import assert from "node:assert/strict";
import { metadata, readRows } from "../tools/workbook.mjs";
import { getLastSubmissionId } from "../db.mjs";
import { legacySubmission, makeRow, SUBMISSION_HEADERS, CONTEST_HEADERS } from "../tools/rows.mjs";

try {
    const tabs = await metadata();
    const original = tabs.some(s => s.properties.title === "Sheet1")
        ? (await readRows("Sheet1")).map(legacySubmission).filter(Boolean) : [];
    const rows = await readRows("Submissions");
    assert.deepEqual(rows[0], SUBMISSION_HEADERS);
    const ids = new Set(rows.slice(1).map(row => Number(row[0])));
    assert.equal(ids.size, rows.length - 1, "Submission IDs must be unique");
    for (const s of original) {
        const row = rows.find(row => Number(row[0]) === s.id);
        assert.ok(row, "Every original submission remains present");
        assert.deepEqual(row.slice(1, 3), makeRow(s).slice(1, 3));
        assert.ok(row[7], "Tags must not be blank");
    }
    const submissions = tabs.find(s => s.properties.title === "Submissions");
    assert.equal(submissions.properties.gridProperties.frozenRowCount, 1);
    assert.equal(submissions.conditionalFormats.length, 3);
    assert.ok(!tabs.some(s => s.properties.title === "Friends"), "Retired Friends tab must be absent");
    assert.deepEqual((await readRows("Contests"))[0], CONTEST_HEADERS);
    const monthly = await readRows("Monthly Reports");
    assert.ok(monthly.length >= 2, "Monthly report must exist");
    console.log(JSON.stringify({
        originalSubmissions: original.length, uniqueSubmissions: ids.size,
        sample: rows[1]?.slice(1, 10),
        monthlyReport: monthly[1], cursor: await getLastSubmissionId(),
        url: `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit#gid=${submissions.properties.sheetId}`
    }, null, 2));
} catch (error) {
    console.error("Verification failed:", error.message);
    process.exitCode = 1;
}
