import { tr } from '../i18n';

// The grader cites evidence as repository file paths or as demo-video timestamps (mm:ss, sometimes h:mm:ss or a
// range like 01:10-01:45). A timestamp must link to the video at that second, never to a file in the repository.

const TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}`;
const TIMESTAMP = new RegExp(String.raw`^\s*(${TIME})(?:\s*[-–]\s*${TIME})?\s*$`);

/** Seconds from the start of the video when this evidence is a timestamp, or null when it is a file path. */
export function timestampSeconds(evidence: string): number | null {
  const m = TIMESTAMP.exec(evidence);
  if (!m) return null;
  return m[1]!.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/** The video URL opened at this second: YouTube with t=, any other link with a media fragment (#t=). */
export function videoAt(videoUrl: string, seconds: number): string {
  try {
    const url = new URL(videoUrl);
    const host = url.hostname.replace(/^(www\.|m\.)/, '');
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
      url.searchParams.set('t', `${seconds}s`);
      return url.toString();
    }
    url.hash = `t=${seconds}`;
    return url.toString();
  } catch {
    return videoUrl;
  }
}

export interface EvidenceLink {
  kind: 'file' | 'video';
  label: string;
  /** Null when there is nothing to open (no repository, frozen commit or video). */
  href: string | null;
}

/** Where one evidence item points: the file at the frozen commit, or the video at that moment. */
export function evidenceLink(evidence: string, ctx: { repoUrl: string | null; sha: string | null; videoUrl: string | null }): EvidenceLink {
  const seconds = timestampSeconds(evidence);
  if (seconds != null) {
    return { kind: 'video', label: evidence.trim(), href: ctx.videoUrl ? videoAt(ctx.videoUrl, seconds) : null };
  }
  const path = evidence.replace(/^\/+/, '');
  return { kind: 'file', label: evidence, href: ctx.repoUrl && ctx.sha ? `${ctx.repoUrl}/blob/${ctx.sha}/${path}` : null };
}

/** Tooltip for an evidence chip: what it opens, or why it opens nothing. */
export function evidenceTitle(ev: EvidenceLink): string {
  if (ev.kind === 'video') {
    return ev.href ? tr('Open the demo video at {time}', { time: ev.label }) : tr('Demo video at {time} (no video link)', { time: ev.label });
  }
  return ev.href ? tr('Open {path} at the frozen commit', { path: ev.label }) : ev.label;
}
