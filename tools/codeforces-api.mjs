import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";

let lastRequest = 0;
let queue = Promise.resolve();

// Serialize calls to respect the public API rate limit.
export function codeforces(method, params = {}) {
    const task = queue.then(async () => {
        await delay(Math.max(0, 2100 - (Date.now() - lastRequest)));
        lastRequest = Date.now();
        const url = new URL(`https://codeforces.com/api/${method}`);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(`Codeforces ${method}: HTTP ${response.status}`);
        const data = await response.json();
        if (data.status !== "OK") throw new Error(`Codeforces ${method}: ${data.comment || "failed"}`);
        return data.result;
    });
    queue = task.catch(() => {});
    return task;
}

export function problemKey(problem) {
    return `${problem.contestId ?? problem.problemsetName ?? ""}:${problem.index}`;
}

export async function enrichTags(submissions, api = codeforces) {
    if (!submissions.some(s => !s.problem.tags?.length)) return submissions;
    const catalog = await api("problemset.problems");
    const problems = new Map(catalog.problems.map(p => [problemKey(p), p]));
    return submissions.map(s => {
        const fallback = problems.get(problemKey(s.problem));
        return { ...s, problem: { ...s.problem,
            tags: s.problem.tags?.length ? s.problem.tags : fallback?.tags ?? [],
            rating: s.problem.rating ?? fallback?.rating
        } };
    });
}
