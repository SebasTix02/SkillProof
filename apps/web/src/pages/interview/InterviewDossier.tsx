import { Link } from 'react-router-dom';
import { ModelsUsed } from '../../components/AiActivity';
import { AnswerKey } from '../../components/AnswerKey';
import { Report } from '../../components/Report';
import { CopyLinkButton, Notice, formatDate } from '../../components/shared';
import { tr } from '../../i18n';
import type { useAuth } from '../../lib/auth';
import { focusSummary, type InterviewResponse } from './types';

type MeUser = ReturnType<typeof useAuth>['me'];

export function InterviewDossier({
  data,
  me,
  publicUrl,
}: {
  data: InterviewResponse;
  me: MeUser;
  publicUrl: string | null;
}) {
  const { interview } = data;
  if (!data.report) return null;

  const profile = me?.public_profile;
  const focusNote = focusSummary(data.focus_events ?? []);

  return (
    <>
      <article
        id="verified-dossier-report"
        className="overflow-hidden rounded-[6px] border border-line bg-surface"
      >
        {/* Official Credential Header Block */}
        <header className="space-y-4 border-b border-line bg-surface p-6 sm:p-8">
          <div className="font-mono-code flex flex-col justify-between gap-2 text-[11px] text-muted md:flex-row md:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="status-dot-live bg-good text-good" />
              <span className="font-bold tracking-wider text-ink uppercase">
                {tr('SkillProof Verified Credential')}
              </span>
              <span>•</span>
              <span className="rounded-[2px] border border-line bg-paper px-2 py-0.5">
                {tr('DOSSIER #SP-')}{interview.id.slice(0, 6).toUpperCase()}
              </span>
            </div>
            <div className="rounded-[3px] border border-good/30 bg-good-soft px-2.5 py-0.5 font-medium text-good-ink">
              {interview.created_at
                ? `${tr('ISSUED {date}', { date: formatDate(interview.created_at).toUpperCase() })} • `
                : ''}
              {tr('COMMIT:')}{' '}{interview.commit_sha?.slice(0, 7) ?? 'HEAD'}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 pt-1 md:flex-row md:items-end">
            <div>
              <h2 className="font-serif-heading text-[28px] leading-[34px] font-medium tracking-tight text-ink sm:text-[34px] sm:leading-[40px]">
                {interview.is_owner && me?.profile.display_name
                  ? me.profile.display_name
                  : `${interview.repo.owner}/${interview.repo.name}`}
              </h2>
              <p className="mt-1 text-[14px] text-muted">
                {tr('Repository Defense:')}{' '}
                <strong className="text-ink">
                  {interview.repo.owner}/{interview.repo.name}
                </strong>
                {me?.public_profile?.headline ? ` • ${me.public_profile.headline}` : ''}
              </p>
            </div>

            <span className="font-mono-code inline-flex items-center gap-1.5 self-start rounded-[3px] border border-good/30 bg-good-soft px-3 py-1.5 text-[11px] font-bold text-good-ink md:self-auto">
              <span className="material-symbols-outlined text-[15px]">verified</span>
              <span>{tr('VERIFICATION COMPLETED')}</span>
            </span>
          </div>
        </header>

        <div className="p-6 sm:p-8">
          {focusNote && (
            <div className="print-avoid-break mb-5">
              <Notice tone="warn">
                {focusNote}{' '}
                {tr('This is recorded as a signal for reviewers; it is not a finding of misconduct.')}
              </Notice>
            </div>
          )}
          <Report report={data.report} />
          {data.answer_key && (
            <div className="mt-6">
              <AnswerKey questions={data.answer_key} answers={data.report.answers_json ?? []} />
            </div>
          )}

          {interview.models_used && interview.models_used.length > 0 && (
            <div className="font-mono-code mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[11px] text-muted">
              <span>{tr('EVALUATED WITH:')}</span>
              <ModelsUsed models={interview.models_used} primary={interview.primary_models} />
            </div>
          )}
        </div>

        {/* Attestation Footer Action Bar */}
        <footer className="flex flex-col justify-between gap-4 border-t border-line bg-good-soft p-6 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-3">
            {interview.is_owner && profile && (
              <Link
                to={profile.is_public ? `/p/${profile.slug}` : '/me'}
                className="btn-tactile inline-flex items-center gap-2 rounded-[4px] border border-ink bg-ink px-4 py-2 text-[13px] font-medium text-on-accent hover:border-accent hover:bg-accent"
              >
                <span className="material-symbols-outlined text-[16px]">public</span>
                <span>
                  {profile.is_public ? tr('Open Public Recruiter Profile') : tr('Enable Public Recruiter Profile')}
                </span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="btn-tactile inline-flex cursor-pointer items-center gap-2 rounded-[4px] border border-line bg-surface px-4 py-2 text-[13px] font-medium text-ink hover:border-muted hover:bg-paper"
            >
              <span className="material-symbols-outlined text-[16px] text-good">print</span>
              <span>{tr('Print / Save PDF Dossier')}</span>
            </button>
          </div>

          {interview.is_owner && profile?.is_public && publicUrl && (
            <CopyLinkButton
              value={publicUrl}
              label={tr('Copy Recruiter Access Link')}
              copiedLabel={tr('COPIED RECRUITER LINK!')}
            />
          )}
        </footer>
      </article>

      {interview.is_owner && profile && !profile.is_public && (
        <Notice tone="info">
          {tr('Your profile is currently private.')}{' '}
          <Link to="/me" className="font-semibold text-accent underline">
            {tr('Make it public in Account Settings')}
          </Link>{' '}
          {tr('to share this verified report with recruiters.')}
        </Notice>
      )}

      {data.transcript && data.transcript.length > 0 && (
        <section className="rounded-[6px] border border-line bg-surface p-5">
          <details>
            <summary className="font-mono-code cursor-pointer text-[12px] font-semibold tracking-wider text-ink uppercase">
              {tr('Inspect Full Verbatim Transcript (')}{data.transcript.length}{' '}{tr('exchanges)')}
            </summary>
            <ol className="mt-4 space-y-2.5 border-t border-line pt-4 text-[13px]">
              {data.transcript.map((t, i) => (
                <li
                  key={i}
                  className={`rounded-[4px] border border-line p-3 ${
                    t.role === 'interviewer'
                      ? 'bg-paper/60'
                      : t.role === 'system'
                        ? 'bg-warn-soft/40'
                        : 'bg-surface'
                  }`}
                >
                  <div className="font-mono-code mb-1 flex items-center justify-between text-[10px] text-muted uppercase">
                    <span
                      className={
                        t.role === 'interviewer'
                          ? 'font-bold text-accent'
                          : t.role === 'system'
                            ? 'font-bold text-warn'
                            : 'font-bold text-good'
                      }
                    >
                      {t.role === 'interviewer'
                        ? tr('AI Technical Examiner')
                        : t.role === 'system'
                          ? 'SkillProof'
                          : tr('Candidate')}
                    </span>
                    {typeof t.at_ms === 'number' && <span>+{Math.round(t.at_ms / 1000)}s</span>}
                  </div>
                  <p className="text-ink">{t.text}</p>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </>
  );
}
