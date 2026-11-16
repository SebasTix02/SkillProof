import { z } from 'zod';

const filePath = z.string().describe('Path of a file in the repository, relative to its root');

export const RepoMapSchema = z.object({
  summary: z.string().describe('What the project does, in at most 3 sentences'),
  stack: z.object({
    languages: z.array(z.string()),
    frameworks: z.array(z.string()),
    services: z.array(z.string()).describe('External services and APIs the code calls'),
  }),
  components: z
    .array(
      z.object({
        name: z.string(),
        responsibility: z.string(),
        paths: z.array(filePath).min(1),
      }),
    )
    .describe('Main modules of the project'),
  key_decisions: z.array(
    z.object({
      decision: z.string(),
      rationale: z.string().describe('Why this choice matters or what trade-off it shows'),
      paths: z.array(filePath).min(1),
    }),
  ),
  weaknesses: z.array(
    z.object({
      issue: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      paths: z.array(filePath),
    }),
  ),
  complexity_signals: z.object({
    has_tests: z.boolean(),
    has_ci: z.boolean(),
    error_handling: z.enum(['none', 'basic', 'thorough']),
    notes: z.string(),
  }),
  interview_hooks: z
    .array(
      z.object({
        path: filePath,
        start_line: z.number().int().min(1),
        end_line: z.number().int().min(1),
        why: z.string().describe('Why this snippet is a good thing to ask the author about'),
      }),
    )
    .describe('Concrete snippets that only someone who understands the code could explain'),
});
export type RepoMap = z.infer<typeof RepoMapSchema>;

export const CommitProfileSchema = z.object({
  total_commits: z.number().int(),
  authors: z.array(z.string()),
  first_commit_at: z.string().nullable(),
  last_commit_at: z.string().nullable(),
  commits_before_start: z.number().int().nullable(),
});
export type CommitProfile = z.infer<typeof CommitProfileSchema>;

/** Every path the map cites, so the backend can check they exist in the repo. */
export function citedPaths(map: RepoMap): string[] {
  const out = new Set<string>();
  for (const c of map.components) c.paths.forEach((p) => out.add(p));
  for (const d of map.key_decisions) d.paths.forEach((p) => out.add(p));
  for (const w of map.weaknesses) w.paths.forEach((p) => out.add(p));
  for (const h of map.interview_hooks) out.add(h.path);
  return [...out];
}

/** Drops citations of files that do not exist, and items left with no evidence. */
export function pruneUnknownPaths(map: RepoMap, known: ReadonlySet<string>): RepoMap {
  const keep = (p: string) => known.has(p);
  return {
    ...map,
    components: map.components
      .map((c) => ({ ...c, paths: c.paths.filter(keep) }))
      .filter((c) => c.paths.length > 0),
    key_decisions: map.key_decisions
      .map((d) => ({ ...d, paths: d.paths.filter(keep) }))
      .filter((d) => d.paths.length > 0),
    weaknesses: map.weaknesses.map((w) => ({ ...w, paths: w.paths.filter(keep) })),
    interview_hooks: map.interview_hooks.filter((h) => keep(h.path)),
  };
}
