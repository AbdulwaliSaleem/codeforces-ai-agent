import { ensureWorkbook, readRows, replaceRows, metadata } from "../tools/workbook.mjs";
import { syncReports } from "../tools/reports.mjs";
import { codeforces } from "../tools/codeforces-api.mjs";

async function validateFriends() {
    const rows = (await readRows("Friends")).slice(1);
    const pending = rows.map(row => String(row[0]));
    const invalid = new Set();
    let valid = new Set();
    const canonical = new Map();
    while (pending.length) {
        try {
            const users = await codeforces("user.info", { handles: pending.join(";"), checkHistoricHandles: false });
            valid = new Set(users.map(user => user.handle.toLowerCase()));
            users.forEach((user, index) => canonical.set(pending[index], user.handle));
            break;
        } catch (error) {
            const bad = pending.find(handle => error.message.includes(`User with handle ${handle} not found`));
            if (!bad) throw error;
            invalid.add(bad); pending.splice(pending.indexOf(bad), 1);
        }
    }
    await replaceRows("Friends", [["Codeforces handle", "Validation"], ...rows.map(row => [canonical.get(String(row[0])) ?? row[0], canonical.has(String(row[0])) ? "Verified" : "Handle not found — check spelling"])]);
    console.log(JSON.stringify({ verifiedFriends: valid.size, unrecognizedHandles: [...invalid] }));
}

try {
    await ensureWorkbook();
    await validateFriends();
    console.log(await syncReports());
    console.log("Sheet setup verified:", (await metadata()).map(s => s.properties.title).join(", "));
} catch (error) {
    console.error("Sheet setup failed:", error.message);
    process.exitCode = 1;
}
