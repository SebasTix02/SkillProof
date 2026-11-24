import { useEffect, useState } from 'react';
import { api } from './api';
import type { NavCourse } from './nav';

/**
 * The organization's courses for the side menu (sub-items of Courses). Loaded quietly (no progress bar) and kept
 * per organization for the visit, so moving between pages neither refetches nor flashes. Screens that create,
 * rename or archive a course call `notifyCoursesChanged()` and the menu reloads.
 */
const EVENT = 'skillproof:courses-changed';
let cache: { orgId: string; courses: NavCourse[] } | null = null;

export function notifyCoursesChanged(): void {
  cache = null;
  window.dispatchEvent(new Event(EVENT));
}

export function useNavCourses(orgId: string | null, enabled: boolean): NavCourse[] {
  const [courses, setCourses] = useState<NavCourse[]>(() => (enabled && orgId && cache?.orgId === orgId ? cache.courses : []));
  const [prevKey, setPrevKey] = useState(`${orgId ?? ''}:${enabled}`);
  const key = `${orgId ?? ''}:${enabled}`;

  if (key !== prevKey) {
    setPrevKey(key);
    setCourses(enabled && orgId && cache?.orgId === orgId ? cache.courses : []);
  }

  useEffect(() => {
    if (!orgId || !enabled) return;
    let alive = true;
    const load = () =>
      api<{ courses: NavCourse[] }>(`/api/orgs/${orgId}/courses`, { quiet: true })
        .then(({ courses: rows }) => {
          const list = rows.map(({ id, name, code }) => ({ id, name, code }));
          cache = { orgId, courses: list };
          if (alive) setCourses(list);
        })
        // The menu is a shortcut: if the list cannot load, Courses simply shows no sub-items.
        .catch(() => {});
    if (cache?.orgId !== orgId) void load();
    const onChange = () => void load();
    window.addEventListener(EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onChange);
    };
  }, [orgId, enabled]);

  return orgId && enabled ? courses : [];
}
