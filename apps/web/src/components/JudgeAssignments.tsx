import { useMemo, useState } from 'react';
import { Button, Notice, NumberedSectionCard, Select, Spinner } from './shared';
import { useToast } from './toast';
import { api, errorMessage } from '../lib/api';
import { useLoad } from '../lib/useLoad';

interface Judge {
  user_id: string;
  display_name: string;
  roles: string[];
}

interface Assignment {
  submission_id: string;
  judge_id: string;
  profiles?: { display_name: string } | null;
}

/**
 * Organizer suite: pick which judges review which submissions. A judge sees only what is assigned to them in the
 * judge workspace.
 */
export function JudgeAssignments({ eventId, submissions }: { eventId: string; submissions: { id: string; team_name: string }[] }) {
  const toast = useToast();
  const judges = useLoad<{ judges: Judge[] }>(`/api/events/${eventId}/judges`);
  const assigned = useLoad<{ assignments: Assignment[] }>(`/api/events/${eventId}/assignments`);
  const [judgeId, setJudgeId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const byJudge = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assigned.data?.assignments ?? []) map.set(a.judge_id, [...(map.get(a.judge_id) ?? []), a]);
    return map;
  }, [assigned.data]);
  const teamName = (sid: string) => submissions.find((s) => s.id === sid)?.team_name ?? 'Submission';
  const judgeList = judges.data?.judges ?? [];

  async function change(method: 'POST' | 'DELETE', judge: string, ids: string[], success: string) {
    setBusy(true);
    try {
      await api(`/api/events/${eventId}/assignments`, { method, body: { judge_id: judge, submission_ids: ids } });
      toast.success(success);
      setPicked(new Set());
      await assigned.reload();
    } catch (err) {
      toast.error(`Could not change the assignments. ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (sid: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });

  return (
    <NumberedSectionCard
      id="section-judges"
      number="J"
      icon="gavel"
      title="Judge Assignments"
      subtitle="Choose who reviews which submission. Judges score them in their own workspace, apart from the AI."
      sectionTag={`${assigned.data?.assignments.length ?? 0} ASSIGNMENTS`}
      theme="indigo"
    >
      {judges.loading || assigned.loading ? (
        <Spinner label="Loading judges" />
      ) : judges.error || assigned.error ? (
        <Notice tone="error">{judges.error ?? assigned.error}</Notice>
      ) : judgeList.length === 0 ? (
        <p className="text-[13px] text-muted">No one in your organization can review yet. Invite judges from Organization settings.</p>
      ) : submissions.length === 0 ? (
        <p className="text-[13px] text-muted">There are no submissions to assign yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="font-mono-code block text-[11px] font-semibold tracking-wider text-ink uppercase">Judge</span>
              <Select value={judgeId} onChange={(e) => setJudgeId(e.target.value)} className="h-9 w-64 bg-paper text-[12px]">
                <option value="">Choose a judge…</option>
                {judgeList.map((j) => (
                  <option key={j.user_id} value={j.user_id}>{j.display_name || 'Unnamed'} ({j.roles.join(', ')})</option>
                ))}
              </Select>
            </label>
            <Button
              type="button"
              disabled={!judgeId || picked.size === 0 || busy}
              onClick={() => void change('POST', judgeId, [...picked], `${picked.size} submission${picked.size === 1 ? '' : 's'} assigned.`)}
            >
              Assign {picked.size || ''} selected
            </Button>
            <button type="button" className="text-[12px] font-semibold text-accent hover:underline" onClick={() => setPicked(new Set(submissions.map((s) => s.id)))}>
              Select all
            </button>
          </div>

          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {submissions.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[4px] border border-line bg-paper/60 px-2.5 py-1.5 text-[12px]">
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="truncate text-ink">{s.team_name}</span>
                  <span className="font-mono-code ml-auto text-[10px] text-muted">
                    {(assigned.data?.assignments ?? []).filter((a) => a.submission_id === s.id).length} judges
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {byJudge.size > 0 && (
            <div className="space-y-2 border-t border-line pt-3">
              {[...byJudge.entries()].map(([jid, list]) => (
                <div key={jid} className="text-[12px]">
                  <span className="font-semibold text-ink">{list[0]?.profiles?.display_name || judgeList.find((j) => j.user_id === jid)?.display_name || 'Judge'}</span>
                  <span className="text-muted"> · {list.length} assigned</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {list.map((a) => (
                      <span key={a.submission_id} className="font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-line bg-white px-1.5 py-0.5 text-[11px]">
                        {teamName(a.submission_id)}
                        <button
                          type="button"
                          aria-label={`Unassign ${teamName(a.submission_id)}`}
                          disabled={busy}
                          onClick={() => void change('DELETE', jid, [a.submission_id], 'Assignment removed.')}
                          className="text-muted hover:text-bad"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </NumberedSectionCard>
  );
}
