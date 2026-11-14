/**
 * Liveness probe — no Firebase, no Firestore, no secrets.
 * Used to verify the serverless runtime loads without ERR_REQUIRE_ESM.
 */
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({
    ok: true,
    service: "kevos",
    ts: new Date().toISOString(),
  });
};
