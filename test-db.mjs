import {
    getLastSubmissionId
} from "./db.mjs";

const id = await getLastSubmissionId();

console.log("Stored submission ID:", id);