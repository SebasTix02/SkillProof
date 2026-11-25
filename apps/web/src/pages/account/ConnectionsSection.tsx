import { tr, trn } from '../../i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NumberedSectionCard } from '../../components/shared';

export function ConnectionsSection({
  organizations,
}: {
  organizations: { id: string; name: string; roles: string[] }[];
}) {
  const [micStatus, setMicStatus] = useState<'idle' | 'testing' | 'ok' | 'denied'>('idle');

  async function testMicrophone() {
    setMicStatus('testing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('ok');
    } catch {
      setMicStatus('denied');
    }
  }

  return (
    <NumberedSectionCard
      id="section-integrations"
      number="03"
      theme="neutral"
      title={tr('Connected Verification Signals & Hardware')}
      subtitle={tr('Repository analysis engine, organization memberships, and oral defense microphone status.')}
      sectionTag={tr('SECTION 03 // CONNECTIONS')}
    >
      <div className="space-y-4">
        {/* GitHub Repository Analyzer Card */}
        <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-surface p-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-ink text-paper">
              <span className="material-symbols-outlined text-[20px]">code</span>
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">{tr('GitHub Repository Analyzer')}</span>
                <span className="font-mono-code rounded-[2px] border border-good/30 bg-good-soft px-1.5 py-0.5 text-[10px] font-semibold text-good-ink">
                  {tr('READ-ONLY PUBLIC REPOS')}
                </span>
              </div>
              <p className="text-[12px] text-muted">
                {tr('Selective Git tree reader and blob SHA cache active for hackathons and personal interviews.')}
              </p>
            </div>
          </div>
          <Link
            to="/interview/new"
            className="btn-tactile font-mono-code inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] border border-line bg-surface px-3.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
          >
            {tr('Start Repo Interview →')}
          </Link>
        </div>

        {/* Organizations & Roles Card */}
        <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-surface p-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-accent/25 bg-accent-soft text-accent-ink">
              <span className="material-symbols-outlined text-[20px]">corporate_fare</span>
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">{tr('Organization Memberships')}</span>
                <span className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                  {trn('{count} ORG', '{count} ORGS', organizations.length)}
                </span>
              </div>
              <p className="text-[12px] text-muted">
                {organizations.length > 0
                  ? organizations.map((o) => `${o.name} (${o.roles.join(', ')})`).join(' • ')
                  : tr('Standard Candidate Account • Eligible to join public and access-code events.')}
              </p>
            </div>
          </div>
          <Link
            to={organizations.length > 0 ? '/org/events' : '/events'}
            className="btn-tactile font-mono-code inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] border border-line bg-surface px-3.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
          >
            {organizations.length > 0 ? tr('Organizer Console →') : tr('Browse Events →')}
          </Link>
        </div>

        {/* Audio Verification Hardware Card */}
        <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-surface p-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-good/30 bg-good-soft text-good-ink">
              <span className="material-symbols-outlined text-[20px]">mic</span>
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">{tr('Oral Defense Capture Device')}</span>
                <span
                  className={`font-mono-code rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    micStatus === 'ok'
                      ? 'border-good/30 bg-good-soft text-good-ink'
                      : micStatus === 'denied'
                        ? 'border-bad/30 bg-bad-soft text-bad'
                        : 'border-line bg-paper text-muted'
                  }`}
                >
                  {micStatus === 'ok'
                    ? tr('PERMISSION GRANTED')
                    : micStatus === 'denied'
                      ? tr('PERMISSION BLOCKED')
                      : tr('READY TO TEST')}
                </span>
              </div>
              <p className="text-[12px] text-muted">
                {tr('Browser microphone with echo cancellation & noise suppression for 3-minute Gemini Live exams.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void testMicrophone()}
            className="btn-tactile font-mono-code inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] border border-line bg-surface px-3.5 text-[11px] font-semibold text-ink hover:border-good hover:text-good"
          >
            <span className="material-symbols-outlined text-[15px] text-good">graphic_eq</span>
            <span>{micStatus === 'testing' ? tr('Checking…') : tr('Test Mic Access')}</span>
          </button>
        </div>
      </div>
    </NumberedSectionCard>
  );
}
