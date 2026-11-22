import { lazy, tr } from '../../i18n';
export type SkillLevel = 'not_shown' | 'basic' | 'solid' | 'strong';
export type SemanticTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

/**
 * Classes for each semantic tone, from the color roles in index.css (@theme). Every pair passes WCAG 2.2 AA:
 * chip = <tone>-ink text on <tone>-soft (≥ 5.8:1), text = on white (≥ 4.9:1), onDark = on dark-canvas (≥ 9:1).
 * Use these instead of combining tone classes by hand.
 */
export const TONE_CLASS: Record<SemanticTone, { chip: string; text: string; dot: string; onDark: string; fill: string }> = {
  neutral: { chip: 'border-line bg-paper text-muted', text: 'text-muted', dot: 'bg-muted', onDark: 'text-dark-muted', fill: 'bg-ink text-paper' },
  good: { chip: 'border-good/30 bg-good-soft text-good-ink', text: 'text-good', dot: 'bg-good', onDark: 'text-good-on-dark', fill: 'bg-good text-on-good' },
  warn: { chip: 'border-warn/30 bg-warn-soft text-warn-ink', text: 'text-warn', dot: 'bg-warn', onDark: 'text-warn-on-dark', fill: 'bg-warn text-on-warn' },
  bad: { chip: 'border-bad/30 bg-bad-soft text-bad-ink', text: 'text-bad', dot: 'bg-bad', onDark: 'text-bad-on-dark', fill: 'bg-bad text-on-bad' },
  accent: { chip: 'border-accent/25 bg-accent-soft text-accent-ink', text: 'text-accent', dot: 'bg-accent', onDark: 'text-accent-on-dark', fill: 'bg-accent text-on-accent' },
};

/** Which step of a scale to use for each job (see index.css). Documentation for audits and new components. */
export const COLOR_ROLE_GUIDE = [
  { job: 'Text and links on white or paper', use: 'text-<tone> (500) or text-<tone>-ink (600)' },
  { job: 'Text on a tinted background (chip, badge, notice)', use: 'bg-<tone>-soft + text-<tone>-ink' },
  { job: 'Icon, active border, focus ring', use: '<tone>-ui (500); input borders line-strong (3:1)' },
  { job: 'Filled button', use: 'bg-<tone> + text-on-<tone>' },
  { job: 'Text and icons on the dark surfaces', use: 'text-<tone>-on-dark (300), text-dark-ink, text-dark-muted' },
  { job: 'Secondary text', use: 'text-muted; lightest allowed for text: text-faint (placeholders)' },
  { job: 'Decoration, hairlines, illustrations', use: 'line, <tone>-200…400 (no contrast requirement)' },
] as const;

/** Permission keys (supabase/migrations) in the user's words, for screens that show what someone can do. */
export const PERMISSION_LABEL: Record<string, { label: string; description: string }> = lazy(() => ({
  'event.join': { label: tr('Join events'), description: tr('Join open events and private ones by link.') },
  'submission.create': { label: tr('Submit repositories'), description: tr('Submit a GitHub repository to an event.') },
  'interview.take': { label: tr('Take voice interviews'), description: tr('Take a 3-minute voice interview about your code.') },
  'profile.publish': { label: tr('Publish a public profile'), description: tr('Share verified reports on a public page.') },
  'event.create': { label: tr('Create events'), description: tr('Create hackathons and capstones.') },
  'event.manage': { label: tr('Run events'), description: tr('Open, close and judge events, and edit their rubric.') },
  'results.publish': { label: tr('Publish results'), description: tr('Make final scores visible to participants.') },
  'score.override': { label: tr('Adjust scores'), description: tr('Change an AI score, with a reason in the audit log.') },
  'submission.review': { label: tr('Review submissions'), description: tr('Score the submissions assigned to you.') },
  'integrity.decide': { label: tr('Decide on integrity flags'), description: tr('Record a verdict on similar submissions.') },
  'course.manage': { label: tr('Manage courses'), description: tr('Create courses, add students and assignments.') },
  'org.manage_members': { label: tr('Manage members'), description: tr('Invite people, change roles and remove access.') },
  'org.view_usage': { label: tr('See AI usage'), description: tr('See Gemini calls, tokens and estimated cost.') },
  'audit.read': { label: tr('Read the audit log'), description: tr('See every sensitive change and who made it.') },
}));

/** Readable names for a list of permission keys, in the order of PERMISSION_LABEL; unknown keys are kept as they are. */
export function permissionLabels(keys: string[]): string[] {
  const known = Object.keys(PERMISSION_LABEL).filter((k) => keys.includes(k)).map((k) => PERMISSION_LABEL[k]!.label);
  const unknown = keys.filter((k) => !PERMISSION_LABEL[k]);
  return [...known, ...unknown];
}

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = lazy(() => ({
  not_shown: tr('NOT SHOWN'),
  basic: tr('BASIC'),
  solid: tr('SOLID'),
  strong: tr('STRONG'),
}));

export const SKILL_LEVEL_TONE: Record<SkillLevel, SemanticTone> = {
  not_shown: 'neutral',
  basic: 'warn',
  solid: 'accent',
  strong: 'good',
};

/**
 * Section themes (NumberedSectionCard, EditorialQuoteBlock, public-profile artifacts). Only tones with a meaning:
 * accent = the main or configuration section, good = success, warn = pending or needs attention, bad = destructive,
 * neutral = everything else. Built from the color roles in index.css (no hex).
 */
export type DossierThemeKey = SemanticTone;

export interface DossierAccentTheme {
  key: DossierThemeKey;
  cardBorder: string;
  headerBg: string;
  iconBg: string;
  badgeBg: string;
  pillClass: string;
  noteBorder: string;
  noteTitle: string;
  quoteBorder: string;
  icon: string;
}

export const DOSSIER_THEMES: Record<DossierThemeKey, DossierAccentTheme> = {
  accent: {
    key: 'accent',
    cardBorder: 'border-line hover:border-accent-ui',
    headerBg: 'bg-gradient-to-r from-accent-50 via-white to-transparent border-b border-line',
    iconBg: 'bg-accent text-on-accent',
    badgeBg: 'bg-accent text-on-accent',
    pillClass: 'border-accent-200 bg-accent-soft text-accent-ink',
    noteBorder: 'border-l-accent-ui bg-accent-50',
    noteTitle: 'text-accent-ink',
    quoteBorder: 'border-l-accent-ui bg-accent-50',
    icon: 'person_pin',
  },
  neutral: {
    key: 'neutral',
    cardBorder: 'border-line hover:border-line-strong',
    headerBg: 'bg-paper border-b border-line',
    iconBg: 'bg-ink text-paper',
    badgeBg: 'bg-ink text-paper',
    pillClass: 'border-line bg-paper text-muted',
    noteBorder: 'border-l-line-strong bg-paper',
    noteTitle: 'text-ink',
    quoteBorder: 'border-l-line-strong bg-paper',
    icon: 'layers',
  },
  good: {
    key: 'good',
    cardBorder: 'border-good-200 hover:border-good-ui',
    headerBg: 'bg-gradient-to-r from-good-50 via-white to-transparent border-b border-good-200',
    iconBg: 'bg-good text-on-good',
    badgeBg: 'bg-good text-on-good',
    pillClass: 'border-good-200 bg-good-soft text-good-ink',
    noteBorder: 'border-l-good-ui bg-good-50',
    noteTitle: 'text-good-ink',
    quoteBorder: 'border-l-good-ui bg-good-50',
    icon: 'verified',
  },
  warn: {
    key: 'warn',
    cardBorder: 'border-warn-200 hover:border-warn-ui',
    headerBg: 'bg-gradient-to-r from-warn-50 via-white to-transparent border-b border-warn-200',
    iconBg: 'bg-warn text-on-warn',
    badgeBg: 'bg-warn text-on-warn',
    pillClass: 'border-warn-200 bg-warn-soft text-warn-ink',
    noteBorder: 'border-l-warn-ui bg-warn-50',
    noteTitle: 'text-warn-ink',
    quoteBorder: 'border-l-warn-ui bg-warn-50',
    icon: 'pending',
  },
  bad: {
    key: 'bad',
    cardBorder: 'border-bad-200 bg-bad-50',
    headerBg: 'bg-bad-soft border-b border-bad-200',
    iconBg: 'bg-bad text-on-bad',
    badgeBg: 'bg-bad text-on-bad',
    pillClass: 'border-bad-200 bg-surface text-bad-ink',
    noteBorder: 'border-l-bad-ui bg-bad-50',
    noteTitle: 'text-bad-ink',
    quoteBorder: 'border-l-bad-ui bg-bad-50',
    icon: 'warning',
  },
};

/** Public-profile artifacts alternate between the accent and the neutral theme. */
export const ARTIFACT_THEME_CYCLE: DossierAccentTheme[] = [DOSSIER_THEMES.accent, DOSSIER_THEMES.neutral];

export type OrgRoleKey = 'owner' | 'organizer' | 'judge' | 'auditor';

export interface RoleCapabilitySpec {
  key: OrgRoleKey;
  label: string;
  tier: string;
  description: string;
  badgeClass: string;
  cardClass: string;
  pillBgClass: string;
  avatarBgClass: string;
}

export const ORG_ROLE_SPECS: Record<OrgRoleKey, RoleCapabilitySpec> = lazy(() => ({
  owner: {
    key: 'owner',
    label: tr('OWNER'),
    tier: tr('ADMIN ROOT'),
    description: tr('Manages members, invitations, roles and organization settings, plus everything an organizer can do.'),
    badgeClass: 'border-bad/30 bg-bad-soft text-bad',
    cardClass: 'border-bad/25 bg-bad-soft/40 text-ink',
    pillBgClass: 'bg-bad text-on-bad',
    avatarBgClass: 'bg-bad text-on-bad ring-2 ring-bad-soft',
  },
  organizer: {
    key: 'organizer',
    label: tr('ORGANIZER'),
    tier: tr('STAGE OPS'),
    description: tr('Create hackathons, freeze candidate repositories, synthesize AST runs, and publish official leaderboards.'),
    badgeClass: 'border-accent/25 bg-accent-soft text-accent-ink',
    cardClass: 'border-accent/25 bg-accent-soft/45 text-ink',
    pillBgClass: 'bg-accent text-on-accent',
    avatarBgClass: 'bg-accent text-on-accent ring-2 ring-accent-soft',
  },
  judge: {
    key: 'judge',
    label: tr('JUDGE'),
    tier: tr('VERIFICATION'),
    description: tr('Read-only access to submissions, submit rubric score overrides, and inspect AI voice defense audits.'),
    badgeClass: 'border-good/30 bg-good-soft text-good-ink',
    cardClass: 'border-good/25 bg-good-soft/45 text-ink',
    pillBgClass: 'bg-good text-on-good',
    avatarBgClass: 'bg-good text-on-good ring-2 ring-good-soft',
  },
  auditor: {
    key: 'auditor',
    label: tr('AUDITOR'),
    tier: tr('COMPLIANCE'),
    description: tr('Reads the audit log and AI usage, and records integrity decisions on flagged submissions.'),
    badgeClass: 'border-accent-200 bg-accent-soft text-accent-ink',
    cardClass: 'border-accent-200 bg-accent-soft/50 text-ink',
    pillBgClass: 'bg-accent text-on-accent',
    avatarBgClass: 'bg-accent text-on-accent ring-2 ring-accent-soft',
  },
}));


export function normalizeOrgRole(raw: string | undefined): OrgRoleKey {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('owner') || lower.includes('admin')) return 'owner';
  if (lower.includes('judge') || lower.includes('reviewer')) return 'judge';
  if (lower.includes('audit')) return 'auditor';
  return 'organizer';
}

export type SimilaritySignal = 'same_repo' | 'same_fork_parent' | 'identical_files' | 'embedding' | 'shared_code';

export const SIMILARITY_SIGNAL_LABEL: Record<SimilaritySignal, string> = lazy(() => ({
  same_repo: tr('Same repository'),
  same_fork_parent: tr('Forks of the same project'),
  identical_files: tr('Identical files'),
  embedding: tr('Very similar code'),
  shared_code: tr('Shared code'),
}));

export type SubmissionPipelineStatus = 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error' | 'paused' | 'canceled';

export const SUBMISSION_STATUS_LABEL: Record<SubmissionPipelineStatus, string> = lazy(() => ({
  submitted: tr('Submitted'),
  queued: tr('Queued'),
  analyzing: tr('Being judged'),
  scored: tr('Scored'),
  error: tr('Failed'),
  paused: tr('Paused'),
  canceled: tr('Canceled'),
}));

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function formatAudioDuration(
  seconds: number | null | undefined,
  suffix = tr('Recorded'),
  fallback = tr('03:00 Window'),
): string {
  if (seconds == null || seconds <= 0) return fallback;
  return `${formatClock(seconds)} ${suffix}`;
}

export function formatCountdown(deadlineIso: string): { label: string; urgent: boolean; closed: boolean } {
  const diffMs = Date.parse(deadlineIso) - Date.now();
  if (diffMs <= 0) return { label: tr('DEADLINE PASSED'), urgent: false, closed: true };
  const totalHours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (days > 0) {
    return {
      label: tr('ENDS IN {d}D : {h}H', { d: String(days).padStart(2, '0'), h: String(hours).padStart(2, '0') }),
      urgent: days <= 2,
      closed: false,
    };
  }
  return {
    label: tr('ENDS IN {h}H : {m}M', { h: String(hours).padStart(2, '0'), m: String(mins).padStart(2, '0') }),
    urgent: true,
    closed: false,
  };
}
