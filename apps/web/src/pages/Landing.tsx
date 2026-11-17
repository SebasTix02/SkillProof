import { useState } from 'react';
import { Link } from 'react-router-dom';
import { linkButton, linkButtonSecondary } from '../components/ui';
import { useAuth } from '../lib/auth';

const HERO_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB4U8SNgCJnrunqXunwpUU2HbAa9S73rvUby5ZKUjdXijbjv81xo3rpsenWd1C_R3yCK2wLY3zPJiav8-76Y0lqA9TfZQjLxaMWU0LOuh9saQBwIJwRfz3IzdOzeUPm28uYlcUqC4KOfWhyMBBB-AVDKLVPJDT0xfRItjtKKiwsZgHQVXdel83ir0qMjmv06rkGsqP8r-X82HwZuQBtt_9O346bVqcoASNeltfULhE';

const COCKPIT_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAplfeNc-7XLyqy-WiJBKm5ihAJ3iVV4lO2PRFwyAqwQjp7JoJ45gtEVIrPeCe1jKxmJhuWoOcGcM4UUgJ-JLF26VIZOw5hOlSObHBcpOyTT9Ryp-6jtwxsKre_KUk_k5ST10nPYwjzzqu3I1QMNeonv3dN6tgLUiqrfxF1iBthTg0fZ2i6YFvGPNtK7_Jmq9i4nXWjyfcisnw6oZATFySwmc-IaZDFVEoC_RwHDlg';

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

const DOSSIERS: DossierSpecimen[] = [
  {
    hash: '@a4f91c2',
    score: 96,
    title: 'Zero-Knowledge Rollup Verifier',
    context: 'Stanford University • CS 251 Applied Crypto',
    depth: 'AST Depth: Selective Plan (34 files)',
    proof: 'PROOF: PLONK Circuit in Rust',
    duration: '03:00 Audio Sealed',
    citedLine: 'src/prover/kzg_commitment.rs:88-104',
    quote:
      'We batched openings across all wire polynomials before computing the pairing check so verification stays constant-size.',
  },
  {
    hash: '@9b7201e',
    score: 92,
    title: 'SIMD Vector Tensor Runtime',
    context: "MIT Blueprint '25 Systems Track",
    depth: 'AST Depth: Selective Plan (28 files)',
    proof: 'PROOF: C++ AVX-512 Intrinsics',
    duration: '02:48 Audio Sealed',
    citedLine: 'kernels/matmul_avx512.cc:142-169',
    quote:
      'We tiled the accumulator registers in 6x16 micro-panels to hide FMA latency without spilling to L1 cache.',
  },
  {
    hash: '@cc41298',
    score: 89,
    title: 'Distributed LSM B-Tree Engine',
    context: 'CalHacks Infrastructure Track',
    depth: 'AST Depth: Selective Plan (41 files)',
    proof: 'PROOF: Go Compaction & WAL Recovery',
    duration: '03:00 Audio Sealed',
    citedLine: 'storage/wal/recovery.go:54-79',
    quote:
      'During replay we truncate any torn CRC frame at the tail of the segment before promoting the memtable.',
  },
];

export function Landing() {
  const { session, org } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeDossier, setActiveDossier] = useState<number | null>(null);

  const primaryHref = session ? (org ? '/org/events' : '/events') : '/signup?as=organizer';
  const primaryLabel = session ? (org ? 'Open Organizer Console' : 'Explore Events') : 'Run a Hackathon / Audit';
  const secondaryHref = session ? '/interview/new' : '/signup';
  const secondaryLabel = session ? 'Start 3-Min Voice Interview' : 'Prove My Skills (Candidate)';

  return (
    <div className="space-y-16 pb-6">
      {/* 1. Hero Section */}
      <section className="pt-2">
        {/* Top Badges & Meta Pill */}
        <div className="mb-6 flex flex-wrap items-center gap-2.5">
          <span className="font-mono-code inline-flex items-center gap-2 rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold tracking-wide text-accent">
            <span className="status-dot-live bg-accent text-accent" />
            REAL-TIME REPO &amp; ORAL DEFENSE PIPELINE
          </span>
          <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-white px-2.5 py-1 text-[11px] text-muted">
            <span className="material-symbols-outlined text-[14px] text-good">verified_user</span>
            POWERED BY GOOGLE GEMINI
          </span>
          <span className="font-mono-code ml-auto hidden text-[11px] text-muted md:inline-block">
            COMMIT LOCK: <span className="font-semibold text-ink">@a4f91c280ee3d1</span>
          </span>
        </div>

        {/* Main Asymmetric 12-Col Hero Grid */}
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Left: Editorial Masthead (6 cols) */}
          <div className="space-y-6 lg:col-span-6">
            <h1 className="font-serif-heading text-[36px] leading-[1.08] font-normal tracking-tight text-ink sm:text-[46px] lg:text-[52px]">
              Anyone can generate code. <br className="hidden sm:inline" />
              <span className="text-accent italic underline decoration-accent/35 decoration-1 underline-offset-8">
                SkillProof
              </span>{' '}
              proves who understands it.
            </h1>

            <p className="max-w-[560px] text-[15px] leading-[24px] text-muted sm:text-[16px] sm:leading-[26px]">
              Hackathon judging that freezes every GitHub repository at the deadline, reads the actual codebase against
              your rubric, and cites exact files. Coupled with a 3-minute live voice interview on the author&apos;s own
              code that copy-pasted prompts cannot pass.
            </p>

            {/* Action Buttons */}
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
                className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-transparent px-3 py-2.5 text-[12px] font-medium text-muted hover:bg-white hover:border-line hover:text-ink"
              >
                <span>Inspect Dossier Specimen</span>
                <span className="arrow-nudge">↓</span>
              </a>
            </div>

            {/* Micro Telemetry Metrics */}
            <div className="font-mono-code grid grid-cols-3 gap-3 border-t border-line pt-4 text-[11px]">
              <div>
                <div className="text-muted uppercase">ORAL DEFENSE</div>
                <div className="mt-0.5 text-[13px] font-semibold text-ink">3:00 Gemini Live</div>
              </div>
              <div>
                <div className="text-muted uppercase">REPO INSPECTION</div>
                <div className="mt-0.5 text-[13px] font-semibold text-good">Selective Git Tree</div>
              </div>
              <div>
                <div className="text-muted uppercase">AUDIT EVIDENCE</div>
                <div className="mt-0.5 text-[13px] font-semibold text-accent">Commit-Locked SHA</div>
              </div>
            </div>
          </div>

          {/* Right: Architectural Examiner Frame (6 cols) */}
          <div className="lg:col-span-6">
            <div className="card-interactive overflow-hidden rounded-[6px] border border-line bg-white p-2">
              <div className="flex h-8 items-center justify-between rounded-t-[4px] border border-line bg-paper px-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-line" />
                  <span className="h-2 w-2 rounded-full bg-line" />
                  <span className="h-2 w-2 rounded-full bg-line" />
                  <span className="font-mono-code ml-2 text-[11px] text-muted">
                    SKILLPROOF_EXAMINER // REPO_ANALYZER.TS
                  </span>
                </div>
                <div className="font-mono-code flex items-center gap-1.5 rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[10px] font-semibold text-good">
                  <span className="status-dot-live bg-good text-good" />
                  <span>AST LIVE MAPPING</span>
                </div>
              </div>

              <div className="relative mt-1.5 overflow-hidden rounded-b-[4px] border border-line bg-paper">
                <img
                  src={HERO_IMAGE}
                  alt="SkillProof AI code evaluation and voice defense interface"
                  className="block h-auto w-full object-cover"
                />

                {/* Flat Architectural Telemetry Overlay 1 */}
                <div className=" hidden border border-line bg-white p-2.5 sm:absolute sm:top-3 sm:left-3 sm:flex sm:items-center sm:gap-2.5 sm:rounded-[4px]">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-accent/25 bg-accent-soft text-accent">
                    <span className="material-symbols-outlined text-[16px]">account_tree</span>
                  </div>
                  <div>
                    <div className="font-mono-code text-[10px] text-muted uppercase">SELECTIVE READER</div>
                    <div className="text-[12px] font-semibold text-ink">Git Tree &amp; Blob SHA Cache</div>
                  </div>
                </div>

                {/* Flat Architectural Telemetry Overlay 2 */}
                <div className="hidden border border-line bg-white p-2.5 sm:absolute sm:right-3 sm:bottom-3 sm:flex sm:items-center sm:gap-3 sm:rounded-[4px]">
                  <span className="status-dot-live bg-good text-good" />
                  <div>
                    <div className="font-mono-code text-[10px] text-muted uppercase">VOICE VERIFICATION</div>
                    <div className="font-mono-code text-[11px] font-semibold text-ink">180s Live • Evidence Linked</div>
                  </div>
                  <span className="font-mono-code rounded-[3px] border border-good/30 bg-good-soft px-1.5 py-0.5 text-[10px] font-bold text-good">
                    94 / 100
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Institutional & Hackathon Register Strip */}
        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-line pt-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 text-[12px] text-muted">
            <span className="font-mono-code rounded-[3px] border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink uppercase">
              PROTOCOL SCOPE
            </span>
            <span>Built for high-density hackathons, engineering cohorts, and verifiable technical portfolios:</span>
          </div>
          <div className="font-mono-code flex flex-wrap items-center gap-4 text-[11px] font-medium tracking-wider text-muted uppercase">
            <span>COMMIT FREEZE</span>
            <span className="text-line">•</span>
            <span>WEIGHTED RUBRICS</span>
            <span className="text-line">•</span>
            <span>3-MIN VOICE DEFENSE</span>
            <span className="text-line">•</span>
            <span>RECRUITER DOSSIERS</span>
          </div>
        </div>
      </section>

      {/* 2. Interactive Core Demo & 3 Pillars Section */}
      <section id="specimen" className="space-y-8 rounded-[6px] border border-line bg-white p-6 lg:p-8">
        {/* Section Header */}
        <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 md:flex-row md:items-end">
          <div>
            <span className="font-mono-code mb-2 inline-flex items-center rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent uppercase">
              01 // SYNCHRONIZED CODE &amp; VOICE VERIFICATION
            </span>
            <h2 className="font-serif-heading text-[26px] leading-[32px] font-medium text-ink sm:text-[32px] sm:leading-[38px]">
              How SkillProof catches what static linters miss
            </h2>
            <p className="mt-1 max-w-[640px] text-[14px] leading-[22px] text-muted">
              Every rubric score and interview skill is backed by concrete repository files and direct quotes from the
              candidate&apos;s 3-minute oral defense.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2.5 py-1.5 text-[11px] text-muted">
              TARGET: <span className="font-semibold text-ink">src/distributed/raft_consensus.rs</span>
            </span>
            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              className={`btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border px-3.5 py-1.5 text-[11px] font-semibold ${
                isPlaying
                  ? 'border-good bg-good text-white'
                  : 'border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">{isPlaying ? 'pause' : 'play_arrow'}</span>
              <span>{isPlaying ? 'Pause Citation [01:24]' : 'Simulate Oral Defense (01:24)'}</span>
            </button>
          </div>
        </div>

        {/* Specimen Split Grid (7 / 5) */}
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          {/* Left: Code Evidence Viewer + Editorial Quote Block (7 cols) */}
          <div className="flex flex-col justify-between space-y-4 lg:col-span-7">
            {/* Code Evidence Viewer */}
            <div className="overflow-hidden rounded-[6px] border border-line bg-white">
              <div className="flex h-9 items-center justify-between border-b border-line bg-paper px-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-good" />
                  <span className="font-mono-code text-[11px] font-semibold text-ink">
                    src/distributed/raft_consensus.rs
                  </span>
                  <span className="font-mono-code hidden text-[10px] text-muted sm:inline">
                    LINES 174-181 (CITED EVIDENCE)
                  </span>
                </div>
                <span className="font-mono-code rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[10px] font-bold text-good">
                  RUBRIC PASS: 88.5 / 100
                </span>
              </div>

              <div className="font-mono-code overflow-x-auto bg-white p-3 text-[12px] leading-[20px]">
                <div className="pb-1 text-[11px] text-muted">// Frozen Commit @a4f91c2 • Rust UTF-8</div>
                <div className="flex text-muted">
                  <span className="w-8 pr-3 text-right text-muted/60 select-none">174</span>
                  <span className="text-ink">let (ack_tx, mut ack_rx) = mpsc::channel(peers.len());</span>
                </div>
                <div className="flex text-muted">
                  <span className="w-8 pr-3 text-right text-muted/60 select-none">175</span>
                  <span className="text-ink">for peer in peers.iter() &#123;</span>
                </div>
                {[
                  { line: 176, code: '  tokio::spawn(async move {' },
                  { line: 177, code: '    let res = peer.send_heartbeat(current_term).await;' },
                  { line: 178, code: '    let _ = ack_tx.send(res).await;' },
                ].map((row) => (
                  <div
                    key={row.line}
                    className={`-mx-3 flex border-l-2 px-3 transition-colors ${
                      isPlaying
                        ? 'border-accent bg-accent text-white font-semibold'
                        : 'border-accent bg-accent-soft/65 text-ink font-medium'
                    }`}
                  >
                    <span
                      className={`w-8 pr-3 text-right font-semibold select-none ${
                        isPlaying ? 'text-white' : 'text-accent'
                      }`}
                    >
                      {row.line}
                    </span>
                    <span className="whitespace-pre">{row.code}</span>
                  </div>
                ))}
                <div className="flex text-muted">
                  <span className="w-8 pr-3 text-right text-muted/60 select-none">179</span>
                  <span className="text-ink">  &#125;);</span>
                </div>
                <div className="flex text-muted">
                  <span className="w-8 pr-3 text-right text-muted/60 select-none">180</span>
                  <span className="text-ink">&#125;</span>
                </div>
                <div className="flex text-muted">
                  <span className="w-8 pr-3 text-right text-muted/60 select-none">181</span>
                  <span className="text-ink">self.tally_quorum(&amp;mut ack_rx).await?;</span>
                </div>
              </div>
            </div>

            {/* Editorial Quote Block for Verified Interview Audio Transcripts */}
            <div className="flex flex-col justify-between space-y-3 rounded-[6px] border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono-code flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-good uppercase">
                  <span className={isPlaying ? 'status-dot-live bg-good text-good' : 'h-1.5 w-1.5 rounded-full bg-good'} />
                  VERIFIED ORAL EVIDENCE (QUESTION 2 OF 4)
                </span>
                <span className="font-mono-code text-[11px] text-muted">TIMESTAMP: 01:24 / 03:00</span>
              </div>

              <blockquote className="rounded-r-[4px] border-l-[3px] border-accent bg-paper/60 py-1.5 pl-4">
                <p className="font-serif-heading text-[16px] leading-[24px] text-ink italic">
                  &ldquo;We spawned non-blocking Tokio tasks per follower inside the broadcast loop so a partitioned peer
                  cannot stall quorum tallying before the election timer expires.&rdquo;
                </p>
                <footer className="font-mono-code mt-1 text-[11px] text-muted">
                  — Candidate Defense Transcript • Matched to lines 176–181
                </footer>
              </blockquote>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-code rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good">
                    SKILL: DISTRIBUTED CONCURRENCY · DEMONSTRATED
                  </span>
                  <span className="font-mono-code text-[11px] text-muted">CONFIDENCE: HIGH</span>
                </div>
                <span className="font-mono-code text-[11px] text-muted">
                  TOKENS: <code className="text-ink">tokio::spawn</code> • <code className="text-ink">mpsc::channel</code>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Audit Cockpit Visualizer & Tabular Gauges (5 cols) */}
          <div className="flex flex-col justify-between space-y-4 lg:col-span-5">
            <div className="flex flex-col space-y-3 rounded-[6px] border border-line bg-paper p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Audit Cockpit Visualizer
                </span>
                <span className="font-mono-code rounded-[3px] border border-line bg-white px-2 py-0.5 text-[10px] font-bold text-accent">
                  COMMIT-LOCKED
                </span>
              </div>

              <div className="overflow-hidden rounded-[4px] border border-line bg-white">
                <img
                  src={COCKPIT_IMAGE}
                  alt="Technical editorial illustration of code analysis and voice spectrogram verification"
                  className="block h-auto w-full object-cover"
                />
              </div>

              <p className="text-[12px] leading-[18px] text-muted">
                SkillProof maps repository structure, caches file summaries by Git blob SHA, and cross-examines the
                author on architecture, trade-offs, and failure modes.
              </p>
            </div>

            {/* Micro Score Gauge Row with GPU scaleX bars */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: 'RUBRIC SCORE', value: '88.5%', scale: 0.885, tone: 'text-ink', bar: 'bg-ink' },
                { label: 'OWNERSHIP', value: '94%', scale: 0.94, tone: 'text-good', bar: 'bg-good' },
                { label: 'CITATIONS', value: '4 / 4', scale: 1, tone: 'text-accent', bar: 'bg-accent' },
              ].map((m) => (
                <div key={m.label} className="rounded-[6px] border border-line bg-white p-3">
                  <div className="font-mono-code text-[10px] text-muted uppercase">{m.label}</div>
                  <div className={`font-serif-heading mt-0.5 text-[22px] leading-tight font-semibold ${m.tone}`}>
                    {m.value}
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-well">
                    <div
                      className={`score-bar-fill h-full w-full ${m.bar}`}
                      style={{ transform: `scaleX(${m.scale})` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3 Pillars Feature Cards Grid */}
        <div className="grid grid-cols-1 gap-4 border-t border-line pt-6 md:grid-cols-3">
          <div className="card-interactive rounded-[6px] border border-line bg-paper/60 p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono-code flex h-7 w-7 items-center justify-center rounded-[4px] border border-accent/25 bg-accent-soft text-[12px] font-bold text-accent">
                01
              </span>
              <span className="material-symbols-outlined text-[20px] text-accent">account_tree</span>
            </div>
            <h3 className="font-serif-heading text-[18px] font-medium text-ink">Selective Repository Analysis</h3>
            <p className="text-[13px] leading-[20px] text-muted">
              Inspects the Git tree, plans high-signal file reading, extracts code hooks, and caches summaries by blob
              SHA to evaluate real architecture rather than README fluff.
            </p>
            <div className="font-mono-code pt-1 text-[11px] font-semibold text-accent">
              CACHED BY COMMIT &amp; BLOB SHA →
            </div>
          </div>

          <div className="card-interactive rounded-[6px] border border-line bg-paper/60 p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono-code flex h-7 w-7 items-center justify-center rounded-[4px] border border-good/30 bg-good-soft text-[12px] font-bold text-good">
                02
              </span>
              <span className="material-symbols-outlined text-[20px] text-good">graphic_eq</span>
            </div>
            <h3 className="font-serif-heading text-[18px] font-medium text-ink">3-Minute Live Voice Defense</h3>
            <p className="text-[13px] leading-[20px] text-muted">
              Generates targeted questions tied to actual code snippets in the author&apos;s repository. The answer key
              stays strictly on the server while Gemini Live conducts the oral exam.
            </p>
            <div className="font-mono-code pt-1 text-[11px] font-semibold text-good">
              ONE-TIME EPHEMERAL LIVE TOKEN →
            </div>
          </div>

          <div className="card-interactive rounded-[6px] border border-line bg-paper/60 p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono-code flex h-7 w-7 items-center justify-center rounded-[4px] border border-line bg-white text-[12px] font-bold text-ink">
                03
              </span>
              <span className="material-symbols-outlined text-[20px] text-ink">fact_check</span>
            </div>
            <h3 className="font-serif-heading text-[18px] font-medium text-ink">Auditable Dossiers &amp; Overrides</h3>
            <p className="text-[13px] leading-[20px] text-muted">
              Organizers inspect AI justifications, cited files, similarity warnings, and manual score overrides with an
              immutable audit log before publishing final standings.
            </p>
            <div className="font-mono-code pt-1 text-[11px] font-semibold text-ink">
              HUMAN-IN-THE-LOOP ADJUDICATION →
            </div>
          </div>
        </div>
      </section>

      {/* 3. Dual Workflow Comparison (Organizers vs. Students/Engineers) */}
      <section id="organizers" className="space-y-6">
        <div className="flex flex-col justify-between gap-2 border-b border-line pb-4 sm:flex-row sm:items-end">
          <div>
            <span className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
              02 // TAILORED OPERATIONAL WORKFLOWS
            </span>
            <h2 className="font-serif-heading mt-1 text-[28px] leading-[34px] font-medium text-ink sm:text-[34px] sm:leading-[40px]">
              Built for high-stakes adjudication and career proof
            </h2>
          </div>
          <span className="font-mono-code text-[11px] text-muted uppercase">
            DUAL ROLE ARCHITECTURE: ORGANIZER &amp; CANDIDATE
          </span>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* Left: For Organizers & Hackathons */}
          <div className="card-interactive flex flex-col justify-between space-y-6 rounded-[6px] border border-line bg-white p-6 lg:p-8">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">
                  ORGANIZER SUITE
                </span>
                <span className="font-mono-code text-[11px] text-muted">HACKATHONS &amp; COHORTS</span>
              </div>

              <div>
                <h3 className="font-serif-heading text-[24px] leading-[30px] font-medium text-ink">
                  For Hackathons &amp; Universities
                </h3>
                <p className="mt-1 text-[14px] text-muted">
                  Evaluate every team against a weighted rubric with file-level evidence and human override controls.
                </p>
              </div>

              <ol className="space-y-3.5 pt-1">
                {[
                  {
                    step: '01',
                    title: 'Define Rubric & Visibility',
                    desc: 'Configure weighted criteria, deadlines, and open, access-code, or invite-only participation.',
                  },
                  {
                    step: '02',
                    title: 'Collect Repository Submissions',
                    desc: 'Teams submit their public GitHub repository, demo video, and slides before the cutoff.',
                  },
                  {
                    step: '03',
                    title: 'Freeze Commits & Score at Scale',
                    desc: 'Closing the event locks each repo at its latest commit SHA and runs concurrent rubric evaluations.',
                  },
                  {
                    step: '04',
                    title: 'Audit, Override & Publish',
                    desc: 'Review cited files, inspect shared-repo/fork flags, override any criterion with a reason, and publish.',
                  },
                ].map((item) => (
                  <li key={item.step} className="flex items-start gap-3">
                    <span className="font-mono-code mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-accent/30 bg-accent-soft text-[11px] font-bold text-accent">
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
              <span className="font-mono-code text-[11px] text-muted">CONCURRENT QUEUE + AUTO-RETRY</span>
              <Link to={session && org ? '/org/events/new' : '/signup?as=organizer'} className={linkButton}>
                <span>{session && org ? 'Create Event' : 'Run a Hackathon'}</span>
                <span className="arrow-nudge font-mono-code text-[11px]">→</span>
              </Link>
            </div>
          </div>

          {/* Right: For Students & Engineers */}
          <div className="card-interactive flex flex-col justify-between space-y-6 rounded-[6px] border border-line bg-white p-6 lg:p-8">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <span className="font-mono-code rounded-[3px] border border-good/30 bg-good-soft px-2.5 py-0.5 text-[11px] font-bold text-good">
                  CANDIDATE CREDENTIALING
                </span>
                <span className="font-mono-code text-[11px] text-muted">STUDENTS &amp; ENGINEERS</span>
              </div>

              <div>
                <h3 className="font-serif-heading text-[24px] leading-[30px] font-medium text-ink">
                  For Students &amp; Engineers
                </h3>
                <p className="mt-1 text-[14px] text-muted">
                  Turn your GitHub repositories into verifiable ownership dossiers backed by live oral defense quotes.
                </p>
              </div>

              <ol className="space-y-3.5 pt-1">
                {[
                  {
                    step: '01',
                    title: 'Paste Your GitHub Repository',
                    desc: 'Use any public repository you authored or start directly from a judged hackathon submission.',
                  },
                  {
                    step: '02',
                    title: 'Defend Your Code for 3 Minutes',
                    desc: 'Answer adaptive voice questions anchored to specific functions and architectural decisions in your code.',
                  },
                  {
                    step: '03',
                    title: 'Earn an Ownership & Skill Report',
                    desc: 'Receive an ownership score (0–100), confidence rating, and demonstrated skills backed by verbatim quotes.',
                  },
                  {
                    step: '04',
                    title: 'Share Your Public Recruiter Dossier',
                    desc: 'Publish your `/p/:slug` profile so recruiters and hiring managers can inspect your verified evidence.',
                  },
                ].map((item) => (
                  <li key={item.step} className="flex items-start gap-3">
                    <span className="font-mono-code mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-good/30 bg-good-soft text-[11px] font-bold text-good">
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
              <span className="font-mono-code text-[11px] text-muted">SHAREABLE /P/:SLUG DOSSIER</span>
              <Link to={session ? '/interview/new' : '/signup'} className={linkButtonSecondary}>
                <span>{session ? 'Start Voice Interview' : 'Prove My Skills'}</span>
                <span className="arrow-nudge font-mono-code text-[11px]">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Public Verification Stream / Specimen Registry */}
      <section id="registry" className="space-y-5">
        <div className="flex flex-col justify-between gap-2 border-b border-line pb-4 sm:flex-row sm:items-end">
          <div>
            <span className="font-mono-code text-[11px] font-semibold tracking-wider text-accent uppercase">
              03 // PUBLIC VERIFICATION SPECIMENS
            </span>
            <h2 className="font-serif-heading mt-1 text-[26px] leading-[32px] font-medium text-ink sm:text-[32px] sm:leading-[38px]">
              Verified Proof Dossier Examples
            </h2>
          </div>
          <div className="font-mono-code flex items-center gap-2 text-[11px] text-muted">
            <span className="status-dot-live bg-good text-good" />
            <span>COMMIT-ANCHORED ORAL EXAM SPECIMENS</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {DOSSIERS.map((d, idx) => {
            const expanded = activeDossier === idx;
            return (
              <div
                key={d.hash}
                className="card-interactive flex flex-col justify-between space-y-4 rounded-[6px] border border-line bg-white p-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2 py-0.5 text-[11px] text-muted">
                      {d.hash}
                    </span>
                    <span className="font-mono-code rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[11px] font-bold text-good">
                      OWNERSHIP: {d.score} / 100
                    </span>
                  </div>

                  <div>
                    <h3 className="font-serif-heading text-[19px] leading-[25px] font-medium text-ink">{d.title}</h3>
                    <p className="text-[12px] text-muted">{d.context}</p>
                  </div>

                  <div className="font-mono-code space-y-1 rounded-[4px] border border-line bg-paper p-2.5 text-[11px] text-muted">
                    <div>{d.depth}</div>
                    <div className="text-ink font-medium">{d.proof}</div>
                    <div className="text-accent">{d.citedLine}</div>
                  </div>

                  {expanded && (
                    <blockquote className="rounded-r-[4px] border-l-[3px] border-accent bg-accent-soft/35 py-1.5 pl-3 text-[12px] text-ink italic">
                      &ldquo;{d.quote}&rdquo;
                    </blockquote>
                  )}
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
                    {expanded ? 'Hide Quote' : 'Inspect Quote'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. High-Impact Dark Architectural Call to Action (Dark Theme Companion Spec) */}
      <section
        id="demo"
        className="rounded-[6px] border border-[#262B34] bg-[#0D0F12] p-8 text-[#EDEDEC] sm:p-12 lg:p-14"
      >
        <div className="mx-auto max-w-[740px] space-y-5 text-center">
          <div className="font-mono-code inline-flex items-center gap-2 rounded-[3px] border border-[#262B34] bg-[#15181E] px-3 py-1 text-[11px] font-semibold tracking-wider text-accent-soft uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            THE STANDARD FOR AUTHENTIC CODE CREDENTIALING
          </div>

          <h2 className="font-serif-heading text-[32px] leading-[1.12] font-normal tracking-tight text-white sm:text-[42px] lg:text-[48px]">
            Make genuine engineering understanding undeniable.
          </h2>

          <p className="mx-auto max-w-[600px] text-[15px] leading-[24px] text-[#8E95A3] sm:text-[16px]">
            Launch an AI-audited hackathon with commit-locked rubric scoring, or take a 3-minute live voice interview on
            your own GitHub repository in minutes.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to={primaryHref} className={`${linkButton} px-6 py-3 text-[14px]`}>
              <span>{primaryLabel}</span>
              <span className="arrow-nudge font-mono-code text-[13px]">→</span>
            </Link>
            <Link
              to={secondaryHref}
              className="btn-tactile inline-flex items-center justify-center gap-2 rounded-[4px] border border-[#262B34] bg-[#15181E] px-6 py-3 text-[14px] font-medium text-[#EDEDEC] hover:border-[#8E95A3] hover:bg-[#1E222B]"
            >
              <span>{secondaryLabel}</span>
            </Link>
          </div>

          <div className="font-mono-code flex flex-wrap items-center justify-center gap-5 border-t border-[#262B34] pt-6 text-[11px] text-[#8E95A3]">
            <span>PUBLIC GITHUB REPOSITORIES</span>
            <span>•</span>
            <span>COMMIT-LOCKED RUBRIC SCORING</span>
            <span>•</span>
            <span>3-MINUTE GEMINI LIVE INTERVIEWS</span>
          </div>
        </div>
      </section>

      {/* Technical Editorial Footer */}
      <footer className="font-mono-code flex flex-col items-center justify-between gap-4 border-t border-line pt-6 text-[11px] text-muted sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-serif-heading text-[16px] font-semibold text-ink">SkillProof</span>
          <span>— Technical Audit Dossier &amp; Voice Verification Environment</span>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Link to="/events" className="transition-colors hover:text-accent">
            Events Directory
          </Link>
          <Link to="/interview/new" className="transition-colors hover:text-accent">
            Voice Interviews
          </Link>
          <Link to="/login" className="transition-colors hover:text-accent">
            Authentication Portal
          </Link>
        </div>
      </footer>
    </div>
  );
}
