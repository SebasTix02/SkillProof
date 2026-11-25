import { UpdateAssignmentSchema } from '@skillproof/shared';
import { useState, type FormEvent } from 'react';
import { ContestLanguageField, StarterRepoField } from '../../../components/LanguageControl';
import {
  Button,
  Field,
  Input,
  Notice,
  NumberedSectionCard,
  Textarea,
  ToggleSwitch,
} from '../../../components/shared';
import { useToast } from '../../../components/toast';
import { tr } from '../../../i18n';
import { api, errorMessage } from '../../../lib/api';
import { localInput, type AssignmentView } from '../../../lib/courses';

/** Edits what can still change: texts and dates while open, and the rubric while it is a draft. */
export function EditAssignment({ assignment: a, onDone }: { assignment: AssignmentView; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: a.title,
    instructions: a.instructions,
    learning_goals: a.learning_goals,
    opens_at: localInput(a.opens_at),
    due_at: localInput(a.due_at),
    group_lock_at: a.group_lock_at ? localInput(a.group_lock_at) : '',
    unlimited: a.max_submissions == null,
    max_submissions: a.max_submissions ?? 3,
    interviews_enabled: a.interviews_enabled,
    language: a.language,
    starter_repo_url: a.starter_repo_url ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = UpdateAssignmentSchema.safeParse({
      title: form.title.trim(),
      instructions: form.instructions,
      learning_goals: form.learning_goals,
      ...(a.status === 'draft' ? { opens_at: new Date(form.opens_at).toISOString() } : {}),
      due_at: new Date(form.due_at).toISOString(),
      ...(a.mode === 'group' ? { group_lock_at: form.group_lock_at ? new Date(form.group_lock_at).toISOString() : null } : {}),
      max_submissions: form.unlimited ? null : form.max_submissions,
      interviews_enabled: form.interviews_enabled,
      language: form.language,
      starter_repo_url: form.starter_repo_url.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? tr('Check the form.'));
      return;
    }
    setBusy(true);
    try {
      await api(`/api/assignments/${a.id}`, { method: 'PATCH', body: parsed.data });
      toast.success(tr('Assignment updated.'));
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <NumberedSectionCard number="✎" icon="edit" title={tr('Edit assignment')} subtitle={tr('Changes reach the students right away. The kind of work and the group sizes stay as they are.')} theme="accent">
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <Field label={tr('Title')}>
          <Input required minLength={3} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label={tr('Instructions')}>
          <Textarea rows={3} maxLength={4000} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </Field>
        <Field label={tr('Learning goals')}>
          <Textarea rows={2} maxLength={2000} value={form.learning_goals} onChange={(e) => setForm({ ...form, learning_goals: e.target.value })} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={tr('Opens')} hint={a.status === 'draft' ? undefined : tr('Already open.')}>
            <Input type="datetime-local" disabled={a.status !== 'draft'} value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} />
          </Field>
          <Field label={tr('Due')}>
            <Input type="datetime-local" required value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
          </Field>
          {a.mode === 'group' && (
            <Field label={tr('Groups close')} hint={tr('Empty: at the due date.')}>
              <Input type="datetime-local" value={form.group_lock_at} onChange={(e) => setForm({ ...form, group_lock_at: e.target.value })} />
            </Field>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <ToggleSwitch checked={form.unlimited} onChange={(v) => setForm({ ...form, unlimited: v })} />{' '}{tr('Unlimited versions')}
          </label>
          {!form.unlimited && (
            <Input type="number" min={1} max={100} aria-label={tr('Versions allowed')} value={form.max_submissions} onChange={(e) => setForm({ ...form, max_submissions: Number(e.target.value) })} className="w-24" />
          )}
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <ToggleSwitch checked={form.interviews_enabled} onChange={(v) => setForm({ ...form, interviews_enabled: v })} />{' '}{tr('Voice interview')}
          </label>
        </div>
        <ContestLanguageField value={form.language} onChange={(l) => setForm({ ...form, language: l })} />
        <StarterRepoField value={form.starter_repo_url} onChange={(v) => setForm({ ...form, starter_repo_url: v })} />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>{tr('Save changes')}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>{tr('Cancel')}</Button>
        </div>
      </form>
    </NumberedSectionCard>
  );
}
