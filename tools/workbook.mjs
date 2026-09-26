import "dotenv/config";
import { google } from "googleapis";
import { enrichTags } from "./codeforces-api.mjs";
import { SUBMISSION_HEADERS, CONTEST_HEADERS, REPORT_HEADERS, legacySubmission, makeRow } from "./rows.mjs";
import { friendHandles } from "../tracker-config.mjs";

const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
const sheets = google.sheets({ version: "v4", auth });
google.options({ timeout: 30000, retry: false });
const spreadsheetId = process.env.SPREADSHEET_ID;
const titles = { Submissions: SUBMISSION_HEADERS, Contests: CONTEST_HEADERS, "Monthly Reports": REPORT_HEADERS, Friends: ["Codeforces handle", "Validation"], "Tracker Settings": ["Setting", "Value"] };
export async function metadata() {
    return (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties,conditionalFormats)" })).data.sheets;
}
export async function readRows(title) {
    return (await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${title}'!A:R`, valueRenderOption: "UNFORMATTED_VALUE" })).data.values ?? [];
}
export async function batch(requests) {
    if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}
const cell = value => ({ userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: String(value ?? "") } });
export function cellsRequest(sheetId, rows, startRowIndex = 0) {
    return { updateCells: { start: { sheetId, rowIndex: startRowIndex, columnIndex: 0 }, rows: rows.map(row => ({ values: row.map(cell) })), fields: "userEnteredValue" } };
}
export async function replaceRows(title, rows) {
    const current = await readRows(title);
    const normalized = data => data.map(row => {
        const copy = [...row];
        while (copy.at(-1) === "") copy.pop();
        return copy;
    });
    if (JSON.stringify(normalized(current)) === JSON.stringify(normalized(rows))) return;
    const sheet = (await metadata()).find(s => s.properties.title === title).properties;
    const requests = [];
    if (rows.length > sheet.gridProperties.rowCount) requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: "ROWS", length: rows.length - sheet.gridProperties.rowCount } });
    requests.push({ updateCells: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: Math.max(current.length, rows.length), startColumnIndex: 0, endColumnIndex: titles[title].length }, rows: rows.map(row => ({ values: row.map(cell) })), fields: "userEnteredValue" } });
    await batch(requests);
}

function style(sheetId, title, headers) {
    const range = { sheetId, startColumnIndex: 0, endColumnIndex: headers.length };
    const requests = [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: title === "Submissions" ? 1 : 0, hideGridlines: true } }, fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.hideGridlines" } },
        { repeatCell: { range, cell: { userEnteredFormat: { textFormat: { fontFamily: "Arial", fontSize: 10 }, verticalAlignment: "MIDDLE", wrapStrategy: "CLIP" } }, fields: "userEnteredFormat" } },
        { repeatCell: { range: { ...range, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.12, green: 0.2, blue: 0.3 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: headers.length }, properties: { pixelSize: 145 }, fields: "pixelSize" } },
        { setBasicFilter: { filter: { range } } }
    ];
    requests.push({ addBanding: { bandedRange: { range: { ...range, startRowIndex: 1 }, rowProperties: { firstBandColor: { red: 1, green: 1, blue: 1 }, secondBandColor: { red: 0.95, green: 0.97, blue: 0.99 } } } } });
    const width = (startIndex, pixelSize) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex, endIndex: startIndex + 1 }, properties: { pixelSize }, fields: "pixelSize" } });
    if (title === "Submissions") {
        width(5, 280); width(7, 330); width(8, 190); width(9, 225); width(14, 340);
        requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 15, endIndex: 18 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } });
        for (const [formula, color] of [
            ['=$J2="OK"', { red: 0.72, green: 0.9, blue: 0.76 }],
            ['=AND($J2<>"",$J2<>"OK",$J2<>"TESTING",$J2<>"QUEUED")', { red: 1, green: 0.76, blue: 0.76 }],
            ['=OR($J2="TESTING",$J2="QUEUED")', { red: 1, green: 0.92, blue: 0.65 }]
        ]) requests.push({ addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 9, endColumnIndex: 10 }], booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] }, format: { backgroundColor: color } } } } });
    } else if (title === "Contests") { width(1, 320); width(4, 240); width(12, 340); }
    else if (title === "Monthly Reports") width(11, 460);
    else if (title === "Friends") { width(0, 280); width(1, 330); }
    return requests;
}

// New tabs are created atomically; Sheet1 remains an untouched original copy.
export async function ensureWorkbook() {
    const existing = await metadata();
    const names = new Set(existing.map(s => s.properties.title));
    for (const [title, headers] of Object.entries(titles)) {
        if (!names.has(title)) continue;
        const actual = (await readRows(title))[0];
        if (JSON.stringify(actual) !== JSON.stringify(headers)) throw new Error(`Unexpected headers in ${title}; refusing to overwrite an existing tab`);
    }
    let migrated = [];
    if (!names.has("Submissions") && names.has("Sheet1")) {
        const legacy = (await readRows("Sheet1")).map(legacySubmission).filter(Boolean);
        migrated = (await enrichTags([...new Map(legacy.map(s => [s.id, s])).values()])).map(makeRow);
    }
    let nextId = Math.max(0, ...existing.map(s => s.properties.sheetId)) + 1;
    const requests = [];
    for (const [title, headers] of Object.entries(titles)) {
        if (names.has(title)) continue;
        const sheetId = nextId++;
        requests.push({ addSheet: { properties: { sheetId, title, gridProperties: { rowCount: Math.max(1000, migrated.length + 1), columnCount: Math.max(18, headers.length) } } } });
        let rows = [headers];
        if (title === "Submissions") rows.push(...migrated);
        if (title === "Friends") rows.push(...friendHandles.map(handle => [handle, "Not checked"]));
        if (title === "Tracker Settings") rows.push(["contest_tracking_started_at", Math.floor(Date.now() / 1000)]);
        requests.push(cellsRequest(sheetId, rows), ...style(sheetId, title, headers));
    }
    await batch(requests);
    // The previous deployment can still write Sheet1 until this version ships.
    // Merge only rows already in that sheet so the switch cannot lose them.
    if (names.has("Submissions") && names.has("Sheet1")) {
        const current = await readRows("Submissions");
        const ids = new Set(current.slice(1).map(row => String(row[0])));
        const legacy = (await readRows("Sheet1")).map(legacySubmission).filter(s => s && !ids.has(String(s.id)));
        const missing = [...new Map(legacy.map(s => [s.id, s])).values()];
        if (missing.length) {
            const rows = (await enrichTags(missing)).map(makeRow);
            await replaceRows("Submissions", [current[0], ...[...current.slice(1), ...rows].sort((a, b) => Number(a[0]) - Number(b[0]))]);
        }
    }
}

export async function appendSubmissionRows(submissions) {
    if (!submissions.length) return 0;
    await ensureWorkbook();
    const rows = await readRows("Submissions");
    const ids = new Set(rows.slice(1).map(row => String(row[0])));
    const added = [];
    for (const submission of submissions) {
        if (ids.has(String(submission.id))) continue;
        ids.add(String(submission.id));
        added.push(makeRow(submission));
    }
    if (added.length) await sheets.spreadsheets.values.append({ spreadsheetId, range: "'Submissions'!A:R", valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: added } });
    return added.length;
}
