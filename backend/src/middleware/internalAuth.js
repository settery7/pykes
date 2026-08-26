// Guards service-to-service routes (called by a scheduled Make/Zapier
// scenario, not a logged-in user) with a shared secret instead of a user
// JWT — there's no user session to verify here. Mirrors requireAuth's
// shape (backend/src/middleware/auth.js) but checks a header against
// INTERNAL_SECRET rather than verifying a Bearer token.
export function requireInternalSecret(req, res, next) {
  const provided = req.headers["x-internal-secret"];
  if (!provided || provided !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({ error: "Missing or invalid x-internal-secret header" });
  }
  next();
}
