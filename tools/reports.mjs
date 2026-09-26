import { codeforces, enrichTags } from "./codeforces-api.mjs";
import { collectContests } from "./contests.mjs";
import { ensureWorkbook, readRows, replaceRows } from "./workbook.mjs";
import { SUBMISSION_HEADERS, CONTEST_HEADERS, REPORT_HEADERS, PENDING_VERDICTS, makeRow, monthlyReports } from "./rows.mjs";

async function refreshPending(rows) {
    const ids = new Set(rows.filter(row => PENDING_VERDICTS.has(row[9])).map(row => Number(row[0])));
    const updates = new Map();
    if (ids.size) {
        const oldest = Math.min(...ids);
        for (let from = 1; ; from += 500) {
            const page = await codeforces("user.status", { handle: process.env.CODEFORCES_HANDLE, from, count: 500 });
            const found = await enrichTags(page.filter(s => ids.has(s.id)));
            for (const s of found) updates.set(s.id, makeRow(s));
            if (page.length < 500 || page.some(s => s.id <= oldest)) break;
        }
    }
    let result = rows.map(row => updates.get(Number(row[0])) ?? row);
    const missingTags = result.filter(row => !row[7] || row[7] === "Not published by Codeforces");
    if (missingTags.length) {
        const enriched = await enrichTags(missingTags.map(row => ({ id: Number(row[0]), problem: { contestId: Number(row[3]), index: row[16], tags: [] } })));
        const byId = new Map(enriched.map(s => [s.id, s.problem]));
        result = result.map(row => {
            const p = byId.get(Number(row[0]));
            if (!p?.tags?.length) return row;
            const copy = [...row]; copy[7] = p.tags.join(", ");
            if (copy[6] === "" && p.rating != null) copy[6] = p.rating;
            return copy;
        });
    }
    return result;
}

export async function syncReports() {
    await ensureWorkbook();
    const settings = Object.fromEntries((await readRows("Tracker Settings")).slice(1));
    const startedAt = Number(settings.contest_tracking_started_at);
    if (!Number.isSafeInteger(startedAt) || startedAt <= 0) throw new Error("Contest tracking baseline is missing; refusing historical import");
    const friends = [...new Set((await readRows("Friends")).slice(1).map(row => String(row[0] ?? "").trim()).filter(Boolean))];
    const submissions = await refreshPending((await readRows("Submissions")).slice(1));
    await replaceRows("Submissions", [SUBMISSION_HEADERS, ...submissions]);
    const contests = await collectContests(submissions, (await readRows("Contests")).slice(1), startedAt, friends);
    await replaceRows("Contests", [CONTEST_HEADERS, ...contests.rows]);
    await replaceRows("Monthly Reports", [REPORT_HEADERS, ...monthlyReports(submissions, contests.rows, startedAt)]);
    if (contests.errors.length) throw new Error(contests.errors.join("; "));
    return { contests: contests.rows.length, monthlyReports: true, configuredFriends: friends.length };
}
