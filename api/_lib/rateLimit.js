/**
 * Rate limiting: Prefer Upstash Redis when configured; else Firestore fixed-window.
 *
 * Recommended for production: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * (shared across serverless instances, no _rateLimits growth).
 *
 * Firestore fallback writes one doc per key per window with expireAt (TTL).
 * Configure a Firestore TTL policy on collection `_rateLimits`, field `expireAt`
 * (Firebase Console → Firestore → TTL) so expired windows are deleted automatically.
 * Hot path: one transactional set per check; expired docs are ignored/overwritten
 * (no extra delete write).
 */
const { getClientIp } = require("./clientIp");

const upstashLimiters = new Map();

function hasUpstashEnv() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function getUpstashLimiter(max, windowMs) {
  if (!hasUpstashEnv()) return null;
  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  const cacheKey = `${max}:${windowSec}`;
  if (upstashLimiters.has(cacheKey)) return upstashLimiters.get(cacheKey);

  try {
    const { Ratelimit } = require("@upstash/ratelimit");
    const { Redis } = require("@upstash/redis");
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix: "kevos-rl",
      analytics: false,
    });
    upstashLimiters.set(cacheKey, limiter);
    return limiter;
  } catch (error) {
    console.error("Upstash ratelimit init failed; using Firestore fallback:", error.message);
    return null;
  }
}

function sanitizeKeyPart(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9@._:-]/g, "_")
    .slice(0, 120);
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return null;
}

/**
 * Fixed-window counter in Firestore (Admin SDK).
 * Stores expireAt for Firestore TTL policy cleanup.
 */
async function firestoreFixedWindow(db, { fullKey, max, windowMs }) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const docId = sanitizeKeyPart(fullKey).slice(0, 700);
  const ref = db.collection("_rateLimits").doc(docId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let count = 0;

    if (snap.exists) {
      const data = snap.data();
      const expireMs = toMillis(data.expireAt);
      const stillValid =
        data.windowStart === windowStart &&
        (expireMs == null || expireMs > now);

      if (stillValid) {
        count = Number(data.count) || 0;
      }
      // else: expired or prior window → treat as fresh (overwrite below)
    }

    count += 1;
    // Single write: overwrite same doc. TTL field expireAt = end of window.
    tx.set(ref, {
      windowStart,
      count,
      updatedAt: new Date(now),
      expireAt: new Date(resetAt),
    });

    return { count, resetAt };
  });

  if (result.count > max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((result.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfterSec: 0 };
}

async function checkOneKey(fullKey, { max, windowMs }) {
  const limiter = getUpstashLimiter(max, windowMs);
  if (limiter) {
    const { success, reset } = await limiter.limit(fullKey);
    if (!success) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      };
    }
    return { ok: true, retryAfterSec: 0 };
  }

  try {
    const { getDb } = require("./firebaseAdmin");
    return firestoreFixedWindow(getDb(), { fullKey, max, windowMs });
  } catch (error) {
    console.error("Rate limit fallback failed open:", error.message);
    return { ok: true, retryAfterSec: 0 };
  }
}

async function checkRateLimit(req, opts = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 60;
  const keyPrefix = opts.keyPrefix ?? "default";
  const ip = getClientIp(req);
  const email = opts.email ? String(opts.email).trim().toLowerCase() : null;
  const emailMax = opts.emailMax ?? max;

  const ipResult = await checkOneKey(`${keyPrefix}:ip:${ip}`, { max, windowMs });
  if (!ipResult.ok) return ipResult;

  if (email) {
    const emailResult = await checkOneKey(`${keyPrefix}:email:${email}`, {
      max: emailMax,
      windowMs,
    });
    if (!emailResult.ok) return emailResult;
  }

  return { ok: true, retryAfterSec: 0 };
}

async function enforceRateLimit(req, res, opts) {
  const result = await checkRateLimit(req, opts);
  if (!result.ok) {
    res.setHeader("Retry-After", String(result.retryAfterSec));
    res.status(429).json({
      error: "Too many requests. Please try again shortly.",
    });
    return false;
  }
  return true;
}

module.exports = {
  getClientIp,
  checkRateLimit,
  enforceRateLimit,
  firestoreFixedWindow,
  hasUpstashEnv,
  sanitizeKeyPart,
};
