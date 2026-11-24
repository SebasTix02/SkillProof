import { tr } from '../i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  CodeEvidenceViewer,
  DarkBanner,
  EditorialQuoteBlock,
  LiveDot,
  ScoreBar,
  SectionHeader,
  linkButton,
  linkButtonSecondary,
} from '../components/shared';
import { useAuth } from '../lib/auth';

const HERO_IMAGE = '/images/landing-hero.webp';

const COCKPIT_IMAGE = '/images/landing-cockpit.webp';

interface DossierSpecimen {
  hash: string;
  score: number;
  title: string;
  context: string;
  depth: string;
  proof: string;
  duration: string;
  quote: string;
  citedLine: string;
}

/** Example reports (a function so the texts follow the language). */
const dossiers = (): DossierSpecimen[] => [
  {
    hash: '@a4f91c2',
    score: 96,
    title: tr('Zero-Knowledge Rollup Verifier'),
    context: tr('Example • Applied cryptography course'),
    depth: '34 files read',
    proof: tr('PROOF: PLONK Circuit in Rust'),
    duration: '03:00 voice interview',
    citedLine: 'src/prover/kzg_commitment.rs:88-104',
    quote:
      tr('We batched openings across all wire polynomials before computing the pairing check so verification stays constant-size.'),
  },
  {
    hash: '@9b7201e',
    score: 92,
    title: tr('SIMD Vector Tensor Runtime'),
    context: tr('Example • Systems hackathon track'),
    depth: '28 files read',
    proof: tr('PROOF: C++ AVX-512 Intrinsics'),
    duration: '02:48 voice interview',
    citedLine: 'kernels/matmul_avx512.cc:142-169',
    quote:
      tr('We tiled the accumulator registers in 6x16 micro-panels to hide FMA latency without spilling to L1 cache.'),
  },
  {
    hash: '@cc41298',
    score: 89,
    title: tr('Distributed LSM B-Tree Engine'),
    context: tr('Example • Infrastructure hackathon track'),
    depth: '41 files read',
    proof: tr('PROOF: Go Compaction & WAL Recovery'),
    duration: '03:00 voice interview',
    citedLine: 'storage/wal/recovery.go:54-79',
    quote:
      tr('During replay we truncate any torn CRC frame at the tail of the segment before promoting the memtable.'),
  },
];

export function Landing() {
  const { session, org } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeDossier, setActiveDossier] = useState<number | null>(null);

  const primaryHref = session ? (org ? '/org/events' : '/events') : '/signup?as=organizer';
  const primaryLabel = session ? (org ? tr('Open Organizer Console') : tr('Explore Events')) : tr('Run a Hackathon / Audit');
  const secondaryHref = session ? '/interview/new' : '/signup';
  const secondaryLabel = session ? tr('Start 3-Min Voice Interview') : tr('Prove My Skills (Candidate)');

  return (
    <div className="space-y-16 pb-6">
      {/* 1. Hero Section */}
      <section className="pt-2">
        <div className="mb-6 flex flex-wrap items-center gap-2.5">
          <Badge tone="accent" dot>
            {tr('REAL-TIME REPO & ORAL DEFENSE PIPELINE')}
          </Badge>
          <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-surface px-2.5 py-0.5 text-[11px] text-muted">
            <span className="material-symbols-outlined text-[14px] text-good">verified_user</span>
            {tr('POWERED BY GOOGLE GEMINI')}
          </span>
          <span className="font-mono-code ml-auto hidden text-[11px] text-muted md:inline-block">
            {tr('COMMIT LOCK:')}{' '}<span className="font-semibold text-ink">{tr('FROZEN AT THE DEADLINE')}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="space-y-6 lg:col-span-6">
            <h1 className="font-serif-heading text-[36px] leading-[1.08] font-normal tracking-tight text-ink sm:text-[46px] lg:text-[52px]">
              {tr('Anyone can generate code.')}{' '}<br className="hidden sm:inline" />
              <span className="text-accent italic underline decoration-accent/35 decoration-1 underline-offset-8">
                SkillProof
              </span>{' '}
              {tr('proves who understands it.')}
            </h1>

            <p className="max-w-[560px] text-[15px] leading-[24px] text-muted sm:text-[16px] sm:leading-[26px]">
              {tr('Hackathon judging that freezes every GitHub repository at the deadline, reads the actual codebase against your rubric, and cites exact files. Coupled with a 3-minute live voice interview on the author\'s own code that copy-pasted prompts cannot pass.')}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link to={primaryHref} className={`${linkButton} px-5 py-2.5 text-[14px]`}>
                <span>{primaryLabel}</span>
                <span className="arrow-nudge font-mono-code text-[13px]">→</span>
              </Link>
              <Link to={secondaryHref} className={`${linkButtonSecondary} px-5 py-2.5 text-[14px]`}>
                <span className="material-symbols-outlined text-[17px] text-accent">mic</span>
                <span>{secondaryLabel}</span>
              </Link>
              <a
                href="#specimen"
                className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-transparent px-3 py-2.5 text-[12px] font-medium text-muted hover:border-line hover:bg-surface hover:text-ink"
              >
                <span>{tr('Inspect Dossier Specimen')}</span>
                <span className="arrow-nudge">↓</span>
              </a>
            </div>

            <div className="font-mono-code grid grid-cols-3 gap-3 border-t border-line pt-4 text-[11px]">
              <div>
                <div className="text-muted uppercase">{tr('ORAL DEFENSE')}</div>
                <div className="mt-0.5 text-[13px] font-semibold text-ink">{tr('3:00 Gemini Live')}</div>
              </div>
              <div>
                <div className="text-muted uppercase">{tr('REPO INSPECTION')}</div>
                <div className="mt-0.5 text-[13px] font-semibold text-good">{tr('Selective Git Tree')}</div>
              </div>
              <div>
                <div className="text-muted uppercase">{tr('AUDIT EVIDENCE')}</div>
                <div className="mt-0.5 text-[13px] font-semibold text-accent">{tr('Commit-Locked SHA')}</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="card-interactive overflow-hidden rounded-[6px] border border-line bg-surface p-2">
              <div className="flex h-8 items-center justify-between rounded-t-[4px] border border-line bg-paper px-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-line" />
                  <span className="h-2 w-2 rounded-full bg-line" />
                  <span className="h-2 w-2 rounded-full bg-line" />
                  <span className="font-mono-code ml-2 text-[11px] text-muted">
                    SKILLPROOF_EXAMINER // REPO_ANALYZER.TS
                  </span>
                </div>
                <Badge tone="good" dot>
                  {tr('REPOSITORY MAP')}
                </Badge>
              </div>

              <div className="relative mt-1.5 overflow-hidden rounded-b-[4px] border border-line bg-paper">
                <img
                  src={HERO_IMAGE}
                  alt={tr('SkillProof AI code evaluation and voice defense interface')}
                  className="block h-auto w-full object-cover"
                />

                <div className="hidden border border-line bg-surface p-2.5 sm:absolute sm:top-3 sm:left-3 sm:flex sm:items-center sm:gap-2.5 sm:rounded-[4px]">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-accent/25 bg-accent-soft text-accent-ink">
                    <span className="material-symbols-outlined text-[16px]">account_tree</span>
                  </div>
                  <div>
                    <div className="font-mono-code text-[10px] text-muted uppercase">{tr('SELECTIVE READER')}</div>
                    <div className="text-[12px] font-semibold text-ink">{tr('Git Tree & Blob SHA Cache')}</div>
                  </div>
                </div>

                <div className="hidden border border-line bg-surface p-2.5 sm:absolute sm:right-3 sm:bottom-3 sm:flex sm:items-center sm:gap-3 sm:rounded-[4px]">
                  <LiveDot tone="good" />
                  <div>
                    <div className="font-mono-code text-[10px] text-muted uppercase">{tr('VOICE VERIFICATION')}</div>
                    <div className="font-mono-code text-[11px] font-semibold text-ink">{tr('180s Live • Evidence Linked')}</div>
                  </div>
                  <Badge tone="good">94 / 100</Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-line pt-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 text-[12px] text-muted">
            <span className="font-mono-code rounded-[3px] border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink uppercase">
              {tr('PROTOCOL SCOPE')}
            </span>
            <span>{tr('Built for high-density hackathons, engineering cohorts, and verifiable technical portfolios:')}</span>
          </div>
          <div className="font-mono-code flex flex-wrap items-center gap-4 text-[11px] font-medium tracking-wider text-muted uppercase">
            <span>{tr('COMMIT FREEZE')}</span>
            <span className="text-line">•</span>
            <span>{tr('WEIGHTED RUBRICS')}</span>
            <span className="text-line">•</span>
            <span>{tr('3-MIN VOICE DEFENSE')}</span>
            <span className="text-line">•</span>
            <span>{tr('RECRUITER DOSSIERS')}</span>
          </div>
        </div>
      </section>

      {/* 2. Interactive Core Demo & 3 Pillars Section */}
      <section id="specimen" className="space-y-8 rounded-[6px] border border-line bg-surface p-6 lg:p-8">
        <SectionHeader
          eyebrow={tr('01 // EXAMPLE: CODE & VOICE EVIDENCE')}
          eyebrowTone="accent"
          title={tr('How SkillProof catches what static linters miss')}
          subtitle={tr('Every rubric score and interview skill is backed by concrete repository files and direct quotes from the candidate\'s 3-minute oral defense.')}
          rightSlot={
            <>
              <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2.5 py-1.5 text-[11px] text-muted">
                {tr('TARGET:')}{' '}<span className="font-semibold text-ink">src/distributed/raft_consensus.rs</span>
              </span>
              <button
                type="button"
                onClick={() => setIsPlaying((prev) => !prev)}
                className={`btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border px-3.5 py-1.5 text-[11px] font-semibold ${
                  isPlaying
                    ? 'border-good bg-good text-on-good'
                    : 'border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">{isPlaying ? 'pause' : 'play_arrow'}</span>
                <span>{isPlaying ? tr('Pause Citation [01:24]') : tr('Simulate Oral Defense (01:24)')}</span>
              </button>
            </>
          }
        />

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          <div className="flex flex-col justify-between space-y-4 lg:col-span-7">
            <CodeEvidenceViewer
              filePath="src/distributed/raft_consensus.rs"
              lineRangeLabel={tr('LINES 174-181 (CITED EVIDENCE)')}
              commentHeader="// Frozen Commit @a4f91c2 • Rust UTF-8"
              badge={<Badge tone="good">{tr('RUBRIC PASS: 88.5 / 100')}</Badge>}
              lines={[
                { lineNumber: 174, content: 'let (ack_tx, mut ack_rx) = mpsc::channel(peers.len());' },
                { lineNumber: 175, content: 'for peer in peers.iter() {' },
                { lineNumber: 176, content: '  tokio::spawn(async move {', highlighted: true, activeFlash: isPlaying },
                {
                  lineNumber: 177,
                  content: '    let res = peer.send_heartbeat(current_term).await;',
                  highlighted: true,
                  activeFlash: isPlaying,
                },
                {
                  lineNumber: 178,
                  content: '    let _ = ack_tx.send(res).await;',
                  highlighted: true,
                  activeFlash: isPlaying,
                },
                { lineNumber: 179, content: '  });' },
                { lineNumber: 180, content: '}' },
                { lineNumber: 181, content: 'self.tally_quorum(&mut ack_rx).await?;' },
              ]}
            />

            <div className="flex flex-col justify-between space-y-3 rounded-[6px] border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono-code flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-good uppercase">
                  <LiveDot tone="good" pulse={isPlaying} />
                  {tr('VERIFIED ORAL EVIDENCE (QUESTION 2 OF 4)')}
                </span>
                <span className="font-mono-code text-[11px] text-muted">{tr('TIMESTAMP: 01:24 / 03:00')}</span>
              </div>

              <EditorialQuoteBlock
                size="md"
                theme="accent"
                quote={tr('We spawned non-blocking Tokio tasks per follower inside the broadcast loop so a partitioned peer cannot stall quorum tallying before the election timer expires.')}
                attribution={tr('— Candidate Defense Transcript • Matched to lines 176–181')}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="good">{tr('SKILL: DISTRIBUTED CONCURRENCY · DEMONSTRATED')}</Badge>
                  <span className="font-mono-code text-[11px] text-muted">{tr('CONFIDENCE: HIGH')}</span>
                </div>
                <span className="font-mono-code text-[11px] text-muted">
                  {tr('TOKENS:')}{' '}<code className="text-ink">tokio::spawn</code> • <code className="text-ink">mpsc::channel</code>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-4 lg:col-span-5">
            <div className="flex flex-col space-y-3 rounded-[6px] border border-line bg-paper p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {tr('Audit Cockpit Visualizer')}
                </span>
                <span className="font-mono-code rounded-[3px] border border-line bg-surface px-2 py-0.5 text-[10px] font-bold text-accent">
                  {tr('COMMIT-LOCKED')}
                </span>
              </div>

              <div className="overflow-hidden rounded-[4px] border border-line bg-surface">
                <img
                  src={COCKPIT_IMAGE}
                  alt={tr('Technical editorial illustration of code analysis and voice spectrogram verification')}
                  className="block h-auto w-full object-cover"
                />
              </div>

              <p className="text-[12px] leading-[18px] text-muted">
                {tr('SkillProof maps repository structure, caches file summaries by Git blob SHA, and cross-examines the author on architecture, trade-offs, and failure modes.')}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { label: tr('RUBRIC SCORE'), value: '88.5%', num: 88.5, tone: 'text-ink', bar: 'ink' },
                  { label: 'OWNERSHIP', value: '94%', num: 94, tone: 'text-good', bar: 'good' },
                  { label: 'CITATIONS', value: '4 / 4', num: 100, tone: 'text-accent', bar: 'accent' },
                ] as const
              ).map((m) => (
                <div key={m.label} className="rounded-[6px] border border-line bg-surface p-3">
                  <div className="font-mono-code text-[10px] text-muted uppercase">{m.label}</div>
                  <div className={`font-serif-heading mt-0.5 text-[22px] leading-tight font-semibold ${m.tone}`}>
                    {m.value}
                  </div>
                  <div className="mt-2">
                    <ScoreBar value={m.num} max={100} tone={m.bar} heightClass="h-1" trackClass="bg-well" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3 Pillars Feature Cards Grid */}
        <div className="grid grid-cols-1 gap-4 border-t border-line pt-6 md:grid-cols-3">
          {[
            {
              num: '01',
              icon: 'account_tree',
              tone: 'accent' as const,
              title: tr('Selective Repository Analysis'),
              desc: tr('Inspects the Git tree, plans high-signal file reading, extracts code hooks, and caches summaries by blob SHA to evaluate real architecture rather than README fluff.'),
              foot: tr('CACHED BY COMMIT & BLOB SHA →'),
            },
            {
              num: '02',
              icon: 'graphic_eq',
              tone: 'good' as const,
              title: tr('3-Minute Live Voice Defense'),
              desc: tr('Generates targeted questions tied to actual code snippets in the author\'s repository. The answer key stays strictly on the server while Gemini Live conducts the oral exam.'),
              foot: tr('ONE-TIME EPHEMERAL LIVE TOKEN →'),
            },
            {
              num: '03',
              icon: 'fact_check',
              tone: 'neutral' as const,
              title: tr('Auditable Dossiers & Overrides'),
              desc: tr('Organizers inspect AI justifications, cited files, similarity warnings, and manual score overrides with an audit log before publishing final standings.'),
              foot: tr('HUMAN-IN-THE-LOOP ADJUDICATION →'),
            },
          ].map((p) => (
            <div key={p.num} className="card-interactive space-y-2.5 rounded-[6px] border border-line bg-paper/60 p-5">
              <div className="flex items-center justify-between">
                <Badge tone={p.tone}>{p.num}</Badge>
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    p.tone === 'accent' ? 'text-accent' : p.tone === 'good' ? 'text-good' : 'text-ink'
                  }`}
                >
                  {p.icon}
                </span>
              </div>
              <h3 className="font-serif-heading text-[18px] font-medium text-ink">{p.title}</h3>
              <p className="text-[13px] leading-[20px] text-muted">{p.desc}</p>
              <div
                className={`font-mono-code pt-1 text-[11px] font-semibold ${
                  p.tone === 'accent' ? 'text-accent' : p.tone === 'good' ? 'text-good' : 'text-ink'
                }`}
              >
                {p.foot}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Dual Workflow Comparison */}
      <section id="organizers" className="space-y-6">
        <SectionHeader
          eyebrow={tr('02 // TAILORED OPERATIONAL WORKFLOWS')}
          title={tr('Built for high-stakes adjudication and career proof')}
          rightSlot={
            <span className="font-mono-code text-[11px] text-muted uppercase">
              {tr('DUAL ROLE ARCHITECTURE: ORGANIZER & CANDIDATE')}
            </span>
          }
        />

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          <div className="card-interactive flex flex-col justify-between space-y-6 rounded-[6px] border border-line bg-surface p-6 lg:p-8">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <Badge tone="accent">{tr('ORGANIZER SUITE')}</Badge>
                <span className="font-mono-code text-[11px] text-muted">{tr('HACKATHONS & COHORTS')}</span>
              </div>

              <div>
                <h3 className="font-serif-heading text-[24px] leading-[30px] font-medium text-ink">
                  {tr('For Hackathons & Universities')}
                </h3>
                <p className="mt-1 text-[14px] text-muted">
                  {tr('Evaluate every team against a weighted rubric with file-level evidence and human override controls.')}
                </p>
              </div>

              <ol className="space-y-3.5 pt-1">
                {[
                  {
                    step: '01',
                    title: tr('Define Rubric & Visibility'),
                    desc: tr('Configure weighted criteria, deadlines, and open, access-code, or invite-only participation.'),
                  },
                  {
                    step: '02',
                    title: tr('Collect Repository Submissions'),
                    desc: tr('Teams submit their public GitHub repository, demo video, and slides before the cutoff.'),
                  },
                  {
                    step: '03',
                    title: tr('Freeze Commits & Score at Scale'),
                    desc: tr('Closing the event locks each repo at its latest commit SHA and runs concurrent rubric evaluations.'),
                  },
                  {
                    step: '04',
                    title: tr('Audit, Override & Publish'),
                    desc: tr('Review cited files, inspect shared-repo/fork flags, override any criterion with a reason, and publish.'),
                  },
                ].map((item) => (
                  <li key={item.step} className="flex items-start gap-3">
                    <span className="font-mono-code mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-accent/30 bg-accent-soft text-[11px] font-bold text-accent-ink">
                      {item.step}
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-ink">{item.title}</div>
                      <div className="text-[12px] leading-[18px] text-muted">{item.desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-4">
              <span className="font-mono-code text-[11px] text-muted">{tr('CONCURRENT QUEUE + AUTO-RETRY')}</span>
              <Link to={session && org ? '/org/events/new' : '/signup?as=organizer'} className={linkButton}>
                <span>{session && org ? tr('Create Event') : tr('Run a Hackathon')}</span>
                <span className="arrow-nudge font-mono-code text-[11px]">→</span>
              </Link>
            </div>
          </div>

          <div className="card-interactive flex flex-col justify-between space-y-6 rounded-[6px] border border-line bg-surface p-6 lg:p-8">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <Badge tone="good">{tr('CANDIDATE CREDENTIALING')}</Badge>
                <span className="font-mono-code text-[11px] text-muted">{tr('STUDENTS & ENGINEERS')}</span>
              </div>

              <div>
                <h3 className="font-serif-heading text-[24px] leading-[30px] font-medium text-ink">
                  {tr('For Students & Engineers')}
                </h3>
                <p className="mt-1 text-[14px] text-muted">
                  {tr('Turn your GitHub repositories into verifiable ownership dossiers backed by live oral defense quotes.')}
                </p>
              </div>

              <ol className="space-y-3.5 pt-1">
                {[
                  {
                    step: '01',
                    title: tr('Paste Your GitHub Repository'),
                    desc: tr('Use any public repository you authored or start directly from a judged hackathon submission.'),
                  },
                  {
                    step: '02',
                    title: tr('Defend Your Code for 3 Minutes'),
                    desc: tr('Answer adaptive voice questions anchored to specific functions and architectural decisions in your code.'),
                  },
                  {
                    step: '03',
                    title: tr('Earn an Ownership & Skill Report'),
                    desc: tr('Receive an ownership score (0–100), confidence rating, and demonstrated skills backed by verbatim quotes.'),
                  },
                  {
                    step: '04',
                    title: tr('Share Your Public Recruiter Dossier'),
                    desc: tr('Publish your `/p/:slug` profile so recruiters and hiring managers can inspect your verified evidence.'),
                  },
                ].map((item) => (
                  <li key={item.step} className="flex items-start gap-3">
                    <span className="font-mono-code mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-good/30 bg-good-soft text-[11px] font-bold text-good-ink">
                      {item.step}
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-ink">{item.title}</div>
                      <div className="text-[12px] leading-[18px] text-muted">{item.desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-4">
              <span className="font-mono-code text-[11px] text-muted">{tr('SHAREABLE /P/:SLUG DOSSIER')}</span>
              <Link to={session ? '/interview/new' : '/signup'} className={linkButtonSecondary}>
                <span>{session ? tr('Start Voice Interview') : tr('Prove My Skills')}</span>
                <span className="arrow-nudge font-mono-code text-[11px]">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Public Verification Stream / Specimen Registry */}
      <section id="registry" className="space-y-5">
        <SectionHeader
          eyebrow={tr('03 // EXAMPLE REPORTS')}
          eyebrowTone="accent"
          title={tr('What a report looks like (examples)')}
          rightSlot={
            <div className="font-mono-code flex items-center gap-2 text-[11px] text-muted">
              <LiveDot tone="good" />
              <span>{tr('ILLUSTRATIVE, NOT REAL CANDIDATES')}</span>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {dossiers().map((d, idx) => {
            const expanded = activeDossier === idx;
            return (
              <div
                key={d.hash}
                className="card-interactive flex flex-col justify-between space-y-4 rounded-[6px] border border-line bg-surface p-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge>{d.hash}</Badge>
                    <Badge tone="good">{tr('OWNERSHIP:')}{' '}{d.score} / 100</Badge>
                  </div>

                  <div>
                    <h3 className="font-serif-heading text-[19px] leading-[25px] font-medium text-ink">{d.title}</h3>
                    <p className="text-[12px] text-muted">{d.context}</p>
                  </div>

                  <div className="font-mono-code space-y-1 rounded-[4px] border border-line bg-paper p-2.5 text-[11px] text-muted">
                    <div>{d.depth}</div>
                    <div className="font-medium text-ink">{d.proof}</div>
                    <div className="text-accent">{d.citedLine}</div>
                  </div>

                  {expanded && <EditorialQuoteBlock quote={d.quote} theme="accent" />}
                </div>

                <div className="flex items-center justify-between border-t border-line pt-3">
                  <div className="font-mono-code flex items-center gap-1.5 text-[11px] text-ink">
                    <span className="material-symbols-outlined text-[15px] text-accent">graphic_eq</span>
                    <span>{d.duration}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDossier(expanded ? null : idx)}
                    className="btn-tactile font-mono-code cursor-pointer rounded-[3px] border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent hover:text-accent"
                  >
                    {expanded ? tr('Hide Quote') : tr('Inspect Quote')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. High-Impact Dark Architectural Call to Action */}
      <DarkBanner id="demo" className="p-8 sm:p-12 lg:p-14">
        <div className="mx-auto max-w-[740px] space-y-5 text-center">
          <div className="font-mono-code inline-flex items-center gap-2 rounded-[3px] border border-dark-hairline bg-dark-surface px-3 py-1 text-[11px] font-semibold tracking-wider text-accent-on-dark uppercase">
            <LiveDot tone="accent" pulse={false} />
            {tr('THE STANDARD FOR AUTHENTIC CODE CREDENTIALING')}
          </div>

          <h2 className="font-serif-heading text-[32px] leading-[1.12] font-normal tracking-tight text-white sm:text-[42px] lg:text-[48px]">
            {tr('Make genuine engineering understanding undeniable.')}
          </h2>

          <p className="mx-auto max-w-[600px] text-[15px] leading-[24px] text-dark-muted sm:text-[16px]">
            {tr('Launch an AI-audited hackathon with commit-locked rubric scoring, or take a 3-minute live voice interview on your own GitHub repository in minutes.')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to={primaryHref} className={`${linkButton} px-6 py-3 text-[14px]`}>
              <span>{primaryLabel}</span>
              <span className="arrow-nudge font-mono-code text-[13px]">→</span>
            </Link>
            <Link
              to={secondaryHref}
              className="btn-tactile inline-flex items-center justify-center gap-2 rounded-[4px] border border-dark-hairline bg-dark-surface px-6 py-3 text-[14px] font-medium text-dark-ink hover:border-dark-muted hover:bg-dark-hairline"
            >
              <span>{secondaryLabel}</span>
            </Link>
          </div>

          <div className="font-mono-code flex flex-wrap items-center justify-center gap-5 border-t border-dark-hairline pt-6 text-[11px] text-dark-muted">
            <span>{tr('PUBLIC GITHUB REPOSITORIES')}</span>
            <span>•</span>
            <span>{tr('COMMIT-LOCKED RUBRIC SCORING')}</span>
            <span>•</span>
            <span>{tr('3-MINUTE GEMINI LIVE INTERVIEWS')}</span>
          </div>
        </div>
      </DarkBanner>

      <footer className="font-mono-code flex flex-col items-center justify-between gap-4 border-t border-line pt-6 text-[11px] text-muted sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-serif-heading text-[16px] font-semibold text-ink">SkillProof</span>
          <span>{tr('— Technical Audit Dossier & Voice Verification Environment')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Link to="/events" className="transition-colors hover:text-accent">
            {tr('Events Directory')}
          </Link>
          <Link to="/interview/new" className="transition-colors hover:text-accent">
            {tr('Voice Interviews')}
          </Link>
          <Link to="/login" className="transition-colors hover:text-accent">
            {tr('Authentication Portal')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
