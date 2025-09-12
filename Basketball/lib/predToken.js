import jwt from "jsonwebtoken";

const secret = process.env.PRED_TOKEN_SECRET;
const TWO_HOURS = 2 * 60 * 60;

export function mintPredEditJWT({ player_id, league_id }) {
  return jwt.sign({ sub: player_id, league_id, purpose: "pred_edit" }, secret, { expiresIn: TWO_HOURS });
}

export function verifyPredEditJWT(token) {
  try { return jwt.verify(token, secret); } catch { return null; }
}
