# Codeforces AI Tracker

Daily Vercel Cron → Gemini ToolLoopAgent → Codeforces → Google Sheets → Supabase cursor.

## Spreadsheet

- **Submissions:** the original columns, with separate date and time in Pakistan time (`26 Sep 2026`, `03:17:03`). Verdict cells are green for `OK`, red for final failures, and yellow while judging. Tags are retained for every verdict and supplemented from the problem catalog. Unpublished tags are explicitly labelled and retried daily.
- **Contests:** completed official public contests, solved problem indices/count, official rank, old/new rating and change, and rank among configured friends who competed. Ties share a friend rank. Practice and virtual participation are excluded. IOI partial scores do not count as full solves.
- **Monthly Reports:** a running current-month report, completed months, unique accepted problems per month, mean difficulty of rated solved problems, mean official contest rank, and net published rating change. Duplicate submissions and repeated accepts of the same problem do not inflate unique solve counts. Unrated problems are excluded from the rating average; a blank average means no qualifying data. Weeks are not reported.
- **Friends:** handles supplied by the user, with validation status. Edit this tab to change the comparison group. Missing handles remain visible for correction and cannot match the standings.
- **Tracker Settings:** persists the contest tracking start timestamp. Do not reset it to import history.
- **Sheet1:** preserved original data. The new tabs copy only submissions already in this sheet, collapse repeated IDs, and continue merging any rows written by the old deployment during the transition. No older Codeforces submission history is imported.

Contest tracking starts when the new workbook tabs are first created. Only contests starting after that baseline are included. Official participation is discovered from new submissions or new rating records (including rated contests with zero submissions). An unrated contest with no submissions cannot be discovered with this workflow. Ratings may arrive later; pending results are revisited daily. Private contests and gym standings requiring authenticated Codeforces access are unsupported. Reports remain revisable when delayed results arrive, and the first month is explicitly marked as partial coverage.

Results update on the existing once-daily cron, not immediately after the contest. Monthly periods follow Asia/Karachi and appear in the sheet; no email delivery is configured.

## Run and verify

Use the existing environment variables listed in `AGENTS.md`. Never commit `.env` or service-account key files.

```sh
npm test
npm run sheet:inspect
npm run sheet:setup
node run-local.mjs
```

`npm test` uses isolated fixtures with no network or production writes. `sheet:inspect` reads sheet headers and the current cursor. `sheet:setup` creates and formats the tabs, validates friends, and refreshes reports without advancing the submission cursor. `run-local.mjs` performs a real sync, including writes; do not use it as a harmless test.

Submission data is held in per-run tool state; the model cannot reconstruct or drop fields. The tools enforce fetch → successful write → cursor update, and check existing submission IDs on retries. The cursor is never reset. API pagination avoids losing submissions beyond a fixed recent window. Existing pending verdicts are refreshed without appending historical submissions. Final already-recorded verdicts are not continually rechecked for later rejudges.

The existing daily cron should be the sole writer. A manual sync overlapping cron can still race because Google Sheets has no transactional uniqueness constraint; avoid concurrent runs. Keep Supabase and Sheets failure alerts visible. Changes must be committed and pushed to activate the updated daily code on Vercel.
