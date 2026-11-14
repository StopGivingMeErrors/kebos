/**
 * Resolve Upstash/Vercel KV REST credentials from env without hard-coding one prefix.
 *
 * Preference order:
 * 1. UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * 2. Explicit Vercel KV style: <PREFIX>_KV_REST_API_URL + <PREFIX>_KV_REST_API_TOKEN
 *    (never the READ_ONLY token; never redis:// URL vars)
 *
 * Returns { url, token, source } or null.
 */
function resolveUpstashRestEnv(env = process.env) {
  const classicUrl = env.UPSTASH_REDIS_REST_URL;
  const classicToken = env.UPSTASH_REDIS_REST_TOKEN;
  if (classicUrl && classicToken) {
    return {
      url: classicUrl,
      token: classicToken,
      source: "UPSTASH_REDIS_REST_URL/TOKEN",
    };
  }

  const urlKeys = Object.keys(env).filter(
    (k) => /_KV_REST_API_URL$/i.test(k) && env[k]
  );

  for (const urlKey of urlKeys.sort()) {
    const prefix = urlKey.replace(/_KV_REST_API_URL$/i, "");
    const rwTokenKey = `${prefix}_KV_REST_API_TOKEN`;
    const roTokenKey = `${prefix}_KV_REST_API_READ_ONLY_TOKEN`;
    const token = env[rwTokenKey];
    if (!token) continue;
    // Prefer RW token; never use read-only even if somehow aliased
    if (rwTokenKey === roTokenKey) continue;
    const url = env[urlKey];
    if (typeof url === "string" && url.includes("redis://")) continue;
    return {
      url,
      token,
      source: `${urlKey}+${rwTokenKey}`,
    };
  }

  return null;
}

module.exports = { resolveUpstashRestEnv };
