import { db } from './supabase.js';

/**
 * Adds one line to the organization's audit trail (Organization settings > Audit trail export).
 * Best effort: a failed write is logged and never fails the action being audited.
 */
export async function audit(entry: {
  organizationId: string;
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await db().from('audit_log').insert({
    organization_id: entry.organizationId,
    actor_id: entry.actorId,
    action: entry.action,
    subject_type: entry.subjectType,
    subject_id: entry.subjectId ?? null,
    detail_json: entry.detail ?? {},
  });
  if (error) console.warn(`audit ${entry.action} failed:`, error.message);
}
