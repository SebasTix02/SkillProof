import { tr } from '../../i18n';
import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs } from '../../components/shared';

const AUTH_IMAGE = '/images/auth.webp';

export function AuthPortalShell({
  mode,
  title,
  subtitle,
  children,
  statusText = tr('Active Session Handshake Ready'),
  badgeLabel = tr('RLS ENFORCED'),
}: {
  mode: 'login' | 'signup' | 'recovery';
  title: string;
  subtitle: string;
  children: ReactNode;
  statusText?: string;
  badgeLabel?: string;
}) {
  const location = useLocation();
  const search = location.search;

  return (
    <div className="mx-auto max-w-[1160px] py-2">
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Left: Technical Editorial Showcase Hero Card (6 cols) */}
        <section className=" flex flex-col justify-between rounded-[6px] border border-line bg-surface p-6 sm:p-8 lg:col-span-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono-code inline-flex items-center gap-2 rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
                <span className="status-dot-live bg-accent text-accent" />
                <span>{tr('SECURED BY SUPABASE AUTH')}</span>
              </div>
              <span className="font-mono-code text-[11px] tracking-wider text-muted uppercase">
                {tr('SECURE SIGN-IN')}
              </span>
            </div>

            {/* Feature Image Frame */}
            <div className="relative my-3 overflow-hidden rounded-[4px] border border-line bg-paper">
              <img
                src={AUTH_IMAGE}
                alt={tr('SkillProof sign-in')}
                className="block h-[240px] w-full object-cover sm:h-[280px]"
              />
              <div className="flex items-center justify-between border-t border-dark-hairline bg-dark-inset px-4 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-good-on-dark">verified_user</span>
                  <span className="font-mono-code text-[11px] tracking-wide">
                    {tr('Verified Repository & Voice Credential Binding')}
                  </span>
                </div>
                <span className="font-mono-code rounded-[3px] border border-dark-hairline bg-dark-canvas px-2 py-0.5 text-[10px] text-dark-ink">
                  {tr('EMAIL + PASSWORD')}
                </span>
              </div>
            </div>

            {/* Editorial Narrative */}
            <div className="space-y-2 pt-1">
              <h2 className="font-serif-heading text-[22px] leading-[29px] font-medium text-ink sm:text-[26px] sm:leading-[33px]">
                {tr('Evidence-backed scores and voice interviews about your own code.')}
              </h2>
              <p className="text-[13px] leading-[21px] text-muted">
                {tr('Authenticate as a candidate to defend your GitHub repositories in 3-minute voice interviews and publish your recruiter dossier, or register an organization to run commit-locked hackathons.')}
              </p>
            </div>
          </div>

          {/* Protocol Status Footprint */}
          <div className="mt-6 grid grid-cols-3 gap-2.5 border-t border-line pt-4 sm:gap-3">
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">{tr('Session Security')}</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-ink">{tr('Supabase RLS')}</div>
            </div>
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">{tr('Repo Scope')}</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-good">{tr('Read-Only SHA')}</div>
            </div>
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">{tr('Oral Engine')}</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-accent">{tr('Gemini Live 3m')}</div>
            </div>
          </div>
        </section>

        {/* Right: Authentication Dossier Portal (6 cols) */}
        <section className="flex flex-col justify-between rounded-[6px] border border-line bg-surface p-6 sm:p-8 lg:col-span-6">
          <div className="space-y-5">
            {/* Header & Identity Icon */}
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div className="space-y-1">
                <span className="font-mono-code text-[10px] font-semibold tracking-wider text-accent uppercase">
                  {tr('IDENTITY & ACCESS CONTROL')}
                </span>
                <h1 className="font-serif-heading text-[24px] leading-[30px] font-medium text-ink sm:text-[28px] sm:leading-[34px]">
                  {title}
                </h1>
                <p className="text-[13px] text-muted">{subtitle}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-line bg-paper text-accent">
                <span className="material-symbols-outlined text-[20px]">fingerprint</span>
              </div>
            </div>

            {/* Auth Mode Navigation Tabs */}
            <Tabs
              ariaLabel={tr('Account access')}
              size="sm"
              active={mode}
              tabs={[
                { key: 'login', label: tr('Sign In'), icon: 'login', to: `/login${search}` },
                { key: 'signup', label: tr('Request Access / Register'), icon: 'person_add', to: `/signup${search}` },
                { key: 'recovery', label: tr('Reset Key'), icon: 'key', to: '/forgot-password' },
              ]}
            />

            {/* Active Form / View Content */}
            <div className="pt-1">{children}</div>
          </div>

          {/* Cryptographic Signature Status Stamp Card */}
          <div className="mt-6 space-y-2.5 rounded-[4px] border border-line bg-paper p-3.5">
            <div className="font-mono-code flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <span className="h-2 w-2 rounded-full bg-good" />
                {tr('Account Security')}
              </span>
              <span className="rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[10px] font-bold text-good-ink">
                {badgeLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-line pt-2">
              <div>
                <span className="font-mono-code block text-[10px] text-muted uppercase">{tr('Verification Mode')}</span>
                <span className="font-mono-code text-[11px] font-medium text-ink">{tr('Email + role')}</span>
              </div>
              <div className="text-right">
                <span className="font-mono-code block text-[10px] text-muted uppercase">{tr('Status')}</span>
                <span className="font-mono-code text-[11px] font-medium text-ink">{statusText}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
