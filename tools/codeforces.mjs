import "dotenv/config";

export async function getNewSubmissions(lastId) {
    const handle = process.env.CODEFORCES_HANDLE;

    const url =
        `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=50`;

    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Codeforces HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.status !== "OK") {
        throw new Error(
            data.comment || "Codeforces API failed"
        );
    }

    return data.result
        .filter(s => s.id > lastId)
        .sort((a, b) => a.id - b.id);
}