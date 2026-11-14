const assert = require("assert");
const { getClientIp } = require("../api/_lib/clientIp");

assert.strictEqual(
  getClientIp({ headers: { "x-forwarded-for": "spoofed, real-platform" } }),
  "real-platform"
);

assert.strictEqual(
  getClientIp({
    headers: {
      "x-vercel-forwarded-for": "trusted",
      "x-forwarded-for": "spoofed, trusted",
    },
  }),
  "trusted"
);

assert.strictEqual(
  getClientIp({ headers: { "x-real-ip": "10.1.2.3" } }),
  "10.1.2.3"
);

console.log("PASS: clientIp trusted-header behaviour");
