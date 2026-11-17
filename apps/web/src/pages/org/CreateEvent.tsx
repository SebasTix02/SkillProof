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
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { EventView } from '../../lib/types';

/** Value for a datetime-local input, in the browser's time zone. */
function localInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

const keyFromName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 40);

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
  const [rubric, setRubric] = useState<Rubric>(() => DEFAULT_RUBRIC.map((c) => ({ ...c, anchors: { ...c.anchors } })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalWeight = rubric.reduce((sum, c) => sum + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  const patch = (i: number, change: Partial<Rubric[number]>) =>
    setRubric((r) => r.map((c, j) => (j === i ? { ...c, ...change } : c)));

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
      rubric: rubric.map((c) => ({ ...c, key: c.key || keyFromName(c.name) })),
      publish,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${issue.path.join(' › ') || 'Form'}: ${issue.message}` : 'Check the form and try again.');
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
            <Link to="/org/events" className="text-[#93B4FF] hover:underline">
              ← ORGANIZER CONSOLE
            </Link>
            <span>//</span>
            <span>{org?.name?.toUpperCase() ?? 'ORGANIZATION'}</span>
          </>
        }
        statusChips={
          <span className="rounded-[3px] border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/75">
            RUBRIC CRITERIA: {rubric.length} ({totalWeight} WEIGHT)
          </span>
        }
        eyebrowBadge="STAGE 02 // ASSESSMENT ARCHITECT"
        title="Draft New Hackathon or Capstone Event"
        subtitle="Configure the event schedule, cohort access control, submission limits, 3-minute voice defense option, and weighted evaluation rubric."
        actions={
          <Link to="/org/events" className={`${linkButtonSecondary} border-white/15 bg-white/10 text-white hover:bg-white/20`}>
            Cancel &amp; Return
          </Link>
        }
      />

      {/* Section 01: Identity & Schedule */}
      <NumberedSectionCard
        number="01"
        icon="event"
        title="Event Identity & Commit-Freeze Schedule"
        subtitle="Define the public title, rules, and exact cutoff timestamp when repositories are frozen."
        sectionTag="SECTION 01 // TIMELINE"
        theme="cobalt"
      >
        <div className="space-y-4">
          <Field label="Event Name">
            <Input
              required
              minLength={3}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Campus Hack 2026 — Distributed Systems Track"
            />
          </Field>

          <Field
            label="Briefing, Rules & Track Overview"
            hint="Shown on the public event workspace (/e/slug) for registered participants."
          >
            <Textarea
              rows={4}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the theme, evaluation rules, deliverables, and prizes..."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Registration & Submission Opens">
              <Input
                type="datetime-local"
                required
                className="font-mono-code"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field
              label="Submission Deadline (Commit Freeze)"
              hint="At this moment every repository is frozen at its latest commit and queued for judging."
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
          title="Cohort Access & Visibility"
          subtitle="Control who can join and submit a repository to this event."
          sectionTag="SECTION 02 // GATEKEEPING"
          theme="indigo"
        >
          <div className="space-y-4">
            <Field label="Access Mode">
              <Select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as EventView['visibility'])}
              >
                <option value="public">Public: anyone with a SkillProof account</option>
                <option value="code">Access code: anyone who enters the organizer code</option>
                <option value="invite">Invite only: verified emails on your allowlist</option>
              </Select>
            </Field>

            {visibility === 'code' && (
              <Field
                label="Organizer Access Code"
                hint="At least 4 characters. Stored hashed with scrypt, so keep a copy to share with participants."
              >
                <Input
                  required
                  minLength={4}
                  maxLength={64}
                  className="font-mono-code tracking-wider uppercase"
                  placeholder="MIT-FALL-2026"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                />
              </Field>
            )}

            {visibility === 'invite' && (
              <Notice tone="info">
                You can paste or upload a CSV of invited participant emails from the event console immediately after
                creating the event.
              </Notice>
            )}
          </div>
        </NumberedSectionCard>

        {/* Section 03: Submissions & Voice Defense */}
        <NumberedSectionCard
          number="03"
          icon="record_voice_over"
          title="Submission Quota & Oral Defense"
          subtitle="Configure version limits and 3-minute Gemini Live voice cross-examination."
          sectionTag="SECTION 03 // PROTOCOL"
          theme="emerald"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-3.5">
              <div>
                <div className="text-[13px] font-semibold text-ink">Unlimited versions until deadline</div>
                <p className="mt-0.5 text-[12px] text-muted">
                  Allow teams to update their submission freely before the cutoff. Only the latest version is judged.
                </p>
              </div>
              <ToggleSwitch checked={unlimited} onChange={setUnlimited} />
            </div>

            {!unlimited && (
              <Field
                label="Maximum Versions Allowed Per Team"
                hint="Each new submission version replaces the previous one."
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
                <div className="text-[13px] font-semibold text-ink">Enable 3-minute live voice defense</div>
                <p className="mt-0.5 text-[12px] text-muted">
                  Offer participants an AI oral interview about their own code after judging to verify authorship.
                </p>
              </div>
              <ToggleSwitch
                checked={interviews}
                onChange={setInterviews}
                activeColorClass="peer-checked:bg-good"
              />
            </div>
          </div>
        </NumberedSectionCard>
      </div>

      {/* Section 04: Weighted Rubric */}
      <NumberedSectionCard
        number="04"
        icon="fact_check"
        title="Evaluation Rubric & Weight Attribution"
        subtitle={`Weights sum to ${totalWeight}. Weights are normalized relatively, so they do not strictly need to equal 100.`}
        sectionTag={`TOTAL WEIGHT: ${totalWeight}`}
        theme="amber"
      >
        <div className="space-y-4">
          <ScoreBar value={Math.min(100, totalWeight)} max={100} tone="accent" heightClass="h-1.5" />

          <ul className="space-y-3">
            {rubric.map((c, i) => (
              <li
                key={i}
                className="space-y-3 rounded-[4px] border border-line bg-paper/55 p-4 transition-colors hover:border-muted/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-code text-[11px] font-bold text-accent uppercase">
                    Criterion {String(i + 1).padStart(2, '0')} // {c.key || keyFromName(c.name) || 'custom_key'}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={rubric.length === 1}
                    onClick={() => setRubric((r) => r.filter((_, j) => j !== i))}
                    className="px-2.5 py-1 text-[11px]"
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                  <Field label="Criterion Name">
                    <Input
                      aria-label="Criterion name"
                      required
                      maxLength={60}
                      placeholder="Architecture & Code Quality"
                      value={c.name}
                      onChange={(e) => patch(i, { name: e.target.value, key: keyFromName(e.target.value) })}
                    />
                  </Field>
                  <Field label="Weight">
                    <Input
                      aria-label="Weight"
                      type="number"
                      min={1}
                      max={100}
                      required
                      className="font-mono-code"
                      value={c.weight}
                      onChange={(e) => patch(i, { weight: Number(e.target.value) })}
                    />
                  </Field>
                </div>

                <Field label="What This Criterion Measures">
                  <Textarea
                    aria-label="What this criterion measures"
                    rows={2}
                    maxLength={500}
                    value={c.description}
                    onChange={(e) => patch(i, { description: e.target.value })}
                    placeholder="What the AI evaluator and human judges should look for in the repository..."
                  />
                </Field>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="secondary"
              disabled={rubric.length >= 12}
              onClick={() =>
                setRubric((r) => [
                  ...r,
                  {
                    key: '',
                    name: '',
                    description: '',
                    weight: 15,
                    anchors: { low: 'Weak.', mid: 'Acceptable.', high: 'Excellent.' },
                  },
                ])
              }
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add Rubric Criterion ({rubric.length}/12)</span>
            </Button>
            <span className="font-mono-code text-[11px] text-muted">
              Up to 12 weighted criteria per assessment
            </span>
          </div>
        </div>
      </NumberedSectionCard>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-line bg-white p-5">
        <div className="font-mono-code text-[11px] text-muted">
          ORGANIZER: <strong className="text-ink">{org?.name}</strong> • STATUS ON PUBLISH:{' '}
          <strong className="text-good">OPEN FOR SUBMISSIONS</strong>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={(e) => void submit(e, false)}>
            Save as Draft
          </Button>
          <Button type="submit" disabled={busy}>
            <span className="material-symbols-outlined text-[17px]">rocket_launch</span>
            <span>{busy ? 'Creating Event…' : 'Create & Open Event'}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
