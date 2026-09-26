export const SUBMISSION_HEADERS = ["Submission ID", "Date (PKT)", "Time (PKT)", "Contest ID", "Problem ID", "Problem name", "Rating", "Tags", "Language", "Verdict", "Time (ms)", "Memory (bytes)", "Passed tests", "Points", "Problem URL", "Participant type", "Problem index", "Timestamp (UTC seconds)"];
export const CONTEST_HEADERS = ["Contest ID", "Contest", "Date (PKT)", "Problems solved", "Solved problems", "Rank", "Old rating", "New rating", "Rating change", "Rating status", "Contest URL"];
export const REPORT_HEADERS = ["Month", "Status", "Submissions", "Accepted submissions", "Unique problems solved", "Rated problems solved", "Average problem rating", "Contests", "Average contest rank", "Rating change", "Rated contests", "Coverage"];
export const PENDING_VERDICTS = new Set(["", "TESTING", "QUEUED"]);

export function pakistanDateTime(seconds) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(seconds * 1000)).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

export function displayDate(iso) {
    const [year, month, day] = iso.split("-");
    return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1]} ${year}`;
}

export function monthOfDate(value) {
    if (/^\d{4}-\d{2}/.test(String(value))) return String(value).slice(0, 7);
    const date = new Date(`${value} 00:00:00 GMT`);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid date in tracked sheet data");
    return date.toISOString().slice(0, 7);
}

export function makeRow(s) {
    const p = s.problem;
    const { date, time } = pakistanDateTime(s.creationTimeSeconds);
    return [s.id, displayDate(date), time, p.contestId ?? "", p.contestId ? `${p.contestId}${p.index}` : p.index,
        p.name ?? "", p.rating ?? "", p.tags?.length ? p.tags.join(", ") : "Not published by Codeforces",
        s.programmingLanguage ?? "", s.verdict ?? "TESTING", s.timeConsumedMillis ?? "",
        s.memoryConsumedBytes ?? "", s.passedTestCount ?? "", p.points ?? "",
        p.contestId ? `https://codeforces.com/contest/${p.contestId}/problem/${p.index}` : "",
        s.author?.participantType ?? "", p.index, s.creationTimeSeconds];
}

export function legacySubmission(row) {
    const seconds = Date.parse(row[1]) / 1000;
    if (!Number.isSafeInteger(Number(row[0])) || !Number.isFinite(seconds)) return null;
    const contestId = Number(row[2]) || undefined;
    const index = String(row[3]).replace(new RegExp(`^${contestId ?? ""}`), "");
    return { id: Number(row[0]), creationTimeSeconds: seconds,
        problem: { contestId, index, name: row[4], rating: row[5] === "" ? undefined : row[5],
            tags: String(row[6] ?? "").split(",").map(t => t.trim()).filter(Boolean), points: row[12] },
        programmingLanguage: row[7], verdict: row[8], timeConsumedMillis: row[9], memoryConsumedBytes: row[10], passedTestCount: row[11] };
}

export function monthlyReports(submissions, contests, startedAt, now = Date.now()) {
    const firstMonth = pakistanDateTime(startedAt).date.slice(0, 7);
    const currentMonth = pakistanDateTime(now / 1000).date.slice(0, 7);
    const months = new Map();
    const addMonth = key => {
        if (!months.has(key)) months.set(key, { submissions: [], contests: [] });
        return months.get(key);
    };
    for (let month = firstMonth; month <= currentMonth;) {
        addMonth(month);
        const next = new Date(`${month}-01T00:00:00Z`);
        next.setUTCMonth(next.getUTCMonth() + 1);
        month = next.toISOString().slice(0, 7);
    }
    const seen = new Set();
    for (const row of submissions) {
        if (seen.has(String(row[0]))) continue;
        seen.add(String(row[0]));
        addMonth(monthOfDate(row[1])).submissions.push(row);
    }
    for (const row of contests) addMonth(monthOfDate(row[2])).contests.push(row);
    const mean = values => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : "";
    return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => {
        const accepted = data.submissions.filter(row => row[9] === "OK");
        const unique = [...new Map(accepted.map(row => [`${row[3]}:${row[4]}`, row])).values()];
        const ratings = unique.map(row => row[6]).filter(x => x !== "" && x != null && Number.isFinite(Number(x))).map(Number);
        const ranked = data.contests.map(row => Number(row[5])).filter(x => x > 0);
        const rated = data.contests.filter(row => row[9] === "Rated");
        return [month, month === currentMonth ? "In progress" : "Complete", data.submissions.length, accepted.length,
            unique.length, ratings.length, mean(ratings), data.contests.length, mean(ranked),
            rated.reduce((sum, row) => sum + Number(row[8]), 0), rated.length,
            month <= firstMonth ? "Tracked data only; contest tracking starts " + pakistanDateTime(startedAt).date : "Tracked data only"];
    });
}
