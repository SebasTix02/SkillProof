import { CreateEventSchema, DEFAULT_RUBRIC, type Rubric } from '@skillproof/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input, Notice, Select, Textarea } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { EventView } from '../../lib/types';

/** Value for a datetime-local input, in the browser's time zone. */
function localInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

const keyFromName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 40);

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
  const patch = (i: number, change: Partial<Rubric[number]>) => setRubric((r) => r.map((c, j) => (j === i ? { ...c, ...change } : c)));

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
    <form onSubmit={(e) => void submit(e, true)} className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create an event</h1>

      <Card className="space-y-4">
        <Field label="Name">
          <Input required minLength={3} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Campus Hack 2026" />
        </Field>
        <Field label="Description" hint="Theme, rules and prizes. Participants see this on the event page.">
          <Textarea rows={4} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts">
            <Input type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Submission deadline" hint="At this moment every repository is frozen at its last commit and judged.">
            <Input type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Who can join</h2>
        <Field label="Access">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as EventView['visibility'])}>
            <option value="public">Public: anyone with an account</option>
            <option value="code">Access code: anyone who has the code</option>
            <option value="invite">Invite only: emails on a list you upload</option>
          </Select>
        </Field>
        {visibility === 'code' && (
          <Field label="Access code" hint="At least 4 characters. It is stored hashed, so keep a copy.">
            <Input required minLength={4} maxLength={64} value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
          </Field>
        )}
        {visibility === 'invite' && <Notice>You upload the list of invited emails from the event console after creating the event.</Notice>}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Submissions</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
          Unlimited submissions until the deadline
        </label>
        {!unlimited && (
          <Field label="Submissions allowed per participant" hint="Each new version replaces the previous one. Only the last one is judged.">
            <Input type="number" min={1} max={100} required value={maxSubmissions} onChange={(e) => setMaxSubmissions(Number(e.target.value))} className="max-w-32" />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={interviews} onChange={(e) => setInterviews(e.target.checked)} />
          Offer participants a voice interview about their code after judging
        </label>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold">Rubric</h2>
          <span className="text-sm text-muted">
            Weights add up to {totalWeight}. They are relative, so they do not need to total 100.
          </span>
        </div>
        <ul className="space-y-3">
          {rubric.map((c, i) => (
            <li key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_6rem_auto]">
              <Input aria-label="Criterion name" required maxLength={60} value={c.name} onChange={(e) => patch(i, { name: e.target.value, key: keyFromName(e.target.value) })} />
              <Input aria-label="Weight" type="number" min={1} max={100} required value={c.weight} onChange={(e) => patch(i, { weight: Number(e.target.value) })} />
              <Button type="button" variant="secondary" disabled={rubric.length === 1} onClick={() => setRubric((r) => r.filter((_, j) => j !== i))}>
                Remove
              </Button>
              <Textarea aria-label="What this criterion measures" rows={2} maxLength={500} className="sm:col-span-3" value={c.description} onChange={(e) => patch(i, { description: e.target.value })} placeholder="What this criterion measures" />
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          disabled={rubric.length >= 12}
          onClick={() => setRubric((r) => [...r, { key: '', name: '', description: '', weight: 10, anchors: { low: 'Weak.', mid: 'Acceptable.', high: 'Excellent.' } }])}
        >
          Add criterion
        </Button>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create and open event'}</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={(e) => void submit(e, false)}>Save as draft</Button>
      </div>
    </form>
  );
}
