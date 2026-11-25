import { weightedTotal, type CommitProfile, type RepoMap, type Rubric } from '@skillproof/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AiActivity, ModelsUsed } from '../../../components/AiActivity';
import { SubmissionJudgingControls } from '../../../components/JudgingControls';
import { one } from '../../../components/Report';
import {
  Badge,
  Button,
  CONFIDENCE_LABEL,
  DossierPageHeader,
  INTERVIEW_STATUS_LABEL,
  Notice,
  NumberedSectionCard,
  PageState,
  SUBMISSION_STATUS_LABEL,
  Select,
  Textarea,
  VERDICT_LABEL,
  formatDate,
  scoreTone,
  type InterviewStatus,
} from '../../../components/shared';
import { tr } from '../../../i18n';
import { useAuth } from '../../../lib/auth';
import type { AssignmentSubmissionRow, AssignmentView, GroupView } from '../../../lib/courses';
import type { ScoreView } from '../../../lib/types';
import { useLoad } from '../../../lib/useLoad';
import { AdjustGrade } from '../Courses';
import { ScoreCalibrationRow } from '../SubmissionDetail';
import { SUB_BASE, WORKING, useAction } from './useAction';

interface Analysis {
  commit_sha: string;
  model: string | null;
  map_json: RepoMap;
  commit_profile_json: CommitProfile | null;
  file_count: number;
}

interface SubmissionDetailResponse {
  primary_models: string[];
  submission: AssignmentSubmissionRow & {
    activity_json: AssignmentSubmissionRow['activity'];
    course_assignments: { id: string; course_id: string; title: string; rubric_json: Rubric; status: AssignmentView['status']; mode: AssignmentView['mode']; due_at: string; interviews_enabled: boolean; courses: { name: string; code: string } | null };
    repo_analyses: Analysis | Analysis[] | null;
    assignment_submission_versions: { id: string; version_no: number; description: string; video_url: string | null; created_at: string; submitted_by: string | null; repos: { owner: string; name: string; url: string } | null }[];
  };
  group: GroupView | null;
  student: { display_name: string; github_login: string | null } | null;
  scores: ScoreView[];
  feedback: { strengths_json: string[]; improvements_json: { what: string; where: string; next_step: string }[]; next_steps_json: string[] } | null;
  interviews: { id: string; status: string; user_id: string; interview_reports: { ownership_score: number; confidence: string } | { ownership_score: number; confidence: string }[] | null }[];
  decisions: { id: string; verdict: string; note: string; created_at: string; profiles: { display_name: string } | null }[];
  adjustments: { user_id: string; adjusted_total: number; note: string; adjusted_at: string }[];
}

export function AssignmentSubmissionPage() {
  const { courseId = '', id = '', sid = '' } = useParams();
  const { org } = useAuth();
  const canManage = !!org?.permissions.includes('course.manage');
  const canDecide = !!org?.permissions.includes('integrity.decide');
  const data = useLoad<SubmissionDetailResponse>(`${SUB_BASE}/${sid}`, (d) => WORKING.has(d.submission.status));
  const { busy, act } = useAction(data.reload);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<'clear' | 'live_defense' | 'code_of_conduct'>('clear');
  const [note, setNote] = useState('');

  if (!data.data) return <PageState loading={data.loading} error={data.error} kind="detail" />;
  const { submission: sub, group, student, scores, feedback, interviews, decisions, adjustments } = data.data;
  const a = sub.course_assignments;
  const rubric = a.rubric_json;
  const total = weightedTotal(rubric, scores);
  const analysis = one(sub.repo_analyses);
  const latest = sub.assignment_submission_versions.slice().sort((x, y) => y.version_no - x.version_no)[0];
  const repoUrl = latest?.repos?.url ?? null;
  const label = group?.name ?? student?.display_name ?? tr('Submission');
  const working = WORKING.has(sub.status);
  const canOverride = canManage && (a.status === 'review' || a.status === 'published');
  const ownershipOf = (userId: string) => {
    const i = interviews.find((x) => x.user_id === userId);
    const r = i ? (Array.isArray(i.interview_reports) ? i.interview_reports[0] : i.interview_reports) : null;
    return { interview: i ?? null, report: r ?? null };
  };

  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <>
            <Link to={`/org/courses/${courseId}/assignments/${id}`} className="text-accent-ink hover:underline">
              ← {a.title.toUpperCase()}
            </Link>
            <Badge tone={sub.status === 'scored' ? 'good' : sub.status === 'error' ? 'bad' : 'neutral'}>{SUBMISSION_STATUS_LABEL[sub.status]}</Badge>
          </>
        }
        title={label}
        subtitle={
          <>
            {group ? tr('Group of {n}', { n: group.members.filter((m) => m.status === 'accepted').length }) : tr('Individual submission')}
            {latest?.repos && (
              <>
                {' · '}
                <a href={latest.repos.url} target="_blank" rel="noreferrer" className="font-mono-code text-accent-ink hover:underline">
                  {latest.repos.owner}/{latest.repos.name}
                </a>
              </>
            )}
            {sub.locked_commit_sha && <span className="font-mono-code"> @{sub.locked_commit_sha.slice(0, 7)}</span>}
          </>
        }
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            {total != null && (
              <span className="font-mono-code text-[28px] font-bold text-ink">
                {total.toFixed(1)}
                <span className="text-[13px] font-normal text-muted"> / 10</span>
              </span>
            )}
            {canManage && (
              <SubmissionJudgingControls
                id={sub.id}
                name={label}
                status={sub.status}
                frozen={!!sub.locked_commit_sha}
                busy={busy}
                act={(k, p, m, c) => void act(k, p, m, c)}
                basePath={SUB_BASE}
              />
            )}
          </div>
        }
      />

      {sub.error && <Notice tone="error">{sub.error}</Notice>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {scores.length > 0 ? (
            <NumberedSectionCard number="01" icon="fact_check" title={tr('Scores')} subtitle={canOverride ? tr('Change a score if you disagree; the total updates.') : tr('Scores can be changed once grading is done.')} theme="accent">
              <ul className="space-y-2.5">
                {rubric.map((c, i) => {
                  const sc = scores.find((x) => x.criterion_key === c.key);
                  return sc ? (
                    <ScoreCalibrationRow
                      key={c.key}
                      index={i}
                      score={sc}
                      criterion={c}
                      repoUrl={repoUrl}
                      sha={sub.locked_commit_sha}
                      videoUrl={latest?.video_url ?? null}
                      canOverride={canOverride}
                      onSaved={() => void data.reload()}
                      scorePath="/api/assignment-scores"
                    />
                  ) : null;
                })}
              </ul>
            </NumberedSectionCard>
          ) : (
            <Notice tone="info">{working ? tr('Being graded…') : a.status === 'open' ? tr('Grading starts when the assignment closes.') : tr('No scores yet.')}</Notice>
          )}

          {feedback && (
            <NumberedSectionCard number="02" icon="rate_review" title={tr('Feedback for the student')} subtitle={tr('What they see once results are published.')} theme="good">
              <div className="space-y-4 text-[13px]">
                {feedback.strengths_json.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink">{tr('Strengths')}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{feedback.strengths_json.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
                {feedback.improvements_json.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink">{tr('To improve')}</p>
                    <ul className="mt-1 space-y-2">
                      {feedback.improvements_json.map((x) => (
                        <li key={x.what} className="rounded-[4px] border border-line bg-paper p-2.5">
                          <p className="text-ink">{x.what}</p>
                          {x.where && <p className="font-mono-code text-[11px] text-muted">{x.where}</p>}
                          {x.next_step && <p className="text-muted">{x.next_step}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.next_steps_json?.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink">{tr('Next steps')}</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">{feedback.next_steps_json.map((x) => <li key={x}>{x}</li>)}</ol>
                  </div>
                )}
              </div>
            </NumberedSectionCard>
          )}

          {analysis && (
            <NumberedSectionCard number="03" icon="account_tree" title={tr('What the grader read')} subtitle={`${analysis.file_count} files at commit ${analysis.commit_sha.slice(0, 7)}.`} theme="neutral">
              <p className="text-[13px] leading-relaxed text-ink">{analysis.map_json.summary}</p>
            </NumberedSectionCard>
          )}

          <section className="rounded-[6px] border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-semibold text-ink">{tr('Grading activity')}</p>
              <ModelsUsed models={sub.models_used} primary={data.data.primary_models} />
            </div>
            <AiActivity entries={sub.activity_json ?? []} live={working} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[6px] border border-line bg-surface p-5">
            <p className="text-[14px] font-semibold text-ink">{group ? tr('Members') : tr('Student')}</p>
            <ul className="mt-3 space-y-3 text-[13px]">
              {(group ? group.members.filter((m) => m.status === 'accepted') : student ? [{ user_id: sub.student_id!, display_name: student.display_name, github_login: student.github_login }] : []).map((m) => {
                const adj = adjustments.find((x) => x.user_id === m.user_id);
                const { interview, report } = ownershipOf(m.user_id);
                const grade = adj ? Number(adj.adjusted_total) : total;
                return (
                  <li key={m.user_id} className="space-y-1.5 border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">
                        {m.display_name}
                        {m.github_login && <span className="font-mono-code ml-1.5 text-[11px] text-muted">@{m.github_login}</span>}
                      </span>
                      {grade != null && (
                        <span className="flex items-center gap-1">
                          <Badge tone={scoreTone(grade)}>{grade.toFixed(1)}</Badge>
                          {adj && <span className="font-mono-code text-[10px] text-accent-ink" title={tr('Adjusted grade')}>{tr('adj.')}</span>}
                        </span>
                      )}
                    </div>
                    {adj?.note && <p className="text-[12px] text-muted">{adj.note}</p>}
                    {a.interviews_enabled && (
                      <p className="text-[12px] text-muted">
                        {tr('Interview:')}{' '}
                        {interview ? (
                          <Link to={`/interview/${interview.id}`} className="text-accent-ink hover:underline">
                            {report
                              ? tr('ownership {score}/100 ({confidence})', {
                                  score: report.ownership_score,
                                  confidence: CONFIDENCE_LABEL[report.confidence as keyof typeof CONFIDENCE_LABEL] ?? report.confidence,
                                })
                              : (INTERVIEW_STATUS_LABEL[interview.status as InterviewStatus] ?? interview.status)}
                          </Link>
                        ) : (
                          tr('not taken')
                        )}
                      </p>
                    )}
                    {group && canManage && total != null &&
                      (adjusting === m.user_id ? (
                        <AdjustGrade
                          assignmentId={a.id}
                          userId={m.user_id}
                          student={m.display_name}
                          cell={{ total, grade, adjusted: !!adj }}
                          onDone={() => {
                            setAdjusting(null);
                            void data.reload();
                          }}
                        />
                      ) : (
                        <button type="button" onClick={() => setAdjusting(m.user_id)} className="cursor-pointer text-[12px] font-semibold text-accent-ink hover:underline">
                          {adj ? tr('Change their grade') : tr('Adjust their grade')}
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-[6px] border border-line bg-surface p-5">
            <p className="text-[14px] font-semibold text-ink">{tr('Versions')}</p>
            <ul className="mt-2 space-y-2 text-[12px]">
              {sub.assignment_submission_versions
                .slice()
                .sort((x, y) => y.version_no - x.version_no)
                .map((v) => (
                  <li key={v.id}>
                    <span className="font-mono-code font-semibold text-ink">v{v.version_no}</span>
                    <span className="text-muted"> · {formatDate(v.created_at)}</span>
                    {v.repos && <span className="font-mono-code text-muted"> · {v.repos.owner}/{v.repos.name}</span>}
                    {v.description && <p className="text-muted">{v.description}</p>}
                  </li>
                ))}
            </ul>
          </section>

          <section className="rounded-[6px] border border-line bg-surface p-5">
            <p className="text-[14px] font-semibold text-ink">{tr('Integrity')}</p>
            {canDecide && (
              <div className="mt-3 space-y-2">
                <Select aria-label={tr('Verdict')} value={verdict} onChange={(e) => setVerdict(e.target.value as typeof verdict)}>
                  <option value="clear">{tr('Cleared: the work is theirs')}</option>
                  <option value="live_defense">{tr('Live defense required')}</option>
                  <option value="code_of_conduct">{tr('Refer to committee')}</option>
                </Select>
                <Textarea rows={2} aria-label={tr('Note')} placeholder={tr('Note (kept in the history)')} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button
                  variant={verdict === 'code_of_conduct' ? 'danger' : 'secondary'}
                  loading={busy === 'verdict'}
                  disabled={!!busy}
                  onClick={() =>
                    void act('verdict', '/api/integrity-decisions', tr('Verdict saved.'), undefined, { assignment_submission_id: sub.id, verdict, note }).then(() => setNote(''))
                  }
                >
                  {tr('Save verdict')}
                </Button>
              </div>
            )}
            {decisions.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted">{tr('No verdict recorded.')}</p>
            ) : (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[12px]">
                {decisions.map((d) => (
                  <li key={d.id}>
                    <span className="font-semibold text-ink">{VERDICT_LABEL[d.verdict] ?? d.verdict}</span>
                    <span className="text-muted"> · {d.profiles?.display_name ?? tr('reviewer')} · {formatDate(d.created_at)}</span>
                    {d.note && <p className="text-muted">{d.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
