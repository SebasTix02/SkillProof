import { getLocale, tr, translateMessage, type Locale } from '../../i18n';
import { ContestLanguageField, StarterRepoField } from '../../components/LanguageControl';
import { CreateEventSchema, DEFAULT_RUBRIC, type Rubric } from '@skillproof/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  CommandConsoleHeader,
  Field,
  Input,
  Notice,
  NumberedSectionCard,
  ScoreBar,
  Select,
  Textarea,
  ToggleSwitch,
  linkButtonSecondary,
} from '../../components/shared';
import { RubricEditor, keyFromName } from '../../components/RubricEditor';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { EventView } from '../../lib/types';

/** Value for a datetime-local input, in the browser's time zone. */
function localInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}


export function CreateEvent() {
  const { org } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() => localInput(new Date()));
  const [deadline, setDeadline] = useState(() => localInput(new Date(Date.now() + 7 * 24 * 3600_000)));
  const [visibility, setVisibility] = useState<EventView['visibility']>('public');
  const [accessCode, setAccessCode] = useState('');
  const [unlimited, setUnlimited] = useState(true);
  const [maxSubmissions, setMaxSubmissions] = useState(3);
  const [interviews, setInterviews] = useState(true);
  const [language, setLanguage] = useState<Locale>(() => getLocale());
  const [starter, setStarter] = useState('');
  const [rubric, setRubric] = useState<Rubric>(() => DEFAULT_RUBRIC.map((c) => ({ ...c, anchors: { ...c.anchors } })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalWeight = rubric.reduce((sum, c) => sum + (Number.isFinite(c.weight) ? c.weight : 0), 0);

  async function submit(e: FormEvent, publish: boolean) {
    e.preventDefault();
    if (!org) return;
    setError(null);
    const parsed = CreateEventSchema.safeParse({
      name: name.trim(),
      description,
      starts_at: new Date(startsAt).toISOString(),
      submission_deadline: new Date(deadline).toISOString(),
      visibility,
      access_code: visibility === 'code' ? accessCode : undefined,
      max_submissions: unlimited ? null : maxSubmissions,
      interviews_enabled: interviews,
      language,
      starter_repo_url: starter.trim() || null,
      rubric: rubric.map((c) => ({ ...c, key: c.key || keyFromName(c.name) })),
      publish,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${issue.path.join(' › ') || tr('Form')}: ${translateMessage(issue.message)}` : tr('Check the form and try again.'));
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ event: EventView }>(`/api/orgs/${org.id}/events`, { body: parsed.data });
      navigate(`/org/events/${res.event.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e, true)} className="space-y-8">
      <CommandConsoleHeader
        breadcrumbs={
          <>
            <Link to="/org/events" className="text-accent-on-dark hover:underline">
              {tr('← ORGANIZER CONSOLE')}
            </Link>
            <span>//</span>
            <span>{org?.name?.toUpperCase() ?? 'ORGANIZATION'}</span>
          </>
        }
        statusChips={
          <span className="rounded-[3px] border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/75">
            {tr('RUBRIC CRITERIA:')}{' '}{rubric.length} ({totalWeight}{' '}{tr('WEIGHT)')}
          </span>
        }
        eyebrowBadge={tr('NEW EVENT // SETUP')}
        title={tr('New Hackathon or Capstone Event')}
        subtitle={tr('Configure the event schedule, cohort access control, submission limits, 3-minute voice defense option, and weighted evaluation rubric.')}
        actions={
          <Link to="/org/events" className={`${linkButtonSecondary} border-white/15 bg-white/10 text-white hover:bg-white/20`}>
            {tr('Cancel & Return')}
          </Link>
        }
      />

      {/* Section 01: Identity & Schedule */}
      <NumberedSectionCard
        number="01"
        icon="event"
        title={tr('Event Identity & Commit-Freeze Schedule')}
        subtitle={tr('Define the public title, rules, and exact cutoff timestamp when repositories are frozen.')}
        sectionTag={tr('SECTION 01 // TIMELINE')}
        theme="accent"
      >
        <div className="space-y-4">
          <Field label={tr('Event Name')}>
            <Input
              required
              minLength={3}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('Campus Hack 2026 — Distributed Systems Track')}
            />
          </Field>

          <Field
            label={tr('Briefing, Rules & Track Overview')}
            hint={tr('Shown on the public event workspace (/e/slug) for registered participants.')}
          >
            <Textarea
              rows={4}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tr('Describe the theme, evaluation rules, deliverables, and prizes...')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr('Registration & Submission Opens')}>
              <Input
                type="datetime-local"
                required
                className="font-mono-code"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field
              label={tr('Submission Deadline (Commit Freeze)')}
              hint={tr('At this moment every repository is frozen at its latest commit and queued for judging.')}
            >
              <Input
                type="datetime-local"
                required
                className="font-mono-code"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </NumberedSectionCard>

      {/* Section 02: Access & Cohort Gatekeeping */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NumberedSectionCard
          number="02"
          icon="shield_lock"
          title={tr('Cohort Access & Visibility')}
          subtitle={tr('Control who can join and submit a repository to this event.')}
          sectionTag={tr('SECTION 02 // ACCESS')}
          theme="neutral"
        >
          <div className="space-y-4">
            <Field label={tr('Access Mode')}>
              <Select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as EventView['visibility'])}
              >
                <option value="public">{tr('Public: anyone with a SkillProof account')}</option>
                <option value="code">{tr('Access code: anyone who enters the organizer code')}</option>
                <option value="invite">{tr('Invite only: verified emails on your allowlist')}</option>
              </Select>
            </Field>

            {visibility === 'code' && (
              <Field
                label={tr('Organizer Access Code')}
                hint={tr('At least 4 characters. Stored hashed with scrypt, so keep a copy to share with participants.')}
              >
                <Input
                  required
                  minLength={4}
                  maxLength={64}
                  className="font-mono-code tracking-wider uppercase"
                  placeholder={tr('MIT-FALL-2026')}
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                />
              </Field>
            )}

            {visibility === 'invite' && (
              <Notice tone="info">
                {tr('You can paste or upload a CSV of invited participant emails from the event console immediately after creating the event.')}
              </Notice>
            )}
          </div>
        </NumberedSectionCard>

        {/* Section 03: Submissions & Voice Defense */}
        <NumberedSectionCard
          number="03"
          icon="record_voice_over"
          title={tr('Submission Quota & Oral Defense')}
          subtitle={tr('Configure version limits and 3-minute Gemini Live voice cross-examination.')}
          sectionTag={tr('SECTION 03 // SUBMISSIONS')}
          theme="neutral"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-3.5">
              <div>
                <div className="text-[13px] font-semibold text-ink">{tr('Unlimited versions until deadline')}</div>
                <p className="mt-0.5 text-[12px] text-muted">
                  {tr('Allow teams to update their submission freely before the cutoff. Only the latest version is judged.')}
                </p>
              </div>
              <ToggleSwitch checked={unlimited} onChange={setUnlimited} />
            </div>

            {!unlimited && (
              <Field
                label={tr('Maximum Versions Allowed Per Team')}
                hint={tr('Each new submission version replaces the previous one.')}
              >
                <Input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={maxSubmissions}
                  onChange={(e) => setMaxSubmissions(Number(e.target.value))}
                  className="font-mono-code max-w-36"
                />
              </Field>
            )}

            <div className="flex items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-3.5">
              <div>
                <div className="text-[13px] font-semibold text-ink">{tr('Enable 3-minute live voice defense')}</div>
                <p className="mt-0.5 text-[12px] text-muted">
                  {tr('Offer participants an AI oral interview about their own code after judging to verify authorship.')}
                </p>
              </div>
              <ToggleSwitch
                checked={interviews}
                onChange={setInterviews}
                activeColorClass="peer-checked:bg-good"
              />
            </div>
            <ContestLanguageField value={language} onChange={setLanguage} />
            <StarterRepoField value={starter} onChange={setStarter} />
          </div>
        </NumberedSectionCard>
      </div>

      {/* Section 04: Weighted Rubric */}
      <NumberedSectionCard
        number="04"
        icon="fact_check"
        title={tr('Evaluation Rubric & Weight Attribution')}
        subtitle={tr('Weights sum to {total}. Weights are normalized relatively, so they do not strictly need to equal 100.', { total: totalWeight })}
        sectionTag={tr('TOTAL WEIGHT: {total}', { total: totalWeight })}
        theme="neutral"
      >
        <RubricEditor rubric={rubric} setRubric={setRubric} />
      </NumberedSectionCard>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-line bg-surface p-5">
        <div className="font-mono-code text-[11px] text-muted">
          {tr('ORGANIZER:')}{' '}<strong className="text-ink">{org?.name}</strong>{' '}{tr('• STATUS ON PUBLISH:')}{' '}
          <strong className="text-good">{tr('OPEN FOR SUBMISSIONS')}</strong>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" disabled={busy} loading={busy} onClick={(e) => void submit(e, false)}>
            {tr('Save as Draft')}
          </Button>
          <Button type="submit" disabled={busy} loading={busy}>
            <span className="material-symbols-outlined text-[17px]">rocket_launch</span>
            <span>{busy ? tr('Creating Event…') : tr('Create & Open Event')}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
