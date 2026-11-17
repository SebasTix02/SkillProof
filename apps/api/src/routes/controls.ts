import type { ActivityEntry } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { Activity } from '../lib/activity.js';
import { audit } from '../lib/audit.js';
import { requirePermission, requireUser } from '../lib/auth.js';
import { actorName } from '../lib/control.js';
import { conflict, notFound } from '../lib/errors.js';
import { clockUtc } from '../lib/gemini.js';
import { IdParams, parse } from '../lib/http.js';
import { db, must } from '../lib/supabase.js';
import { settleEvent } from '../services/judge.js';
import { dispatchJudging } from '../services/judgeQueue.js';
import { enqueue } from '../services/queue.js';

type Table = 'submissions' | 'interviews';

/** Adds one line to a row's activity history, keeping what is there. */
async function note(table: Table, id: string, kind: ActivityEntry['kind'], text: string): Promise<void> {
  const row = must(await db().from(table).select('activity_json, models_used').eq('id', id).maybeSingle()) as { activity_json: ActivityEntry[]; models_used: string[] } | null;
  const activity = new Activity(table, id, table === 'submissions', row?.activity_json ?? [], row?.models_used ?? []);
  await activity.add(kind, text);
}

const by = async (userId: string, verb: string) => `${verb} by ${await actorName(userId, 'the organizer')} at ${clockUtc(Date.now())}.`;

interface SubRef {
  id: string;
  event_id: string;
  organization_id: string;
  status: string;
}

async function submission(id: string): Promise<SubRef> {
  const s = must(await db().from('submissions').select('id, event_id, organization_id, status').eq('id', id).maybeSingle()) as SubRef | null;
  if (!s) throw notFound('Submission not found');
  return s;
}

/** Pause, resume and cancel for judging (one submission or a whole event) and for interview jobs. */
export async function controlRoutes(app: FastifyInstance): Promise<void> {
  // ---- judging one submission ----

  app.post('/api/submissions/:id/pause', async (req) => {
    const user = await requireUser(req);
    const sub = await submission(parse(IdParams, req.params).id);
    requirePermission(user, 'event.manage', sub.organization_id);
    const done = must(await db().from('submissions').update({ status: 'paused' }).eq('id', sub.id).in('status', ['queued', 'analyzing']).select('id')) as unknown[];
    if (done.length === 0) throw conflict('not_running', 'Only a submission that is queued or being judged can be paused.');
    await note('submissions', sub.id, 'retry', await by(user.id, 'Paused'));
    await audit({ organizationId: sub.organization_id, actorId: user.id, action: 'judging.paused', subjectType: 'submission', subjectId: sub.id });
    return { ok: true };
  });

  app.post('/api/submissions/:id/resume', async (req) => {
    const user = await requireUser(req);
    const sub = await submission(parse(IdParams, req.params).id);
    requirePermission(user, 'event.manage', sub.organization_id);
    const done = must(await db().from('submissions').update({ status: 'queued', next_attempt_at: null }).eq('id', sub.id).eq('status', 'paused').select('id')) as unknown[];
    if (done.length === 0) throw conflict('not_paused', 'This submission is not paused.');
    await note('submissions', sub.id, 'step', await by(user.id, 'Resumed'));
    await audit({ organizationId: sub.organization_id, actorId: user.id, action: 'judging.resumed', subjectType: 'submission', subjectId: sub.id });
    await dispatchJudging();
    return { ok: true };
  });

  app.post('/api/submissions/:id/cancel', async (req) => {
    const user = await requireUser(req);
    const sub = await submission(parse(IdParams, req.params).id);
    requirePermission(user, 'event.manage', sub.organization_id);
    const done = must(
      await db()
        .from('submissions')
        .update({ status: 'canceled', error: 'Judging was canceled. Use "Judge again" to start over.' })
        .eq('id', sub.id)
        .in('status', ['queued', 'analyzing', 'paused'])
        .select('id'),
    ) as unknown[];
    if (done.length === 0) throw conflict('not_running', 'Only a submission that is queued, being judged or paused can be canceled.');
    await note('submissions', sub.id, 'error', await by(user.id, 'Canceled'));
    await audit({ organizationId: sub.organization_id, actorId: user.id, action: 'judging.canceled', subjectType: 'submission', subjectId: sub.id });
    await settleEvent(sub.event_id);
    await dispatchJudging();
    return { ok: true };
  });

  // ---- judging a whole event ----

  async function managedEvent(id: string, userId: string, grants: Parameters<typeof requirePermission>[0]) {
    const e = must(await db().from('events').select('id, organization_id, status, judging_paused_at').eq('id', id).maybeSingle()) as
      | { id: string; organization_id: string; status: string; judging_paused_at: string | null }
      | null;
    if (!e) throw notFound('Event not found');
    requirePermission(grants, 'event.manage', e.organization_id);
    if (e.status !== 'judging') throw conflict('not_judging', 'The event is not being judged.');
    void userId;
    return e;
  }

  app.post('/api/events/:id/judging/pause', async (req) => {
    const user = await requireUser(req);
    const e = await managedEvent(parse(IdParams, req.params).id, user.id, user);
    must(await db().from('events').update({ judging_paused_at: new Date().toISOString(), judging_paused_by: user.id }).eq('id', e.id));
    const paused = must(await db().from('submissions').update({ status: 'paused' }).eq('event_id', e.id).in('status', ['queued', 'analyzing']).select('id')) as { id: string }[];
    const text = await by(user.id, 'Judging of the whole event paused');
    for (const s of paused) await note('submissions', s.id, 'retry', text);
    await audit({ organizationId: e.organization_id, actorId: user.id, action: 'judging.event_paused', subjectType: 'event', subjectId: e.id, detail: { submissions: paused.length } });
    return { paused: paused.length };
  });

  app.post('/api/events/:id/judging/resume', async (req) => {
    const user = await requireUser(req);
    const e = await managedEvent(parse(IdParams, req.params).id, user.id, user);
    must(await db().from('events').update({ judging_paused_at: null, judging_paused_by: null }).eq('id', e.id));
    const resumed = must(await db().from('submissions').update({ status: 'queued', next_attempt_at: null }).eq('event_id', e.id).eq('status', 'paused').select('id')) as { id: string }[];
    const text = await by(user.id, 'Judging of the whole event resumed');
    for (const s of resumed) await note('submissions', s.id, 'step', text);
    await audit({ organizationId: e.organization_id, actorId: user.id, action: 'judging.event_resumed', subjectType: 'event', subjectId: e.id, detail: { submissions: resumed.length } });
    await dispatchJudging();
    return { resumed: resumed.length };
  });

  /** Cancels what is not judged yet; the event moves to review, and canceled ones can be judged again later. */
  app.post('/api/events/:id/judging/cancel', async (req) => {
    const user = await requireUser(req);
    const e = await managedEvent(parse(IdParams, req.params).id, user.id, user);
    const canceled = must(
      await db()
        .from('submissions')
        .update({ status: 'canceled', error: 'Judging was canceled. Use "Judge again" to start over.' })
        .eq('event_id', e.id)
        .in('status', ['queued', 'analyzing', 'paused'])
        .select('id'),
    ) as { id: string }[];
    const text = await by(user.id, 'Judging of the whole event canceled');
    for (const s of canceled) await note('submissions', s.id, 'error', text);
    must(await db().from('events').update({ judging_paused_at: null, judging_paused_by: null }).eq('id', e.id));
    await settleEvent(e.id);
    await audit({ organizationId: e.organization_id, actorId: user.id, action: 'judging.event_canceled', subjectType: 'event', subjectId: e.id, detail: { submissions: canceled.length } });
    return { canceled: canceled.length };
  });

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
