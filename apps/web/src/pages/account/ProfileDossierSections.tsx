import { tr } from '../../i18n';
import { Link } from 'react-router-dom';
import {
  CopyLinkButton,
  Field,
  Input,
  LiveDot,
  NumberedSectionCard,
  ToggleSwitch,
} from '../../components/shared';

export function ProfileDossierSections({
  name,
  onNameChange,
  displayNameFallback,
  email,
  initials,
  slug,
  url,
  headline,
  onHeadlineChange,
  isPublic,
  onIsPublicChange,
}: {
  name: string;
  onNameChange: (next: string) => void;
  displayNameFallback: string;
  email: string | null;
  initials: string;
  slug: string;
  url: string | null;
  headline: string;
  onHeadlineChange: (next: string) => void;
  isPublic: boolean;
  onIsPublicChange: (next: boolean) => void;
}) {
  return (
    <>
      {/* 01. Public Profile Configuration (Cobalt Accent) */}
      <NumberedSectionCard
        id="section-profile"
        number="01"
        theme="accent"
        title={tr('Public Identity & Recruiter Persona')}
        subtitle={tr('Identity and engineering headline displayed on your public recruiter dossier.')}
        sectionTag={tr('SECTION 01 // IDENTITY')}
      >
        <div className="space-y-5">
          {/* User Persona Preview Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[4px] border border-line bg-paper p-4">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="font-mono-code flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-accent text-[15px] font-bold text-on-accent">
                  {initials}
                </div>
                <span
                  className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-good text-on-good"
                  title={tr('Verified Account')}
                >
                  <span className="material-symbols-outlined text-[10px]">check</span>
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-ink">
                    {name || displayNameFallback}
                  </span>
                  <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">
                    /p/{slug}
                  </span>
                </div>
                <p className="font-mono-code text-[11px] text-muted">{email}</p>
              </div>
            </div>

            {url && (
              <Link
                to={`/p/${slug}`}
                className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
              >
                <span>{tr('Open Recruiter View')}</span>
                <span>↗</span>
              </Link>
            )}
          </div>

          <Field
            label={tr('Full Display Name')}
            hint={tr('Publicly visible to hiring managers, peer review panels, and hackathon judges.')}
          >
            <Input
              required
              maxLength={80}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={tr('Alex Rivera')}
            />
          </Field>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="account-headline"
                className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase"
              >
                {tr('Professional Headline & Technical Focus')}
              </label>
              <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink">
                {headline.length} / 160
              </span>
            </div>
            <Input
              id="account-headline"
              maxLength={160}
              value={headline}
              onChange={(e) => onHeadlineChange(e.target.value)}
              placeholder={tr('Distributed Systems & Infrastructure Engineer • Rust, Go & Consensus Protocols')}
            />
            <p className="font-mono-code text-[11px] text-muted">
              {tr('One-line summary displayed at the top of your public recruiter dossier alongside oral defense quotes.')}
            </p>
          </div>
        </div>
      </NumberedSectionCard>

      {/* 02. Public Dossier Visibility & Immutable URL (Indigo Accent) */}
      <NumberedSectionCard
        id="section-visibility"
        number="02"
        theme="accent"
        title={tr('Dossier Visibility & Public Address')}
        subtitle={tr('Configure public read-only access for your verified interview reports.')}
        sectionTag={tr('SECTION 02 // PUBLIC LINK')}
      >
        <div className="space-y-5">
          {/* Toggle Switch Card */}
          <div className="flex items-start justify-between gap-4 rounded-[4px] border border-accent/30 bg-accent-soft/45 p-4">
            <div className="space-y-1 pr-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">{tr('Enable Public Recruiter Dossier')}</span>
                <span
                  className={`font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[10px] font-bold ${
                    isPublic
                      ? 'border-good/30 bg-good-soft text-good-ink'
                      : 'border-line bg-surface text-muted'
                  }`}
                >
                  <LiveDot tone={isPublic ? 'good' : 'muted'} pulse={false} />
                  {isPublic ? tr('ACTIVE & RESOLVABLE') : tr('PRIVATE ONLY')}
                </span>
              </div>
              <p className="text-[12px] leading-[19px] text-muted">
                {tr('When enabled, anyone with your link can view your completed interviews, ownership scores, and cited transcript quotes without logging in.')}
              </p>
            </div>

            <ToggleSwitch
              checked={isPublic}
              onChange={onIsPublicChange}
              activeColorClass="peer-checked:bg-accent"
            />
          </div>

          {/* Share Link Read-Only Input Group */}
          {url && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="dossier-url-input"
                  className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase"
                >
                  {tr('Your Canonical Public Dossier URL')}
                </label>
                <span className="font-mono-code rounded-[3px] border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] text-accent-ink">
                  {tr('SLUG:')}{' '}{slug}
                </span>
              </div>

              <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
                    <span className="material-symbols-outlined text-[17px]">link</span>
                  </span>
                  <input
                    id="dossier-url-input"
                    type="text"
                    readOnly
                    value={url}
                    className="font-mono-code h-10 w-full rounded-[4px] border border-line bg-paper pr-3 pl-9 text-[12px] text-ink select-all focus:border-accent focus:outline-none"
                  />
                </div>
                <CopyLinkButton
                  value={url}
                  variant="primary"
                  className="h-10 shrink-0 px-4 text-[12px]"
                />
              </div>
            </div>
          )}
        </div>
      </NumberedSectionCard>
    </>
  );
}
