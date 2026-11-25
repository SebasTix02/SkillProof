import { CreateAssignmentSchema, DEFAULT_GROUP_MAX, DEFAULT_GROUP_MIN, DEFAULT_RUBRIC, type Rubric } from '@skillproof/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ContestLanguageField, StarterRepoField } from '../../../components/LanguageControl';
import { RubricEditor, keyFromName } from '../../../components/RubricEditor';
import {
  Button,
  DossierPageHeader,
  Field,
  Input,
  Notice,
  NumberedSectionCard,
  PageState,
  Textarea,
  ToggleSwitch,
} from '../../../components/shared';
import { getLocale, tr, trn, translateMessage, type Locale } from '../../../i18n';
import { api, errorMessage } from '../../../lib/api';
import { localInput, type AssignmentMode, type AssignmentView } from '../../../lib/courses';
import { useLoad } from '../../../lib/useLoad';
import type { CourseDetail } from './types';

export function NewAssignment() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const detail = useLoad<CourseDetail>(`/api/courses/${courseId}`);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [learningGoals, setLearningGoals] = useState('');
  const [mode, setMode] = useState<AssignmentMode>('individual');
  const [groupMin, setGroupMin] = useState(DEFAULT_GROUP_MIN);
  const [groupMax, setGroupMax] = useState(DEFAULT_GROUP_MAX);
  const [lockEarly, setLockEarly] = useState(false);
  const [groupLockAt, setGroupLockAt] = useState(() => localInput(new Date(Date.now() + 3 * 24 * 3600_000)));
  const [opensAt, setOpensAt] = useState(() => localInput(new Date()));
  const [dueAt, setDueAt] = useState(() => localInput(new Date(Date.now() + 7 * 24 * 3600_000)));
  const [unlimited, setUnlimited] = useState(true);
  const [maxSubmissions, setMaxSubmissions] = useState(3);
  const [interviews, setInterviews] = useState(false);
  const [language, setLanguage] = useState<Locale>(() => getLocale());
  const [starter, setStarter] = useState('');
  const [rubric, setRubric] = useState<Rubric>(() => DEFAULT_RUBRIC.map((c) => ({ ...c, anchors: { ...c.anchors } })));
  const [busy, setBusy] = useState<'draft' | 'open' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!detail.data) return <PageState loading={detail.loading} error={detail.error} kind="sections" />;
  const { course, members } = detail.data;
  const students = members.filter((m) => m.role === 'student').length;

  async function submit(e: FormEvent, publish: boolean) {
    e.preventDefault();
    setError(null);
    const parsed = CreateAssignmentSchema.safeParse({
      title: title.trim(),
      instructions,
      learning_goals: learningGoals,
      mode,
      group_min: mode === 'group' ? groupMin : null,
      group_max: mode === 'group' ? groupMax : null,
      group_lock_at: mode === 'group' && lockEarly ? new Date(groupLockAt).toISOString() : null,
      opens_at: new Date(opensAt).toISOString(),
      due_at: new Date(dueAt).toISOString(),
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
    setBusy(publish ? 'open' : 'draft');
    try {
      const res = await api<{ assignment: AssignmentView }>(`/api/courses/${courseId}/assignments`, { body: parsed.data });
      navigate(`/org/courses/${courseId}/assignments/${res.assignment.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e, true)} className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <Link to={`/org/courses/${courseId}/assignments`} className="text-accent-ink hover:underline">
            ← {course.name.toUpperCase()}{' '}{tr('· ASSIGNMENTS')}
          </Link>
        }
        title={tr('New assignment')}
        subtitle={trn('For the {count} student on the roster of {name}. Students added later get it too.', 'For the {count} students on the roster of {name}. Students added later get it too.', students, { name: course.name })}
      />

      <NumberedSectionCard number="01" icon="assignment" title={tr('Assignment')} subtitle={tr('What students must build and when it is due.')} theme="accent">
        <div className="space-y-4">
          <Field label={tr('Title')}>
            <Input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('Lab 3: Sorting algorithms')} />
          </Field>
          <Field label={tr('Instructions')} hint={tr('Shown to the students of the course.')}>
            <Textarea rows={4} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={tr('What to build, what to include in the README, how it is graded…')} />
          </Field>
          <Field label={tr('Learning goals')} hint={tr('What students should show they understand. The grader and the voice interview look for it.')}>
            <Textarea rows={2} maxLength={2000} value={learningGoals} onChange={(e) => setLearningGoals(e.target.value)} placeholder={tr('Divide and conquer; time complexity; tests for edge cases')} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={tr('Opens')}>
              <Input type="datetime-local" required value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </Field>
            <Field label={tr('Due')} hint={tr('Every repository is frozen at its latest commit at this moment.')}>
              <Input type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </Field>
          </div>
        </div>
      </NumberedSectionCard>

      <NumberedSectionCard number="02" icon="groups" title={tr('Individual or group')} subtitle={tr('Who can submit is the course roster. In a group assignment students form groups by inviting classmates.')} theme="neutral">
        <div className="space-y-4">
          <div role="radiogroup" aria-label={tr('Kind of work')} className="grid gap-3 md:grid-cols-2">
            {(
              [
                { key: 'individual', title: tr('Individual'), desc: tr('Each student submits their own repository.'), icon: 'person' },
                { key: 'group', title: tr('Group'), desc: tr('One repository per group. Each member gets the group grade; you can adjust one student.'), icon: 'groups' },
              ] as const
            ).map((o) => (
              <label
                key={o.key}
                className={`flex cursor-pointer items-start gap-3 rounded-[4px] border p-4 ${mode === o.key ? 'border-accent-ui bg-accent-soft' : 'border-line bg-paper'}`}
              >
                <input type="radio" name="mode" className="mt-1 accent-accent" checked={mode === o.key} onChange={() => setMode(o.key)} />
                <span>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{o.icon}</span>
                    {o.title}
                  </span>
                  <span className="block text-[12px] text-muted">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {mode === 'group' && (
            <div className="grid gap-4 rounded-[4px] border border-line bg-paper p-4 md:grid-cols-3">
              <Field label={tr('Smallest group')} hint={tr('A group can submit once it has this many members.')}>
                <Input type="number" min={1} max={20} value={groupMin} onChange={(e) => { const v = Number(e.target.value); setGroupMin(v); if (v > groupMax) setGroupMax(v); }} />
              </Field>
              <Field label={tr('Largest group')}>
                <Input type="number" min={groupMin} max={20} value={groupMax} onChange={(e) => setGroupMax(Number(e.target.value))} />
              </Field>
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{tr('Close groups before the due date')}</p>
                    <p className="text-[12px] text-muted">{tr('Otherwise groups can change until it is due. A group also closes when it first submits.')}</p>
                  </div>
                  <ToggleSwitch checked={lockEarly} onChange={setLockEarly} />
                </div>
                {lockEarly && <Input type="datetime-local" aria-label={tr('Groups close')} value={groupLockAt} onChange={(e) => setGroupLockAt(e.target.value)} />}
              </div>
            </div>
          )}
        </div>
      </NumberedSectionCard>

      <NumberedSectionCard number="03" icon="tune" title={tr('Submissions')} subtitle={tr('Versions and voice interviews.')} theme="neutral">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-4">
            <div>
              <p className="text-[13px] font-semibold text-ink">{tr('Unlimited versions until the due date')}</p>
              <p className="text-[12px] text-muted">
                {mode === 'group'
                  ? tr('Any member can update the group submission; only the latest version is graded.')
                  : tr('Students can update their submission; only the latest version is graded.')}
              </p>
            </div>
            <ToggleSwitch checked={unlimited} onChange={setUnlimited} />
          </div>
          {!unlimited && (
            <Field label={mode === 'group' ? tr('Versions per group') : tr('Versions per student')}>
              <Input type="number" min={1} max={100} value={maxSubmissions} onChange={(e) => setMaxSubmissions(Number(e.target.value))} className="w-32" />
            </Field>
          )}
          <div className="flex items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-4">
            <div>
              <p className="text-[13px] font-semibold text-ink">{mode === 'group' ? tr('Short voice interview for each member') : tr('3-minute voice interview')}</p>
              <p className="text-[12px] text-muted">
                {mode === 'group'
                  ? tr('After grading, each member answers up to 2 questions (about 90 seconds) on the files they wrote.')
                  : tr('After grading, each student answers up to 4 questions about their own code.')}
              </p>
            </div>
            <ToggleSwitch checked={interviews} onChange={setInterviews} />
          </div>
          <ContestLanguageField value={language} onChange={setLanguage} />
          <StarterRepoField value={starter} onChange={setStarter} />
        </div>
      </NumberedSectionCard>

      <NumberedSectionCard number="04" icon="fact_check" title={tr('Rubric')} subtitle={tr('How each submission is graded.')} theme="neutral">
        <RubricEditor rubric={rubric} setRubric={setRubric} />
      </NumberedSectionCard>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap justify-end gap-3 rounded-[6px] border border-line bg-surface p-5">
        <Button type="button" variant="secondary" disabled={busy !== null} loading={busy === 'draft'} onClick={(e) => void submit(e, false)}>
          {tr('Save as draft')}
        </Button>
        <Button type="submit" disabled={busy !== null} loading={busy === 'open'}>
          {tr('Create and open to students')}
        </Button>
      </div>
      {students === 0 && (
        <Notice tone="warn">
          {tr('The roster has no students yet.')}{' '}
          <Link to={`/org/courses/${courseId}/roster`} className="font-semibold underline">
            {tr('Add them')}
          </Link>{' '}
          {tr('before or after creating the assignment.')}
        </Notice>
      )}
    </form>
  );
}
