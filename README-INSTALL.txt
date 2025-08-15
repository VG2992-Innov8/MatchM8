# MatchM8 — Phase B MERGE OVERLAY

This overlay adds:
- Player PINs (set/verify) + short-lived prediction edit cookie
- Audit Log hooks
- Admin Audit Viewer UI (React components) + CSV export
- Fixtures/Results routes with audit
- Public admin audit page at /admin.html (optional)

## How to merge (Replit)
1) Upload this ZIP to your existing MatchM8 project root.
2) In the Replit Shell, run:
   unzip -o matchm8_phaseB_merge_overlay.zip -d .
3) Ensure these env vars exist (in Replit Secrets or .env):
   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN, PRED_TOKEN_SECRET
4) Open your server entry file (e.g. index.js or server.js) and ADD these lines:

// Top-level imports (add if missing)
import cookieParser from "cookie-parser";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { authCheckRouter } from "./routes/authCheck.js";
import { predictionsRouter } from "./routes/predictions.js";
import { fixturesRouter } from "./routes/fixtures.js";
import { resultsRouter } from "./routes/results.js";
import { auditRouter } from "./routes/audit.js";

// After app initialization (add if missing)
app.use(cookieParser());
app.use(express.json());
app.use("/auth", authRouter);
app.use("/auth", authCheckRouter);
app.use("/predictions", predictionsRouter);
app.use("/fixtures", fixturesRouter);
app.use("/results", resultsRouter);
app.use("/audit", auditRouter);

// (Optional) Serve /admin.html if you want a quick standalone viewer
import path from "path"; import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

5) Frontend: On your Admin page, add the Audit card.
   - Import:
       import AdminCard from "./ui/admin/AdminCard.jsx";
       import AdminAuditLog from "./ui/admin/AdminAuditLog.jsx";
   - Render:
       <AdminCard id="audit-log" title="Audit Log" description="See changes with timestamps and diffs.">
         <AdminAuditLog leagueId={currentLeagueId} adminToken={import.meta.env.VITE_ADMIN_TOKEN || window.ADMIN_TOKEN} />
       </AdminCard>

6) Restart your repl.

## Files included
- /lib/supa.js, /lib/pin.js, /lib/predToken.js, /lib/rateLimit.js, /lib/audit.js
- /middleware/requireAdmin.js, /middleware/requirePredEditToken.js
- /routes/auth.js, /routes/authCheck.js, /routes/predictions.js, /routes/fixtures.js, /routes/results.js, /routes/audit.js
- /ui/admin/AdminCard.jsx, /ui/admin/AdminAuditLog.jsx
- /public/admin.html (optional standalone audit page)

