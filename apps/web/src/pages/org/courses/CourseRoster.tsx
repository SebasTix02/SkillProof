import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Field,
  Input,
  Notice,
  NumberedSectionCard,
  Select,
  Textarea,
  formatDate,
  useConfirm,
} from '../../../components/shared';
import { useToast } from '../../../components/toast';
import { tr, trn } from '../../../i18n';
import { api, errorMessage } from '../../../lib/api';
import { EMAIL, ROLE_LABEL, type CourseDetail, type Member } from './types';

export function CourseRoster({
  detail,
  onChanged,
  canManage,
}: {
  detail: CourseDetail;
  onChanged: () => void;
  canManage: boolean;
}) {
  const { course, members } = detail;
  const toast = useToast();
  const confirm = useConfirm();
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<Member['role']>('student');
  const [section, setSection] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [withoutAccount, setWithoutAccount] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  const parsed = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const valid = parsed.length > 0 && parsed.every((e) => EMAIL.test(e));

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy('add');
    try {
      const res = await api<{ added: number; without_account: string[] }>(`/api/courses/${course.id}/members`, {
        body: { emails: parsed, role, section: section.trim() },
      });
      setWithoutAccount(res.without_account);
      setEmails('');
      toast.success(tr('{n} added to {name}.', { n: res.added, name: course.name }));
      onChanged();
    } catch (err) {
      toast.error(tr('Could not add them. {error}', { error: errorMessage(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function remove(m: Member) {
    const name = m.profiles?.display_name ?? tr('this person');
    const ok = await confirm({
      title: tr('Remove {name} from {org}?', { name, org: course.name }),
      body: m.role === 'student' ? tr('They stop seeing the course assignments. Their past submissions stay. You can add them again later.') : tr('They stop helping run this course.'),
      confirmLabel: tr('Remove'),
    });
    if (!ok) return;
    setBusy(m.user_id);
    try {
      await api(`/api/courses/${course.id}/members/${m.user_id}`, { method: 'DELETE' });
      toast.success(tr('{name} removed.', { name }));
      onChanged();
    } catch (err) {
      toast.error(tr('Could not remove them. {error}', { error: errorMessage(err) }));
    } finally {
      setBusy(null);
    }
  }

  const sections = [...new Set(members.map((m) => m.section).filter(Boolean))].sort();
  const shown = members.filter((m) => !filter || m.section === filter);
  return (
    <div className="space-y-6">
      {canManage && (
        <NumberedSectionCard number="+" icon="person_add" title={tr('Add to the roster')} subtitle={tr('By email. Students get every assignment of the course; instructors and TAs help run it.')} theme="accent">
          <form onSubmit={(e) => void add(e)} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
            <Field label={tr('Emails')} hint={tr('Separate them with commas, spaces or new lines.')}>
              <Textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={tr('ana@uni.edu, cy@uni.edu')} />
            </Field>
            <Field label={tr('Role')}>
              <Select value={role} onChange={(e) => setRole(e.target.value as Member['role'])}>
                <option value="student">{tr('Student')}</option>
                <option value="ta">{tr('TA')}</option>
                <option value="instructor">{tr('Instructor')}</option>
              </Select>
            </Field>
            <Field label={tr('Section')}>
              <Input value={section} maxLength={40} onChange={(e) => setSection(e.target.value)} placeholder={tr('A')} />
            </Field>
            <Button type="submit" disabled={!valid} loading={busy === 'add'}>
              {tr('Add')}
            </Button>
          </form>
          {withoutAccount.length > 0 && (
            <div className="mt-3">
              <Notice tone="warn">
                {tr('No SkillProof account yet:')}{' '}{withoutAccount.join(', ')}{tr('. Ask them to sign up with that email, then add them again.')}
              </Notice>
            </div>
          )}
        </NumberedSectionCard>
      )}

      <section className="rounded-[6px] border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <p className="text-[14px] font-semibold text-ink">
            {trn('{count} person', '{count} people', members.length)}
          </p>
          {sections.length > 0 && (
            <div className="w-44">
              <Select aria-label={tr('Section')} value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">{tr('All sections')}</option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {tr('Section')}{' '}{s}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-muted">{tr('Nobody on the roster yet. Add students by email above.')}</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="font-mono-code bg-paper text-[11px] text-muted uppercase">
              <tr>
                <th className="px-5 py-2.5 font-semibold">{tr('Name')}</th>
                <th className="px-5 py-2.5 font-semibold">{tr('Role')}</th>
                <th className="px-5 py-2.5 font-semibold">{tr('Section')}</th>
                <th className="px-5 py-2.5 font-semibold">{tr('Added')}</th>
                {canManage && <th className="px-5 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-ink">{m.profiles?.display_name ?? tr('Unnamed')}</span>
                    {m.profiles?.github_login && <span className="font-mono-code ml-2 text-[11px] text-muted">@{m.profiles.github_login}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={m.role === 'student' ? 'neutral' : 'accent'}>{ROLE_LABEL[m.role]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{m.section || '—'}</td>
                  <td className="px-5 py-3 text-muted">{formatDate(m.created_at)}</td>
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      <Button type="button" variant="ghost" loading={busy === m.user_id} onClick={() => void remove(m)} className="px-2.5 py-1 text-[12px]">
                        {tr('Remove')}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
