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
});

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', async (req) => {
    const user = await requireUser(req);
    const profile = must(await db().from('profiles').select('id, display_name, github_login, avatar_url').eq('id', user.id).single());
    const publicProfile = must(await db().from('public_profiles').select('slug, is_public, headline').eq('user_id', user.id).maybeSingle());
    const orgIds = [...new Set(user.grants.flatMap((g) => (g.organization_id ? [g.organization_id] : [])))];
    const orgs = orgIds.length ? (must(await db().from('organizations').select('id, name, slug, plan').in('id', orgIds)) as { id: string }[]) : [];
    return {
      profile,
      email: user.email,
      public_profile: publicProfile,
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
    if (input.display_name !== undefined)
      must(await db().from('profiles').update({ display_name: input.display_name }).eq('id', user.id));
    const pub: Record<string, unknown> = {};
    if (input.headline !== undefined) pub.headline = input.headline;
    if (input.is_public !== undefined) pub.is_public = input.is_public;
    if (Object.keys(pub).length) must(await db().from('public_profiles').update(pub).eq('user_id', user.id));
    return { ok: true };
  });

  // Public: no sign-in needed. Only profiles their owner chose to publish.
  app.get('/api/profiles/:slug', async (req) => {
    const { slug } = parse(z.object({ slug: z.string().max(80) }), req.params);
    const pub = must(
      await db().from('public_profiles').select('user_id, slug, headline, is_public, profiles(display_name, github_login, avatar_url)').eq('slug', slug).maybeSingle(),
    ) as unknown as { user_id: string; slug: string; headline: string; is_public: boolean; profiles: Record<string, unknown> } | null;
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
    return { profile: { slug: pub.slug, headline: pub.headline, ...pub.profiles }, interviews };
  });
}
