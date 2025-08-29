const crypto = require("crypto");
const secret = process.env.LICENSE_SECRET || "change-me";
const b64u = b => Buffer.from(b).toString("base64url");
const sign = body => b64u(crypto.createHmac("sha256", secret).update(body).digest());

const [issued_to = "Vince (Faux Customer)", product = "matchm8-soccer", season = "EPL-2025", max_players = "20", expires = "2025-12-31"] = process.argv.slice(2);

const payload = {
  v: 1,
  issued_to,
  product,
  season,
  max_players: Number(max_players),
  features: ["scores","leaderboard","email-reminders"],
  issued_at: new Date().toISOString(),
  expires,
  nonce: crypto.randomUUID()
};

const body = b64u(JSON.stringify(payload));
console.error("Payload:", payload);
console.log(body + "." + sign(body));
