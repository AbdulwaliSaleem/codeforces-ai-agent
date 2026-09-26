import "dotenv/config";
import { ToolLoopAgent, tool } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getNewSubmissions } from "./tools/codeforces.mjs";
import { appendSubmissions } from "./tools/sheets.mjs";
import { getLastSubmissionId, setLastSubmissionId } from "./tools/state.mjs";
import { syncReports } from "./tools/reports.mjs";
import { createWorkflow } from "./tools/workflow.mjs";

export async function runAgent() {
    const workflow = createWorkflow({ getLastSubmissionId, getNewSubmissions, appendSubmissions, setLastSubmissionId, syncReports });
    const define = (description, execute) => tool({ description, inputSchema: z.object({}), execute });
    const agent = new ToolLoopAgent({
        model: google("gemini-3.8-flash"),
        instructions: `Synchronize the user's new Codeforces submissions, then update contest tracking and monthly reports.
First fetch new submissions. If any exist, append them and only then update the saved cursor.
Always sync contest reports, even without new submissions, because ratings can arrive later.
Submission data stays inside the tools. Never invent submissions or cursor values.`,
        tools: {
            getNewSubmissions: define("Read the saved baseline and fetch only newer submissions.", () => workflow.fetch()),
            appendSubmissions: define("Write the exact fetched submissions, preserving tags and avoiding existing IDs.", () => workflow.append()),
            updateLastSubmissionId: define("Advance to the newest successfully written submission ID.", () => workflow.commit()),
            syncContestReports: define("Refresh pending verdicts, contest results and monthly reports.", () => workflow.report())
        },
        prepareStep: () => workflow.nextTool
            ? { activeTools: [workflow.nextTool], toolChoice: { type: "tool", toolName: workflow.nextTool } }
            : { toolChoice: "none" }
    });
    const result = await agent.generate({ prompt: "Run the daily tracker and monthly reporting workflow." });
    if (!workflow.complete) throw new Error("Tracker workflow did not finish successfully");
    return result.text;
}
