import { supa } from "./supa.js";

export async function logAudit({ league_id, actor_id, action, target_table, target_id, details }) {
  try {
    await supa.from("audit_log").insert({
      league_id: league_id || null,
      actor_id: actor_id || null,
      action,
      target_table: target_table || null,
      target_id: target_id || null,
      details: details ? JSON.parse(JSON.stringify(details)) : null,
    });
  } catch (e) {
    console.error("audit_log insert failed", e?.message || e);
  }
}
