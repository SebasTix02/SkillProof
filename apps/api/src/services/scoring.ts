import { languageNote } from './language.js';
import { CourseScoreResultSchema, ScoreResultSchema, type CourseScoreResult, type Rubric } from '@skillproof/shared';
import type { Part } from '@google/genai';
import type { AnalysisRow } from '../engine/analyze.js';
import { currentActivity } from '../lib/activity.js';
import { AiUnavailableError, generateJson, isTransientAiError, type UsageContext } from '../lib/gemini.js';
import { analysisModel, summariesModel } from '../lib/models.js';
import { db, must } from '../lib/supabase.js';
import { HACKATHON_SYSTEM, scoringSystem, subjectBlock, type CourseContext, type ScoringSpecKey } from './scoringSpecs.js';

/** The hackathon prompt (kept as SCORE_SYSTEM for the events code and its snapshot test). */
export const SCORE_SYSTEM = HACKATHON_SYSTEM;

export interface ScoreInput {
  /** Language of the feedback: the event's or the assignment's. */
  language?: 'en' | 'es';
  submissionId: string;
  organizationId: string;
  rubric: Rubric;
  analysis: AnalysisRow;
  /** Hackathon: the team name. Courses: the student's or the group's name. */
  teamName: string;
  description: string;
  videoUrl: string | null;
  usage: UsageContext;
  /** Which prompt grades it. Default: hackathon. */
  spec?: ScoringSpecKey;
  /** The assignment, for course specs. */
  course?: CourseContext;
  /** Where scores and feedback are stored. Default: the event tables. */
  store?: { scores: 'scores' | 'assignment_scores'; feedback: 'feedback' | 'assignment_feedback' };
}

/**
 * What the judge needs from the analysis, and nothing more: the interview snippets are left out (they are for the
 * voice interview) and the commit history is reduced to the numbers that matter for a hackathon.
 */
export function compactEvidence(analysis: Pick<AnalysisRow, 'map_json' | 'commit_profile_json'>): Record<string, unknown> {
  const { interview_hooks: _hooks, ...map } = analysis.map_json;
  const c = analysis.commit_profile_json;
  return {
    map,
    commits: c
      ? { total: c.total_commits, authors: c.authors.length, first: c.first_commit_at, last: c.last_commit_at, before_event_start: c.commits_before_start }
      : null,
  };
}

export function buildParts(input: ScoreInput, withVideo: boolean): Part[] {
  const rubric = input.rubric
    .map(
      (c) =>
        `- ${c.key} (${c.name}, weight ${c.weight}): ${c.description}\n    2 = ${c.anchors.low}\n    5 = ${c.anchors.mid}\n    8 = ${c.anchors.high}`,
    )
    .join('\n');
  const text = `Rubric:
${rubric}

Return one entry in "scores" for each of these criterion keys, in this order: ${input.rubric.map((c) => c.key).join(', ')}.

${subjectBlock(input.spec ?? 'hackathon', input.teamName, input.course)}

<description>
${input.description || '(none given)'}
</description>

<repository>
${JSON.stringify(compactEvidence(input.analysis))}
</repository>

Video: ${withVideo ? 'attached. It contains the demo and the pitch.' : 'none available.'}`;
  const parts: Part[] = [{ text }];
  if (withVideo && input.videoUrl) parts.push({ fileData: { fileUri: input.videoUrl, mimeType: 'video/*' } });
  return parts;
}

async function runScoring(input: ScoreInput, withVideo: boolean): Promise<CourseScoreResult> {
  const spec = input.spec ?? 'hackathon';
  await currentActivity()?.step(
    `Scoring ${input.rubric.length} criteria against the rubric${withVideo ? ', watching the demo video for demo and pitch' : ''}.`,
    analysisModel(),
  );
  const { data } = await generateJson({
    model: analysisModel(),
    // Course specs also return next_steps; the hackathon result is the original schema.
    schema: spec === 'hackathon' ? ScoreResultSchema : CourseScoreResultSchema,
    system: scoringSystem(spec) + languageNote(input.language, 'every text you return (justifications, strengths, improvements and next steps)'),
    parts: buildParts(input, withVideo),
    usage: { ...input.usage, kind: withVideo ? 'score_with_video' : 'score' },
    temperature: 0.1,
    maxOutputTokens: 6_000,
    effort: 'medium',
  });
  return { ...data, feedback: { next_steps: [], ...data.feedback } };
}

/**
 * Scores a submission and stores scores and feedback.
 * Returns a note when the video could not be used, so the organizer knows why demo and pitch are empty.
 */
export async function scoreSubmission(input: ScoreInput): Promise<{ note: string | null }> {
  let result: CourseScoreResult;
  const store = input.store ?? { scores: 'scores', feedback: 'feedback' };
  let note: string | null = null;
  if (input.videoUrl) {
    try {
      result = await runScoring(input, true);
    } catch (err) {
      // A busy model fails the same way without the video: let the job retry later instead of scoring twice.
      if (err instanceof AiUnavailableError || isTransientAiError(err)) throw err;
      // Private, removed or too long videos fail the whole call. The code is still worth scoring.
      console.warn(`Scoring with video failed for ${input.submissionId}:`, err);
      note = 'The video could not be read (it must be a public YouTube video), so demo and pitch were not scored.';
      await currentActivity()?.step('The video could not be read, so the project is scored again from the code alone.');
      result = await runScoring(input, false);
    }
  } else {
    result = await runScoring(input, false);
  }

  const known = new Set(input.rubric.map((c) => c.key));
  const byKey = new Map(result.scores.filter((s) => known.has(s.criterion_key)).map((s) => [s.criterion_key, s]));
  const rows = input.rubric.map((c) => {
    const s = byKey.get(c.key);
    return {
      submission_id: input.submissionId,
      organization_id: input.organizationId,
      criterion_key: c.key,
      ai_score: s?.score ?? null,
      justification: s?.justification ?? 'The model returned no score for this criterion.',
      evidence_json: s?.evidence ?? [],
    };
  });
  // Upsert only the AI columns, so a judge's override survives a re-run.
  must(await db().from(store.scores).upsert(rows, { onConflict: 'submission_id,criterion_key' }));
  must(
    await db().from(store.feedback).upsert(
      {
        submission_id: input.submissionId,
        organization_id: input.organizationId,
        strengths_json: result.feedback.strengths,
        improvements_json: result.feedback.improvements,
        ...(store.feedback === 'assignment_feedback' ? { next_steps_json: result.feedback.next_steps } : {}),
      },
      { onConflict: 'submission_id' },
    ),
  );
  return { note };
}
