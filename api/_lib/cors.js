/**
 * Origin allowlist for /api/book, /api/cancel, /api/send-email.
 *
 * Override with comma-separated ALLOWED_ORIGINS env, e.g.:
 *   ALLOWED_ORIGINS=https://kevos.site,https://www.kevos.site,https://kebos.vercel.app
 *
 * Defaults always include kevos.site (+ www) and the legacy Vercel host.
 * Localhost is added only outside Vercel production/preview (local / vercel dev).
 */

const DEFAULT_PROD_ORIGINS = [
  "https://kevos.site",
  "https://www.kevos.site",
  "https://kebos.vercel.app",
];

const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function getAllowedOrigins() {
  const fromEnv = process.env.ALLOWED_ORIGINS;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const origins = [...DEFAULT_PROD_ORIGINS];
  const vercelEnv = process.env.VERCEL_ENV; // production | preview | development
  const allowLocal =
    vercelEnv === "development" ||
    (!vercelEnv && process.env.NODE_ENV !== "production");

  if (allowLocal) {
    origins.push(...LOCAL_ORIGINS);
  }
  return origins;
}

function isAllowedOrigin(origin) {
  return Boolean(origin) && getAllowedOrigins().includes(origin);
}

/**
 * Strict origin check: missing Origin is rejected (prevents curl open-relay).
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
  DEFAULT_PROD_ORIGINS,
  LOCAL_ORIGINS,
  getAllowedOrigins,
  isAllowedOrigin,
  applyCors,
};
