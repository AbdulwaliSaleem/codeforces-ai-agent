import assert from "node:assert/strict";
import { metadata, readRows, batch } from "../tools/workbook.mjs";
import { removeFriendFeatureRequests } from "../tools/workbook-migration.mjs";
import { CONTEST_HEADERS } from "../tools/rows.mjs";
import { getLastSubmissionId } from "../db.mjs";

try {
    const before = await metadata();
    const cursor = await getLastSubmissionId();
    const preserved = new Map();
    for (const sheet of before) {
        const title = sheet.properties.title;
        if (title !== "Friends") preserved.set(title, await readRows(title));
    }
    const oldContests = preserved.get("Contests");
    const requests = removeFriendFeatureRequests(before, oldContests?.[0],
        before.some(s => s.properties.title === "Friends") ? (await readRows("Friends"))[0] : undefined);
    if (!process.argv.includes("--apply")) {
        console.log(JSON.stringify({ dryRun: true, wouldRemoveFriendsTab: requests.some(request => request.deleteSheet), wouldRemoveComparisonColumns: requests.some(request => request.deleteDimension), preservedTabs: [...preserved.keys()], cursorUnchanged: true }));
    } else {
        await batch(requests);
        const after = await metadata();
        assert.ok(!after.some(s => s.properties.title === "Friends"));
        const columnsRemoved = requests.some(request => request.deleteDimension);
        for (const [title, rows] of preserved) {
            const expected = title === "Contests" && columnsRemoved
                ? rows.map(row => { const next = [...row]; next.splice(9, 2); return next; }) : rows;
            assert.deepEqual(await readRows(title), expected, `${title} must retain all unrelated data`);
        }
        if (oldContests) assert.deepEqual((await readRows("Contests"))[0], CONTEST_HEADERS);
        assert.equal(await getLastSubmissionId(), cursor, "Submission cursor must not change");
        console.log(JSON.stringify({ removedFriendsTab: requests.some(request => request.deleteSheet), removedComparisonColumns: columnsRemoved, preservedTabs: [...preserved.keys()], cursorUnchanged: true }));
    }
} catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
}
