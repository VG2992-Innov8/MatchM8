// middleware/requirePredEditToken.js
import { verifyPredEditJWT, mintPredEditJWT } from "../lib/predToken.js";
import { supa } from "../lib/supa.js";
import { verifyPin, validatePin } from "../lib/pin.js";
import { pinLimiter } from "../lib/rateLimit.js";

/**
 * Allows:
 *  - Existing cookie `pred_edit_token`, or
 *  - { player_id, pin }, or
 *  - { name, pin }
 * On success: ensures cookie exists and attaches req.predEdit = { sub, league_id }
 */
export async function requirePredEditToken(req, res, next) {
  const cookie = req.cookies?.pred_edit_token;
  const body = req.body || {};
  const player_id = body.player_id ?? req.query.player_id ?? null;
  const name = body.name ?? req.query.name ?? null;
  const pin = body.pin ?? req.query.pin ?? null;

  // 1) If valid cookie exists, allow
  if (cookie) {
    const payload = verifyPredEditJWT(cookie);
    if (payload?.purpose === "pred_edit" && payload.sub) {
      req.predEdit = payload;
      return next();
    }
  }

  // 2) Otherwise require a pin + name or id
  if ((!player_id && !name) || !validatePin(String(pin || ""))) {
    return res.status(401).json({ error: "PIN and player name or id required" });
  }

  const rlKey = `${name || player_id}:${req.ip}`;
  const rl = pinLimiter(
    rlKey,
    Number(process.env.RATE_LIMIT_MAX_ATTEMPTS || 5),
    Number(process.env.RATE_LIMIT_WINDOW_MIN || 15)
  );
  if (!rl.ok) return res.status(429).json({ error: "Too many attempts. Try later." });

  // Lookup by id or name
  const { data: player, error } = player_id
    ? await supa.from("players").select("id, league_id, pin_hash").eq("id", player_id).single()
    : await supa.from("players").select("id, league_id, pin_hash").eq("name", name).single();

  if (error || !player) return res.status(404).json({ error: "Player not found" });

  const ok = await verifyPin(String(pin), player.pin_hash);
  if (!ok) return res.status(401).json({ error: "Invalid PIN" });

  // Mint cookie for future requests
  const jwt = mintPredEditJWT({ player_id: player.id, league_id: player.league_id });
  res.cookie("pred_edit_token", jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 2 * 60 * 60 * 1000,
    path: "/",
  });

  req.predEdit = { sub: player.id, league_id: player.league_id, purpose: "pred_edit" };
  next();
}
