import { runAgent } from "./agent.mjs";

runAgent()
    .then((text) => {
        console.log("\nAgent finished:");
        console.log(text);
    })
    .catch((err) => {
        console.error("AGENT ERROR:");
        console.error(err);
    });