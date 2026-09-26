import test from "node:test";
import assert from "node:assert/strict";
import { makeRow, pakistanDateTime, legacySubmission, monthlyReports, CONTEST_HEADERS } from "../tools/rows.mjs";
import { enrichTags } from "../tools/codeforces-api.mjs";
import { getNewSubmissions } from "../tools/codeforces.mjs";
import { createWorkflow } from "../tools/workflow.mjs";
import { contestRow, collectContests } from "../tools/contests.mjs";
import { removeFriendFeatureRequests } from "../tools/workbook-migration.mjs";

const submission = (id, verdict = "OK") => ({ id, creationTimeSeconds: Date.parse("2026-09-25T22:17:03Z") / 1000,
    problem: { contestId: 1578, index: "C", name: "Cactus Lady and her Cing", rating: 3500, tags: ["graphs"] },
    verdict, author: { participantType: "CONTESTANT" } });

test("Pakistan timestamp crosses the date boundary", () => {
    assert.deepEqual(pakistanDateTime(submission(1).creationTimeSeconds), { date: "2026-09-26", time: "03:17:03" });
    assert.equal(makeRow(submission(1, "COMPILATION_ERROR"))[7], "graphs");
    assert.equal(makeRow(submission(1))[1], "26 Sep 2026");
});
test("missing tags enriched regardless of verdict", async () => {
    const s = submission(1, "WRONG_ANSWER"); s.problem.tags = [];
    const [result] = await enrichTags([s], async () => ({ problems: [{ contestId: 1578, index: "C", tags: ["trees"] }] }));
    assert.deepEqual(result.problem.tags, ["trees"]);
    assert.equal(result.verdict, "WRONG_ANSWER");
});
test("pagination stops at baseline and imports only newer IDs", async () => {
    const calls = [];
    const result = await getNewSubmissions(100, async (method, args) => {
        calls.push(args.from);
        return args.from === 1 ? Array.from({ length: 500 }, (_, i) => submission(700 - i)) : [submission(200), submission(100), submission(99)];
    });
    assert.deepEqual(calls, [1, 501]); assert.equal(result.length, 501); assert.equal(result[0].id, 200);
    await assert.rejects(getNewSubmissions(0), /baseline/);
});
test("failed append never advances cursor; retry uses original data", async () => {
    const written = []; let fail = true; let cursor = 100;
    const workflow = createWorkflow({ getLastSubmissionId: async () => cursor, getNewSubmissions: async () => [submission(101)],
        appendSubmissions: async rows => { if (fail) throw new Error("Sheet failed"); written.push(...rows); return rows.length; },
        setLastSubmissionId: async id => { cursor = id; }, syncReports: async () => ({}) });
    await workflow.fetch(); await assert.rejects(workflow.commit(), /write/);
    await assert.rejects(workflow.append(), /Sheet failed/); assert.equal(cursor, 100);
    await assert.rejects(workflow.commit(), /write/);
    fail = false; await workflow.append(); await workflow.append(); await workflow.commit(); await workflow.report();
    assert.equal(cursor, 101); assert.equal(written.length, 1); assert.equal(written[0].problem.tags[0], "graphs"); assert.equal(workflow.complete, true);
});
test("zero submissions still refresh reports without writing cursor or submissions", async () => {
    const workflow = createWorkflow({ getLastSubmissionId: async () => 100, getNewSubmissions: async () => [],
        appendSubmissions: async () => assert.fail(), setLastSubmissionId: async () => assert.fail(), syncReports: async () => ({}) });
    await workflow.fetch(); assert.equal(workflow.nextTool, "syncContestReports"); await workflow.report(); assert.equal(workflow.complete, true);
});
test("monthly difficulty counts unique accepted problems; blanks excluded", () => {
    const a = makeRow(submission(101)); const b = makeRow(submission(102));
    const c = makeRow(submission(103)); c[4] = "1578D"; c[6] = "";
    const rejected = makeRow(submission(104, "WRONG_ANSWER")); rejected[6] = 800;
    const contest = [20, "Round", "2026-09-26", 1, "A", 100, 900, 920, 20, "Rated", "https://codeforces.com/contest/20"];
    const report = monthlyReports([a, a, b, c, rejected], [contest], submission(1).creationTimeSeconds, Date.parse("2026-10-01T00:00:00Z"))[0];
    assert.equal(report[1], "Complete"); assert.equal(report[2], 4); assert.equal(report[4], 2); assert.equal(report[5], 1);
    assert.equal(report[6], 3500); assert.equal(report[8], 100); assert.equal(report[9], 20);
});
test("legacy conversion splits time and preserves fields", () => {
    const old = [101, "2026-09-25T22:17:03.000Z", 1578, "1578C", "Cactus", 3500, "graphs, trees", "C++", "OK", 5, 8, 10, "", "url"];
    const row = makeRow(legacySubmission(old)); assert.equal(row[2], "03:17:03"); assert.equal(row[16], "C"); assert.equal(row[7], "graphs, trees");
    assert.equal(legacySubmission(["Submission ID", "Date"]), null);
});
const standings = {
    contest: { id: 20, name: "Round", type: "CF", phase: "FINISHED", startTimeSeconds: 200 }, problems: [{ index: "A" }, { index: "B" }],
    rows: [
        { party: { participantType: "CONTESTANT", members: [{ handle: "me" }] }, rank: 10, problemResults: [{ points: 100 }, { points: 0 }] },
        { party: { participantType: "CONTESTANT", members: [{ handle: "competitor" }] }, rank: 5, problemResults: [] },
        { party: { participantType: "CONTESTANT", members: [{ handle: "tied" }] }, rank: 10, problemResults: [] },
        { party: { participantType: "PRACTICE", members: [{ handle: "other" }] }, rank: 1, problemResults: [] }
    ]
};
test("contest row retains official rank, solved count, rating and URL", () => {
    const row = contestRow(standings, "ME", { oldRating: 1000, newRating: 980 });
    assert.equal(row.length, CONTEST_HEADERS.length);
    assert.equal(row[3], 1); assert.equal(row[5], 10); assert.equal(row[8], -20);
    assert.equal(row[9], "Rated"); assert.equal(row[10], "https://codeforces.com/contest/20");
});
test("IOI partial scores are not counted as solved", () => {
    const data = structuredClone(standings); data.contest.type = "IOI"; data.problems[0].points = 200;
    assert.equal(contestRow(data, "me", null)[3], 0);
});
test("old contests excluded even if rating is published after baseline", async () => {
    const result = await collectContests([], [], 300, async method => method === "user.rating"
        ? [{ contestId: 20, ratingUpdateTimeSeconds: 400 }] : standings);
    assert.deepEqual(result.rows, []);
});

const oldHeaders = [...CONTEST_HEADERS.slice(0, 9), "Rank among friends", "Friends competing (incl. you)", ...CONTEST_HEADERS.slice(9)];
const oldTabs = [{ properties: { title: "Contests", sheetId: 2 } }, { properties: { title: "Friends", sheetId: 4 } }, { properties: { title: "Submissions", sheetId: 1 } }];
test("migration removes only the retired columns and tab, retaining contest values", () => {
    const requests = removeFriendFeatureRequests(oldTabs, oldHeaders, ["Codeforces handle", "Validation"]);
    assert.deepEqual(requests, [
        { deleteDimension: { range: { sheetId: 2, dimension: "COLUMNS", startIndex: 9, endIndex: 11 } } },
        { deleteSheet: { sheetId: 4 } }
    ]);
    const oldRow = [20, "Round", "26 Sep 2026", 1, "A", 100, 900, 920, 20, 2, 5, "Rated", "https://codeforces.com/contest/20"];
    const migrated = [...oldRow];
    const range = requests[0].deleteDimension.range;
    migrated.splice(range.startIndex, range.endIndex - range.startIndex);
    assert.deepEqual(migrated.slice(0, 9), oldRow.slice(0, 9));
    assert.deepEqual(migrated.slice(9), oldRow.slice(11));
    const reports = monthlyReports([], [migrated], submission(1).creationTimeSeconds);
    assert.equal(reports[0][8], 100); assert.equal(reports[0][9], 20); assert.equal(reports[0][10], 1);
});
test("migration is a no-op for a new or already-migrated workbook", () => {
    assert.deepEqual(removeFriendFeatureRequests([], undefined, undefined), []);
    assert.deepEqual(removeFriendFeatureRequests(oldTabs.filter(s => s.properties.title !== "Friends"), CONTEST_HEADERS, undefined), []);
});
test("migration rejects unfamiliar tabs and reordered contest headers", () => {
    assert.throws(() => removeFriendFeatureRequests(oldTabs, oldHeaders, ["Personal notes"]), /unrecognized tab/);
    const reordered = [...oldHeaders]; [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    assert.throws(() => removeFriendFeatureRequests(oldTabs, reordered, ["Codeforces handle", "Validation"]), /refusing to remove columns/);
});
