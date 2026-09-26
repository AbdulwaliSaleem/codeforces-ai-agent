import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url) {
    throw new Error("SUPABASE_URL missing");
}

if (!key) {
    throw new Error("SUPABASE_SECRET_KEY missing");
}

export const supabase = createClient(url, key, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

export async function getLastSubmissionId() {
    const { data, error } = await supabase
        .from("tracker_state")
        .select("last_submission_id")
        .eq("id", "codeforces")
        .single();

    if (error) throw error;

    return Number(data.last_submission_id);
}

export async function setLastSubmissionId(id) {
    const { error } = await supabase
        .from("tracker_state")
        .update({
            last_submission_id: id,
            updated_at: new Date().toISOString()
        })
        .eq("id", "codeforces");

    if (error) throw error;
}