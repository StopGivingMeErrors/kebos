/**
 * Missing / malformed Admin env → clear error codes (no live Firebase).
 * Run: node tests/firebaseAdminConfig.test.js
 */
const assert = require("assert");

function loadFresh() {
  const modPath = require.resolve("../api/_lib/firebaseAdmin");
  delete require.cache[modPath];
  // firebase-admin may already have apps — use isolated getPrivateKey tests mainly
  return require("../api/_lib/firebaseAdmin");
}

function withEnv(env, fn) {
  const keys = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
  ];
  const prev = {};
  keys.forEach((k) => {
    prev[k] = process.env[k];
    delete process.env[k];
  });
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    keys.forEach((k) => {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    });
  }
}

withEnv({}, () => {
  const { getPrivateKey } = loadFresh();
  assert.strictEqual(getPrivateKey(), null);
});

withEnv(
  {
    FIREBASE_PRIVATE_KEY: "not-a-pem",
  },
  () => {
    const { getPrivateKey } = loadFresh();
    let err;
    try {
      getPrivateKey();
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.strictEqual(err.code, "ADMIN_KEY_FORMAT");
  }
);

withEnv(
  {
    FIREBASE_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\\nLINE\\n-----END PRIVATE KEY-----\\n",
  },
  () => {
    const { getPrivateKey } = loadFresh();
    const key = getPrivateKey();
    assert.ok(key.includes("\n"));
    assert.ok(key.includes("BEGIN PRIVATE KEY"));
    assert.ok(!key.includes("\\n"));
  }
);

withEnv({}, () => {
  const { adminConfigClientMessage } = loadFresh();
  assert.ok(
    adminConfigClientMessage({ code: "ADMIN_CONFIG" }).includes("not configured")
  );
  assert.ok(
    adminConfigClientMessage({ code: "ADMIN_KEY_FORMAT" }).includes("key format")
  );
});

console.log("PASS: Admin env missing/malformed → ADMIN_KEY_FORMAT; \\n expanded");
