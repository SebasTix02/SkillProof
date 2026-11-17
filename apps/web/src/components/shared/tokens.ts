export type SkillLevel = 'not_shown' | 'basic' | 'solid' | 'strong';
export type SemanticTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

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
    headerBg: 'bg-gradient-to-r from-[#E9EFFF]/75 via-white to-transparent border-b border-line',
    iconBg: 'bg-accent text-white',
    badgeBg: 'bg-accent text-white',
    pillClass: 'border-accent/25 bg-accent-soft text-accent',
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
    pillClass: 'border-good/30 bg-good-soft text-good',
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
    pillClass: 'border-warn/30 bg-warn-soft text-warn',
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
