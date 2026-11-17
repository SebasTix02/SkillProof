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

## Deploy on Vercel

The web app and the API deploy together as one Vercel project. The root `vercel.json` runs
`scripts/build-vercel.mjs`, which writes the Vite build as static files and bundles the Fastify API into one Node
function with the [Build Output API](https://vercel.com/docs/build-output-api/v3). `/api/*` and `/internal/*` go to
the function and every other path goes to the web app, so the browser calls the API on its own domain.

1. **Import.** In Vercel, choose Add New > Project, import the repository and leave **Root Directory** at the
   repository root. The build settings come from `vercel.json`.
2. **Environment variables.** Under Settings > Environment Variables paste these:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | From Supabase |
   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | From Supabase. The anon key is the only one the browser gets |
   | `GEMINI_API_KEY` | From Google AI Studio |
   | `WEB_ORIGIN` | The project's URL, for example `https://skillproof.vercel.app` |
   | `INTERNAL_SECRET` | A random string of at least 16 characters |
   | `CRON_SECRET` | Another random string of at least 16 characters |
   | `GITHUB_TOKEN` | Optional, raises the GitHub limit |
   | `USE_VERTEX`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_SERVICE_ACCOUNT_JSON` | Optional, to use Google Cloud credits. The last one is the content of a service account key with the Vertex AI User role |

   Leave out `PORT` and `VITE_API_URL`: the web app calls the API on its own domain. `API_PUBLIC_URL` is only
   needed if the production domain is not the one Vercel assigns.
3. **Supabase Auth.** Change the site URL to the project's URL and add `<URL>/auth/callback` and
   `<URL>/reset-password` as redirect URLs.

### Background jobs on Vercel

Vercel Functions stop after 300 seconds on the Hobby plan and keep no process running between requests.
SkillProof deals with that like this:

- Each job (judging one submission, preparing or evaluating an interview) runs in its own function
  invocation. The API calls its own `/internal/<job>/<id>/run` route with `INTERNAL_SECRET`, and that route
  answers at once and keeps working in the background with `waitUntil`.
- Closing events at their deadline runs as a scheduler pass. Any API request triggers one at most once a
  minute, and a Vercel cron job (`GET /internal/tick`, set in `vercel.json`) runs one daily. On Hobby, cron jobs
  can run only once a day, so if an event could close while nobody is using the site, also point a free external
  cron service (for example cron-job.org) at `POST <URL>/internal/tick` every minute with the header
  `x-internal-secret`. On Pro you can change the schedule in `vercel.json` to `* * * * *` instead.
- A job that is stopped before it finishes is picked up by the next scheduler pass. A submission stuck in
  judging for 10 minutes is marked as failed, so the organizer can use "Judge again".

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

### How the AI reads a repository

Reading a whole repository is the most expensive step, so it is kept small:

- **Only useful files are downloaded.** The file list comes from the git tree of the frozen commit, with every
  path and size, and only the files worth reading are fetched. Images, fonts, styles and dependencies are never
  downloaded. A very large repository falls back to the zipball, unpacking only the kept files.
- **Never read:** styles (css, scss, less…), images, fonts and other assets, `public/`, `static/` and `assets/`
  folders, build output, dependencies and libraries pasted into the project (jQuery plugins, files that start with
  a licence banner), lock files, generated code (protobuf, `.g.dart`, `.d.ts`, `.designer.cs`, minified bundles, files
  marked "generated"), data and fixtures, translations, test snapshots, editor files, generated migrations and
  documentation other than the root README. Notebooks are read as their cells, without outputs.
- **Read in full:** the most important files (README, manifests, entry points, business logic), up to
  `REPO_TOKEN_BUDGET` tokens (40 000) and `REPO_MAX_FULL_FILES` files (30). A long file is sent as a skeleton:
  imports, every declaration and the start of each body, with real line numbers. A small project (under
  `REPO_SMALL_REPO_TOKENS`, 50 000) is read whole in one call.
- **HTML and templates** are outlined (title, headings, forms, scripts), unless they are most of the project, as in
  a static site.
- **Outlined without AI:** other files get a local outline with their size, first comment and declarations.
- **Summarised:** only when 25 or more files are left out, the `REPO_MAX_SUMMARISED_FILES` (20) most relevant code
  files get a one-line summary in one call, cached by git blob sha (`file_summaries`).
- **Reused:** the repository map is cached per commit (`repo_analyses`), for judging and interviews alike.

The activity log says what was skipped and why, for example "Skipped 270 files: 144 image, font or asset,
57 documentation, 41 style, 20 generated or minified, 6 dependency or third-party library".

Measured on a 286-file static site (Proyecto-Banco), without calling the model:

| | Before | After the first round | Now |
| --- | --- | --- | --- |
| Downloaded | 24 MB zip | 24 MB zip | 131 KB, 16 files |
| Files read in full | 62 | 26 | 16 (the whole app) |
| Gemini calls | 3 | 3 | 2 (map, score) |
| Input tokens | ~230 000 | ~82 000 | ~21 000 |

### When Gemini is busy

A 503 "high demand" from Gemini is capacity on Google's side and rarely clears within seconds, so SkillProof
switches instead of waiting:

- **One gate per server:** every call goes through a limiter: `GEMINI_CONCURRENCY` calls at a time (2) and
  `GEMINI_MIN_GAP_MS` between starts (400 ms). A call that hangs longer than `GEMINI_TIMEOUT_MS` counts as busy.
- **One short retry:** a busy (503) or rate-limited (429) model is tried once more after about 2 seconds, or after
  the wait the API asks for when that is under 8 seconds. Then the next model in the chain answers.
- **Model health:** a model that failed rests for 3 minutes, then 10, then 30 if it keeps failing. When its pause is
  over, one probe call tests it (half-open); the others keep using the backup until it answers. Models that failed
  more than half of their recent calls are tried after their backups. The state is in `ai_model_health`, shared by
  every Vercel instance.
- **Configurable models:** `GEMINI_MODEL_ANALYSIS`, `GEMINI_MODEL_SUMMARIES`, `GEMINI_FALLBACKS_ANALYSIS` and
  `GEMINI_FALLBACKS_SUMMARIES` change the main models and their backups without a code change. The defaults are in
  `packages/shared/src/models.ts`.
- **A second provider:** with `GEMINI_CROSS_PROVIDER=true` and both the Gemini API key and a Google Cloud project
  configured, the same models are tried through the other provider when every model is busy on the main one.
  Vertex AI with billing enabled (where Google Cloud credits apply) usually has more capacity than a free AI
  Studio key. The thinking settings and the backup chain work the same through both.
- **A queue, not an avalanche:** `JUDGE_CONCURRENCY` submissions (2) are judged at a time across all instances.
- **Automatic retries:** if judging fails only because every model was busy, it is tried again after about 2 and
  6 minutes, up to 3 attempts, before "Judge again" is needed.
- **Thinking:** minimal for summaries, medium for the map and the scores.

In the activity log, retries and model switches for one call are a single line, such as "Gemini 3.8 Flash was
busy, so Gemini 3.6 Flash answered instead", with each attempt and its error folded under "Details".

Model order: the Gemini models page lists `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite` and
`gemini-3.1-flash-lite` as Stable, so the default chain has no preview model. It also lists a newer Gemini 4 family
(`gemini-4-argon`, an efficient model) that has not been tried with SkillProof; it can be set as the main model with
`GEMINI_MODEL_ANALYSIS` to compare.

Not done yet: explicit context caching of the repository between the map and the score calls. The score call
already receives only the compact map, so the shared part is small.

### Interview

The API writes a question plan from the repository, with the points a real author would mention. Those
points never reach the browser. The browser receives a single-use token that is locked to the interviewer's
instructions, opens a live audio session with Gemini, and sends the transcript back when the interview ends.
A second model call compares the transcript with the plan and writes the report. Audio is not stored.


During the interview the room asks for full screen. Browsers do not let a page stop someone from leaving full
screen, switching tabs or windows, so SkillProof does not block it: it detects each time, hides the question until
the candidate comes back, and records when and for how long. The report shows it as a signal ("Left the interview
window 2 times, total 14 s"), never as a finding of cheating. "Next question" tells the interviewer to move on and
marks the skip in the transcript. Once the interview is completed, the candidate and the event's organizers see
the answer key ("What a strong answer covered") with the points the candidate made and missed; it is never sent
before, and public profiles do not show it.
## Known limits

- **Not yet tested against live services.** The unit tests, database checks, typecheck and build pass. No run
  has been made yet against a real Supabase project, the Gemini API or the GitHub API. The voice interview and
  the scoring of YouTube videos in particular need a first real run.
- The interview transcript is assembled in the browser, so a determined candidate could alter it. A server
  relay for the audio session would close this.
- Similarity flags cover shared repositories and shared fork parents. Comparing file contents or embeddings is
  not built yet.
- Only public GitHub repositories are supported.
- The Vercel setup has not been deployed yet. Background jobs on Vercel in particular need a first real run.
- Not built yet: sign in with GitHub, installable PWA.
- Organizer suite, judge workspace, similarity forensics and course mode have their data model and API
  (`20261117000004_screens`): members and invitations, usage, audit trail, judge assignments and reviews,
  integrity decisions, courses and rosters. Some of these screens still show sample data until they are wired
  to it. Only the data model exists for billing, invitation and result emails, and file-level similarity matches.
