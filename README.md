# SkillProof

Anyone can generate code. SkillProof shows who understands it.

SkillProof reads a GitHub repository with Google Gemini and does two things with what it learns:

- **Hackathon judging.** Organizers create an event with a rubric. Participants join and submit their
  repository and demo video. At the deadline every repository is frozen at its last commit and scored against
  the rubric, with the reason and the files behind each score. The organizer reviews, overrides any score, and
  publishes.
- **Voice interview.** A three-minute spoken interview about the author's own code, with follow-up questions.
  The result is a skills report with the candidate's own quotes, shown on a public profile.

Both use the same repository analysis.

## What is in this repository

```
packages/shared      Schemas and rules shared by the API and the web app (zod)
apps/api             Fastify API: events, submissions, judging, interviews
apps/web             React app (Vite, Tailwind)
supabase/migrations  Database schema, roles, permissions and row level security
supabase/tests       Database checks, run by scripts/test-db.sh
```

## Run it locally

You need Node 22 or later, a Supabase project and a Gemini API key.

1. **Install**

   ```bash
   npm install
   npm run build -w @skillproof/shared
   ```

2. **Database.** Create a project at supabase.com. Open the SQL editor, paste the contents of
   `supabase/migrations/20261116000001_init.sql` and run it. With the Supabase CLI you can instead run
   `supabase link` and `supabase db push`.

3. **Auth.** In Supabase, under Authentication > URL Configuration, set the site URL to
   `http://localhost:5173` and add `http://localhost:5173/auth/callback` and
   `http://localhost:5173/reset-password` as redirect URLs. Email and password sign-in is on by default.
   The built-in email sender allows only a few emails per hour. Add your own SMTP provider before an event.

4. **Environment**

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

   Fill in both files. The service role key belongs only in `apps/api/.env`. Never put it in the web app.

5. **Start**

   ```bash
   npm run dev:api    # http://localhost:8080
   npm run dev:web    # http://localhost:5173
   ```

Sign up as an organizer to create events, or as a student to join them and take interviews.

### Using Google Cloud credits

Repository analysis and scoring can run through Vertex AI. Set `USE_VERTEX=true`, `GOOGLE_CLOUD_PROJECT` and
`GOOGLE_CLOUD_LOCATION` in `apps/api/.env`, enable the Vertex AI API in the project, and run
`gcloud auth application-default login`. The voice interview always uses `GEMINI_API_KEY`.

Set a budget alert in Google Cloud Billing before running a real event.

## Deploy to Vercel

The web app and the API deploy together as one Vercel project. `vercel.json` runs `scripts/build-vercel.mjs`,
which writes the Vite build as static files and bundles the Fastify API into one Node function with the
[Build Output API](https://vercel.com/docs/build-output-api/v3). `/api/*` and `/internal/*` go to the function and
every other path goes to the web app, so the browser calls the API on its own domain.

1. Import the repository in Vercel. Leave the root directory at the repository root. The framework, build and
   output settings come from `vercel.json`.
2. Under Settings > Environment Variables add the variables from `apps/api/.env` and `apps/web/.env`, plus
   `INTERNAL_SECRET` and `CRON_SECRET` (random strings of at least 16 characters). Set `WEB_ORIGIN` to the
   Vercel URL. Leave out `PORT` and `VITE_API_URL`.
3. In Supabase, add the Vercel URL as the site URL and add `<url>/auth/callback` and `<url>/reset-password` as
   redirect URLs.

Background jobs (judging, interview reports) call the API's own `/internal` routes, so each one runs in its own
function invocation with up to 300 seconds. Vercel Cron calls `GET /internal/tick` once a day, which is the
limit on the Hobby plan. API traffic also closes events whose deadline has passed, at most once a minute. On Pro,
set the cron in `scripts/build-vercel.mjs` to every minute.

## Checks

```bash
npm run typecheck
npm test                 # unit tests for the shared rules and the API
./scripts/test-db.sh     # applies the migration to a temporary Postgres 16 and checks row level security
npm run build
```

## How it works

### Roles and tenants

Each organization is a tenant. Every tenant table carries `organization_id` and has row level security.
Roles are `student` and `platform_admin` (global), and `org_owner`, `organizer` and `judge` (inside one
organization). Permissions are rows in `permissions`, joined to roles through `role_permissions`, and granted
to users through `user_roles`. The browser talks to Supabase only to sign in. Every write goes through the
API, which checks the same permissions.

### Events

| Access | Who can join |
| --- | --- |
| Public | Anyone with an account |
| Access code | Anyone who has the code. It is stored hashed and attempts are limited |
| Invite only | People whose confirmed email is on the list the organizer uploads |

An event allows a set number of submissions per participant, or unlimited. Each new version replaces the
previous one. The check and the insert happen in one database function, so two requests at the same moment
cannot go over the limit.

### Closing and judging

When the deadline passes, or the organizer closes the event by hand:

1. The event moves from `open` to `judging`. No more submissions are accepted.
2. For every submission, the API asks GitHub for the last commit at that moment and stores it. Judging uses
   exactly that commit. Commits pushed later are ignored.
3. Submissions that share a repository or are forks of the same project are flagged for the organizer.
4. Each submission is judged in a background job: the repository is read and mapped, then scored against the
   rubric together with the demo video and pitch.
5. When all jobs have finished, the event moves to `review`. The organizer can override scores and then
   publishes.

Jobs run inside the API process by default. Set `TASKS_QUEUE` to run them on Cloud Tasks, and point a Cloud
Scheduler job at `POST /internal/tick` every minute with the `x-internal-secret` header so deadlines are
picked up while no one has the site open.

### Interview

The API writes a question plan from the repository, with the points a real author would mention. Those
points never reach the browser. The browser receives a single-use token that is locked to the interviewer's
instructions, opens a live audio session with Gemini, and sends the transcript back when the interview ends.
A second model call compares the transcript with the plan and writes the report. Audio is not stored.

## Known limits

- **Not yet tested against live services.** The unit tests, database checks, typecheck and build pass. No run
  has been made yet against a real Supabase project, the Gemini API or the GitHub API. The voice interview and
  the scoring of YouTube videos in particular need a first real run.
- The interview transcript is assembled in the browser, so a determined candidate could alter it. A server
  relay for the audio session would close this.
- Similarity flags cover shared repositories and shared fork parents. Comparing file contents or embeddings is
  not built yet.
- Only public GitHub repositories are supported.
- Not built yet: sign in with GitHub, installable PWA, teacher mode for assignments, deployment files.
