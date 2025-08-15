import express from "express";
import { supa } from "../lib/supa.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { logAudit } from "../lib/audit.js";

export const resultsRouter = express.Router();

resultsRouter.put("/upsert", requireAdmin, async (req, res) => {
  const { match_id, league_id, home_score, away_score } = req.body || {};
  if (!match_id || home_score == null || away_score == null) {
    return res.status(400).json({ error: "match_id, home_score, away_score required" });
  }

  const { data: before } = await supa.from("results").select("*").eq("match_id", match_id).maybeSingle();

  const payload = { match_id, home_score, away_score, updated_at: new Date().toISOString() };
  if (league_id) payload.league_id = league_id;

  const { data, error } = await supa
    .from("results")
    .upsert(payload, { onConflict: "match_id" })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: "Failed to save result" });

  await logAudit({
    league_id: data?.league_id || league_id || null,
    actor_id: req.admin?.id || null,
    action: before ? "RESULTS_UPDATE" : "RESULTS_CREATE",
    target_table: "results",
    target_id: data?.id || null,
    details: { before: before || null, after: data, ip: req.ip, match_id }
  });

  return res.json({ ok: true, result: data });
});
