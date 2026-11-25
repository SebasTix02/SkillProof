import { t, tr } from '../../i18n';
import { Link } from 'react-router-dom';
import { LanguageChoice } from '../../components/LanguageControl';
import { ThemeChoice } from '../../components/ThemeControl';
import { NumberedSectionCard } from '../../components/shared';

export function SecurityAndPreferencesSections({
  slug,
  isPublic,
  showQuotes,
  notifyResults,
  onSavePreference,
  rotatedUrl,
  busy,
  onRevokePublicAccess,
  onSignOut,
}: {
  slug: string;
  isPublic: boolean;
  showQuotes: boolean;
  notifyResults: boolean;
  onSavePreference: (field: 'show_quotes' | 'notify_results', value: boolean) => Promise<void>;
  rotatedUrl: string | null;
  busy: boolean;
  onRevokePublicAccess: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  return (
    <>
      {/* 04. Appearance: light or dark page, for this browser */}
      <NumberedSectionCard
        id="section-appearance"
        number="04"
        theme="neutral"
        title={t('theme.appearance')}
        subtitle={t('theme.appearanceHint')}
        sectionTag={tr('SECTION 04 // APPEARANCE')}
      >
        <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
          <div className="space-y-1.5">
            <p className="text-[12px] font-semibold text-ink">{t('theme.label')}</p>
            <ThemeChoice />
          </div>
          <div className="space-y-1.5">
            <p className="text-[12px] font-semibold text-ink">{t('language.label')}</p>
            <LanguageChoice id="account-language" />
            <p className="text-[12px] text-muted">{t('language.hint')}</p>
          </div>
        </div>
      </NumberedSectionCard>

      {/* 05. Privacy Controls & Notification Telemetry */}
      <NumberedSectionCard
        id="section-privacy"
        number="05"
        theme="neutral"
        title={tr('Privacy Controls & Verification Telemetry')}
        subtitle={tr('Visibility boundaries for interview attempts and event notifications.')}
        sectionTag={tr('SECTION 05 // PRIVACY')}
      >
        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-[4px] border border-line bg-paper/50 p-3.5">
            <input
              type="checkbox"
              checked={showQuotes}
              onChange={(e) => void onSavePreference('show_quotes', e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-accent"
            />
            <div className="space-y-0.5">
              <span className="block text-[13px] font-semibold text-ink">
                {tr('Display verbatim transcript quotes on my public profile')}
              </span>
              <span className="block text-[12px] text-muted">
                {tr('Recruiters inspecting your public dossier can read the exact quotes that proved each skill.')}
              </span>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-[4px] border border-line bg-paper/50 p-3.5">
            <input
              type="checkbox"
              checked={notifyResults}
              onChange={(e) => void onSavePreference('notify_results', e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-accent"
            />
            <div className="space-y-0.5">
              <span className="block text-[13px] font-semibold text-ink">
                {tr('Tell me when results of my events are published')}
              </span>
              <span className="block text-[12px] text-muted">
                {tr('Email notices are coming soon. Your choice is saved and used as soon as they are.')}
              </span>
            </div>
          </label>

          <div className="flex items-start justify-between gap-4 rounded-[4px] border border-warn/30 bg-warn-soft/45 p-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  {tr('Hide failed or incomplete interview attempts from public profile')}
                </span>
                <span className="font-mono-code rounded-[2px] border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold text-warn-ink">
                  {tr('ENFORCED BY PROTOCOL')}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted">
                {tr('Only completed interviews with a finalized ownership report are shown on {path}. Failed or in-progress sessions remain strictly private to your account.', { path: `/p/${slug}` })}
              </p>
            </div>
          </div>
        </div>
      </NumberedSectionCard>

      {/* Danger Zone & Access Revocation (Crimson Accent) */}
      <NumberedSectionCard
        id="section-danger"
        icon="warning"
        theme="bad"
        title={tr('Danger Zone & Access Revocation')}
        subtitle={tr('Immediate public link revocation and passphrase rotation routines.')}
        sectionTag={tr('SECURITY CONTROLS')}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col justify-between space-y-4 rounded-[4px] border border-bad/30 bg-surface p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                <span className="material-symbols-outlined text-[18px] text-bad">link_off</span>
                <span>{tr('Revoke Public Dossier Link')}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted">
                {isPublic
                  ? tr('Moves your dossier from {path} to a new address, so every link you shared before stops working. Your profile stays public.', { path: `/p/${slug}` })
                  : tr('Moves your dossier from {path} to a new address, so every link you shared before stops working. Your profile stays private.', { path: `/p/${slug}` })}
              </p>
              {rotatedUrl && (
                <p className="font-mono-code break-all rounded-[3px] border border-line bg-paper px-2 py-1 text-[11px] text-ink">
                  {tr('New link:')}{' '}{rotatedUrl}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRevokePublicAccess()}
              className="btn-tactile font-mono-code h-9 w-full cursor-pointer rounded-[4px] border border-bad/40 bg-bad-soft text-[11px] font-bold tracking-wider text-bad uppercase hover:bg-bad hover:text-on-bad disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? tr('CREATING NEW LINK…') : tr('REVOKE AND CREATE A NEW LINK')}
            </button>
          </div>

          <div className="flex flex-col justify-between space-y-4 rounded-[4px] border border-bad/30 bg-surface p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                <span className="material-symbols-outlined text-[18px] text-bad">lock_reset</span>
                <span>{tr('Passphrase & Session Control')}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted">
                {tr('Rotate your account passphrase or terminate your active browser session immediately.')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/reset-password"
                className="btn-tactile font-mono-code flex h-9 items-center justify-center rounded-[4px] border border-line bg-paper text-[11px] font-bold text-ink uppercase hover:border-ink"
              >
                {tr('Rotate Key')}
              </Link>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="btn-tactile font-mono-code h-9 cursor-pointer rounded-[4px] border border-bad bg-bad text-[11px] font-bold text-on-bad uppercase hover:bg-bad-hover"
              >
                {tr('Sign Out')}
              </button>
            </div>
          </div>
        </div>
      </NumberedSectionCard>
    </>
  );
}
