/**
 * localStorage stats cache + refresh cooldown (pure helpers for Statistics).
 * Cache stores only date+status rows — never emails or names.
 */

const CACHE_KEY = "kebos_stats_cache_v1";
const COOLDOWN_MS = 60_000;
const COOLDOWN_STORAGE_KEY = "kebos_stats_refresh_cooldown_until";

function defaultStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function slimBookings(bookings) {
  return (Array.isArray(bookings) ? bookings : []).map((b) => ({
    date: b.date || "",
    status: b.status || "active",
  }));
}

function readCache(storage = defaultStorage()) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.bookings)) return null;
    return {
      fetchedAt: parsed.fetchedAt || null,
      total: parsed.total ?? parsed.bookings.length,
      bookings: slimBookings(parsed.bookings),
    };
  } catch {
    return null;
  }
}

function writeCache(bookings, storage = defaultStorage(), now = new Date()) {
  const slim = slimBookings(bookings);
  const payload = {
    fetchedAt: now.toISOString(),
    total: slim.length,
    bookings: slim,
  };
  if (storage) storage.setItem(CACHE_KEY, JSON.stringify(payload));
  return payload;
}

function getCooldownUntil(storage = defaultStorage()) {
  try {
    if (!storage) return 0;
    const raw = storage.getItem(COOLDOWN_STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function isRefreshAllowed(nowMs = Date.now(), storage = defaultStorage()) {
  return nowMs >= getCooldownUntil(storage);
}

function markRefreshDone(nowMs = Date.now(), storage = defaultStorage()) {
  const until = nowMs + COOLDOWN_MS;
  if (storage) storage.setItem(COOLDOWN_STORAGE_KEY, String(until));
  return until;
}

function cooldownRemainingMs(nowMs = Date.now(), storage = defaultStorage()) {
  return Math.max(0, getCooldownUntil(storage) - nowMs);
}

module.exports = {
  CACHE_KEY,
  COOLDOWN_MS,
  COOLDOWN_STORAGE_KEY,
  slimBookings,
  readCache,
  writeCache,
  getCooldownUntil,
  isRefreshAllowed,
  markRefreshDone,
  cooldownRemainingMs,
};
