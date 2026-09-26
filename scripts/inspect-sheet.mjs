import { metadata, readRows } from "../tools/workbook.mjs";
import { getLastSubmissionId } from "../db.mjs";
const deadline = setTimeout(() => { console.error("Read-only inspection timed out after 60 seconds"); process.exit(1); }, 60000);
try {
    const tabs = await metadata();
    console.log("Tabs:", JSON.stringify(tabs.map(s => s.properties.title)));
    for (const tab of tabs) {
        const rows = await readRows(tab.properties.title);
        console.log(JSON.stringify({ tab: tab.properties.title, rows: rows.length, headers: rows[0] }));
    }
    console.log("Saved cursor:", await getLastSubmissionId());
} catch (error) {
    console.error("Read-only inspection failed:", error.message);
    process.exitCode = 1;
} finally {
    clearTimeout(deadline);
}
