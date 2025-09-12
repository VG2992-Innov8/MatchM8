// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Ã¢Â¬â€¡Ã¯Â¸Â import your existing routers (adjust names/paths if yours differ)
import apiRouter from "./routes/index.js";        // should handle /fixtures, /predictions, etc. under /api
import authRouter from "./routes/auth.js";        // your PIN endpoints (/auth/pin/verify, /auth/pin/set, ...)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// --- Normalize any legacy "%3F" requests (e.g., /Part_B_Predictions.html%3Fweek=3&player_id=1)
app.use((req, res, next) => {
  if (/%3f/i.test(req.path)) {
    const [base, rawQs = ""] = req.path.split(/%3f/i);
    const qsFromUrl = req.url.includes("?") ? req.url.split("?")[1] : "";
    const qs = [rawQs, qsFromUrl].filter(Boolean).join("&");
    const target = qs ? `${base}?${qs}` : base;
    return res.redirect(302, target);
  }
  next();
});

// --- Mount your API + Auth routers (this is what was missing)
app.use("/api", apiRouter);
app.use("/auth", authRouter);

// --- Simple health endpoint (handy to sanity-check the server)
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Static hosting (put HTML, CSS, JS in /public)
app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"], // /foo resolves to /foo.html
    fallthrough: true,
  })
);

// --- Explicit routes (belt-and-braces)
app.get("/Part_B_Predictions.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "Part_B_Predictions.html"));
});
app.get("/Part_A_PIN.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "Part_A_PIN.html"));
});

// --- Extra safety: if someone literally requests the bad filename
app.get("/Part_B_Predictions.html%3F*", (req, res) => {
  const raw = req.path.split("%3F")[1] || "";
  const qsFromUrl = req.url.includes("?") ? req.url.split("?")[1] : "";
  const qs = [raw, qsFromUrl].filter(Boolean).join("&");
  res.redirect(302, `/Part_B_Predictions.html${qs ? "?" + qs : ""}`);
});

// --- 404 fallback
app.use((_req, res) => res.status(404).send("Not found"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MatchM8 listening on ${PORT}`));
