/**
 * Origin allowlist tests for applyCors (shared by book/cancel/send-email).
 * Run: node tests/cors.test.js
 */
const assert = require("assert");

function mockRes() {
  const headers = {};
  let statusCode = null;
  let body = null;
  return {
    headers,
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      statusCode = code;
      return {
        json(payload) {
          body = payload;
          return payload;
        },
        end() {},
      };
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

function withEnv(overrides, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // Reload module so getAllowedOrigins sees new env
  delete require.cache[require.resolve("../api/_lib/cors")];
  try {
    return fn(require("../api/_lib/cors"));
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    delete require.cache[require.resolve("../api/_lib/cors")];
  }
}

function run() {
  withEnv(
    {
      ALLOWED_ORIGINS: undefined,
      VERCEL_ENV: "production",
      NODE_ENV: "production",
    },
    ({ applyCors, getAllowedOrigins }) => {
      const origins = getAllowedOrigins();
      assert.ok(origins.includes("https://kevos.site"));
      assert.ok(origins.includes("https://www.kevos.site"));
      assert.ok(!origins.includes("http://localhost:3000"), "no localhost in prod");

      const resOk = mockRes();
      const ok = applyCors(
        { method: "POST", headers: { origin: "https://kevos.site" } },
        resOk
      );
      assert.strictEqual(ok.ok, true);
      assert.strictEqual(ok.handled, undefined);
      assert.strictEqual(resOk.headers["Access-Control-Allow-Origin"], "https://kevos.site");

      const resEvil = mockRes();
      const evil = applyCors(
        { method: "POST", headers: { origin: "https://evil.example" } },
        resEvil
      );
      assert.strictEqual(evil.ok, false);
      assert.strictEqual(evil.handled, true);
      assert.strictEqual(resEvil.statusCode, 403);
      assert.strictEqual(resEvil.body.error, "Forbidden origin");
    }
  );

  withEnv(
    {
      ALLOWED_ORIGINS: "https://kevos.site,https://custom.example",
      VERCEL_ENV: "production",
    },
    ({ getAllowedOrigins, applyCors }) => {
      const origins = getAllowedOrigins();
      assert.deepStrictEqual(origins, [
        "https://kevos.site",
        "https://custom.example",
      ]);
      const res = mockRes();
      const r = applyCors(
        { method: "POST", headers: { origin: "https://custom.example" } },
        res
      );
      assert.strictEqual(r.ok, true);
    }
  );

  console.log("PASS: kevos.site allowed; evil.example → 403; ALLOWED_ORIGINS env works");
}

run();
