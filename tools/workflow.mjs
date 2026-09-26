// Per-run state keeps API data out of model-generated tool arguments.
export function createWorkflow({ getLastSubmissionId, getNewSubmissions, appendSubmissions, setLastSubmissionId, syncReports }) {
    let fetched;
    let written = false;
    let committed = false;
    let reported = false;
    let appended = 0;
    return {
        async fetch() {
            if (!fetched) {
                const baseline = await getLastSubmissionId();
                if (!Number.isSafeInteger(baseline) || baseline <= 0) throw new Error("Invalid saved baseline");
                const submissions = await getNewSubmissions(baseline);
                if (submissions.some(s => !Number.isSafeInteger(s.id) || s.id <= baseline)) throw new Error("Submission is outside the incremental window");
                fetched = { baseline, submissions };
            }
            return { count: fetched.submissions.length, lastSubmissionId: fetched.baseline };
        },
        async append() {
            if (!fetched) throw new Error("Fetch submissions first");
            if (!written) {
                appended = await appendSubmissions(fetched.submissions);
                written = true;
            }
            return { added: appended };
        },
        async commit() {
            if (!written) throw new Error("Spreadsheet write must succeed first");
            if (!committed && fetched.submissions.length) {
                await setLastSubmissionId(Math.max(...fetched.submissions.map(s => s.id)));
            }
            committed = true;
            return { success: true };
        },
        async report() {
            if (!fetched || (fetched.submissions.length && !committed)) throw new Error("Finish submission tracking first");
            const result = await syncReports();
            reported = true;
            return result;
        },
        get complete() { return Boolean(fetched && (!fetched.submissions.length || committed) && reported); },
        get nextTool() {
            if (!fetched) return "getNewSubmissions";
            if (fetched.submissions.length && !written) return "appendSubmissions";
            if (fetched.submissions.length && !committed) return "updateLastSubmissionId";
            if (!reported) return "syncContestReports";
            return null;
        }
    };
}
