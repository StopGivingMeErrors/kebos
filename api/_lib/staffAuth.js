const { getAuth } = require("./firebaseAdmin");

/**
 * Verify Bearer ID token and require custom claim staff === true.
 * @returns {Promise<object|null>} decoded token or null if missing/invalid
 */
async function verifyIdTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await getAuth().verifyIdToken(match[1]);
  } catch (error) {
    console.error("ID token verify failed:", error.message);
    return null;
  }
}

/**
 * Staff-only gate. Returns { ok: true, decoded } or writes 401/403 and { ok: false }.
 */
async function requireStaff(req, res) {
  const decoded = await verifyIdTokenFromRequest(req);
  if (!decoded) {
    res.status(401).json({ error: "Unauthorized" });
    return { ok: false };
  }
  if (decoded.staff !== true) {
    res.status(403).json({ error: "Forbidden — staff only" });
    return { ok: false };
  }
  return { ok: true, decoded };
}

module.exports = {
  verifyIdTokenFromRequest,
  requireStaff,
};
