import "dotenv/config";

const handle = process.env.CODEFORCES_HANDLE;

if (!handle) {
    throw new Error("CODEFORCES_HANDLE is missing from .env");
}

async function main() {
    const url =
        `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=10`;

    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
    }

    const data = await res.json();

    if (data.status !== "OK") {
        throw new Error(data.comment || "Codeforces API failed");
    }

    console.log(`Latest submissions for ${handle}\n`);

    for (const s of data.result) {
        const p = s.problem;

        console.log("-------------------------");
        console.log(`Submission ID: ${s.id}`);
        console.log(`Problem: ${p.contestId ?? "?"}${p.index} - ${p.name}`);
        console.log(`Rating: ${p.rating ?? "Unrated"}`);
        console.log(`Tags: ${(p.tags ?? []).join(", ")}`);
        console.log(`Language: ${s.programmingLanguage}`);
        console.log(`Verdict: ${s.verdict ?? "TESTING"}`);
        console.log(`Time: ${s.timeConsumedMillis} ms`);
        console.log(`Memory: ${s.memoryConsumedBytes} bytes`);
    }
}

main().catch((err) => {
    console.error("ERROR:");
    console.error(err.message);
    process.exit(1);
});