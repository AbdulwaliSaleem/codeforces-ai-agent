import "dotenv/config";

import {
    ToolLoopAgent,
    tool
} from "ai";

import { google } from "@ai-sdk/google";
import { z } from "zod";

import {
    getNewSubmissions
} from "./tools/codeforces.mjs";

import {
    appendSubmissions
} from "./tools/sheets.mjs";

import {
    getLastSubmissionId,
    setLastSubmissionId
} from "./tools/state.mjs";
const tools = {
    getNewSubmissions: tool({
        description:
            "Get Codeforces submissions newer than the last processed submission ID.",

        inputSchema: z.object({}),

        execute: async () => {
            const lastId =
                await getLastSubmissionId();

            const submissions =
                await getNewSubmissions(lastId);

            return {
                lastSubmissionId: lastId,
                count: submissions.length,
                submissions
            };
        }
    }),

    appendSubmissions: tool({
        description:
            "Add Codeforces submissions to the Google Sheet.",

        inputSchema: z.object({
            submissions: z.array(z.any())
        }),

        execute: async ({ submissions }) => {
            const count =
                await appendSubmissions(submissions);

            return {
                added: count
            };
        }
    }),

    updateLastSubmissionId: tool({
        description:
            "Update the saved last Codeforces submission ID after submissions have successfully been added to the sheet.",

        inputSchema: z.object({
            submissionId: z.number()
        }),

        execute: async ({ submissionId }) => {
            await setLastSubmissionId(
                submissionId
            );

            return {
                success: true,
                submissionId
            };
        }
    })
};
const agent = new ToolLoopAgent({
    model: google("gemini-3.8-flash"),

    instructions: `
You are a Codeforces tracking agent.

Your job is to keep the user's Google Sheet synchronized
with their new Codeforces submissions.

Follow these rules:

1. First call getNewSubmissions.
2. If there are zero new submissions, stop.
3. If there are new submissions, add ALL of them using
   appendSubmissions.
4. Only after appendSubmissions succeeds, update the stored
   submission ID.
5. Set the stored ID to the highest submission ID that was
   successfully written.
6. Never update the ID before the spreadsheet write succeeds.
7. Never intentionally create duplicate rows.
`,

    tools
});
export async function runAgent() {
    const result = await agent.generate({
        prompt: `
Check my Codeforces account for new submissions
and synchronize them with my Google Sheet.
`
    });

    return result.text;
}