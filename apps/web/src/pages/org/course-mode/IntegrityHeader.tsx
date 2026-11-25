import { Link } from 'react-router-dom';
import {
  DossierPageHeader,
  Select,
  Tabs,
  formatDate,
  linkButton,
  linkButtonSecondary,
} from '../../../components/shared';
import { tr, trn } from '../../../i18n';
import { STATUS_LABEL } from '../../../lib/types';
import type { CourseTab, OrgAssignment, OrgEvent, Source, Target } from './types';

export function IntegrityHeader({
  orgName,
  reviewerName,
  source,
  onSourceChange,
  events,
  assignments,
  activeEventId,
  onSelectEvent,
  activeAssignmentId,
  onSelectAssignment,
  target,
  participantCount,
  submissionCount,
  flagCount,
  withOwnershipCount,
  rubricCount,
  activeTab,
  onTabChange,
  onRefresh,
  onExportCsv,
}: {
  orgName: string | undefined;
  reviewerName: string | undefined;
  source: Source;
  onSourceChange: (next: Source) => void;
  events: readonly OrgEvent[];
  assignments: readonly OrgAssignment[];
  activeEventId: string | null;
  onSelectEvent: (id: string) => void;
  activeAssignmentId: string | null;
  onSelectAssignment: (id: string) => void;
  target: Target | null;
  participantCount: number | undefined;
  submissionCount: number;
  flagCount: number;
  withOwnershipCount: number;
  rubricCount: number;
  activeTab: CourseTab;
  onTabChange: (tab: CourseTab) => void;
  onRefresh: () => void;
  onExportCsv: () => void;
}) {
  return (
    <>
      {/* 1. Faculty Portal Department Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-line bg-surface px-5 py-2.5">
        <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-accent-soft px-2 py-0.5 font-bold text-accent-ink">
            <span className="material-symbols-outlined text-[14px]">policy</span>
            <span>{tr('INTEGRITY')}</span>
          </span>
          <span className="text-line">//</span>
          <span className="font-semibold text-ink">{orgName?.toUpperCase() ?? tr('DEPARTMENT')}</span>
          {target && (
            <>
              <span className="text-line">•</span>
              <span className="rounded-[3px] border border-line bg-paper px-2 py-0.5 font-bold text-ink">
                {target.tag}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            variant="segmented"
            ariaLabel={tr('Review events or courses')}
            tabs={[
              { key: 'events', label: tr('Events'), icon: 'emoji_events' },
              { key: 'courses', label: tr('Courses'), icon: 'school' },
            ]}
            active={source}
            onChange={onSourceChange}
          />
          {source === 'events' && events.length > 0 && (
            <Select
              aria-label={tr('Event')}
              value={activeEventId ?? ''}
              onChange={(e) => onSelectEvent(e.target.value)}
              className="font-mono-code h-8 w-56 bg-paper text-[11px]"
            >
              {events.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({STATUS_LABEL[x.status]})
                </option>
              ))}
            </Select>
          )}
          {source === 'courses' && assignments.length > 0 && (
            <Select
              aria-label={tr('Course assignment')}
              value={activeAssignmentId ?? ''}
              onChange={(e) => onSelectAssignment(e.target.value)}
              className="font-mono-code h-8 w-64 bg-paper text-[11px]"
            >
              {assignments.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.course_name} · {x.title} ({STATUS_LABEL[x.status]})
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {/* 2. Course Context Header */}
      <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
        <DossierPageHeader
          eyebrow={
            <div className="flex flex-wrap items-center gap-2 text-muted">
              <Link to="/org/events" className="text-accent hover:underline">
                {tr('← EVENT CONSOLE')}
              </Link>
              <span>/</span>
              <span>{tr('INTEGRITY REVIEW')}</span>
            </div>
          }
          title={target ? target.name : tr('Integrity review')}
          subtitle={tr('Similarity between submissions, voice-interview ownership and your verdict on each submission, for one event or course assignment at a time.')}
          borderBottom={false}
          rightSlot={
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onRefresh} className={linkButtonSecondary}>
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>{tr('Refresh')}</span>
              </button>
              <button type="button" onClick={onExportCsv} className={linkButtonSecondary}>
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                <span>{tr('Export CSV')}</span>
              </button>
              {target && (
                <Link to={target.consoleLink} className={linkButton}>
                  <span className="material-symbols-outlined text-[16px]">gavel</span>
                  <span>{target.kind === 'assignment' ? tr('Assignment console') : tr('Event console')}</span>
                </Link>
              )}
            </div>
          }
        />

        {/* Metadata Chips Strip */}
        {target && (
          <div className="font-mono-code grid grid-cols-2 gap-4 border-t border-line pt-4 text-[12px] md:grid-cols-5">
            <div>
              <span className="block text-[10px] text-muted uppercase">{tr('Reviewer')}</span>
              <span className="font-semibold text-ink">{reviewerName || tr('Faculty Lead')}</span>
            </div>
            <div>
              <span className="block text-[10px] text-muted uppercase">{tr('Participants')}</span>
              <span className="font-semibold text-ink">
                {trn('{count} participant', '{count} participants', participantCount ?? 0)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-muted uppercase">{tr('Status')}</span>
              <span className="font-semibold text-accent uppercase">{STATUS_LABEL[target.status]}</span>
            </div>
            <div>
              <span className="block text-[10px] text-muted uppercase">{tr('Submissions')}</span>
              <span className="font-semibold text-ink">
                {submissionCount} / {participantCount ?? submissionCount}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-muted uppercase">{tr('Deadline')}</span>
              <span className="font-semibold text-good">{formatDate(target.deadline)}</span>
            </div>
          </div>
        )}

        <Tabs
          tabs={[
            {
              key: 'roster',
              label: tr('01. Submissions'),
              count: submissionCount,
              icon: 'group',
            },
            {
              key: 'plagiarism',
              label: tr('02. Similarity & Plagiarism Matrix'),
              count: flagCount,
              icon: 'schema',
            },
            {
              key: 'grading',
              label: tr('03. Oral Defense & Review'),
              count: withOwnershipCount,
              icon: 'record_voice_over',
            },
            {
              key: 'rubric',
              label: tr('04. Rubric'),
              count: rubricCount,
              icon: 'fact_check',
            },
          ]}
          active={activeTab}
          onChange={onTabChange}
          ariaLabel={tr('Integrity review sections')}
        />
      </section>
    </>
  );
}
