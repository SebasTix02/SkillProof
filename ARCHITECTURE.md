# Architecture Overview

SkillProof is organized as a strict TypeScript npm workspace monorepo with three packages and a PostgreSQL/RLS schema layer:

```text
packages/shared/       Domain schemas (Zod), rubric math, model chains, interview guards, locale types
apps/api/              Fastify HTTP server, Gemini orchestration, GitHub tree reader, MOSS fingerprinting
apps/web/              React 19 + Vite + Tailwind v4 SPA, design-token UI kit, Gemini Live WebSocket room
supabase/              SQL migrations, RBAC permission graph, RPC functions, and pgTap/SQL RLS test suites
```

## Module Boundaries & Data Flow

1. **Shared Contracts (`@skillproof/shared`)**
   - Single source of truth for request/response validation, AI structured-output JSON schemas (`RepoMapSchema`, `ScoreResultSchema`, `InterviewReportSchema`), GA model fallback chains (`prioritizeStableModels`), and live transcript sanitization (`clampQuestionText`, `sanitizeInterviewerTurn`).
   - Imported by both `@skillproof/api` and `@skillproof/web`, preventing schema drift.

2. **Backend Engine & Services (`@skillproof/api`)**
   - **`engine/`**: Pure or stateless analysis primitives — selective Git tree filtering & skeleton outlining (`files.ts`), repository mapping (`analyze.ts`), and MOSS winnowing similarity fingerprinting (`fingerprint.ts`).
   - **`lib/`**: Infrastructure adapters — multi-key & cross-provider Gemini client with shared circuit-breaker health (`gemini.ts`, `aiLimiter.ts`), streaming GitHub client (`github.ts`), typed Supabase helpers (`supabase.ts`), RBAC checks (`auth.ts`, `permissions.ts`), and Cloud Run static/CSP host (`webApp.ts`).
   - **`services/`**: Contest-agnostic judging queue (`contest.ts`, `judge.ts`, `judgeQueue.ts`, `scoring.ts`), spoken interview lifecycle (`interviews.ts`, `interviewSpecs.ts`), similarity comparison (`similarity.ts`), and cooperative job recovery (`scheduler.ts`).
   - **`routes/`**: Thin HTTP controllers grouped by domain (`events`, `courses/*`, `interviews`, `review`, `org`, `profiles`, `controls`, `internal`).

3. **Frontend Application (`@skillproof/web`)**
   - **`components/shared/`**: Reusable OKLCH semantic-token UI primitives (`Tabs`, `ConfirmDialog`, `ScoreBar`, `WaveformVisualizer`, `DossierPageHeader`, `Skeleton`), tested for zero hardcoded hex colors and WCAG 2.2 AA contrast in light, dark, and OS forced-color modes.
   - **`pages/`**: Lazy-loaded route entry points (`React.lazy`) split into focused feature subfolders (`pages/interview/`, `pages/account/`, `pages/event/`, `pages/org/*`) so each module has a single responsibility.
   - **`i18n/`**: Compile-time-checked English/Spanish translation catalogs (`i18n/es/*`) verified for 100% screen coverage (`coverage.test.ts`).
