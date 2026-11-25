# Security Policy & Controls

SkillProof evaluates untrusted source repositories, user-submitted descriptions, demo links, and live audio transcripts. Security is enforced across every layer of the stack rather than relying on client-side checks.

## Defense-in-Depth Architecture

1. **Tenant Isolation & Row-Level Security (RLS)**
   - Every multi-tenant table in PostgreSQL carries `organization_id` with strict Row-Level Security policies (`supabase/migrations/`), verified continuously in CI against a live PostgreSQL 16 instance (`scripts/test-db.sh`).
   - The browser only receives the public `SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` stay exclusively on the server (Google Cloud Secret Manager / server environment).
   - Every API endpoint independently validates authentication (`requireUser`) and RBAC permissions (`requirePermission`) before touching the database.

2. **Untrusted Repository & Archive Handling**
   - **Strict Git Reference & Path Validation (`apps/api/src/lib/github.ts`)**: Owner, repository name, 40-char commit SHA, and relative file paths are validated before any network request, blocking path traversal (`..`), null bytes, and SSRF injection.
   - **Streaming Byte Caps & Zip-Bomb Defense (`apps/api/src/engine/files.ts`)**: Selective raw downloads abort streams exceeding 1 MB per file; zipball fallbacks cap compressed size at 60 MB, per-entry size at 512 KB, and cumulative uncompressed output at 50 MB while rejecting Zip-Slip paths.
   - **Prompt-Injection Isolation (`UNTRUSTED_NOTICE`)**: Repository files, descriptions, transcripts, and videos are wrapped in explicit data delimiters (`<repository>`, `<description>`, `<transcript>`) with system-level anti-injection instructions and deterministic post-processing (`pruneUnknownPaths` drops any file citation not present in the actual commit tree).

3. **Transport, Browser & Credential Hardening**
   - **Strict Content-Security-Policy**: Both Cloud Run (`apps/api/src/lib/webApp.ts`) and Vercel (`scripts/build-vercel.mjs`) compute `sha256` hashes of inline bootstrap scripts with zero `'unsafe-inline'` in `script-src`, plus `frame-ancestors 'none'` and `object-src 'none'`.
   - **Defensive HTTP Headers**: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), geolocation=(), microphone=(self)`.
   - **Proxy-Aware Rate Limiting**: Fastify runs with `trustProxy: true` and bounded LRU sliding-window limiters (`AttemptLimiter`) per client IP for general reads and expensive write routes.
   - **Cryptographic Secrets**: Event access codes use salted `scrypt` hashes compared via `crypto.timingSafeEqual`; internal job endpoints verify OIDC tokens or constant-time shared secrets; interview answer keys never leave the server until an interview is completed.

## Reporting a Vulnerability

Please report security issues privately to the maintainers via GitHub Security Advisories on the repository rather than opening a public issue. Include steps to reproduce and the affected endpoint or component.
