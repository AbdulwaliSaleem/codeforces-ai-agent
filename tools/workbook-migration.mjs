import { CONTEST_HEADERS } from "./rows.mjs";

// Recognize the exact retired schema before deleting its two columns or tab.
// Google applies the returned batch atomically; rerunning after success is a no-op.
export function removeFriendFeatureRequests(tabs, contestHeaders, friendHeaders) {
    const requests = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const contests = tabs.find(tab => tab.properties.title === "Contests");
    const friends = tabs.find(tab => tab.properties.title === "Friends");
    if (contests && !same(contestHeaders, CONTEST_HEADERS)) {
        const retired = [...CONTEST_HEADERS.slice(0, 9), "Rank among friends", "Friends competing (incl. you)", ...CONTEST_HEADERS.slice(9)];
        if (!same(contestHeaders, retired)) throw new Error("Unexpected Contests headers; refusing to remove columns");
        requests.push({ deleteDimension: { range: { sheetId: contests.properties.sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 11 } } });
    }
    if (friends) {
        if (!same(friendHeaders, ["Codeforces handle", "Validation"])) throw new Error("Unexpected Friends headers; refusing to remove an unrecognized tab");
        requests.push({ deleteSheet: { sheetId: friends.properties.sheetId } });
    }
    return requests;
}
