/**
 * Best-effort in-memory rate limit (per serverless instance).
 * Enough to blunt casual abuse; not a global distributed limiter.
 */
const buckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.headers["x-real-ip"] || "unknown";
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {{ windowMs?: number, max?: number, keyPrefix?: string }} [opts]
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
function checkRateLimit(req, opts = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 20;
  const keyPrefix = opts.keyPrefix ?? "default";
  const ip = getClientIp(req);
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();

  let entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > max) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  return { ok: true };
}

function enforceRateLimit(req, res, opts) {
  const result = checkRateLimit(req, opts);
  if (!result.ok) {
    res.setHeader("Retry-After", String(result.retryAfterSec));
    res.status(429).json({ error: "Too many requests. Please try again shortly." });
    return false;
  }
  return true;
}

module.exports = {
  getClientIp,
  checkRateLimit,
  enforceRateLimit,
};
