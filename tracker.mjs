import {
    getLastSubmissionId,
    setLastSubmissionId
} from "./db.mjs";

import "dotenv/config";
import fs from "fs";
import { google } from "googleapis";

const handle = process.env.CODEFORCES_HANDLE;
const spreadsheetId = process.env.SPREADSHEET_ID;
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// let lastId = Number(process.env.LAST_SUBMISSION_ID);

if (!handle) throw new Error("CODEFORCES_HANDLE missing");
if (!spreadsheetId) throw new Error("SPREADSHEET_ID missing");
if (!keyFile) throw new Error("GOOGLE_APPLICATION_CREDENTIALS missing");
// if (!lastId) throw new Error("LAST_SUBMISSION_ID missing");

const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({
    version: "v4",
    auth,
});

async function getSubmissions() {
    const url =
        `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=50`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK") {
        throw new Error(data.comment || "Codeforces API failed");
    }

    return data.result;
}

function getNewSubmissions(submissions, lastId) {
    return submissions
        .filter(s => s.id > lastId)
        .sort((a, b) => a.id - b.id);
}

function makeRow(s) {
    const p = s.problem;

    const date = new Date(
        s.creationTimeSeconds * 1000
    ).toISOString();

    const contest = p.contestId ?? "";

    const problem = p.contestId
        ? `${p.contestId}${p.index}`
        : p.index;

    const url = p.contestId
        ? `https://codeforces.com/contest/${p.contestId}/problem/${p.index}`
        : "";

    return [
        s.id,
        date,
        contest,
        problem,
        p.name ?? "",
        p.rating ?? "",
        (p.tags ?? []).join(", "),
        s.programmingLanguage ?? "",
        s.verdict ?? "TESTING",
        s.timeConsumedMillis ?? "",
        s.memoryConsumedBytes ?? "",
        s.passedTestCount ?? "",
        p.points ?? "",
        url
    ];
}

async function appendRows(submissions) {
    if (submissions.length === 0) return;

    const rows = submissions.map(makeRow);

    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Sheet1!A:N",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
            values: rows
        }
    });
}

async function main() {
    console.log(`Checking Codeforces for ${handle}...`);

    const lastId = await getLastSubmissionId();

    console.log(`Last processed submission: ${lastId}`);

    const submissions = await getSubmissions();

    const newSubmissions =
        getNewSubmissions(submissions, lastId);

    if (newSubmissions.length === 0) {
        console.log("No new submissions.");
        return;
    }

    console.log(
        `Found ${newSubmissions.length} new submission(s).`
    );

    for (const s of newSubmissions) {
        console.log(
            `NEW: ${s.id} - ${s.problem.name}`
        );
    }

    await appendRows(newSubmissions);

    const newestId =
        newSubmissions[newSubmissions.length - 1].id;

    await setLastSubmissionId(newestId);

    console.log(
        `${newSubmissions.length} submission(s) added to Google Sheets.`
    );

    console.log(
        `Updated last submission ID to: ${newestId}`
    );
}

main().catch((err) => {
    console.error("ERROR:");
    console.error(err);
});