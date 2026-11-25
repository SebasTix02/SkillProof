import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Field,
  Input,
  Notice,
  NumberedSectionCard,
  Select,
  formatDate,
  useConfirm,
} from '../../../components/shared';
import { useToast } from '../../../components/toast';
import { tr } from '../../../i18n';
import { api, errorMessage } from '../../../lib/api';
import { groupSizeLabel, type AssignmentView, type GroupView, type Person } from '../../../lib/courses';

/** Groups for staff: who is in each, pending invitations, and moving or placing students (even after groups close). */
export function GroupsPanel({
  assignment: a,
  groups,
  ungrouped,
  canManage,
  reload,
}: {
  assignment: AssignmentView;
  groups: GroupView[];
  ungrouped: Person[];
  canManage: boolean;
  reload: () => unknown;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [placing, setPlacing] = useState<Record<string, string>>({});
  /** The most members a new group can have (the assignment's group size, 20 when it has none). */
  const maxMembers = a.group_max ?? 20;
  const everyone: Person[] = [
    ...ungrouped,
    ...groups.flatMap((g) =>
      g.members
        .filter((m) => m.status === 'accepted')
        .map((m) => ({ user_id: m.user_id, display_name: `${m.display_name} (${g.name})`, github_login: m.github_login })),
    ),
  ];

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    await run('create', () => api(`/api/assignments/${a.id}/groups`, { body: { name: newName.trim(), member_ids: newMembers } }), tr('Group {name} created.', { name: newName.trim() }));
    setNewName('');
    setNewMembers([]);
  }

  async function remove(g: GroupView, userId: string, name: string) {
    if (!(await confirm({ title: tr('Remove {name} from {group}?', { name, group: g.name }), body: tr('They can join or be placed in another group.'), confirmLabel: tr('Remove') }))) return;
    await run(`rm-${g.id}-${userId}`, () => api(`/api/assignment-groups/${g.id}/members/${userId}`, { method: 'DELETE' }), `${name} removed from ${g.name}.`);
  }

  return (
    <div className="space-y-6">
      <Notice tone="info">
        {tr('{size}. Students form groups by inviting classmates until {date}; a group also closes when it first submits. You can move or place students at any time.', {
          size: groupSizeLabel(a),
          date: a.groups_close_at ? formatDate(a.groups_close_at) : tr('the due date'),
        })}
      </Notice>

      {ungrouped.length > 0 && (
        <section className="rounded-[6px] border border-warn-ui bg-warn-soft p-4 text-[13px]">
          <p className="font-semibold text-warn-ink">{tr('Without a group (')}{ungrouped.length})</p>
          <p className="mt-1 text-ink">{ungrouped.map((p) => p.display_name).join(', ')}</p>
        </section>
      )}

      {groups.length === 0 ? (
        <section className="rounded-[6px] border border-line bg-surface p-8 text-center text-[13px] text-muted">{tr('No groups yet.')}</section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const accepted = g.members.filter((m) => m.status === 'accepted');
            const ready = accepted.length >= (a.group_min ?? 1);
            return (
              <li key={g.id} className="rounded-[6px] border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{g.name}</p>
                    <p className="text-[12px] text-muted">
                      {accepted.length}/{a.group_max} {tr('members')}{g.locked_at && ` · ${tr('closed {date}', { date: formatDate(g.locked_at) })}`}
                    </p>
                  </div>
                  <Badge tone={ready ? 'good' : 'warn'}>{ready ? tr('Can submit') : tr('Too small')}</Badge>
                </div>
                <ul className="mt-3 space-y-1.5 text-[13px]">
                  {g.members.map((m) => (
                    <li key={m.user_id} className="flex items-center justify-between gap-2">
                      <span className={m.status === 'invited' ? 'text-muted' : 'text-ink'}>
                        {m.display_name}
                        {m.status === 'invited' && <span className="ml-1.5 text-[11px]">{tr('(invited)')}</span>}
                      </span>
                      {canManage && (
                        <Button variant="ghost" className="px-2 py-0.5 text-[11px]" loading={busy === `rm-${g.id}-${m.user_id}`} disabled={!!busy} onClick={() => void remove(g, m.user_id, m.display_name)}>
                          {tr('Remove')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {canManage && accepted.length < (a.group_max ?? 0) && everyone.length > 0 && (
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    <Select aria-label={tr('Place a student in {group}', { group: g.name })} value={placing[g.id] ?? ''} onChange={(e) => setPlacing({ ...placing, [g.id]: e.target.value })} className="h-8 text-[12px]">
                      <option value="">{tr('Place a student…')}</option>
                      {everyone
                        .filter((p) => !accepted.some((m) => m.user_id === p.user_id))
                        .map((p) => (
                          <option key={p.user_id} value={p.user_id}>
                            {p.display_name}
                          </option>
                        ))}
                    </Select>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-[12px]"
                      disabled={!placing[g.id] || !!busy}
                      loading={busy === `place-${g.id}`}
                      onClick={() =>
                        void run(`place-${g.id}`, () => api(`/api/assignment-groups/${g.id}/place`, { body: { user_id: placing[g.id] } }), tr('Student placed in {group}.', { group: g.name })).then(() =>
                          setPlacing({ ...placing, [g.id]: '' }),
                        )
                      }
                    >
                      {tr('Place')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <NumberedSectionCard number="+" icon="group_add" title={tr('New group')} subtitle={tr('Create a group and put students in it. Students already in a group are moved.')} theme="accent">
          <form onSubmit={(e) => void createGroup(e)} className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
            <Field label={tr('Name')}>
              <Input required maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={tr('Team 4')} />
            </Field>
            {/* A list of checkboxes instead of a multiple <select> (which needed Ctrl or ⌘): the limit is visible and
                reached options are disabled. A fieldset, since a <label> (Field) cannot hold several inputs. */}
            <fieldset className="min-w-0">
              <legend className="font-mono-code mb-1.5 block text-[11px] font-semibold tracking-wider text-ink uppercase">{tr('Members')}</legend>
              <div className="max-h-40 overflow-y-auto rounded-[4px] border border-line-strong bg-surface p-1">
                {everyone.length === 0 && <p className="px-2 py-1.5 text-[12px] text-muted">{tr('No students on the roster yet.')}</p>}
                {everyone.map((p) => {
                  const checked = newMembers.includes(p.user_id);
                  const full = !checked && newMembers.length >= maxMembers;
                  return (
                    <label
                      key={p.user_id}
                      className={`flex items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-[13px] transition-colors ${
                        full ? 'cursor-not-allowed text-muted opacity-60' : 'cursor-pointer text-ink hover:bg-well'
                      } ${checked ? 'bg-accent-soft' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
                        checked={checked}
                        disabled={full}
                        onChange={() => setNewMembers(checked ? newMembers.filter((id) => id !== p.user_id) : [...newMembers, p.user_id])}
                      />
                      <span className="truncate">{p.display_name}</span>
                    </label>
                  );
                })}
              </div>
              <span className="font-mono-code mt-1 block text-[11px] text-muted" aria-live="polite">
                {tr('{n} of {max} chosen', { n: newMembers.length, max: maxMembers })}
              </span>
            </fieldset>
            <Button type="submit" loading={busy === 'create'} disabled={!newName.trim()}>
              {tr('Create group')}
            </Button>
          </form>
        </NumberedSectionCard>
      )}
    </div>
  );
}
