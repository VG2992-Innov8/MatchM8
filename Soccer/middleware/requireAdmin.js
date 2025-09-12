export function requireAdmin(req, res, next) {
  const token = req.header("x-admin-token");
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Admin token required" });
  }
  req.admin = { id: null }; // attach admin actor_id if you track admins
  next();
}
