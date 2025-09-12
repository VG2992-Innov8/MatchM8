import express from "express";
import { verifyPredEditJWT } from "../lib/predToken.js";

export const authCheckRouter = express.Router();

authCheckRouter.get("/check", (req, res) => {
  const cookie = req.cookies?.pred_edit_token;
  const payload = cookie ? verifyPredEditJWT(cookie) : null;
  if (payload?.purpose === "pred_edit") return res.json({ ok: true });
  return res.status(401).json({ ok: false });
});
