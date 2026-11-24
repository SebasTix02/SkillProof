/**
 * One empty list for "no data yet": `data?.items ?? NONE`. A new `[]` on every render would change the
 * dependencies of every useMemo built on it, so the memo would recompute each time. Typed never[] so nothing
 * can be pushed into it.
 */
export const NONE: never[] = [];
