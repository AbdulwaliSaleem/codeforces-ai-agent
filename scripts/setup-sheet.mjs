import { ensureWorkbook, metadata } from "../tools/workbook.mjs";
import { syncReports } from "../tools/reports.mjs";

try {
    await ensureWorkbook();
    console.log(await syncReports());
    console.log("Sheet setup verified:", (await metadata()).map(s => s.properties.title).join(", "));
} catch (error) {
    console.error("Sheet setup failed:", error.message);
    process.exitCode = 1;
}
