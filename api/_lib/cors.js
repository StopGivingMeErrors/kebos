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
  // This deployment's own host (staged *.vercel.app) so same-origin POSTs work
  const vercelUrl = process.env.VERCEL_URL
    ? String(process.env.VERCEL_URL).replace(/^https?:\/\//, "")
    : "";
  if (vercelUrl) {
    const self = `https://${vercelUrl}`;
    if (!origins.includes(self)) origins.push(self);
  }
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
 * Browser same-origin GETs (e.g. cancel-page preview) often omit Origin.
 * Accept when Sec-Fetch-Site is same-origin, or Referer origin is allowlisted.
 * Never used for POST — those stay strict (Origin required + allowlisted).
 */
function isTrustedSameOriginGet(req) {
  if (String(req.method || "").toUpperCase() !== "GET") return false;

  const site = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (site === "same-origin") return true;

  const referer = req.headers.referer || req.headers.referrer;
  if (!referer) return false;
  try {
    return isAllowedOrigin(new URL(String(referer)).origin);
  } catch {
    return false;
  }
}

/**
 * Strict origin check: missing Origin is rejected (prevents curl open-relay),
 * except optional GET same-origin browser previews when opts.allowSameOriginGet.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.allowSameOriginGet] — cancel GET preview only
 */
function applyCors(req, res, opts = {}) {
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

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    return { ok: true, origin };
  }

  // Explicit Origin that is not allowlisted → always refuse (incl. cross-site GET)
  if (origin) {
    res.status(403).json({ error: "Forbidden origin" });
    return { ok: false, handled: true };
  }

  // No Origin: only GET previews may pass via same-origin / Referer trust
  if (opts.allowSameOriginGet && isTrustedSameOriginGet(req)) {
    res.setHeader("Vary", "Origin, Sec-Fetch-Site, Referer");
    return { ok: true, origin: null };
  }

  res.status(403).json({ error: "Forbidden origin" });
  return { ok: false, handled: true };
}

module.exports = {
  DEFAULT_PROD_ORIGINS,
  LOCAL_ORIGINS,
  getAllowedOrigins,
  isAllowedOrigin,
  isTrustedSameOriginGet,
  applyCors,
};
