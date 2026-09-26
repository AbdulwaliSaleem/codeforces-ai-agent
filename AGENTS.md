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
6. If there are no new submissions, it stops.
7. If there are new submissions, it writes all of them to Google Sheets.
8. Only after the spreadsheet write succeeds, it updates `last_submission_id` in Supabase.
9. The newest successfully written submission ID becomes the new cursor.

---

## Important Behavior

These rules must always be preserved:

- Do not import old Codeforces history.
- Only track submissions after the stored baseline.
- Never update `last_submission_id` before the Google Sheets write succeeds.
- Never intentionally create duplicate rows.
- Keep the workflow idempotent where possible.
- If the Google Sheets write fails, Supabase state must not advance.
- If there are no new submissions, do nothing except return success.
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

The current sheet-writing logic is mainly in:

`tools/sheets.mjs`

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

Handles:

- Google Sheets authentication
- converting a Codeforces submission into a spreadsheet row
- appending rows to the sheet

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

A manual cloud test has already succeeded.

---

## Known Issue

The timestamp written to Google Sheets currently uses UTC.

Example format:

`2026-09-26T07:57:31.000Z`

The user's preferred timezone is Pakistan Standard Time.

Timezone:

`Asia/Karachi`

UTC offset:

`UTC+05:00`

Future spreadsheet changes should use Pakistan local time unless the user explicitly requests another timezone.

Do not assume the final display format yet. Ask or follow the user's requested sheet format.

---

## Next Planned Work

The next work is mainly improving the spreadsheet.

The user wants to specify the exact Google Sheet layout and formatting.

Potential changes may include:

- Pakistan local date/time
- separate date and time columns
- custom date formatting
- removing unnecessary columns
- adding new columns
- sorting
- styling
- conditional formatting
- accepted-only views
- dashboards
- summary statistics

Do not implement layout assumptions before reading the user's requested format.

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

The current expected next task is likely related to improving the Google Sheet layout and converting timestamps to Pakistan local time.