# Codeforces AI Tracker

## Project Goal

Build and maintain an automated Codeforces tracking agent.

The system should:

1. Run automatically once per day in the cloud.
2. Check the user's Codeforces submissions.
3. Only process submissions newer than the last processed submission.
4. Add new submissions to a Google Sheet.
5. Store the latest processed submission ID in Supabase.
6. Use an LLM agent with tools to orchestrate the workflow.
7. Avoid duplicates.
8. Never import the user's older Codeforces history unless explicitly requested.

The project is already deployed and working.

## Current Release — 26 September 2026

Commit `7ff7e33` is deployed on production `main` and is present in the local project.
The spreadsheet now has `Submissions`, `Contests`, `Monthly Reports`, `Friends`,
and `Tracker Settings` tabs. `Sheet1` is retained as the original data copy.

The user selected monthly reports only. The Friends tab contains 68 verified
Codeforces handles; `Sahil Sarfraz` was normalized to `SahilSarfraz` using the API.
The live Friends tab is the source for future comparison changes.

The deployed feature changes were pushed directly to main with user approval.
A retrospective draft PR compares them against the pre-release commit for review;
its comparison base is not the production branch. Do not revert production or
force-push main to recreate a conventional feature PR.

---

## Current Architecture

The current production flow is:

Vercel Cron
→ /api/cron/codeforces
→ AI ToolLoopAgent
→ Codeforces API
→ Google Sheets API
→ Supabase state update

Detailed flow:

1. Vercel cron runs once per day.
2. The cron endpoint calls `runAgent()`.
3. The agent calls a tool that reads `last_submission_id` from Supabase.
4. The agent fetches recent Codeforces submissions.
5. It filters only submissions with an ID greater than the stored ID.
6. If there are no new submissions, it skips submission writes and cursor updates.
7. If there are new submissions, it writes all of them to Google Sheets.
8. Only after the spreadsheet write succeeds, it updates `last_submission_id` in Supabase.
9. The newest successfully written submission ID becomes the new cursor.
10. The agent then refreshes pending verdicts, missing tags, completed contest
    results, friend ranks, and monthly reports, even on days without new submissions.

Submission objects are kept in per-run tool state, not reconstructed from model
arguments. Tools enforce fetch → successful sheet write → cursor update. The agent
can only select the next permitted tool. Codeforces fetching is paginated.

---

## Important Behavior

These rules must always be preserved:

- Do not import old Codeforces history.
- Only track submissions after the stored baseline.
- Never update `last_submission_id` before the Google Sheets write succeeds.
- Never intentionally create duplicate rows.
- Keep the workflow idempotent where possible.
- If the Google Sheets write fails, Supabase state must not advance.
- If there are no new submissions, do not append submissions or advance the cursor;
  still refresh contest results and monthly reports as requested by the user.
- Codeforces submission IDs are used as the cursor for incremental tracking.

---

## Current Services

### Codeforces

Uses the public Codeforces API.

Current endpoint pattern:

`https://codeforces.com/api/user.status`

The project currently fetches recent submissions and filters them using the saved submission ID.

No Codeforces API secret is required for the current public-data workflow.

---

### Google Sheets

The spreadsheet is accessed using a Google service account.

The production deployment does not depend on a local JSON key file.

Google credentials are provided through environment variables.

The sheet currently stores Codeforces submission data such as:

- Submission ID
- Date/time
- Contest ID
- Problem ID
- Problem name
- Rating
- Tags
- Language
- Verdict
- Time consumed
- Memory consumed
- Passed tests
- Points
- Problem URL

The new Submissions tab preserves those fields, splits date/time into Pakistan
local columns, and adds hidden participant type, problem index, and UTC timestamp
metadata for contest tracking. Verdict cells are green for `OK`, red for final
failures, and yellow for pending judging. Tags do not depend on the verdict.

`tools/sheets.mjs` exports the append function from `tools/workbook.mjs`, which
handles authenticated API calls, formatting, tab creation, and duplicate ID checks.
`tools/rows.mjs` handles row conversion and monthly calculations.

---

### Supabase

Supabase stores persistent tracker state.

The main state is:

`last_submission_id`

Relevant files:

- `db.mjs`
- `tools/state.mjs`

The tracker must read the stored ID before checking Codeforces and update it only after a successful spreadsheet write.

---

### LLM / Agent

The agent uses the Vercel AI SDK.

The current pattern is:

`ToolLoopAgent`

The current provider is Google Gemini through:

`@ai-sdk/google`

The current model is:

`gemini-3.8-flash`

The agent has tools for:

- fetching new Codeforces submissions
- appending submissions to Google Sheets
- updating the saved submission ID
- refreshing contest results and monthly reports

The main agent file is:

`agent.mjs`

The reusable entry point is:

`runAgent()`

---

### Vercel

The project is deployed on Vercel.

A Vercel Cron Job runs once per day.

The cron endpoint is:

`/api/cron/codeforces`

The cron endpoint is protected using:

`CRON_SECRET`

The production deployment is connected to GitHub.

Pushing changes to the production branch should trigger a new Vercel deployment.

Relevant files:

- `api/cron/codeforces.mjs`
- `vercel.json`

---

## Environment Variables

The application expects these environment variables:

- `CODEFORCES_HANDLE`
- `SPREADSHEET_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `CRON_SECRET`

Never:

- print secret values
- log secret values
- commit secret values
- hardcode secret values
- copy secrets into documentation

Do not add `.env` to Git.

Do not add `google-service-account.json` to Git.

---

## Repository Files

### `agent.mjs`

Contains:

- AI ToolLoopAgent
- tool definitions
- agent instructions
- reusable `runAgent()` function

### `tools/codeforces.mjs`

Handles:

- fetching Codeforces submissions
- filtering submissions newer than the saved cursor

### `tools/sheets.mjs`

Re-exports the append function from `tools/workbook.mjs`.

### `tools/workbook.mjs`

Handles Google authentication, spreadsheet formatting, tab creation, writes,
existing-ID checks, and migration of rows already in Sheet1. Sheet1 remains intact.
During the deployment transition, rows written by the old version are merged into
Submissions without fetching older history.

### `tools/rows.mjs`

Converts timestamps to Asia/Karachi, defines columns, converts existing rows, and
calculates monthly summaries from tracked data.

### `tools/codeforces-api.mjs`

Serializes public API calls and supplements missing tags from the problem catalog.

### `tools/workflow.mjs`

Keeps per-run submission data and enforces write-before-cursor ordering.

### `tools/contests.mjs` and `tools/reports.mjs`

Collect completed official contest results and friend ranks, refresh pending
verdicts and missing tags, and update monthly reports. Contest tracking uses the
start timestamp stored in Tracker Settings and does not import older contests.

### `tracker-config.mjs`

Seeds the user-supplied friend handles when the Friends tab is first created.
After creation, the live Friends tab controls comparisons.

### `scripts/` and `tests/`

- `npm test`: isolated fixture tests; no production writes or network calls.
- `npm run sheet:inspect`: read-only sheet and cursor inspection.
- `npm run sheet:setup`: creates/formats tabs, validates friends, refreshes reports;
  does not advance the submission cursor.
- `node scripts/verify-sheet.mjs`: read-only checks of migration, unique IDs,
  dates, tags, conditional formatting, friends, monthly report, and cursor.
- `node run-local.mjs`: a real agent run that can write submissions and state.

### `tools/state.mjs`

Exports the Supabase state functions.

### `db.mjs`

Handles:

- Supabase client
- reading `last_submission_id`
- updating `last_submission_id`

### `api/cron/codeforces.mjs`

Vercel cron endpoint.

Responsibilities:

- validate `CRON_SECRET`
- call `runAgent()`
- return a success/error response

### `vercel.json`

Contains the once-per-day Vercel cron configuration.

### `run-local.mjs`

Local manual runner for testing the agent.

---

## Current Production Status

The complete workflow has been tested successfully.

The system can currently:

- fetch new Codeforces submissions
- detect only submissions newer than the saved cursor
- add them to Google Sheets
- update Supabase state
- run the AI agent successfully
- run from a Vercel deployment
- execute through the cron endpoint

A manual cloud test of the original workflow succeeded before this release.
For the new release, Vercel deployment succeeded, all 10 local tests passed, and
live sheet setup and read-only verification succeeded. The full updated local
agent run was blocked by Gemini's free-tier request quota; do not claim it passed.

---

## Spreadsheet Format and Known Limitations

Submissions display separate Pakistan date and time columns, for example
`26 Sep 2026` and `03:17:03`, using `Asia/Karachi` (UTC+05:00).

Tags are retained for every verdict and filled from the Codeforces catalog where
possible. If no tags are published, use `Not published by Codeforces` and retry
later. Problem 1578C had no topic tags in either the API or official problem page
when checked; never invent tags to fill the cell.

Contests records solved problems, official rank, old/new rating, rating change,
and rank among configured friends who participated. Ties share a friend rank.
Only completed official public contests starting after the persisted contest
baseline are included. Results update daily, and delayed rating changes are
rechecked. Practice/virtual entries and private/gym standings requiring API
authentication are not supported. An unrated contest with no submissions cannot
be discovered by the current workflow.

Monthly Reports counts unique accepted problems per month, averages ratings only
over rated solved problems, averages official contest ranks, and totals published
rating changes. Empty averages mean no qualifying data. The current month remains
in progress, and the first month identifies partial coverage. Reports live in the
sheet; there is no email delivery or weekly report.

The original Sheet1 is preserved; its repeated submission IDs are collapsed in
the new tab. Final verdicts are not continually refreshed for later rejudges.
Use the daily cron as the sole writer: overlapping manual runs can still race
because Google Sheets has no transactional unique-ID constraint.

---

## Follow-up Work

The requested sheet layout, contest tracking, friend comparisons, and monthly
reports have been implemented. Future work should follow new user requests.
If verifying the complete agent again, first account for the Gemini quota
limitation. Do not change the model/provider or billing configuration without
the user's instruction.

---

## Development Rules

When making changes:

1. Inspect the repository before editing.
2. Preserve the working production architecture unless a change is necessary.
3. Prefer small, focused changes.
4. Test locally or with available tooling where practical.
5. Do not expose secrets.
6. Do not edit `.env`.
7. Do not create or commit service-account JSON files.
8. Do not commit `node_modules`.
9. Do not reset the Supabase cursor unless explicitly requested.
10. Do not import historical submissions unless explicitly requested.
11. Keep the existing Google Sheets + Supabase + Vercel architecture unless the user asks to change it.
12. If changing data format, ensure existing state tracking still works correctly.

---

## Git and Deployment

The repository is connected to Vercel.

Normal workflow:

1. modify code
2. test
3. commit
4. push
5. Vercel redeploys automatically

Before committing:

- verify `.env` is ignored
- verify `node_modules/` is ignored
- verify `google-service-account.json` is ignored

---

## User Preference for Future Work

The user does not want to manually edit code anymore.

When possible:

- inspect the repo yourself
- make the code changes yourself
- test the changes yourself
- explain what changed
- commit/push when the user asks for the change to be shipped

Avoid giving the user long manual code-editing instructions unless manual action is actually required, such as entering credentials into Vercel or another external service.

---

## First Task When Starting a New Codex Session

Before making changes:

1. Read this `AGENTS.md`.
2. Inspect the repository structure.
3. Inspect the relevant files.
4. Summarize the current architecture briefly.
5. Preserve all existing production behavior.
6. Then work on the user's requested change.

Use the current-release section and README.md for the implemented spreadsheet
behavior. Do not repeat the migration or import historical submissions to test it.
