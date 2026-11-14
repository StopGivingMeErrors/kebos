const ALLOWED_ORIGINS = [
  "https://kebos.vercel.app",
  "https://kevos.site",
  "https://www.kevos.site",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function isAllowedOrigin(origin) {
  return Boolean(origin) && ALLOWED_ORIGINS.includes(origin);
}

/**
 * Strict origin check: missing Origin is rejected (prevents curl open-relay).
 * Returns false if the request should be blocked.
 */
function applyCors(req, res) {
  const origin = req.headers.origin;

  if (req.method === "OPTIONS") {
    if (isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    res.status(204).end();
    return { ok: false, handled: true };
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Forbidden origin" });
    return { ok: false, handled: true };
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  return { ok: true, origin };
}

module.exports = {
  ALLOWED_ORIGINS,
  isAllowedOrigin,
  applyCors,
};
