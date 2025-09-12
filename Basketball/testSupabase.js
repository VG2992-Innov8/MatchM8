// testSupabase.js
import fetch from "node-fetch";

const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const service = process.env.SUPABASE_SERVICE;   // <-- service_role (server-only)
const anon = process.env.SUPABASE_KEY;         // optional fallback
const key = service || anon;

console.log("Base URL:", base);
console.log("Have service key?", !!service, "| Have anon key?", !!anon);

async function run() {
  try {
    const url = `${base}/rest/v1/matches?select=id,match_no,home,away&limit=5`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    console.log("HTTP status:", res.status);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log("Body (JSON):", json);
    } catch {
      console.log("Body (text):", text);
    }
  } catch (e) {
    console.error("Fetch error:", e);
  }
}

run();
