import { tr } from '../../i18n';
import { Link } from 'react-router-dom';
import { Badge, SectionHeader, formatDate } from '../../components/shared';
import { STATUS_LABEL, VISIBILITY_LABEL, type EventView } from '../../lib/types';
import { type EventTab } from './types';

export function EventHeroHeader({
  event,
  isManager,
  activeStep,
}: {
  event: EventView;
  isManager: boolean;
  activeStep: 1 | 2 | 3 | 4;
}) {
  const stateBadgeConfig: Record<1 | 2 | 3 | 4, { label: string; tone: 'warn' | 'accent' | 'good' }> = {
    1: { label: tr('STATE 1: NOT JOINED'), tone: 'warn' },
    2: { label: tr('STATE 2: JOINED & OPEN'), tone: 'accent' },
    3: { label: tr('STATE 3: {status}', { status: STATUS_LABEL[event.status].toUpperCase() }), tone: 'warn' },
    4: { label: tr('STATE 4: PUBLISHED'), tone: 'good' },
  };

  return (
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
            {isManager && (
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
  );
}

export function EventLifecycleStepper({
  event,
  activeStep,
}: {
  event: EventView;
  activeStep: 1 | 2 | 3 | 4;
}) {
  return (
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
  );
}

export function EventSectionNav({
  event,
  activeTab,
  onJump,
}: {
  event: EventView;
  activeTab: EventTab;
  onJump: (tab: EventTab, elementId: string) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-6 rounded-[6px] border border-line bg-surface px-6 pt-3">
      <button
        type="button"
        onClick={() => onJump('workspace', 'workspaceSection')}
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
          onClick={() => onJump('rubric', 'rubricSection')}
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
          onClick={() => onJump('leaderboard', 'leaderboardSection')}
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
  );
}

export function EventRubricSection({ event }: { event: EventView }) {
  if (event.rubric_json.length === 0) return null;

  return (
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
  );
}
