import type { ActivityEntry } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { Activity } from '../lib/activity.js';
import { audit } from '../lib/audit.js';
import { requirePermission, requireUser, type AuthUser } from '../lib/auth.js';
import { actorName } from '../lib/control.js';
import { conflict, notFound } from '../lib/errors.js';
import { clockUtc } from '../lib/gemini.js';
import { IdParams, parse } from '../lib/http.js';
import { db, must } from '../lib/supabase.js';
import { ASSIGNMENT_STORE, EVENT_STORE, type ContestStore } from '../services/contest.js';
import { settleContest } from '../services/judge.js';
import { dispatchJudging } from '../services/judgeQueue.js';
import { enqueue } from '../services/queue.js';

type Table = 'submissions' | 'assignment_submissions' | 'interviews';

/** Adds one line to a row's activity history, keeping what is there. */
async function note(table: Table, id: string, kind: ActivityEntry['kind'], text: string): Promise<void> {
  const row = must(await db().from(table).select('activity_json, models_used').eq('id', id).maybeSingle()) as { activity_json: ActivityEntry[]; models_used: string[] } | null;
  const activity = new Activity(table, id, table !== 'interviews', row?.activity_json ?? [], row?.models_used ?? []);
  await activity.add(kind, text);
}

const by = async (userId: string, verb: string) => `${verb} by ${await actorName(userId, 'the organizer')} at ${clockUtc(Date.now())}.`;

const CANCELED = 'Judging was canceled. Use "Judge again" to start over.';

/** Where the judging controls of each kind of contest live, and who may use them. */
export interface JudgingRoutes {
  store: ContestStore;
  /** URL prefix of one submission and of one contest. */
  submissionPath: string;
  contestPath: string;
  permission: 'event.manage' | 'course.manage';
  /** Word used in the activity log, the audit actions and the errors. */
  noun: 'event' | 'assignment';
  submissionSubject: 'submission' | 'assignment_submission';
}

export const JUDGING_ROUTES: JudgingRoutes[] = [
  { store: EVENT_STORE, submissionPath: '/api/submissions', contestPath: '/api/events', permission: 'event.manage', noun: 'event', submissionSubject: 'submission' },
  {
    store: ASSIGNMENT_STORE,
    submissionPath: '/api/assignment-submissions',
    contestPath: '/api/assignments',
    permission: 'course.manage',
    noun: 'assignment',
    submissionSubject: 'assignment_submission',
  },
];

/** Pause, resume and cancel for judging (one submission or a whole event or assignment) and for interview jobs. */
export async function controlRoutes(app: FastifyInstance): Promise<void> {
  for (const r of JUDGING_ROUTES) judgingControls(app, r);

  // ---- interviews (the candidate's own) ----

  async function ownInterview(id: string, userId: string) {
    const row = must(await db().from('interviews').select('id, user_id, organization_id, status').eq('id', id).maybeSingle()) as
      | { id: string; user_id: string; organization_id: string | null; status: string }
      | null;
    if (!row || row.user_id !== userId) throw notFound('Interview not found');
    return row;
  }

  /** Cancels a preparation (does not use up the one interview per commit) or the writing of the report. */
  app.post('/api/interviews/:id/cancel', async (req) => {
    const user = await requireUser(req);
    const row = await ownInterview(parse(IdParams, req.params).id, user.id);
    const next = row.status === 'preparing' ? 'canceled' : ['evaluating', 'report_paused'].includes(row.status) ? 'report_canceled' : null;
    if (!next) throw conflict('not_cancelable', 'Only an interview that is being prepared or whose report is being written can be canceled.');
    must(await db().from('interviews').update({ status: next }).eq('id', row.id).eq('status', row.status));
    await note('interviews', row.id, 'error', next === 'canceled' ? `Preparation canceled at ${clockUtc(Date.now())}.` : `Report canceled at ${clockUtc(Date.now())}. Your answers are saved.`);
    if (row.organization_id)
      await audit({ organizationId: row.organization_id, actorId: user.id, action: `interview.${next}`, subjectType: 'interview', subjectId: row.id });
    return { status: next };
  });

  app.post('/api/interviews/:id/pause-report', async (req) => {
    const user = await requireUser(req);
    const row = await ownInterview(parse(IdParams, req.params).id, user.id);
    const done = must(await db().from('interviews').update({ status: 'report_paused' }).eq('id', row.id).eq('status', 'evaluating').select('id')) as unknown[];
    if (done.length === 0) throw conflict('not_evaluating', 'The report is not being written.');
    await note('interviews', row.id, 'retry', `Report paused at ${clockUtc(Date.now())}.`);
    return { status: 'report_paused' };
  });

  /** Resumes a paused report, or writes it again after it was canceled. */
  app.post('/api/interviews/:id/resume-report', async (req) => {
    const user = await requireUser(req);
    const row = await ownInterview(parse(IdParams, req.params).id, user.id);
    const done = must(await db().from('interviews').update({ status: 'evaluating', error: null }).eq('id', row.id).in('status', ['report_paused', 'report_canceled']).select('id')) as unknown[];
    if (done.length === 0) throw conflict('not_paused', 'The report is not paused or canceled.');
    await note('interviews', row.id, 'step', `Writing the report again at ${clockUtc(Date.now())}.`);
    await enqueue('interview-evaluate', row.id);
    return { status: 'evaluating' };
  });
}

/** The same six judging controls for events and for course assignments, each on its own tables and URLs. */
function judgingControls(app: FastifyInstance, r: JudgingRoutes): void {
  const { store } = r;

  async function submission(id: string) {
    const s = must(await db().from(store.submissions).select(`id, ${store.contestFk}, organization_id, status`).eq('id', id).maybeSingle()) as
      | (Record<string, string> & { id: string; organization_id: string; status: string })
      | null;
    if (!s) throw notFound('Submission not found');
    return { ...s, contest_id: s[store.contestFk]! };
  }

  // ---- judging one submission ----

  app.post(`${r.submissionPath}/:id/pause`, async (req) => {
    const user = await requireUser(req);
    const sub = await submission(parse(IdParams, req.params).id);
    requirePermission(user, r.permission, sub.organization_id);
    const done = must(await db().from(store.submissions).update({ status: 'paused' }).eq('id', sub.id).in('status', ['queued', 'analyzing']).select('id')) as unknown[];
    if (done.length === 0) throw conflict('not_running', 'Only a submission that is queued or being judged can be paused.');
    await note(store.submissions, sub.id, 'retry', await by(user.id, 'Paused'));
    await audit({ organizationId: sub.organization_id, actorId: user.id, action: 'judging.paused', subjectType: r.submissionSubject, subjectId: sub.id });
    return { ok: true };
  });

  app.post(`${r.submissionPath}/:id/resume`, async (req) => {
    const user = await requireUser(req);
    const sub = await submission(parse(IdParams, req.params).id);
    requirePermission(user, r.permission, sub.organization_id);
    const done = must(await db().from(store.submissions).update({ status: 'queued', next_attempt_at: null }).eq('id', sub.id).eq('status', 'paused').select('id')) as unknown[];
    if (done.length === 0) throw conflict('not_paused', 'This submission is not paused.');
    await note(store.submissions, sub.id, 'step', await by(user.id, 'Resumed'));
    await audit({ organizationId: sub.organization_id, actorId: user.id, action: 'judging.resumed', subjectType: r.submissionSubject, subjectId: sub.id });
    await dispatchJudging();
    return { ok: true };
  });

  app.post(`${r.submissionPath}/:id/cancel`, async (req) => {
    const user = await requireUser(req);
    const sub = await submission(parse(IdParams, req.params).id);
    requirePermission(user, r.permission, sub.organization_id);
    const done = must(
      await db().from(store.submissions).update({ status: 'canceled', error: CANCELED }).eq('id', sub.id).in('status', ['queued', 'analyzing', 'paused']).select('id'),
    ) as unknown[];
    if (done.length === 0) throw conflict('not_running', 'Only a submission that is queued, being judged or paused can be canceled.');
    await note(store.submissions, sub.id, 'error', await by(user.id, 'Canceled'));
    await audit({ organizationId: sub.organization_id, actorId: user.id, action: 'judging.canceled', subjectType: r.submissionSubject, subjectId: sub.id });
    await settleContest(store, sub.contest_id);
    await dispatchJudging();
    return { ok: true };
  });

  // ---- judging a whole contest ----

  async function judgingContest(id: string, user: AuthUser) {
    const c = must(await db().from(store.contests).select('id, organization_id, status, judging_paused_at').eq('id', id).maybeSingle()) as
      | { id: string; organization_id: string; status: string; judging_paused_at: string | null }
      | null;
    if (!c) throw notFound(r.noun === 'event' ? 'Event not found' : 'Assignment not found');
    requirePermission(user, r.permission, c.organization_id);
    if (c.status !== 'judging') throw conflict('not_judging', `The ${r.noun} is not being judged.`);
    return c;
  }

  app.post(`${r.contestPath}/:id/judging/pause`, async (req) => {
    const user = await requireUser(req);
    const c = await judgingContest(parse(IdParams, req.params).id, user);
    must(await db().from(store.contests).update({ judging_paused_at: new Date().toISOString(), judging_paused_by: user.id }).eq('id', c.id));
    const paused = must(
      await db().from(store.submissions).update({ status: 'paused' }).eq(store.contestFk, c.id).in('status', ['queued', 'analyzing']).select('id'),
    ) as { id: string }[];
    const text = await by(user.id, `Judging of the whole ${r.noun} paused`);
    for (const s of paused) await note(store.submissions, s.id, 'retry', text);
    await audit({ organizationId: c.organization_id, actorId: user.id, action: `judging.${r.noun}_paused`, subjectType: r.noun, subjectId: c.id, detail: { submissions: paused.length } });
    return { paused: paused.length };
  });

  app.post(`${r.contestPath}/:id/judging/resume`, async (req) => {
    const user = await requireUser(req);
    const c = await judgingContest(parse(IdParams, req.params).id, user);
    must(await db().from(store.contests).update({ judging_paused_at: null, judging_paused_by: null }).eq('id', c.id));
    const resumed = must(
      await db().from(store.submissions).update({ status: 'queued', next_attempt_at: null }).eq(store.contestFk, c.id).eq('status', 'paused').select('id'),
    ) as { id: string }[];
    const text = await by(user.id, `Judging of the whole ${r.noun} resumed`);
    for (const s of resumed) await note(store.submissions, s.id, 'step', text);
    await audit({ organizationId: c.organization_id, actorId: user.id, action: `judging.${r.noun}_resumed`, subjectType: r.noun, subjectId: c.id, detail: { submissions: resumed.length } });
    await dispatchJudging();
    return { resumed: resumed.length };
  });

  /** Cancels what is not judged yet; the contest moves to review, and canceled ones can be judged again later. */
  app.post(`${r.contestPath}/:id/judging/cancel`, async (req) => {
    const user = await requireUser(req);
    const c = await judgingContest(parse(IdParams, req.params).id, user);
    const canceled = must(
      await db().from(store.submissions).update({ status: 'canceled', error: CANCELED }).eq(store.contestFk, c.id).in('status', ['queued', 'analyzing', 'paused']).select('id'),
    ) as { id: string }[];
    const text = await by(user.id, `Judging of the whole ${r.noun} canceled`);
    for (const s of canceled) await note(store.submissions, s.id, 'error', text);
    must(await db().from(store.contests).update({ judging_paused_at: null, judging_paused_by: null }).eq('id', c.id));
    await settleContest(store, c.id);
    await audit({ organizationId: c.organization_id, actorId: user.id, action: `judging.${r.noun}_canceled`, subjectType: r.noun, subjectId: c.id, detail: { submissions: canceled.length } });
    return { canceled: canceled.length };
  });
}
