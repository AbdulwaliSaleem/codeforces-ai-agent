import "dotenv/config";
import { google } from "googleapis";

const spreadsheetId = process.env.SPREADSHEET_ID;
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is missing from .env");
}

if (!keyFile) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is missing from .env");
}

const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({
    version: "v4",
    auth,
});

async function main() {
    const result = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Sheet1!A:N",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
            values: [[
                "TEST-123",
                new Date().toISOString(),
                "Test",
                "TEST",
                "Google Sheets Connection Test",
                800,
                "test",
                "C++17",
                "OK",
                100,
                1000,
                1,
                0,
                "https://codeforces.com/"
            ]],
        },
    });

    console.log(
        `Success! ${result.data.updates?.updatedCells ?? 0} cells written.`
    );
}

main().catch((error) => {
    console.error("ERROR:");
    console.error(error.message);
    process.exit(1);
});