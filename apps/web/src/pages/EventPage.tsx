import { tr, trn } from '../i18n';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../components/toast';
import {
  Badge,
  Button,
  Field,
  Input,
  LiveDot,
  MetricTile,
  Notice,
  PageState,
  ScoreBar,
  SectionHeader,
  Textarea,
  WaveformVisualizer,
  formatDate,
  linkButton,
  scoreTone,
} from '../components/shared';
import { api, errorMessage, existingInterviewId } from '../lib/api';
import { evidenceLink, evidenceTitle } from '../lib/evidence';
import {
  STATUS_LABEL,
  VISIBILITY_LABEL,
  type EventView,
  type Feedback,
  type ScoreView,
  type VersionView,
} from '../lib/types';
import { useLoad } from '../lib/useLoad';

const COCKPIT_PREVIEW =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB1qCdMiODOPX_hcBYNzrZYzeTHZou43yS5giPBdc_KbF4saKLRCFfh68ECha75Yc2drihgPnnoyckUrlPs6n6rPHvh1lJWnZvu7reDBEgT7I2ERM6539VhHu9nL6Y6UwCZT7KwGqzYS-bWTFo0mDqMDn09EnWqzhCIUm4cusdEqbi8qd6fQ-imEbnaZa_nTwcAZCxXKXPf5g0DBnEKANb91yEzH4DCMuuK1ImtTvY';

interface EventResponse {
  event: EventView;
  is_participant: boolean;
  is_manager: boolean;
}

interface MySubmission {
  submission: {
    id: string;
    team_name: string;
    status: string;
    versions_used: number;
    current_version_id: string;
    locked_commit_sha: string | null;
    submission_versions: VersionView[];
  } | null;
  max_submissions: number | null;
  submissions_left: number | null;
  accepting: boolean;
}

interface Results {
  published: boolean;
  status: EventView['status'];
  leaderboard?: { rank: number; team_name: string; total: number; mine: boolean }[];
  mine?: {
    id: string;
    team_name: string;
    total: number | null;
    scores: ScoreView[];
    note: string | null;
    ownership: { score: number; confidence: string } | null;
  } | null;
  feedback?: Feedback | null;
  interview?: { id: string; status: string } | null;
}

function getLifecycleStep(event: EventView, isParticipant: boolean): 1 | 2 | 3 | 4 {
  if (!isParticipant) return 1;
  if (event.status === 'published') return 4;
  if (event.status === 'judging' || event.status === 'review' || Date.parse(event.submission_deadline) <= Date.now()) {
    return 3;
  }
  return 2;
}

export function EventPage() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useLoad<EventResponse>(`/api/events/by-slug/${slug}`);
  const [activeTab, setActiveTab] = useState<'workspace' | 'rubric' | 'leaderboard'>('workspace');

  if (!data) return <PageState loading={loading} error={error} kind="detail" />;
  const { event } = data;
  const activeStep = getLifecycleStep(event, data.is_participant);

  const stateBadgeConfig: Record<1 | 2 | 3 | 4, { label: string; tone: 'warn' | 'accent' | 'good' }> = {
    1: { label: tr('STATE 1: NOT JOINED'), tone: 'warn' },
    2: { label: tr('STATE 2: JOINED & OPEN'), tone: 'accent' },
    3: { label: tr('STATE 3: {status}', { status: STATUS_LABEL[event.status].toUpperCase() }), tone: 'warn' },
    4: { label: tr('STATE 4: PUBLISHED'), tone: 'good' },
  };

  function jumpToSection(tab: 'workspace' | 'rubric' | 'leaderboard', elementId: string) {
    setActiveTab(tab);
    const el = document.getElementById(elementId);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="space-y-8">
      {/* 1. Top Event Dossier Header */}
      <section className="rounded-[6px] border border-line bg-surface p-6">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-3xl space-y-2.5">
            <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-[3px] border border-line bg-paper px-2 py-0.5 font-semibold tracking-wider text-muted uppercase">
                {tr('SLUG: /e/')}{event.slug}
              </span>
              <span className="text-line">•</span>
              <span className="flex items-center gap-1 rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 font-semibold tracking-wider text-accent-ink uppercase">
                <span className="material-symbols-outlined text-[13px]">shield</span>
                {VISIBILITY_LABEL[event.visibility]}{' '}{tr('TRACK')}
              </span>
              <span className="text-line">•</span>
              <span className="text-muted uppercase">
                {event.interviews_enabled ? tr('COMMIT RUBRIC + 3-MIN VOICE DEFENSE') : tr('COMMIT-LOCKED RUBRIC AUDIT')}
              </span>
            </div>

            <h1 className="font-serif-heading text-[30px] leading-[36px] font-medium tracking-tight text-ink sm:text-[36px] sm:leading-[42px]">
              {event.name}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-accent">account_balance</span>
                {tr('Organized by')}{' '}<strong className="font-semibold text-ink">{event.organization?.name || tr('Organizer')}</strong>
              </span>
              <span className="text-line">|</span>
              <span className="font-mono-code text-[12px] text-muted">{tr('Kind:')}{' '}{event.kind}</span>
              {data.is_manager && (
                <>
                  <span className="text-line">|</span>
                  <Link
                    to={`/org/events/${event.id}`}
                    className="font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink hover:underline"
                  >
                    <span>{tr('Open Organizer Console')}</span>
                    <span>↗</span>
                  </Link>
                </>
              )}
            </div>

            {event.description && (
              <p className="max-w-2xl pt-1 whitespace-pre-line text-[14px] leading-[22px] text-muted">
                {event.description}
              </p>
            )}
          </div>

          <div className="flex flex-col items-start justify-between gap-3 border-t border-line pt-4 sm:flex-row lg:flex-col lg:items-end lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <Badge tone={stateBadgeConfig[activeStep].tone} dot>
              {stateBadgeConfig[activeStep].label}
            </Badge>

            <div className="font-mono-code space-y-0.5 text-left text-[11px] text-muted lg:text-right">
              <div className="flex items-center gap-1.5 font-semibold text-ink lg:justify-end">
                <span className="material-symbols-outlined text-[14px] text-warn">timer</span>
                <span>{tr('DEADLINE:')}{' '}{formatDate(event.submission_deadline).toUpperCase()}</span>
              </div>
              <div>
                {event.status === 'published'
                  ? tr('ALL AUDITS CONCLUDED & PUBLISHED')
                  : event.status === 'judging' || event.status === 'review'
                    ? tr('COMMITS FROZEN • EVALUATION ACTIVE')
                    : tr('COMMIT FREEZE AT DEADLINE CUTOFF')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Lifecycle State Progress Stepper */}
      <section className="space-y-2.5 rounded-[6px] border border-line bg-surface p-3.5">
        <div className="flex items-center justify-between px-1.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[17px] text-accent">tune</span>
            <span className="font-mono-code text-[11px] font-bold tracking-wider text-ink uppercase">
              {tr('Event Lifecycle State')}
            </span>
          </div>
          <span className="font-mono-code hidden text-[11px] text-muted md:inline">
            {tr('STATUS:')}{' '}{STATUS_LABEL[event.status].toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              {
                step: 1,
                code: tr('01 / PRE-FLIGHT'),
                title: tr('1. Not Joined'),
                desc: tr('Registration open, access verification, cohort entry.'),
              },
              {
                step: 2,
                code: tr('02 / INGESTION'),
                title: tr('2. Joined & Open'),
                desc: tr('Live GitHub repository hook and version submissions.'),
              },
              {
                step: 3,
                code: tr('03 / FORENSICS'),
                title: tr('3. Judging In Progress'),
                desc: tr('Commits frozen, AI rubric scoring & voice defense.'),
              },
              {
                step: 4,
                code: tr('04 / RESULTS'),
                title: tr('4. Published Results'),
                desc: tr('Final composite standings, rubric evidence & feedback.'),
              },
            ] as const
          ).map((item) => {
            const isCurrent = activeStep === item.step;
            const isCompleted = activeStep > item.step;
            return (
              <div
                key={item.step}
                className={`flex flex-col justify-between rounded-[4px] border p-3 transition-colors ${
                  isCurrent
                    ? 'border-accent bg-accent text-on-accent'
                    : isCompleted
                      ? 'border-good/30 bg-good-soft/35 text-ink'
                      : 'border-line bg-paper/60 text-ink'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className={`font-mono-code text-[10px] font-bold tracking-wider uppercase ${
                      isCurrent ? 'text-white/85' : isCompleted ? 'text-good' : 'text-muted'
                    }`}
                  >
                    {item.code}
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isCurrent ? 'bg-good-on-dark animate-pulse' : isCompleted ? 'bg-good' : 'bg-line'
                    }`}
                  />
                </div>
                <div className={`font-serif-heading text-[16px] leading-tight font-semibold ${isCurrent ? 'text-white' : 'text-ink'}`}>
                  {item.title}
                </div>
                <div className={`mt-1 text-[11px] leading-snug ${isCurrent ? 'text-white/85' : 'text-muted'}`}>
                  {item.desc}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Primary Navigation Bar */}
      <nav className="flex flex-wrap items-center gap-6 rounded-[6px] border border-line bg-surface px-6 pt-3">
        <button
          type="button"
          onClick={() => jumpToSection('workspace', 'workspaceSection')}
          className={`relative flex cursor-pointer items-center gap-1.5 pb-3 text-[13px] transition-colors ${
            activeTab === 'workspace' ? 'font-semibold text-accent' : 'font-medium text-muted hover:text-ink'
          }`}
        >
          <span className="material-symbols-outlined text-[17px]">workspace_premium</span>
          <span>{tr('Candidate Workspace & Dossier')}</span>
          {activeTab === 'workspace' && <span className=" bg-accent absolute right-0 bottom-0 left-0 h-0.5" />}
        </button>

        {event.rubric_json.length > 0 && (
          <button
            type="button"
            onClick={() => jumpToSection('rubric', 'rubricSection')}
            className={`relative flex cursor-pointer items-center gap-1.5 pb-3 text-[13px] transition-colors ${
              activeTab === 'rubric' ? 'font-semibold text-accent' : 'font-medium text-muted hover:text-ink'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">description</span>
            <span>{tr('Overview & Rubric Standard (')}{event.rubric_json.length})</span>
            {activeTab === 'rubric' && <span className="bg-accent absolute right-0 bottom-0 left-0 h-0.5" />}
          </button>
        )}

        {event.status === 'published' && (
          <button
            type="button"
            onClick={() => jumpToSection('leaderboard', 'leaderboardSection')}
            className={`relative flex cursor-pointer items-center gap-1.5 pb-3 text-[13px] transition-colors ${
              activeTab === 'leaderboard' ? 'font-semibold text-accent' : 'font-medium text-muted hover:text-ink'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">leaderboard</span>
            <span>{tr('Official Leaderboard')}</span>
            {activeTab === 'leaderboard' && <span className="bg-accent absolute right-0 bottom-0 left-0 h-0.5" />}
          </button>
        )}
      </nav>

      {/* 4. Active Workspace Content */}
      <div id="workspaceSection" className="space-y-8">
        {data.is_participant ? (
          <Participant event={event} />
        ) : (
          <Join event={event} onJoined={reload} />
        )}
      </div>

      {/* 5. Rubric Specification Card */}
      {event.rubric_json.length > 0 && (
        <section id="rubricSection" className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
          <SectionHeader
            title={tr('Evaluation Rubric & Weight Attribution')}
            subtitle={tr('Every repository is frozen at its latest commit at the deadline and scored against these weighted criteria.')}
            rightSlot={
              <span className="font-mono-code rounded-[3px] border border-line bg-paper px-3 py-1 text-[11px] font-bold text-ink">
                {tr('TOTAL WEIGHT:')}{' '}{event.rubric_json.reduce((acc, c) => acc + c.weight, 0)}%
              </span>
            }
          />

          <ul className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {event.rubric_json.map((c, idx) => (
              <li key={c.key} className="space-y-2 rounded-[4px] border border-line bg-paper/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono-code text-[11px] font-bold text-accent uppercase">
                    {tr('CRITERION')}{' '}{String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono-code rounded-[3px] border border-line bg-surface px-2 py-0.5 text-[11px] font-bold text-ink">
                    {tr('WEIGHT:')}{' '}{c.weight}%
                  </span>
                </div>
                <div className="font-serif-heading text-[18px] font-medium text-ink">{c.name}</div>
                {c.description && <p className="text-[13px] leading-relaxed text-muted">{c.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Join({ event, onJoined }: { event: EventView; onJoined: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const open = event.status === 'open' && Date.parse(event.submission_deadline) > Date.now();

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${event.id}/join`, { body: { access_code: code || undefined } });
      toast.success(tr('You joined {name}.', { name: event.name }));
      await onJoined();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Notice tone="warn">{tr('This event is not accepting new participants.')}</Notice>;
  }

  return (
    <div className="space-y-5">
      {event.visibility !== 'public' && (
        <Notice tone="warn">
          <strong className="font-semibold">{tr('Restricted Event Access:')}{' '}</strong>
          {event.visibility === 'code'
            ? tr('This event requires an organizer access code to claim a participant workspace.')
            : tr('This event is invite-only. You can join if the organizer added your account email to the allowlist.')}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="flex flex-col justify-between space-y-6 rounded-[6px] border border-line bg-surface p-6 sm:p-8 md:col-span-7">
          <div className="space-y-4">
            <span className="font-mono-code inline-block rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-ink uppercase">
              {tr('STAGE 01 // CANDIDATE REGISTRATION')}
            </span>
            <h2 className="font-serif-heading text-[26px] leading-tight font-medium text-ink">
              {tr('Join')}{' '}{event.name}
            </h2>
            <p className="text-[14px] leading-relaxed text-muted">
              {tr('Register as a participant to unlock the repository submission console. You can push commits and update your submission until the deadline cutoff.')}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-[4px] border border-line bg-paper p-3.5">
                <span className="font-mono-code block text-[10px] text-muted uppercase">{tr('Access Mode')}</span>
                <span className="font-serif-heading mt-0.5 block text-[20px] font-semibold text-ink">
                  {VISIBILITY_LABEL[event.visibility]}
                </span>
              </div>
              <div className="rounded-[4px] border border-line bg-paper p-3.5">
                <span className="font-mono-code block text-[10px] text-muted uppercase">{tr('Submission Quota')}</span>
                <span className="font-serif-heading mt-0.5 block text-[20px] font-semibold text-ink">
                  {event.max_submissions ? tr('{n} Versions', { n: event.max_submissions }) : tr('Unlimited')}
                </span>
              </div>
            </div>
          </div>

          {event.visibility !== 'code' && (
            <form onSubmit={join} className="space-y-3">
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" disabled={busy} loading={busy} className="px-6 py-2.5">
                <span className="material-symbols-outlined text-[17px]">key</span>
                <span>{busy ? tr('Joining Event…') : tr('Join Event as Candidate')}</span>
                <span className="arrow-nudge font-mono-code text-[12px]">→</span>
              </Button>
            </form>
          )}
        </div>

        <div className="flex flex-col justify-between space-y-6 rounded-[6px] border border-line bg-surface p-6 sm:p-8 md:col-span-5">
          {event.visibility === 'code' ? (
            <form onSubmit={join} className="flex h-full flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="font-serif-heading text-[22px] font-medium text-ink">{tr('Redeem Access Code')}</h3>
                <p className="text-[13px] leading-relaxed text-muted">
                  {tr('Enter the access code shared by the event organizer to unlock your submission workspace.')}
                </p>
              </div>

              <div className="space-y-3">
                <Field label={tr('Organizer Access Code')}>
                  <Input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={tr('ENTER ACCESS CODE')}
                    autoComplete="off"
                    className="font-mono-code bg-paper text-center text-[14px] tracking-widest uppercase"
                  />
                </Field>
                {error && <Notice tone="error">{error}</Notice>}
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-tactile w-full cursor-pointer rounded-[4px] border border-ink bg-ink py-2.5 text-[13px] font-medium text-on-accent hover:border-accent hover:bg-accent disabled:opacity-50"
                >
                  {busy ? tr('Verifying Code…') : tr('Submit Code & Claim Workspace')}
                </button>
              </div>

              <div className="font-mono-code flex items-center gap-1.5 text-[11px] text-muted">
                <span className="material-symbols-outlined text-[15px]">lock_clock</span>
                <span>{tr('Closes')}{' '}{formatDate(event.submission_deadline)}</span>
              </div>
            </form>
          ) : (
            <div className="flex h-full flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="font-serif-heading text-[22px] font-medium text-ink">{tr('Verification Protocol')}</h3>
                <p className="text-[13px] leading-relaxed text-muted">
                  {event.visibility === 'invite'
                    ? tr('Your account email is checked against the organizer allowlist when you click Join Event.')
                    : tr('This event is open to all registered SkillProof accounts.')}
                </p>
              </div>
              <div className="space-y-2 rounded-[4px] border border-line bg-paper p-4">
                <div className="font-mono-code text-[11px] font-semibold text-ink uppercase">{tr('What Happens Next')}</div>
                <p className="text-[12px] text-muted">
                  {tr('1. Submit your public GitHub repository URL and team name.')}<br />
                  {tr('2. At the deadline, the latest commit SHA is frozen and scored.')}<br />
                  {event.interviews_enabled && tr('3. Defend your code in a 3-minute voice interview.')}
                </p>
              </div>
              <div className="font-mono-code flex items-center gap-1.5 text-[11px] text-muted">
                <span className="material-symbols-outlined text-[15px]">lock_clock</span>
                <span>{tr('Closes')}{' '}{formatDate(event.submission_deadline)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Participant({ event }: { event: EventView }) {
  const mine = useLoad<MySubmission>(`/api/events/${event.id}/my-submission`);
  const results = useLoad<Results>(
    `/api/events/${event.id}/results`,
    (r) => r.status === 'judging' || r.status === 'review',
  );
  if (!mine.data) return <PageState loading={mine.loading} error={mine.error} kind="list" />;
  const closed = !mine.data.accepting;
  const sub = mine.data.submission;

  return (
    <div className="space-y-8">
      {/* State 3: Judging / In Review Pipeline Banner */}
      {closed && results.data && !results.data.published && (
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[26px] text-accent">hourglass_top</span>
              <div>
                <h3 className="font-serif-heading text-[22px] font-medium text-ink">
                  {sub?.locked_commit_sha
                    ? tr('Submissions Locked & Frozen at Commit @{sha}', { sha: sub.locked_commit_sha.slice(0, 7) })
                    : tr('Submissions Closed & Evaluation In Progress')}
                </h3>
                <p className="text-[13px] text-muted">
                  {results.data.status === 'judging'
                    ? tr('The repository analyzer and rubric evaluator are scoring submissions against the event criteria.')
                    : tr('The organizer is reviewing the AI scores and evidence. Final standings appear here once published.')}
                </p>
              </div>
            </div>
            <Badge tone="warn" dot>
              {results.data.status === 'judging' ? tr('PIPELINE RUNNING') : tr('ORGANIZER REVIEW')}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 rounded-[4px] border border-line bg-paper p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-bold text-good">{tr('STAGE 01')}</span>
                <span className="material-symbols-outlined text-[17px] text-good">verified</span>
              </div>
              <div className="text-[13px] font-semibold text-ink">{tr('Commit SHA Freeze')}</div>
              <span className="font-mono-code inline-block rounded-[2px] bg-good-soft px-2 py-0.5 text-[10px] font-bold text-good-ink">
                {sub?.locked_commit_sha ? tr('@{sha} LOCKED', { sha: sub.locked_commit_sha.slice(0, 7) }) : tr('LOCKED')}
              </span>
            </div>

            <div
              className={`space-y-1.5 rounded-[4px] border p-3.5 ${
                results.data.status === 'judging' ? 'border-accent/40 bg-accent-soft/60' : 'border-line bg-paper'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-bold text-accent">{tr('STAGE 02')}</span>
                <span
                  className={`material-symbols-outlined text-[17px] text-accent ${
                    results.data.status === 'judging' ? 'animate-spin' : ''
                  }`}
                >
                  {results.data.status === 'judging' ? 'sync' : 'verified'}
                </span>
              </div>
              <div className="text-[13px] font-semibold text-ink">{tr('Rubric Vector Evaluation')}</div>
              <span className="font-mono-code inline-block rounded-[2px] bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
                {results.data.status === 'judging' ? tr('ACTIVE') : tr('SCORED')}
              </span>
            </div>

            <div className="space-y-1.5 rounded-[4px] border border-line bg-paper p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-bold text-muted">{tr('STAGE 03')}</span>
                <span className="font-mono-code text-[10px] text-muted">
                  {event.interviews_enabled ? tr('ENABLED') : tr('SKIPPED')}
                </span>
              </div>
              <div className="text-[13px] font-semibold text-ink">{tr('3-Min Voice Defense')}</div>
              <span className="font-mono-code inline-block rounded-[2px] border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">
                {event.interviews_enabled ? tr('OPENS AFTER JUDGING') : tr('NOT REQUIRED')}
              </span>
            </div>

            <div
              className={`space-y-1.5 rounded-[4px] border p-3.5 ${
                results.data.status === 'review' ? 'border-warn/40 bg-warn-soft/60' : 'border-line bg-paper'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-bold text-warn">{tr('STAGE 04')}</span>
                <span className="material-symbols-outlined text-[17px] text-warn">gavel</span>
              </div>
              <div className="text-[13px] font-semibold text-ink">{tr('Organizer Calibration')}</div>
              <span className="font-mono-code inline-block rounded-[2px] bg-warn-soft px-2 py-0.5 text-[10px] font-bold text-warn-ink">
                {results.data.status === 'review' ? tr('IN JURY REVIEW') : tr('PENDING')}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* State 4: Published Results Dossier & Leaderboard */}
      {results.data?.published && <ResultsView event={event} results={results.data} lockedSha={sub?.locked_commit_sha ?? null} version={sub?.submission_versions.find((v) => v.id === sub.current_version_id) ?? null} />}

      {/* State 2 (and History): Submission Dossier Formulation & Timeline */}
      <SubmissionCard event={event} mine={mine.data} onSubmitted={mine.reload} />
    </div>
  );
}

function SubmissionCard({
  event,
  mine,
  onSubmitted,
}: {
  event: EventView;
  mine: MySubmission;
  onSubmitted: () => Promise<void>;
}) {
  const versions = [...(mine.submission?.submission_versions ?? [])].sort((a, b) => b.version_no - a.version_no);
  const current = versions[0];
  const [team, setTeam] = useState(mine.submission?.team_name ?? '');
  const [repo, setRepo] = useState(current?.repos.url ?? '');
  const [video, setVideo] = useState(current?.video_url ?? '');
  const [slides, setSlides] = useState(current?.slides_url ?? '');
  const [description, setDescription] = useState(current?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const left = mine.submissions_left;
  const used = mine.submission?.versions_used ?? 0;
  const max = mine.max_submissions;
  const canSubmit = mine.accepting && (left === null || left > 0);
  const quotaScale = max ? Math.min(1, used / max) : used > 0 ? 0.5 : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api(`/api/events/${event.id}/submissions`, {
        body: {
          team_name: team,
          repo_url: repo.trim(),
          description,
          video_url: video.trim() || null,
          slides_url: slides.trim() || null,
        },
      });
      setDone(true);
      await onSubmitted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Workspace Status Bar */}
      <div className="flex flex-col justify-between gap-3 rounded-[6px] border border-line bg-surface p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          {mine.accepting ? <LiveDot tone="good" /> : <span className="h-2 w-2 rounded-full bg-muted" />}
          <span className="font-mono-code text-[12px] font-semibold text-ink">
            {mine.accepting
              ? tr('Workspace Active: Commit Freeze at {date}', { date: formatDate(event.submission_deadline) })
              : tr('Submission Window Closed')}
          </span>
        </div>
        <div className="font-mono-code rounded-[3px] border border-line bg-paper px-3 py-1 text-[11px] text-muted">
          {tr('TEAM:')}{' '}<span className="font-bold text-ink">{mine.submission?.team_name || tr('NOT SUBMITTED YET')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 Cols: Submission Dossier Formulation */}
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <h2 className="font-serif-heading text-[22px] font-medium text-ink">{tr('Submission Dossier Formulation')}</h2>
            <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              {current ? tr('ACTIVE VERSION #{n}', { n: current.version_no }) : tr('INITIAL SUBMISSION')}
            </span>
          </div>

          {current && (
            <div className="font-mono-code flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-line bg-paper px-3.5 py-2.5 text-[12px]">
              <div>
                <span className="text-muted">{tr('CURRENT REPO:')}{' '}</span>
                <a
                  className="font-semibold text-accent hover:underline"
                  href={current.repos.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {current.repos.owner}/{current.repos.name}
                </a>
                <span className="text-muted"> · v{current.version_no} ({formatDate(current.created_at)})</span>
              </div>
              {mine.submission?.locked_commit_sha && (
                <span className="rounded-[2px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink">
                  {tr('FROZEN @')}{mine.submission.locked_commit_sha.slice(0, 7)}
                </span>
              )}
            </div>
          )}

          {canSubmit ? (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={tr('Registered Team Identifier')}>
                  <Input
                    required
                    maxLength={80}
                    placeholder={tr('Team Nova Consensus')}
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                  />
                </Field>

                <Field
                  label={tr('Git Ingestion Target (Public GitHub URL)')}
                  hint={tr('The latest commit at the deadline is frozen for evaluation.')}
                >
                  <Input
                    required
                    type="url"
                    className="font-mono-code"
                    placeholder={tr('https://github.com/owner/repo')}
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                  />
                </Field>
              </div>

              <Field label={tr('Technical Abstract & Architectural Summary (What did you build?)')}>
                <Textarea
                  rows={4}
                  maxLength={4000}
                  placeholder={tr('Describe your architecture, key modules, and engineering trade-offs...')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={tr('Walkthrough Demo Video (Public YouTube)')}
                  hint={tr('Required if the rubric scores demo & pitch.')}
                >
                  <Input
                    type="url"
                    className="font-mono-code"
                    placeholder={tr('https://youtu.be/…')}
                    value={video}
                    onChange={(e) => setVideo(e.target.value)}
                  />
                </Field>

                <Field label={tr('Slides or Technical Spec URL (Optional)')}>
                  <Input
                    type="url"
                    className="font-mono-code"
                    placeholder={tr('https://…')}
                    value={slides}
                    onChange={(e) => setSlides(e.target.value)}
                  />
                </Field>
              </div>

              {error && <Notice tone="error">{error}</Notice>}
              {done && (
                <Notice tone="good">
                  {tr('Submission received and verified. You can continue pushing commits until the deadline cutoff.')}
                </Notice>
              )}

              <div className="flex flex-col items-center justify-between gap-3 border-t border-line pt-4 sm:flex-row">
                <Button type="submit" disabled={busy} loading={busy} className="w-full sm:w-auto">
                  <span className="material-symbols-outlined text-[17px]">lock</span>
                  <span>
                    {busy ? tr('Checking Repository…') : current ? tr('Save & Send New Version') : tr('Submit Project Dossier')}
                  </span>
                </Button>
                <span className="font-mono-code text-[11px] text-muted">
                  {tr('Public GitHub repo verified before consuming quota')}
                </span>
              </div>
            </form>
          ) : (
            <p className="text-[13px] text-muted">
              {mine.accepting
                ? tr('You have used all allowed submission versions for this event.')
                : current
                  ? tr('Submissions are closed. Your latest version above is locked for evaluation.')
                  : tr('Submissions are closed and you did not submit a project.')}
            </p>
          )}
        </section>

        {/* Right 4 Cols: Ingestion Quota & Version Timeline */}
        <div className="space-y-6 lg:col-span-4">
          <section className="space-y-3 rounded-[6px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                {tr('Ingestion Quota')}
              </span>
              <span
                className={`font-mono-code text-[11px] font-bold ${
                  left === 0 ? 'text-bad' : 'text-good'
                }`}
              >
                {left === null ? tr('UNLIMITED VERSIONS') : tr('{left} OF {max} REMAINING', { left, max })}
              </span>
            </div>

            <ScoreBar value={quotaScale * 100} max={100} tone="accent" heightClass="h-2" />

            <p className="text-[12px] leading-relaxed text-muted">
              {max
                ? tr('{used} of {max} submission versions used.', { used, max })
                : trn('{count} submission version recorded.', '{count} submission versions recorded.', used)}{' '}
              {tr('At the deadline, SkillProof freezes the HEAD commit of your current version.')}
            </p>
          </section>

          <section className="space-y-4 rounded-[6px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h3 className="font-serif-heading text-[18px] font-medium text-ink">{tr('Submission Timeline')}</h3>
              <span className="font-mono-code text-[11px] text-muted">
                {trn('{count} SNAPSHOT', '{count} SNAPSHOTS', versions.length)}
              </span>
            </div>

            {versions.length === 0 ? (
              <p className="text-[12px] text-muted">
                {tr('No versions submitted yet. Submit your repository on the left to record v1.')}
              </p>
            ) : (
              <ol className="space-y-3.5 pl-1">
                {versions.map((v, idx) => (
                  <li key={v.id} className="space-y-1 border-l-2 border-line pl-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-code text-[12px] font-bold text-ink">
                        v{v.version_no} {idx === 0 ? tr('(Active)') : ''}
                      </span>
                      <span
                        className={`font-mono-code rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold ${
                          idx === 0 ? 'bg-accent-soft text-accent-ink' : 'bg-paper text-muted'
                        }`}
                      >
                        {v.repos.owner}/{v.repos.name}
                      </span>
                    </div>
                    {v.description && <p className="line-clamp-2 text-[12px] text-muted">{v.description}</p>}
                    <span className="font-mono-code block text-[10px] text-muted">{formatDate(v.created_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ResultsView({
  event,
  results,
  lockedSha,
  version,
}: {
  event: EventView;
  results: Results;
  lockedSha: string | null;
  /** The judged version: its repository and demo video are what the evidence points to. */
  version: VersionView | null;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = results.mine;
  const myRank = results.leaderboard?.find((r) => r.mine)?.rank ?? null;
  const totalTeams = results.leaderboard?.length ?? 0;

  async function startInterview() {
    if (!mine) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ interview: { id: string } }>('/api/interviews', { body: { submission_id: mine.id } });
      navigate(`/interview/${res.interview.id}`);
    } catch (err) {
      // The frozen commit was already interviewed (for example as a personal interview): open that one.
      const existing = existingInterviewId(err);
      if (existing) navigate(`/interview/${existing}`);
      else setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* 1. Split Certified Audit Dossier & Oral Defense Module */}
      {mine && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 7 Cols: Certified Audit Dossier */}
          <div className="flex flex-col justify-between space-y-5 rounded-[6px] border border-line bg-surface p-6 lg:col-span-7">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[19px] text-good">verified</span>
                  <span className="font-mono-code rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[11px] font-bold text-good-ink uppercase">
                    {tr('Certified Audit Dossier #')}{mine.id.slice(0, 6).toUpperCase()}
                  </span>
                </div>
                {myRank != null && (
                  <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
                    <span className="material-symbols-outlined text-[14px]">military_tech</span>
                    <span>
                      {tr('RANKED #')}{String(myRank).padStart(2, '0')} / {totalTeams}{' '}{tr('COHORTS')}
                    </span>
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <h2 className="font-serif-heading text-[24px] leading-tight font-medium text-ink">
                  {tr('Candidate Performance & Evaluation Brief')}
                </h2>
                <p className="text-[13px] text-muted">
                  {tr('Submitted by')}{' '}<strong className="text-ink">{mine.team_name}</strong>
                  {lockedSha ? ` • ${tr('Evaluated at frozen commit @{sha}', { sha: lockedSha.slice(0, 7) })}` : ''}.
                </p>
              </div>

              {/* Cockpit Visual Preview Framing */}
              <div className="relative overflow-hidden rounded-[4px] border border-dark-hairline bg-dark-canvas">
                <div className="font-mono-code flex items-center justify-between border-b border-dark-hairline bg-dark-inset px-3 py-1.5 text-[11px] text-dark-muted">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-good-on-dark" />
                    <span className="font-medium text-white">{tr('AUTOMATED EVALUATION')}</span>
                  </div>
                  <span className="text-good-on-dark">{tr('RUBRIC AUDIT: COMPLETED')}</span>
                </div>
                <img
                  src={COCKPIT_PREVIEW}
                  alt={tr('Technical evaluation cockpit showing repository analysis and verification seal')}
                  className="block max-h-[220px] w-full object-cover"
                />
              </div>

              {/* Key Metrics Bento Row */}
              <div className="grid grid-cols-1 gap-3.5 pt-1 sm:grid-cols-2">
                <MetricTile
                  label={tr('Final Composite Grade')}
                  value={
                    <span className="flex items-baseline gap-1.5">
                      <span>{mine.total != null ? mine.total.toFixed(1) : '—'}</span>
                      <span className="font-mono-code text-[12px] font-normal text-muted">/ 100.0</span>
                    </span>
                  }
                  valueClassName="text-[34px] leading-none"
                  sub={
                    <span className="font-mono-code flex items-center gap-1 pt-0.5 text-[11px] font-bold text-good">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      <span>{tr('WEIGHTED RUBRIC TOTAL')}</span>
                    </span>
                  }
                />

                <MetricTile
                  label={tr('Author Provenance & Voice Match')}
                  value={
                    <span className="flex items-baseline gap-1.5">
                      <span>{mine.ownership ? mine.ownership.score : '—'}</span>
                      <span className="font-mono-code text-[12px] font-normal text-muted">/ 100.0</span>
                    </span>
                  }
                  valueClassName="text-[34px] leading-none text-accent"
                  sub={
                    <span className="font-mono-code flex items-center gap-1 pt-0.5 text-[11px] font-bold text-accent">
                      <span className="material-symbols-outlined text-[14px]">fingerprint</span>
                      <span>
                        {mine.ownership
                          ? tr('{level} CONFIDENCE', { level: mine.ownership.confidence.toUpperCase() })
                          : event.interviews_enabled
                            ? tr('VOICE DEFENSE AVAILABLE')
                            : tr('CODE RUBRIC ONLY')}
                      </span>
                    </span>
                  }
                />
              </div>
            </div>

            {mine.note && <Notice tone="warn">{mine.note}</Notice>}

            <div className="font-mono-code flex flex-wrap items-center justify-between border-t border-line pt-3 text-[11px] text-muted">
              <span>{tr('PUBLISHED BY {name}', { name: event.organization?.name?.toUpperCase() || tr('ORGANIZER') })}</span>
              <span className="font-semibold text-ink">{tr('JUDGED ON THE FROZEN COMMIT')}</span>
            </div>
          </div>

          {/* Right 5 Cols: Dark Audio Dossier Audit & Ownership Interview Panel */}
          <div className="flex flex-col justify-between space-y-5 rounded-[6px] border border-dark-hairline bg-dark-inset p-6 text-white lg:col-span-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-accent/40 bg-accent/20 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-accent-on-dark uppercase">
                  <span className="material-symbols-outlined text-[15px] text-accent-on-dark">mic</span>
                  <span>{tr('AUDIO DOSSIER AUDIT')}</span>
                </span>
                <span className="font-mono-code text-[11px] text-white/50">{tr('3:00 ORAL DEFENSE')}</span>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-serif-heading text-[24px] font-medium text-white">{tr('Oral Verification Defense')}</h3>
                <p className="text-[13px] leading-relaxed text-white/70">
                  {event.interviews_enabled
                    ? tr('A 3-minute voice cross-examination on the code you submitted, verifying first-hand architectural understanding.')
                    : tr('Voice interviews were not enabled for this event.')}
                </p>
              </div>

              {/* Stylized Waveform Box */}
              <div className="space-y-3 rounded-[4px] border border-white/10 bg-black/40 p-4">
                <div className="font-mono-code flex items-center justify-between text-[11px] text-white/60">
                  <span className="flex items-center gap-1.5 text-good-on-dark">
                    <span className="h-2 w-2 rounded-full bg-good-on-dark" />
                    <span>
                      {mine.ownership
                        ? tr('Ownership Verified ({score}/100)', { score: mine.ownership.score })
                        : results.interview
                          ? tr('Interview Status: {status}', { status: results.interview.status })
                          : tr('Ready for Voice Defense')}
                    </span>
                  </span>
                  <span>{tr('03:00 WINDOW')}</span>
                </div>

                <WaveformVisualizer variant="dark" active={Boolean(mine.ownership)} />

                {event.interviews_enabled && (
                  <>
                    {mine.ownership && results.interview ? (
                      <Link
                        to={`/interview/${results.interview.id}`}
                        className={`${linkButton} w-full py-2.5 text-[13px]`}
                      >
                        <span className="material-symbols-outlined text-[17px]">description</span>
                        <span>{tr('Inspect Oral Defense Report (')}{mine.ownership.score}/100)</span>
                      </Link>
                    ) : results.interview ? (
                      <Link
                        to={`/interview/${results.interview.id}`}
                        className={`${linkButton} w-full py-2.5 text-[13px]`}
                      >
                        <span className="material-symbols-outlined text-[17px]">mic</span>
                        <span>{tr('Continue Your Voice Interview')}</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void startInterview()}
                        disabled={busy}
                        className={`${linkButton} w-full cursor-pointer py-2.5 text-[13px] disabled:opacity-50`}
                      >
                        <span className="material-symbols-outlined text-[17px]">mic</span>
                        <span>{busy ? tr('Preparing Interview…') : tr('Prepare My 3-Min Voice Interview')}</span>
                      </button>
                    )}
                  </>
                )}

                {error && <Notice tone="error">{error}</Notice>}
              </div>
            </div>

            <div className="space-y-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-tactile font-mono-code flex w-full cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-white/15 bg-white/10 py-2 text-[11px] font-medium text-white hover:bg-white/15"
              >
                <span className="material-symbols-outlined text-[15px]">print</span>
                <span>{tr('Print / Save Evaluation Dossier (PDF)')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Comprehensive Rubric Breakdown & Feedback */}
      {mine && (
        <section className="space-y-6 rounded-[6px] border border-line bg-surface p-6">
          <SectionHeader
            title={tr('Comprehensive Rubric Vector Breakdown')}
            subtitle={tr('Criterion-by-criterion evaluation with cited repository files and judge overrides.')}
            rightSlot={
              mine.total != null ? (
                <span className="font-mono-code rounded-[3px] border border-line bg-paper px-3 py-1.5 text-[12px] font-bold text-ink">
                  {tr('COMPOSITE SCORE:')}{' '}{mine.total.toFixed(1)} / 100
                </span>
              ) : undefined
            }
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {event.rubric_json.map((c) => {
              const s = mine.scores.find((x) => x.criterion_key === c.key);
              const value = s?.override_score ?? s?.ai_score ?? null;
              const tone = scoreTone(value, 10);
              return (
                <div key={c.key} className="space-y-3 rounded-[4px] border border-line bg-paper/70 p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-code rounded-[3px] border border-line bg-surface px-2 py-0.5 text-[11px] font-bold text-ink">
                      {c.weight}{tr('% WEIGHT')}
                    </span>
                    <div className="flex items-center gap-2">
                      {s?.override_score != null && (
                        <span className="font-mono-code text-[10px] text-warn uppercase">{tr('Judge Adjusted')}</span>
                      )}
                      <Badge tone={tone}>{value ?? '–'} / 10</Badge>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-serif-heading text-[18px] font-medium text-ink">{c.name}</h4>
                    {s?.justification && (
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.justification}</p>
                    )}
                  </div>

                  {s?.evidence_json && s.evidence_json.length > 0 && (
                    <div className="pt-1">
                      <span className="font-mono-code mb-1 block text-[10px] text-muted uppercase">
                        {tr('Audited Evidence Files:')}
                      </span>
                      <div className="font-mono-code flex flex-wrap gap-1.5 text-[11px]">
                        {s.evidence_json.map((item, idx) => {
                          const ev = evidenceLink(item, { repoUrl: version?.repos.url ?? null, sha: lockedSha, videoUrl: version?.video_url ?? null });
                          const body = (
                            <>
                              {ev.kind === 'video' && <span className="material-symbols-outlined text-[13px]" aria-hidden="true">play_circle</span>}
                              {ev.label}
                            </>
                          );
                          const cls = 'inline-flex items-center gap-1 rounded-[3px] border border-line bg-surface px-2 py-0.5 text-accent';
                          return ev.href ? (
                            <a key={idx} href={ev.href} target="_blank" rel="noreferrer" title={evidenceTitle(ev)} className={`${cls} hover:underline`}>
                              {body}
                            </a>
                          ) : (
                            <span key={idx} title={evidenceTitle(ev)} className={cls}>
                              {body}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {results.feedback && (
            <div className="grid grid-cols-1 gap-6 border-t border-line pt-5 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-good">
                  <span className="material-symbols-outlined text-[19px]">thumb_up</span>
                  <h4 className="font-serif-heading text-[18px] font-medium text-ink">{tr('Forensic Strengths')}</h4>
                </div>
                <ul className="space-y-2 text-[13px] text-muted">
                  {results.feedback.strengths_json.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-good">
                        check_circle
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-accent">
                  <span className="material-symbols-outlined text-[19px]">tune</span>
                  <h4 className="font-serif-heading text-[18px] font-medium text-ink">
                    {tr('Recommendations & Next Steps')}
                  </h4>
                </div>
                <ul className="space-y-2.5 text-[13px] text-muted">
                  {results.feedback.improvements_json.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-accent">
                        arrow_forward
                      </span>
                      <div>
                        <span className="font-medium text-ink">{s.what}</span>{' '}
                        {s.where && (
                          <code className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.5 text-[11px] text-accent">
                            {s.where}
                          </code>
                        )}
                        <div className="mt-0.5 text-[12px] text-muted">{tr('Next step:')}{' '}{s.next_step}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3. Official Leaderboard Table */}
      <section id="leaderboardSection" className="space-y-4 rounded-[6px] border border-line bg-surface p-6">
        <SectionHeader
          title={tr('Official Event Leaderboard')}
          subtitle={trn('Final standings across {count} participating team.', 'Final standings across {count} participating teams.', totalTeams)}
          rightSlot={
            <div className="font-mono-code flex items-center gap-1.5 rounded-[3px] border border-line bg-paper px-3 py-1 text-[11px] text-muted">
              <span className="material-symbols-outlined text-[14px] text-good">lock</span>
              <span>{tr('FINAL RANKING PUBLISHED')}</span>
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="font-mono-code w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
                <th className="px-4 py-3">{tr('Rank')}</th>
                <th className="px-4 py-3">{tr('Cohort Team / Submission')}</th>
                <th className="px-4 py-3 text-right">{tr('Composite Score')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {results.leaderboard?.map((row) => (
                <tr
                  key={row.rank}
                  className={
                    row.mine
                      ? 'bg-accent-soft/65 hover:bg-accent-soft transition-colors'
                      : 'hover:bg-paper/60 transition-colors'
                  }
                >
                  <td
                    className={`font-serif-heading px-4 py-3.5 text-[18px] font-bold ${
                      row.mine ? 'text-accent' : 'text-ink'
                    }`}
                  >
                    #{String(row.rank).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] ${row.mine ? 'font-bold text-accent' : 'font-semibold text-ink'}`}>
                        {row.team_name}
                      </span>
                      {row.mine && (
                        <span className="rounded-[2px] bg-accent px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-on-accent uppercase">
                          {tr('YOUR SUBMISSION')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={`font-serif-heading px-4 py-3.5 text-right text-[20px] font-bold ${
                      row.mine ? 'text-accent' : 'text-ink'
                    }`}
                  >
                    {row.total.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
