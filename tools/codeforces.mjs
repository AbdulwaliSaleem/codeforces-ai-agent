import "dotenv/config";
import { codeforces, enrichTags } from "./codeforces-api.mjs";

export async function getNewSubmissions(lastId, api = codeforces) {
    if (!Number.isSafeInteger(lastId) || lastId <= 0) throw new Error("A valid saved submission baseline is required");
    const submissions = [];
    for (let from = 1; ; from += 500) {
        const page = await api("user.status", { handle: process.env.CODEFORCES_HANDLE, from, count: 500 });
        submissions.push(...page.filter(s => s.id > lastId));
        if (page.length < 500 || page.some(s => s.id <= lastId)) break;
    }
    return enrichTags([...new Map(submissions.map(s => [s.id, s])).values()].sort((a, b) => a.id - b.id), api);
}
