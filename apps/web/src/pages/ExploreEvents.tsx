import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge,
  DarkBanner,
  DossierPageHeader,
  LiveDot,
  MetricTile,
  PageState,
  SectionHeader,
  formatCountdown,
  formatDate,
  linkButton,
} from '../components/shared';
import { useAuth } from '../lib/auth';
import { STATUS_LABEL, VISIBILITY_LABEL, type EventView } from '../lib/types';
import { useLoad } from '../lib/useLoad';

const GLOBE_BANNER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCpJ6344r24Shk5x3mkB9WDc2u3hzf27rGVCZmdx7lU3pZ2RBdayWQyid_bYcScPW6tUuBWrNQQKC_cipvzrP8D5bRCIo0noKkdKgga2nYPa_EXqX97XfEUUmkpXR84lBdruiqBdkdYJoUItDWweQAaG2AtcRc35nYmRSYjNQkqQO7_jSwQQ2a4OZS2jxQzVbbYVfJeLs7y_P4XnKFsiPjf-B4XujCBxxg9Lv-L_NY';

const ARENA_THUMB =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuANPkqvOBPYAuUNeL9Zm_HESu2w_Nd2DoC6EFGyMR96vx9VzX7ehrdIp4tT8avVj_WI02OmQOUg-PzboXTrcLVE2a5MlmITx1RLs_YAL1SiJEF08e55Mg7ykiKbK8zzBTWAygVcG8pANnsZV2kI2Kw1L27uMscYjT1_c-EQ04NhvWIv3DRNq74eiL-8J3M2DgrxqM3-b8gOtI2lJcVAhP5TW0e43hL3924LDwbTjf8';

function statusTone(status: EventView['status']): 'good' | 'warn' | 'accent' | 'neutral' {
  if (status === 'open') return 'good';
  if (status === 'judging' || status === 'review') return 'warn';
  if (status === 'published') return 'accent';
  return 'neutral';
}

export function ExploreEvents() {
  const { org } = useAuth();
  const navigate = useNavigate();
  const mine = useLoad<{ events: EventView[] }>('/api/me/events');
  const open = useLoad<{ events: EventView[] }>('/api/events');

  const [query, setQuery] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | 'interviews' | 'public' | 'code' | 'invite'>('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'recent' | 'name'>('deadline');
  const [privateInput, setPrivateInput] = useState('');

  const myEvents = mine.data?.events ?? [];
  const openEvents = open.data?.events ?? [];
  const joinedIds = useMemo(() => new Set(myEvents.map((e) => e.id)), [myEvents]);
  const unjoinedOpen = useMemo(() => openEvents.filter((e) => !joinedIds.has(e.id)), [openEvents, joinedIds]);

  const featured = useMemo(() => {
    if (openEvents.length > 0) return openEvents[0]!;
    if (myEvents.length > 0) return myEvents[0]!;
    return null;
  }, [openEvents, myEvents]);

  function applyFilterAndSort(events: EventView[]): EventView[] {
    const q = query.trim().toLowerCase();
    const filtered = events.filter((e) => {
      if (filterKind === 'interviews' && !e.interviews_enabled) return false;
      if (filterKind === 'public' && e.visibility !== 'public') return false;
      if (filterKind === 'code' && e.visibility !== 'code') return false;
      if (filterKind === 'invite' && e.visibility !== 'invite') return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.organization?.name ?? '').toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'recent') return Date.parse(b.starts_at) - Date.parse(a.starts_at);
      return Date.parse(a.submission_deadline) - Date.parse(b.submission_deadline);
    });
  }

  const filteredMine = useMemo(() => applyFilterAndSort(myEvents), [myEvents, query, filterKind, sortBy]);
  const filteredOpen = useMemo(() => applyFilterAndSort(unjoinedOpen), [unjoinedOpen, query, filterKind, sortBy]);

  function handleOpenPrivate(e: FormEvent) {
    e.preventDefault();
    const raw = privateInput.trim();
    if (!raw) return;
    const match = raw.match(/\/e\/([^/?#]+)/);
    const slug = (match ? match[1]! : raw.replace(/^\/+/, '')).trim();
    if (slug) navigate(`/e/${encodeURIComponent(slug)}`);
  }

  const featuredCountdown = featured ? formatCountdown(featured.submission_deadline) : null;

  return (
    <div className="space-y-10">
      {/* 1. Directory Header & Featured Flagship Arena */}
      <header className="space-y-6">
        <DossierPageHeader
          eyebrow={
            <>
              <span className="font-semibold tracking-widest text-accent uppercase">
                EVENTS // HACKATHONS &amp; COURSES
              </span>
              <span className="text-line">•</span>
              <span className="flex items-center gap-1.5 font-medium text-good">
                <LiveDot tone="good" />
                {openEvents.length} PUBLIC {openEvents.length === 1 ? 'ARENA' : 'ARENAS'} LIVE
              </span>
            </>
          }
          title="Events & Algorithmic Hackathons"
          subtitle="Commit-locked repository evaluations, weighted rubric audits, and 3-minute live oral defense trials."
          rightSlot={
            org ? (
              <>
                <Link
                  to="/org/events"
                  className="btn-tactile font-mono-code inline-flex h-10 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-3.5 text-[12px] font-semibold text-ink hover:border-muted hover:bg-paper"
                >
                  <span>Organizer Console</span>
                </Link>
                <Link
                  to="/org/events/new"
                  className="btn-tactile inline-flex h-10 items-center gap-2 rounded-[4px] border border-ink bg-ink px-4 text-[13px] font-medium text-on-accent hover:border-accent hover:bg-accent"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  <span>Create Event (Organizer)</span>
                </Link>
              </>
            ) : (
              <Link
                to="/interview/new"
                className="btn-tactile inline-flex h-10 items-center gap-2 rounded-[4px] border border-ink bg-ink px-4 text-[13px] font-medium text-on-accent hover:border-accent hover:bg-accent"
              >
                <span className="material-symbols-outlined text-[16px]">mic</span>
                <span>Take Independent Interview</span>
              </Link>
            )
          }
        />

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          <div className="relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-[6px] border border-line bg-ink lg:col-span-7">
            <div className="absolute inset-0 z-0">
              <img
                src={GLOBE_BANNER}
                alt="Global developer hackathon live evaluation hub"
                className="h-full w-full object-cover opacity-85"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-transparent" />
            </div>

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 p-5">
              <span className="font-mono-code inline-flex items-center gap-2 rounded-[3px] border border-white/20 bg-ink/90 px-2.5 py-1 text-[11px] font-medium tracking-wide text-paper">
                <LiveDot tone="good" />
                COMMIT-LOCKED EVALUATION // GEMINI RUBRIC ENGINE
              </span>
              <span className="font-mono-code rounded-[3px] border border-white/15 bg-black/70 px-2 py-0.5 text-[11px] text-white/90">
                {featured ? `SLUG: /e/${featured.slug}` : 'SELECTIVE REPO INGESTION'}
              </span>
            </div>

            <div className="relative z-10 mt-auto space-y-2 p-6">
              <span className="font-mono-code text-[11px] font-semibold tracking-wider text-accent-soft uppercase">
                {featured ? 'FEATURED FLAGSHIP ARENA' : 'EVALUATION ARENA ARCHITECTURE'}
              </span>
              <h2 className="font-serif-heading text-[26px] leading-tight font-medium text-white sm:text-[30px]">
                {featured ? featured.name : 'Automated Repository Judging & Oral Defense'}
              </h2>
              <p className="max-w-xl text-[13px] leading-[20px] text-white/80">
                {featured?.description ||
                  'Join an open hackathon arena below or enter a private event slug to submit your GitHub repository before the deadline.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-5 rounded-[6px] border border-line bg-surface p-6 lg:col-span-5">
            {featured ? (
              <>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <Badge tone={statusTone(featured.status)} dot>
                      {STATUS_LABEL[featured.status]}
                    </Badge>
                    {featuredCountdown && (
                      <span
                        className={`font-mono-code flex items-center gap-1 text-[12px] font-semibold ${
                          featuredCountdown.urgent ? 'text-bad' : 'text-accent'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">schedule</span>
                        <span>{featuredCountdown.label}</span>
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="font-mono-code text-[11px] tracking-wider text-muted uppercase">
                      Host Organization
                    </div>
                    <div className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                      <span className="material-symbols-outlined text-[17px] text-accent">corporate_fare</span>
                      <span>{featured.organization?.name || 'SkillProof Organization'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <MetricTile
                      label="VISIBILITY"
                      value={VISIBILITY_LABEL[featured.visibility]}
                      sub={
                        <span className="text-good">
                          {joinedIds.has(featured.id) ? 'Registered Participant' : 'Open to Join'}
                        </span>
                      }
                    />
                    <MetricTile
                      label="ORAL DEFENSE"
                      value={featured.interviews_enabled ? '3-Min Voice Exam' : 'Code Rubric Only'}
                      sub={
                        Array.isArray(featured.rubric_json)
                          ? `${featured.rubric_json.length} Rubric Criteria`
                          : 'Weighted Rubric'
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t border-line pt-3">
                  <Link to={`/e/${featured.slug}`} className={`${linkButton} h-10 w-full`}>
                    <span>Enter Event Workspace</span>
                    <span className="arrow-nudge font-mono-code text-[12px]">→</span>
                  </Link>
                  <div className="font-mono-code flex items-center justify-between px-1 text-[11px] text-muted">
                    <span>DEADLINE: {formatDate(featured.submission_deadline)}</span>
                    <span>{featured.kind.toUpperCase()}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <Badge tone="accent" dot>
                    NOTHING OPEN RIGHT NOW
                  </Badge>
                  <h3 className="font-serif-heading text-[22px] font-medium text-ink">
                    No active public events right now
                  </h3>
                  <p className="text-[13px] leading-[21px] text-muted">
                    If you have a private event slug or link from your organizer, enter it in the Private Access bar
                    below, or take a 3-minute voice interview on any public GitHub repository you authored.
                  </p>
                </div>
                <Link to="/interview/new" className={`${linkButton} h-10 w-full`}>
                  <span>Prove My Skills on Any Repository</span>
                  <span className="arrow-nudge font-mono-code text-[12px]">→</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. Search, Filter, Sort & Private Event Lookup Bar */}
      <section className="rounded-[6px] border border-line bg-surface p-5">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div className="flex flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[220px] flex-1">
              <span className="material-symbols-outlined pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-muted">
                search
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hackathons, organizations, slugs..."
                className="h-10 w-full rounded-[4px] border border-line-strong bg-paper pr-3 pl-9 text-[13px] text-ink placeholder:text-muted transition-colors focus:border-accent focus:bg-surface focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as typeof filterKind)}
                aria-label="Filter events"
                className="h-10 cursor-pointer rounded-[4px] border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent focus:outline-none"
              >
                <option value="all">All Event Types</option>
                <option value="interviews">3-Min Voice Defense Enabled</option>
                <option value="public">Public Arenas</option>
                <option value="code">Access-Code Protected</option>
                <option value="invite">Invite-Only Cohorts</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label="Sort events"
                className="h-10 cursor-pointer rounded-[4px] border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent focus:outline-none"
              >
                <option value="deadline">Sort: Ending Soon</option>
                <option value="recent">Sort: Recently Started</option>
                <option value="name">Sort: Name (A–Z)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 border-t border-line pt-4 sm:flex-row sm:items-center xl:border-t-0 xl:border-l xl:pt-0 xl:pl-5">
            <div className="mr-1 flex shrink-0 items-center gap-1.5 text-muted">
              <span className="material-symbols-outlined text-[18px] text-accent">vpn_key</span>
              <span className="font-mono-code text-[11px] font-semibold tracking-wide uppercase">Private Event</span>
            </div>
            <form onSubmit={handleOpenPrivate} className="flex items-center gap-2">
              <input
                type="text"
                value={privateInput}
                onChange={(e) => setPrivateInput(e.target.value)}
                placeholder="event-slug or URL"
                className="font-mono-code h-9 w-full rounded-[4px] border border-line-strong bg-paper px-3 text-[12px] text-ink placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none sm:w-40"
              />
              <button
                type="submit"
                className="btn-tactile h-9 cursor-pointer rounded-[4px] border border-ink bg-ink px-3.5 text-[12px] font-medium whitespace-nowrap text-on-accent hover:border-accent hover:bg-accent"
              >
                Open →
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* 3. My Active & Past Events */}
      <section className="space-y-4">
        <SectionHeader
          title="My Active & Past Events"
          rightSlot={
            <Badge>{String(filteredMine.length).padStart(2, '0')} REGISTERED WORKSPACES</Badge>
          }
        />

        <PageState loading={mine.loading} error={mine.error} kind="list" />

        {!mine.loading && !mine.error && filteredMine.length === 0 && (
          <div className="rounded-[6px] border border-line bg-surface p-6 text-[13px] text-muted">
            {myEvents.length === 0
              ? 'You have not joined an event yet. Select an open arena below or open a private event link above.'
              : 'No joined events match your current search filter.'}
          </div>
        )}

        {!mine.loading && !mine.error && filteredMine.length > 0 && (
          <div className="space-y-3.5">
            {filteredMine.map((e) => {
              const countdown = formatCountdown(e.submission_deadline);
              const tone = statusTone(e.status);
              return (
                <article
                  key={e.id}
                  className="card-interactive group rounded-[6px] border border-line bg-surface p-5"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={tone} dot>
                          {STATUS_LABEL[e.status]}
                        </Badge>
                        <Badge>REGISTERED PARTICIPANT</Badge>
                        {e.interviews_enabled && <Badge tone="accent">3-MIN VOICE DEFENSE</Badge>}
                        <span className="font-mono-code ml-1 flex items-center gap-1 text-[11px] text-muted">
                          <span className="material-symbols-outlined text-[14px]">
                            {e.status === 'open' ? 'timer' : 'lock'}
                          </span>
                          <span className="font-semibold text-ink">
                            {e.status === 'open' ? countdown.label : `DEADLINE ${formatDate(e.submission_deadline)}`}
                          </span>
                        </span>
                      </div>

                      <div>
                        <h3 className="font-serif-heading text-[20px] font-medium tracking-tight text-ink group-hover:text-accent">
                          <Link to={`/e/${e.slug}`}>{e.name}</Link>
                        </h3>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                          <span>Organized by {e.organization?.name || 'SkillProof Organization'}</span>
                          <span>•</span>
                          <span className="font-mono-code text-[11px] text-accent">
                            Visibility: {VISIBILITY_LABEL[e.visibility]}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line pt-3 lg:justify-end lg:border-t-0 lg:pt-0">
                      <div className="mr-2 hidden text-right md:block">
                        <div className="font-mono-code text-[10px] text-muted uppercase">SUBMISSION CUTOFF</div>
                        <div className="font-mono-code text-[12px] font-semibold text-ink">
                          {formatDate(e.submission_deadline)}
                        </div>
                      </div>

                      <Link
                        to={`/e/${e.slug}`}
                        className={`btn-tactile inline-flex h-9 items-center gap-1.5 rounded-[4px] border px-4 text-[13px] font-medium whitespace-nowrap ${
                          e.status === 'published'
                            ? 'border-accent bg-surface text-accent-ink hover:bg-accent-soft'
                            : e.status === 'open'
                              ? 'border-ink bg-ink text-on-accent hover:border-accent hover:bg-accent'
                              : 'border-line bg-surface text-ink hover:border-ink hover:bg-paper'
                        }`}
                      >
                        <span>
                          {e.status === 'published'
                            ? 'View Published Standings'
                            : e.status === 'open'
                              ? 'Enter Event Workspace'
                              : 'View Audit Status'}
                        </span>
                        <span className="arrow-nudge font-mono-code text-[12px]">→</span>
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Open Hackathons & Benchmark Arenas */}
      <section className="space-y-4">
        <SectionHeader
          title="Open Hackathons & Benchmark Arenas"
          rightSlot={<Badge>{String(filteredOpen.length).padStart(2, '0')} PUBLIC ARENAS AVAILABLE</Badge>}
        />

        <PageState loading={open.loading} error={open.error} kind="cards" />

        {!open.loading && !open.error && filteredOpen.length === 0 && (
          <div className="rounded-[6px] border border-line bg-surface p-6 text-[13px] text-muted">
            No other public events are open right now. Have a private event link? Paste its slug in the Private Event
            bar above, or{' '}
            <Link to="/interview/new" className="font-semibold text-accent hover:underline">
              take a 3-minute voice interview on any repository you wrote
            </Link>
            .
          </div>
        )}

        {!open.loading && !open.error && filteredOpen.length > 0 && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {filteredOpen.map((e, idx) => {
              const countdown = formatCountdown(e.submission_deadline);
              const isFirst = idx === 0;
              return (
                <div
                  key={e.id}
                  className="card-interactive group flex flex-col justify-between overflow-hidden rounded-[6px] border border-line bg-surface"
                >
                  {isFirst && (
                    <div className="relative h-40 w-full overflow-hidden border-b border-line bg-ink">
                      <img src={ARENA_THUMB} alt={e.name} className="h-full w-full object-cover" />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <Badge tone="good" dot>
                          {STATUS_LABEL[e.status]}
                        </Badge>
                        <span className="font-mono-code rounded-[3px] bg-black/70 px-2 py-0.5 text-[10px] text-white">
                          FEATURED ARENA
                        </span>
                      </div>
                      <div className="font-mono-code absolute right-2 bottom-2 rounded-[3px] bg-black/80 px-2 py-0.5 text-[10px] text-white">
                        {countdown.label}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-1 flex-col justify-between space-y-4 p-5">
                    <div className="space-y-3">
                      {!isFirst && (
                        <div className="flex items-center justify-between">
                          <Badge tone="good" dot>
                            {STATUS_LABEL[e.status]}
                          </Badge>
                          <span
                            className={`font-mono-code text-[11px] font-semibold ${
                              countdown.urgent ? 'text-bad' : 'text-muted'
                            }`}
                          >
                            {countdown.label}
                          </span>
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="font-mono-code text-[11px] font-semibold tracking-wider text-accent uppercase">
                          {e.organization?.name || e.kind}
                        </div>
                        <h3 className="font-serif-heading text-[19px] leading-snug font-medium text-ink group-hover:text-accent">
                          <Link to={`/e/${e.slug}`}>{e.name}</Link>
                        </h3>
                        {e.description && (
                          <p className="line-clamp-2 text-[13px] leading-[19px] text-muted">{e.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2.5 border-t border-line pt-3">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-mono-code text-[11px] text-muted">ORAL DEFENSE</span>
                        <span className="font-mono-code text-[11px] font-semibold text-ink">
                          {e.interviews_enabled ? '3-Min Voice Required' : 'Optional / Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-mono-code text-[11px] text-muted">DEADLINE</span>
                        <span className="font-mono-code text-[11px] font-semibold text-ink">
                          {formatDate(e.submission_deadline)}
                        </span>
                      </div>

                      <Link
                        to={`/e/${e.slug}`}
                        className="btn-tactile mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[4px] border border-ink bg-ink text-[13px] font-medium text-on-accent hover:border-accent hover:bg-accent"
                      >
                        <span>Enter Event Workspace</span>
                        <span className="arrow-nudge font-mono-code text-[12px]">→</span>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Dark Telemetry Banner */}
      <DarkBanner>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="space-y-1.5">
            <div className="font-mono-code text-[11px] font-semibold tracking-widest text-accent uppercase">
              YOUR EVENTS IN NUMBERS
            </div>
            <h3 className="font-serif-heading text-[22px] font-medium text-white">
              No active event? Prove your skills on any repository you wrote.
            </h3>
            <p className="max-w-xl text-[13px] text-dark-muted">
              Start an independent 3-minute Gemini Live voice interview on any public GitHub repository to generate a
              verified ownership dossier for recruiters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 lg:pt-0">
            <div className="border-l border-white/15 pl-4">
              <div className="font-mono-code text-[10px] tracking-wider text-dark-muted uppercase">
                My Joined Events
              </div>
              <div className="font-mono-code text-[20px] font-bold text-white">{myEvents.length}</div>
              <div className="font-mono-code text-[11px] text-good-on-dark">Active Workspaces</div>
            </div>

            <div className="border-l border-white/15 pl-4">
              <div className="font-mono-code text-[10px] tracking-wider text-dark-muted uppercase">
                Public Open Arenas
              </div>
              <div className="font-mono-code text-[20px] font-bold text-white">{openEvents.length}</div>
              <div className="font-mono-code text-[11px] text-accent">Commit-Locked</div>
            </div>

            <Link to="/interview/new" className={`${linkButton} px-5 py-2.5`}>
              <span className="material-symbols-outlined text-[16px]">mic</span>
              <span>Start Repository Interview</span>
              <span className="arrow-nudge font-mono-code text-[12px]">→</span>
            </Link>
          </div>
        </div>
      </DarkBanner>
    </div>
  );
}
