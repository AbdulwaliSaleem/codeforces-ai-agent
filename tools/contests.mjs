import { codeforces } from "./codeforces-api.mjs";
import { pakistanDateTime, displayDate } from "./rows.mjs";

export function contestRow(standings, handle, rating) {
    const belongsTo = (row, name) => row.party.members.some(m => m.handle.toLowerCase() === name.toLowerCase());
    const official = standings.rows.filter(row => row.party.participantType === "CONTESTANT");
    const mine = official.find(row => belongsTo(row, handle));
    if (!mine) return null;
    // IOI permits partial points; only full scores count as solved.
    const solved = mine.problemResults.flatMap((result, index) => {
        const problem = standings.problems[index];
        const full = standings.contest.type === "IOI"
            ? Number.isFinite(problem.points) && result.points >= problem.points && result.points > 0
            : result.points > 0;
        return full ? [problem.index] : [];
    });
    return [standings.contest.id, standings.contest.name, displayDate(pakistanDateTime(standings.contest.startTimeSeconds).date),
        solved.length, solved.join(", "), mine.rank, rating?.oldRating ?? "", rating?.newRating ?? "",
        rating ? rating.newRating - rating.oldRating : "",
        rating ? "Rated" : "Unrated / awaiting rating",
        `https://codeforces.com/contest/${standings.contest.id}`];
}

export async function collectContests(submissions, existing, startedAt, api = codeforces) {
    const handle = process.env.CODEFORCES_HANDLE;
    const ratings = await api("user.rating", { handle });
    const ratingMap = new Map(ratings.map(r => [r.contestId, r]));
    const candidates = new Set(existing.map(row => Number(row[0])));
    for (const row of submissions) {
        if (row[15] === "CONTESTANT" && Number(row[17]) >= startedAt && Number(row[3]) > 0) candidates.add(Number(row[3]));
    }
    // Rating history also finds rated contests with zero submitted problems.
    for (const rating of ratings) if (rating.ratingUpdateTimeSeconds >= startedAt) candidates.add(rating.contestId);
    const results = new Map(existing.map(row => [Number(row[0]), row]));
    const errors = [];
    for (const contestId of candidates) {
        try {
            // Public regular standings currently require exactly this parameter.
            const standings = await api("contest.standings", { contestId });
            if (standings.contest.startTimeSeconds < startedAt || standings.contest.phase !== "FINISHED") continue;
            const row = contestRow(standings, handle, ratingMap.get(contestId));
            if (row) results.set(contestId, row);
        } catch {
            // Preserve prior results and retry on the next daily run.
            errors.push(`Contest ${contestId} could not be refreshed`);
        }
    }
    return { rows: [...results.values()].sort((a, b) => Date.parse(a[2]) - Date.parse(b[2]) || a[0] - b[0]), errors };
}
