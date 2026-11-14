/**
 * Rate limiting: Prefer Upstash/Vercel KV REST when configured; else Firestore.
 *
 * Env (any of):
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   or Vercel integration: *_KV_REST_API_URL + *_KV_REST_API_TOKEN (RW, not READ_ONLY)
 *
 * On any Upstash error: fall back to Firestore fixed-window (never block bookings
 * solely because Redis is down). If Firestore also fails, fail open (allow).
 *
 * Firestore fallback: collection `_rateLimits`, field `expireAt` for TTL policy.
 */
const { getClientIp } = require("./clientIp");
const { resolveUpstashRestEnv } = require("./upstashEnv");

const upstashLimiters = new Map();
let loggedUpstashSource = false;

function getUpstashLimiter(max, windowMs) {
  const creds = resolveUpstashRestEnv();
  if (!creds) return null;

  if (!loggedUpstashSource) {
    console.log(`[rateLimit] Using Upstash/KV REST creds from ${creds.source}`);
    loggedUpstashSource = true;
  }

  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  const cacheKey = `${creds.source}:${max}:${windowSec}`;
  if (upstashLimiters.has(cacheKey)) return upstashLimiters.get(cacheKey);

  try {
    const { Ratelimit } = require("@upstash/ratelimit");
    const { Redis } = require("@upstash/redis");
    const redis = new Redis({
      url: creds.url,
      token: creds.token,
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
    console.warn(
      "[rateLimit] Upstash init failed; will use Firestore fallback:",
      error.message
    );
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
    }

    count += 1;
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
      backend: "firestore",
    };
  }
  return { ok: true, retryAfterSec: 0, backend: "firestore" };
}

async function checkFirestoreFallback(fullKey, { max, windowMs }) {
  try {
    const { getDb } = require("./firebaseAdmin");
    return firestoreFixedWindow(getDb(), { fullKey, max, windowMs });
  } catch (error) {
    console.warn(
      "[rateLimit] Firestore fallback failed open (allowing request):",
      error.message
    );
    return { ok: true, retryAfterSec: 0, backend: "fail-open" };
  }
}

async function checkOneKey(fullKey, { max, windowMs }) {
  const limiter = getUpstashLimiter(max, windowMs);
  if (limiter) {
    try {
      const { success, reset } = await limiter.limit(fullKey);
      if (!success) {
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
          backend: "upstash",
        };
      }
      return { ok: true, retryAfterSec: 0, backend: "upstash" };
    } catch (error) {
      console.warn(
        "[rateLimit] Upstash limit() error; falling back to Firestore:",
        error.message
      );
      return checkFirestoreFallback(fullKey, { max, windowMs });
    }
  }

  return checkFirestoreFallback(fullKey, { max, windowMs });
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

  return { ok: true, retryAfterSec: 0, backend: ipResult.backend };
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
  sanitizeKeyPart,
  resolveUpstashRestEnv,
};
