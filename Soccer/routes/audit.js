import express from "express";
import { supa } from "../lib/supa.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const auditRouter = express.Router();

function applyAuditFilters(q, params = {}) {
  const {
    league_id, action, actor_id, target_table,
    date_from, date_to, q: search,
  } = params;

  if (league_id) q = q.eq("league_id", league_id);
  if (action) q = q.eq("action", action);
  if (actor_id) q = q.eq("actor_id", actor_id);
  if (target_table) q = q.eq("target_table", target_table);
  if (date_from) q = q.gte("created_at", new Date(date_from).toISOString());
  if (date_to) q = q.lte("created_at", new Date(date_to).toISOString());
  if (search) {
    q = q.or(`action.ilike.%${search}%,target_table.ilike.%${search}%`);
  }
  return q;
}

auditRouter.get("/", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.page_size || "50", 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supa
    .from("audit_log")
    .select("id,league_id,actor_id,action,target_table,target_id,details,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  query = applyAuditFilters(query, req.query);

  const { data, error, count } = await query.range(from, to);
  if (error) return res.status(500).json({ error: error.message || "Failed to fetch audit log" });

  res.json({
    ok: true,
    page,
    page_size: pageSize,
    total: count || 0,
    rows: data || [],
  });
});

auditRouter.get("/actions", requireAdmin, async (_req, res) => {
  const { data, error } = await supa
    .from("audit_log")
    .select("action")
    .not("action", "is", null)
    .order("action", { ascending: true })
    .limit(1000);
  if (error) return res.status(500).json({ error: "Failed to fetch actions" });

  const dedup = Array.from(new Set((data || []).map(r => r.action))).sort();
  res.json({ ok: true, actions: dedup });
});

auditRouter.get("/export", requireAdmin, async (req, res) => {
  let query = supa
    .from("audit_log")
    .select("id,league_id,actor_id,action,target_table,target_id,details,created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(5000);

  query = applyAuditFilters(query, req.query);

  const { data, error } = await query;
  if (error) return res.status(500).send("Failed to export audit log");

  const rows = (data || []).map(r => {
    const d = r.details || {};
    return {
      created_at: r.created_at,
      action: r.action || "",
      league_id: r.league_id || "",
      actor_id: r.actor_id || "",
      target_table: r.target_table || "",
      target_id: r.target_id || "",
      ip: d.ip || "",
      match_id: d.match_id || "",
      before: d.before ? JSON.stringify(d.before) : "",
      after: d.after ? JSON.stringify(d.after) : "",
    };
  });

  const headers = Object.keys(rows[0] || {
    created_at: "", action: "", league_id: "", actor_id: "",
    target_table: "", target_id: "", ip: "", match_id: "",
    before: "", after: ""
  });

  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => esc(r[h])).join(",")),
  ].join("\n");

  const today = new Date().toISOString().slice(0,10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="audit_log_${today}.csv"`);
  res.send(csv);
});
