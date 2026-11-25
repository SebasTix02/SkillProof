import {
  MAX_INTERVIEW_PAUSES,
  MAX_INTERVIEW_PAUSE_MS,
  type FocusEvent as ExamFocusEvent,
} from '@skillproof/shared';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { clockNow, type RoomPhase } from './types';

export function useExamMode({
  phase,
  startedAt,
}: {
  phase: RoomPhase;
  startedAt: RefObject<number>;
}) {
  // Only the interview itself goes full screen: the code, the chat, the clock and the controls.
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Exam mode: times the candidate left full screen, the tab or the window. A signal for reviewers, not a verdict.
  const focusEvents = useRef<ExamFocusEvent[]>([]);
  const awaySince = useRef<{ type: ExamFocusEvent['type']; at: number } | null>(null);
  const [away, setAway] = useState<ExamFocusEvent['type'] | null>(null);
  // The browser did not open full screen on Start (or closed it while connecting, as Firefox does for the
  // microphone prompt): ask for it once the room is live. Not recorded as leaving, since the candidate never left.
  const [needsFullscreen, setNeedsFullscreen] = useState(false);

  // Pause: microphone and audio stop, the clock stops, the question and code are hidden.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pauseStart = useRef(0);
  const pausedMs = useRef(0);
  const [pauseCount, setPauseCount] = useState(0);
  const [pauseBudgetUsed, setPauseBudgetUsed] = useState(false);

  const endAway = useCallback(() => {
    const open = awaySince.current;
    if (!open) return;
    awaySince.current = null;
    focusEvents.current.push({
      type: open.type,
      at_ms: Math.max(0, open.at - startedAt.current),
      duration_ms: Math.max(0, clockNow() - open.at),
    });
    setAway(null);
  }, [startedAt]);

  const endPause = useCallback(() => {
    if (!pausedRef.current) return;
    const duration = clockNow() - pauseStart.current;
    pausedMs.current += duration;
    pausedRef.current = false;
    setPaused(false);
    setPauseBudgetUsed(pausedMs.current >= MAX_INTERVIEW_PAUSE_MS);
    focusEvents.current.push({
      type: 'paused',
      at_ms: Math.max(0, pauseStart.current - startedAt.current),
      duration_ms: duration,
    });
  }, [startedAt]);

  /** Time paused so far, including a pause in progress. */
  const pausedSoFar = useCallback(
    () => pausedMs.current + (pausedRef.current ? clockNow() - pauseStart.current : 0),
    [],
  );

  const beginPause = useCallback(
    (wrappingUp: boolean): boolean => {
      if (
        pausedRef.current ||
        wrappingUp ||
        pauseCount >= MAX_INTERVIEW_PAUSES ||
        pausedMs.current >= MAX_INTERVIEW_PAUSE_MS
      ) {
        return false;
      }
      pausedRef.current = true;
      pauseStart.current = clockNow();
      setPaused(true);
      setPauseCount((n) => n + 1);
      return true;
    },
    [pauseCount],
  );

  const requestInitialFullscreen = useCallback(() => {
    if (document.fullscreenEnabled && stageRef.current && !document.fullscreenElement) {
      void stageRef.current.requestFullscreen().catch(() => {
        focusEvents.current.push({ type: 'fullscreen_unsupported', at_ms: 0, duration_ms: 0 });
      });
    } else if (
      !document.fullscreenEnabled &&
      !focusEvents.current.some((e) => e.type === 'fullscreen_unsupported')
    ) {
      focusEvents.current.push({ type: 'fullscreen_unsupported', at_ms: 0, duration_ms: 0 });
    }
  }, []);

  const syncFullscreenOnLiveStart = useCallback(() => {
    if (document.fullscreenEnabled && document.fullscreenElement !== stageRef.current) {
      setNeedsFullscreen(true);
    }
  }, []);

  // Exam mode watchers: leaving full screen, hiding the tab, or moving to another window.
  useEffect(() => {
    if (phase !== 'live') return;
    const leave = (type: ExamFocusEvent['type']) => {
      if (awaySince.current) return;
      awaySince.current = { type, at: clockNow() };
      setAway(type);
    };
    const onFullscreen = () => {
      if (document.fullscreenElement === stageRef.current) setNeedsFullscreen(false);
      if (document.fullscreenElement !== stageRef.current) leave('fullscreen_exit');
      else if (awaySince.current?.type === 'fullscreen_exit') endAway();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave('tab_hidden');
      else if (
        awaySince.current?.type === 'tab_hidden' &&
        (document.fullscreenElement || !document.fullscreenEnabled)
      ) {
        endAway();
      }
    };
    const onBlur = () => leave('window_blur');
    const onFocus = () => {
      if (awaySince.current?.type === 'window_blur') endAway();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [phase, endAway]);

  const enterFullscreen = useCallback(async () => {
    try {
      if (stageRef.current && document.fullscreenElement !== stageRef.current) {
        await stageRef.current.requestFullscreen();
      }
    } catch {
      // Refused even after a click (an embedded or locked-down browser): carry on, and the report says so.
      if (!focusEvents.current.some((e) => e.type === 'fullscreen_unsupported')) {
        focusEvents.current.push({ type: 'fullscreen_unsupported', at_ms: 0, duration_ms: 0 });
      }
    }
    setNeedsFullscreen(false);
  }, []);

  const returnToFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenEnabled && stageRef.current && document.fullscreenElement !== stageRef.current) {
        await stageRef.current.requestFullscreen();
      }
    } catch {
      // the browser refused; the overlay stays until the window is back
    }
    if (document.visibilityState === 'visible' && document.hasFocus()) endAway();
  }, [endAway]);

  return {
    stageRef,
    focusEvents,
    away,
    needsFullscreen,
    paused,
    pausedRef,
    pauseCount,
    pauseBudgetUsed,
    endAway,
    endPause,
    pausedSoFar,
    beginPause,
    requestInitialFullscreen,
    syncFullscreenOnLiveStart,
    enterFullscreen,
    returnToFullscreen,
  };
}
