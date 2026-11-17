import { AiUnavailableError, aiErrorStatus } from './gemini.js';
import { HttpError } from './errors.js';

/**
 * Turns an error from a background job into one sentence a user can act on.
 * The technical detail goes to the activity log and the server logs, not to this message.
 */
export function friendlyJobError(err: unknown, action: 'judge' | 'prepare' | 'evaluate'): string {
  const retry =
    action === 'judge'
      ? 'Use "Judge again" in a few minutes.'
      : action === 'prepare'
        ? 'Start a new interview in a few minutes.'
        : 'Your answers are saved.';
  if (err instanceof AiUnavailableError)
    return `Gemini is overloaded right now. SkillProof tried ${err.models.length} models and none answered. ${retry}`;
  if (err instanceof HttpError) return err.message;
  const text = err instanceof Error ? err.message : String(err);
  const status = aiErrorStatus(err);
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text))
    return `The Gemini usage limit for this project was reached. ${retry}`;
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED/i.test(text))
    return 'SkillProof could not use Gemini: the API key or Google Cloud permissions are not set up correctly. Tell the site admin.';
  if (/GitHub rate limit/i.test(text)) return `GitHub is limiting requests right now. ${retry}`;
  if (/does not match the schema/i.test(text)) return `The AI returned an incomplete answer. ${retry}`;
  return `Something went wrong while ${action === 'judge' ? 'judging this project' : action === 'prepare' ? 'preparing the interview' : 'writing the report'}. ${retry}`;
}

/** The raw error, shortened, for the activity log seen by organizers and admins. */
export const technicalDetail = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 400);
