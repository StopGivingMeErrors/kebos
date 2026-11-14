/**
 * Client IP for rate limiting on Vercel.
 *
 * Do NOT trust the first hop of a client-supplied X-Forwarded-For (spoofable).
 * Prefer Vercel's trusted header, then the rightmost X-Forwarded-For value
 * (platform-appended), then x-real-ip / socket.
 *
 * @see https://vercel.com/docs/headers/request-headers
 */
function getClientIp(req) {
  const headers = req.headers || {};

  const vercelForwarded = headers["x-vercel-forwarded-for"];
  if (typeof vercelForwarded === "string" && vercelForwarded.trim()) {
    // May be a list; Vercel documents this as the connecting client IP chain it sets
    const parts = vercelForwarded.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }

  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    // Rightmost = closest to our platform (not client-spoofed leftmost)
    if (parts.length) return parts[parts.length - 1];
  }

  if (typeof headers["x-real-ip"] === "string" && headers["x-real-ip"].trim()) {
    return headers["x-real-ip"].trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

module.exports = { getClientIp };
