const assert = require("assert");
const { resolveUpstashRestEnv } = require("../api/_lib/upstashEnv");

// Classic names
{
  const r = resolveUpstashRestEnv({
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "tok_rw",
  });
  assert.strictEqual(r.source, "UPSTASH_REDIS_REST_URL/TOKEN");
  assert.strictEqual(r.url, "https://example.upstash.io");
}

// Vercel KV integration style (KEVOS_REDIS_*)
{
  const r = resolveUpstashRestEnv({
    KEVOS_REDIS_KV_REST_API_URL: "https://kv.example",
    KEVOS_REDIS_KV_REST_API_TOKEN: "rw_token",
    KEVOS_REDIS_KV_REST_API_READ_ONLY_TOKEN: "ro_token",
    KEVOS_REDIS_KV_URL: "redis://should-not-use",
    KEVOS_REDIS_REDIS_URL: "redis://also-not",
  });
  assert.ok(r);
  assert.strictEqual(r.url, "https://kv.example");
  assert.strictEqual(r.token, "rw_token");
  assert.ok(r.source.includes("KEVOS_REDIS_KV_REST_API_URL"));
  assert.ok(!r.source.includes("READ_ONLY"));
}

// Prefer classic over KV when both present
{
  const r = resolveUpstashRestEnv({
    UPSTASH_REDIS_REST_URL: "https://classic",
    UPSTASH_REDIS_REST_TOKEN: "classic_tok",
    KEVOS_REDIS_KV_REST_API_URL: "https://kv",
    KEVOS_REDIS_KV_REST_API_TOKEN: "kv_tok",
  });
  assert.strictEqual(r.url, "https://classic");
}

// Missing → null
{
  const r = resolveUpstashRestEnv({
    KEVOS_REDIS_KV_REST_API_READ_ONLY_TOKEN: "ro_only",
    KEVOS_REDIS_REDIS_URL: "redis://x",
  });
  assert.strictEqual(r, null);
}

console.log("PASS: resolveUpstashRestEnv classic + KEVOS_REDIS KV REST RW selection");
