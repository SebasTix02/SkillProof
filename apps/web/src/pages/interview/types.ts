import { tr, trn } from '../../i18n';
import type {
  ActivityEntry,
  FocusEvent as ExamFocusEvent,
  PublicQuestion,
  TranscriptEntry,
} from '@skillproof/shared';
import type { AnswerCoverage, AnswerKeyQuestion } from '../../components/AnswerKey';
import type { ReportView } from '../../components/Report';

export const SPECTROGRAM_ASSET = '/images/interview-spectrogram.svg';

export const BAR_HEIGHTS = [35, 50, 70, 85, 60, 40, 65, 90, 100, 75, 55, 30, 60, 45, 25, 18];

export const clockNow = () => Date.now();

export type RoomPhase = 'idle' | 'connecting' | 'live' | 'sending';

export type InterviewStatus =
  | 'preparing'
  | 'ready'
  | 'in_progress'
  | 'evaluating'
  | 'completed'
  | 'error'
  | 'canceled'
  | 'report_paused'
  | 'report_canceled';

export interface InterviewResponse {
  interview: {
    id: string;
    status: InterviewStatus;
    error: string | null;
    submission_id: string | null;
    /** Set when the interview is about a course assignment submission. */
    assignment?: { id: string; course_id: string; title: string } | null;
    created_at?: string;
    duration_s?: number | null;
    repo: { owner: string; name: string; url: string };
    commit_sha: string | null;
    summary: string | null;
    is_owner: boolean;
    models_used?: string[];
    primary_models?: string[];
  };
  activity?: ActivityEntry[];
  seconds: number;
  questions: PublicQuestion[];
  transcript: TranscriptEntry[] | null;
  report: (ReportView & { answers_json?: AnswerCoverage[] }) | null;
  /** Only once completed. */
  answer_key?: AnswerKeyQuestion[] | null;
  focus_summary?: string | null;
  focus_events?: ExamFocusEvent[];
}

export interface LiveToken {
  token: string;
  model: string;
  api_version: string;
  seconds: number;
}

/**
 * The exam-mode signal in the interface language (the API's focus_summary is English: it is written for the
 * evaluator's prompt). Same rules as describeFocusEvents in packages/shared.
 */
export function focusSummary(events: ExamFocusEvent[]): string | null {
  const away = events.filter((e) => e.type !== 'fullscreen_unsupported' && e.type !== 'paused');
  const pauses = events.filter((e) => e.type === 'paused');
  const seconds = (list: ExamFocusEvent[]) => Math.round(list.reduce((n, e) => n + e.duration_ms, 0) / 1000);
  const parts: string[] = [];
  if (away.length) {
    parts.push(
      trn(
        'Left the interview window {count} time (total {seconds} s).',
        'Left the interview window {count} times (total {seconds} s).',
        away.length,
        { seconds: seconds(away) },
      ),
    );
  }
  if (pauses.length) {
    parts.push(
      trn('Paused {count} time (total {seconds} s).', 'Paused {count} times (total {seconds} s).', pauses.length, {
        seconds: seconds(pauses),
      }),
    );
  }
  if (events.some((e) => e.type === 'fullscreen_unsupported')) {
    parts.push(tr('Full screen was not available in this browser.'));
  }
  return parts.length ? parts.join(' ') : null;
}
