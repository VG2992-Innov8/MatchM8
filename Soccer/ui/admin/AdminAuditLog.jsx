// /ui/admin/AdminAuditLog.jsx
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;

function qs(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  });
  return `?${search.toString()}`;
}

function JsonPreview({ obj }) {
  const [open, setOpen] = useState(false);
  if (!obj) return null;
  return (
    <div className="mt-1">
      <button
        className="text-blue-600 hover:underline"
        onClick={() => setOpen(o => !o)}
      >
        {open ? "Hide details" : "Show details"}
      </button>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
{JSON.stringify(obj, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AdminAuditLog({ leagueId, adminToken }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // filters
  const [action, setAction] = useState("");
  const [actions, setActions] = useState([]);
  const [targetTable, setTargetTable] = useState("");
  const [actorId, setActorId] = useState("");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // load action list once
  useEffect(() => {
    fetch("/audit/actions", { headers: { "x-admin-token": adminToken } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => setActions(j.actions || []))
      .catch(() => setActions([]));
  }, [adminToken]);

  const params = useMemo(() => ({
    league_id: leagueId || "",
    action,
    target_table: targetTable,
    actor_id: actorId,
    q,
    date_from: dateFrom,
    date_to: dateTo,
    page,
    page_size: PAGE_SIZE,
  }), [leagueId, action, targetTable, actorId, q, dateFrom, dateTo, page]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/audit${qs(params)}`, {
        headers: { "x-admin-token": adminToken }
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed");
      setRows(j.rows || []);
      setTotal(j.total || 0);
    } catch (e) {
      console.error(e);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params.action, params.target_table, params.actor_id, params.q, params.date_from, params.date_to, params.page]);

  function resetPagingAndReload() {
    setPage(1);
    setTimeout(load, 0);
  }

  async function exportCsv() {
    const r = await fetch(`/audit/export${qs({ ...params, page: undefined, page_size: undefined })}`, {
      headers: { "x-admin-token": adminToken }
    });
    if (!r.ok) return alert("Export failed");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 shadow @2xl:grid-cols-6">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Action</label>
          <select value={action} onChange={e => { setAction(e.target.value); resetPagingAndReload(); }} className="rounded-lg border p-2">
            <option value="">All</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Target Table</label>
          <select value={targetTable} onChange={e => { setTargetTable(e.target.value); resetPagingAndReload(); }} className="rounded-lg border p-2">
            <option value="">All</option>
            <option value="predictions">predictions</option>
            <option value="fixtures">fixtures</option>
            <option value="results">results</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Actor ID</label>
          <input value={actorId} onChange={e => setActorId(e.target.value)} onBlur={resetPagingAndReload} placeholder="player/admin id" className="rounded-lg border p-2" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Search</label>
          <input value={q} onChange={e => setQ(e.target.value)} onBlur={resetPagingAndReload} placeholder="action/table" className="rounded-lg border p-2" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">From (local)</label>
          <input type="datetime-local" value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPagingAndReload(); }} className="rounded-lg border p-2" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">To (local)</label>
          <input type="datetime-local" value={dateTo} onChange={e => { setDateTo(e.target.value); resetPagingAndReload(); }} className="rounded-lg border p-2" />
        </div>
        <div className="col-span-full flex items-center justify-between pt-1">
          <div className="text-sm text-gray-500">
            {loading ? "Loading…" : `${total} record${total === 1 ? "" : "s"}`}
          </div>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="rounded-xl border px-4 py-2 font-medium hover:bg-gray-50">
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Table</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">More</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => {
                const d = r.details || {};
                const when = new Date(r.created_at);
                return (
                  <tr key={r.id} className="odd:bg-white even:bg-gray-50/40">
                    <td className="px-4 py-3 whitespace-nowrap">{when.toLocaleString()}</td>
                    <td className="px-4 py-3">{r.action}</td>
                    <td className="px-4 py-3">{r.actor_id || "—"}</td>
                    <td className="px-4 py-3">{r.target_table || "—"}</td>
                    <td className="px-4 py-3">{r.target_id || d.match_id || "—"}</td>
                    <td className="px-4 py-3">{d.ip || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-500">
                        {d.match_id ? `match: ${d.match_id}` : ""}
                      </div>
                      <JsonPreview obj={r.details} />
                    </td>
                  </tr>
                );
              })}
              {(!loading && rows.length === 0) && (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-500" colSpan={7}>
                    No audit records found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
