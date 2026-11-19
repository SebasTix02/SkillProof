import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { parse } from '../lib/http.js';
import { db, must } from '../lib/supabase.js';

const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(80).optional(),
  headline: z.string().max(160).optional(),
  is_public: z.boolean().optional(),
  /** Show the transcript quotes behind each skill on the public profile. */
  show_quotes: z.boolean().optional(),
  /** Email when results of a joined event are published. Stored only: sending is not built yet. */
  notify_results: z.boolean().optional(),
});

function withoutQuotes(report: unknown): unknown {
  if (Array.isArray(report)) return report.map(withoutQuotes);
  if (!report || typeof report !== 'object') return report;
  const r = report as { skills_json?: unknown };
  if (!Array.isArray(r.skills_json)) return report;
  return { ...r, skills_json: r.skills_json.map((s) => (s && typeof s === 'object' ? { ...(s as object), evidence_quote: '' } : s)) };
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', async (req) => {
    const user = await requireUser(req);
    const profile = must(await db().from('profiles').select('id, display_name, github_login, avatar_url, notify_results').eq('id', user.id).single());
    const publicProfile = must(await db().from('public_profiles').select('slug, is_public, headline, show_quotes').eq('user_id', user.id).maybeSingle());
    const orgIds = [...new Set(user.grants.flatMap((g) => (g.organization_id ? [g.organization_id] : [])))];
    // Courses the user takes as a student: the web shows "My courses" when there is at least one.
    const enrolled = await db().from('course_members').select('course_id', { count: 'exact', head: true }).eq('user_id', user.id).eq('role', 'student');
    if (enrolled.error) throw new Error(`Database error: ${enrolled.error.message}`);
    const orgs = orgIds.length ? (must(await db().from('organizations').select('id, name, slug, plan').in('id', orgIds)) as { id: string }[]) : [];
    return {
      profile,
      email: user.email,
      public_profile: publicProfile,
      enrolled_courses: enrolled.count ?? 0,
      organizations: orgs.map((o) => ({
        ...o,
        roles: user.grants.filter((g) => g.organization_id === o.id).map((g) => g.role_key),
        permissions: [...new Set(user.grants.filter((g) => g.organization_id === o.id).flatMap((g) => g.permissions))],
      })),
    };
  });

  app.patch('/api/me/profile', async (req) => {
    const user = await requireUser(req);
    const input = parse(UpdateProfileSchema, req.body);
    const own: Record<string, unknown> = {};
    if (input.display_name !== undefined) own.display_name = input.display_name;
    if (input.notify_results !== undefined) own.notify_results = input.notify_results;
    if (Object.keys(own).length) must(await db().from('profiles').update(own).eq('id', user.id));
    const pub: Record<string, unknown> = {};
    if (input.headline !== undefined) pub.headline = input.headline;
    if (input.is_public !== undefined) pub.is_public = input.is_public;
    if (input.show_quotes !== undefined) pub.show_quotes = input.show_quotes;
    if (Object.keys(pub).length) must(await db().from('public_profiles').update(pub).eq('user_id', user.id));
    return { ok: true };
  });

  /** "Revoke public dossier link": a new slug, so links shared before stop working. */
  app.post('/api/me/profile/rotate-slug', async (req) => {
    const user = await requireUser(req);
    const current = must(await db().from('public_profiles').select('slug').eq('user_id', user.id).single()) as { slug: string };
    const base = current.slug.replace(/-[0-9a-f]{6}$/, '');
    const slug = `${base}-${randomBytes(3).toString('hex')}`;
    must(await db().from('public_profiles').update({ slug }).eq('user_id', user.id));
    return { slug };
  });

  // Public: no sign-in needed. Only profiles their owner chose to publish.
  app.get('/api/profiles/:slug', async (req) => {
    const { slug } = parse(z.object({ slug: z.string().max(80) }), req.params);
    const pub = must(
      await db().from('public_profiles').select('user_id, slug, headline, is_public, show_quotes, profiles(display_name, github_login, avatar_url)').eq('slug', slug).maybeSingle(),
    ) as unknown as { user_id: string; slug: string; headline: string; is_public: boolean; show_quotes: boolean; profiles: Record<string, unknown> } | null;
    if (!pub || !pub.is_public) throw notFound('Profile not found');
    const interviews = must(
      await db()
        .from('interviews')
        .select('id, created_at, duration_s, submission_id, repos(owner, name, url), repo_analyses(commit_sha), interview_reports(skills_json, ownership_score, confidence, summary)')
        .eq('user_id', pub.user_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20),
    );
    // The owner may hide the quotes behind each skill: scores and skills stay, the words go.
    const shown = pub.show_quotes ? interviews : (interviews as { interview_reports: unknown }[]).map((i) => ({ ...i, interview_reports: withoutQuotes(i.interview_reports) }));
    return { profile: { slug: pub.slug, headline: pub.headline, show_quotes: pub.show_quotes, ...pub.profiles }, interviews: shown };
  });
}
