import "dotenv/config";
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key:
            process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    },
    scopes: [
        "https://www.googleapis.com/auth/spreadsheets"
    ]
});

const sheets = google.sheets({
    version: "v4",
    auth
});

function makeRow(s) {
    const p = s.problem;

    const problem =
        p.contestId
            ? `${p.contestId}${p.index}`
            : p.index;

    const url =
        p.contestId
            ? `https://codeforces.com/contest/${p.contestId}/problem/${p.index}`
            : "";

    return [
        s.id,
        new Date(
            s.creationTimeSeconds * 1000
        ).toISOString(),
        p.contestId ?? "",
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

export async function appendSubmissions(submissions) {
    if (submissions.length === 0) {
        return 0;
    }

    await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: "Sheet1!A:N",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
            values: submissions.map(makeRow)
        }
    });

    return submissions.length;
}