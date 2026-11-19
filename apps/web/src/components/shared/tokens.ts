export type SkillLevel = 'not_shown' | 'basic' | 'solid' | 'strong';
export type SemanticTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

/**
 * Classes for each semantic tone, from the color roles in index.css (@theme). Every pair passes WCAG 2.2 AA:
 * chip = <tone>-ink text on <tone>-soft (≥ 5.8:1), text = on white (≥ 4.9:1), onDark = on dark-canvas (≥ 9:1).
 * Use these instead of combining tone classes by hand.
 */
export const TONE_CLASS: Record<SemanticTone, { chip: string; text: string; dot: string; onDark: string; fill: string }> = {
  neutral: { chip: 'border-line bg-paper text-muted', text: 'text-muted', dot: 'bg-muted', onDark: 'text-dark-muted', fill: 'bg-ink text-white' },
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
export const PERMISSION_LABEL: Record<string, { label: string; description: string }> = {
  'event.join': { label: 'Join events', description: 'Join open events and private ones by link.' },
  'submission.create': { label: 'Submit repositories', description: 'Submit a GitHub repository to an event.' },
  'interview.take': { label: 'Take voice interviews', description: 'Take a 3-minute voice interview about your code.' },
  'profile.publish': { label: 'Publish a public profile', description: 'Share verified reports on a public page.' },
  'event.create': { label: 'Create events', description: 'Create hackathons, assignments and capstones.' },
  'event.manage': { label: 'Run events', description: 'Open, close and judge events, and edit their rubric.' },
  'results.publish': { label: 'Publish results', description: 'Make final scores visible to participants.' },
  'score.override': { label: 'Adjust scores', description: 'Change an AI score, with a reason in the audit log.' },
  'submission.review': { label: 'Review submissions', description: 'Score the submissions assigned to you.' },
  'integrity.decide': { label: 'Decide on integrity flags', description: 'Record a verdict on similar submissions.' },
  'course.manage': { label: 'Manage courses', description: 'Create courses, add students and assignments.' },
  'org.manage_members': { label: 'Manage members', description: 'Invite people, change roles and remove access.' },
  'org.view_usage': { label: 'See AI usage', description: 'See Gemini calls, tokens and estimated cost.' },
  'audit.read': { label: 'Read the audit log', description: 'See every sensitive change and who made it.' },
};

/** Readable names for a list of permission keys, in the order of PERMISSION_LABEL; unknown keys are kept as they are. */
export function permissionLabels(keys: string[]): string[] {
  const known = Object.keys(PERMISSION_LABEL).filter((k) => keys.includes(k)).map((k) => PERMISSION_LABEL[k]!.label);
  const unknown = keys.filter((k) => !PERMISSION_LABEL[k]);
  return [...known, ...unknown];
}

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  not_shown: 'NOT SHOWN',
  basic: 'BASIC',
  solid: 'SOLID',
  strong: 'STRONG',
};

export const SKILL_LEVEL_TONE: Record<SkillLevel, SemanticTone> = {
  not_shown: 'neutral',
  basic: 'warn',
  solid: 'accent',
  strong: 'good',
};

export type DossierThemeKey = 'cobalt' | 'indigo' | 'sky' | 'emerald' | 'amber' | 'crimson';

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
  cobalt: {
    key: 'cobalt',
    cardBorder: 'border-line hover:border-accent',
    headerBg: 'bg-gradient-to-r from-accent-soft/75 via-white to-transparent border-b border-line',
    iconBg: 'bg-accent text-white',
    badgeBg: 'bg-accent text-white',
    pillClass: 'border-accent/25 bg-accent-soft text-accent-ink',
    noteBorder: 'border-l-accent bg-accent-soft/45',
    noteTitle: 'text-accent',
    quoteBorder: 'border-l-accent bg-accent-soft/35',
    icon: 'person_pin',
  },
  indigo: {
    key: 'indigo',
    cardBorder: 'border-[#C7D2FE] hover:border-[#6366F1]',
    headerBg: 'bg-gradient-to-r from-[#EEF2FF] via-white to-[#F5F3FF] border-b border-[#E0E7FF]',
    iconBg: 'bg-[#4338CA] text-white',
    badgeBg: 'bg-[#4338CA] text-white',
    pillClass: 'border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]',
    noteBorder: 'border-l-[#4338CA] bg-[#EEF2FF]/60',
    noteTitle: 'text-[#3730A3]',
    quoteBorder: 'border-l-[#4338CA] bg-[#F5F3FF]/60',
    icon: 'terminal',
  },
  sky: {
    key: 'sky',
    cardBorder: 'border-[#BAE6FD] hover:border-[#0284C7]',
    headerBg: 'bg-gradient-to-r from-[#F0F9FF] via-white to-[#EFF6FF] border-b border-[#E0F2FE]',
    iconBg: 'bg-[#0284C7] text-white',
    badgeBg: 'bg-[#0284C7] text-white',
    pillClass: 'border-[#BAE6FD] bg-[#F0F9FF] text-[#075985]',
    noteBorder: 'border-l-[#0284C7] bg-[#F0F9FF]/70',
    noteTitle: 'text-[#075985]',
    quoteBorder: 'border-l-[#0284C7] bg-[#F0F9FF]/50',
    icon: 'layers',
  },
  emerald: {
    key: 'emerald',
    cardBorder: 'border-[#A7F3D0] hover:border-[#12805C]',
    headerBg: 'bg-gradient-to-r from-[#E7F5F0] via-white to-[#F0FDFA] border-b border-[#D1FAE5]',
    iconBg: 'bg-good text-white',
    badgeBg: 'bg-good text-white',
    pillClass: 'border-good/30 bg-good-soft text-good-ink',
    noteBorder: 'border-l-good bg-good-soft/60',
    noteTitle: 'text-good',
    quoteBorder: 'border-l-good bg-[#FBFDFB]',
    icon: 'memory',
  },
  amber: {
    key: 'amber',
    cardBorder: 'border-warn/35 hover:border-warn',
    headerBg: 'bg-gradient-to-r from-[#FDF3E3] via-white to-transparent border-b border-line',
    iconBg: 'bg-warn text-white',
    badgeBg: 'bg-warn text-white',
    pillClass: 'border-warn/30 bg-warn-soft text-warn-ink',
    noteBorder: 'border-l-warn bg-[#FFFDF5]',
    noteTitle: 'text-warn',
    quoteBorder: 'border-l-warn bg-[#FFFDF5]',
    icon: 'tune',
  },
  crimson: {
    key: 'crimson',
    cardBorder: 'border-bad/40 bg-bad-soft/25',
    headerBg: 'bg-bad-soft/65 border-b border-bad/30',
    iconBg: 'bg-bad text-white',
    badgeBg: 'bg-bad text-white',
    pillClass: 'border-bad/40 bg-white text-bad',
    noteBorder: 'border-l-bad bg-bad-soft/50',
    noteTitle: 'text-bad',
    quoteBorder: 'border-l-bad bg-bad-soft/35',
    icon: 'warning',
  },
};

export const ARTIFACT_THEME_CYCLE: DossierAccentTheme[] = [
  DOSSIER_THEMES.indigo,
  DOSSIER_THEMES.sky,
  DOSSIER_THEMES.emerald,
];

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

export const ORG_ROLE_SPECS: Record<OrgRoleKey, RoleCapabilitySpec> = {
  owner: {
    key: 'owner',
    label: 'OWNER',
    tier: 'ADMIN ROOT',
    description:
      'Manages members, invitations, roles and organization settings, plus everything an organizer can do.',
    badgeClass: 'border-bad/30 bg-bad-soft text-bad',
    cardClass: 'border-bad/25 bg-bad-soft/40 text-ink',
    pillBgClass: 'bg-bad text-white',
    avatarBgClass: 'bg-bad text-white ring-2 ring-bad-soft',
  },
  organizer: {
    key: 'organizer',
    label: 'ORGANIZER',
    tier: 'STAGE OPS',
    description:
      'Create hackathons, freeze candidate repositories, synthesize AST runs, and publish official leaderboards.',
    badgeClass: 'border-accent/25 bg-accent-soft text-accent-ink',
    cardClass: 'border-accent/25 bg-accent-soft/45 text-ink',
    pillBgClass: 'bg-accent text-white',
    avatarBgClass: 'bg-accent text-white ring-2 ring-accent-soft',
  },
  judge: {
    key: 'judge',
    label: 'JUDGE',
    tier: 'VERIFICATION',
    description:
      'Read-only access to submissions, submit rubric score overrides, and inspect AI voice defense audits.',
    badgeClass: 'border-good/30 bg-good-soft text-good-ink',
    cardClass: 'border-good/25 bg-good-soft/45 text-ink',
    pillBgClass: 'bg-good text-white',
    avatarBgClass: 'bg-good text-white ring-2 ring-good-soft',
  },
  auditor: {
    key: 'auditor',
    label: 'AUDITOR',
    tier: 'COMPLIANCE',
    description:
      'Reads the audit log and AI usage, and records integrity decisions on flagged submissions.',
    badgeClass: 'border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]',
    cardClass: 'border-[#C7D2FE] bg-[#EEF2FF]/50 text-ink',
    pillBgClass: 'bg-[#4338CA] text-white',
    avatarBgClass: 'bg-[#4338CA] text-white ring-2 ring-[#EEF2FF]',
  },
};

export function normalizeOrgRole(raw: string | undefined): OrgRoleKey {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('owner') || lower.includes('admin')) return 'owner';
  if (lower.includes('judge') || lower.includes('reviewer')) return 'judge';
  if (lower.includes('audit')) return 'auditor';
  return 'organizer';
}

export type SimilaritySignal = 'same_repo' | 'same_fork_parent' | 'identical_files' | 'embedding';

export const SIMILARITY_SIGNAL_LABEL: Record<SimilaritySignal, string> = {
  same_repo: 'Same repository',
  same_fork_parent: 'Forks of the same project',
  identical_files: 'Identical files',
  embedding: 'Very similar code',
};

export type SubmissionPipelineStatus = 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error' | 'paused' | 'canceled';

export const SUBMISSION_STATUS_LABEL: Record<SubmissionPipelineStatus, string> = {
  submitted: 'Submitted',
  queued: 'Queued',
  analyzing: 'Being judged',
  scored: 'Scored',
  error: 'Failed',
  paused: 'Paused',
  canceled: 'Canceled',
};

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function formatAudioDuration(
  seconds: number | null | undefined,
  suffix = 'Recorded',
  fallback = '03:00 Window',
): string {
  if (seconds == null || seconds <= 0) return fallback;
  return `${formatClock(seconds)} ${suffix}`;
}

export function formatCountdown(deadlineIso: string): { label: string; urgent: boolean; closed: boolean } {
  const diffMs = Date.parse(deadlineIso) - Date.now();
  if (diffMs <= 0) return { label: 'DEADLINE PASSED', urgent: false, closed: true };
  const totalHours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (days > 0) {
    return {
      label: `ENDS IN ${String(days).padStart(2, '0')}D : ${String(hours).padStart(2, '0')}H`,
      urgent: days <= 2,
      closed: false,
    };
  }
  return {
    label: `ENDS IN ${String(hours).padStart(2, '0')}H : ${String(mins).padStart(2, '0')}M`,
    urgent: true,
    closed: false,
  };
}
