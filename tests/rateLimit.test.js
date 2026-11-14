/**
 * Rate-limit unit tests (no live Firebase / Upstash).
 * Run: node tests/rateLimit.test.js
 */
const assert = require("assert");

// Fake Firestore for fixed-window
function createFakeDb() {
  const store = new Map();
  return {
    collection(name) {
      return {
        doc(id) {
          const path = `${name}/${id}`;
          return {
            path,
            async get() {
              const data = store.get(path);
              return {
                exists: data !== undefined,
                data: () => (data === undefined ? undefined : { ...data }),
              };
            },
          };
        },
      };
    },
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        async get(ref) {
          const data = store.get(ref.path);
          return {
            exists: data !== undefined,
            data: () => (data === undefined ? undefined : { ...data }),
          };
        },
        set(ref, data) {
          writes.push({ path: ref.path, data: { ...data } });
        },
      };
      const result = await fn(tx);
      for (const w of writes) store.set(w.path, w.data);
      return result;
    },
    _store: store,
  };
}

async function run() {
  // Isolate module and inject fake getDb via stubbing require cache path:
  // call firestoreFixedWindow directly with fake db
  const { firestoreFixedWindow, sanitizeKeyPart } = require("../api/_lib/rateLimit");

  const db = createFakeDb();
  const key = "book:ip:1.2.3.4";
  const windowMs = 60_000;
  const max = 3;

  const r1 = await firestoreFixedWindow(db, { fullKey: key, max, windowMs });
  const r2 = await firestoreFixedWindow(db, { fullKey: key, max, windowMs });
  const r3 = await firestoreFixedWindow(db, { fullKey: key, max, windowMs });
  const r4 = await firestoreFixedWindow(db, { fullKey: key, max, windowMs });

  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r3.ok, true);
  assert.strictEqual(r4.ok, false, "4th request in window must 429");
  assert.ok(r4.retryAfterSec >= 1);

  assert.ok(sanitizeKeyPart("A@B.com").includes("a@b.com"));

  // Per-email + per-IP via checkRateLimit with mocked firebaseAdmin
  const fakeDb2 = createFakeDb();
  const firebaseAdminPath = require.resolve("../api/_lib/firebaseAdmin");
  require.cache[firebaseAdminPath] = {
    id: firebaseAdminPath,
    filename: firebaseAdminPath,
    loaded: true,
    exports: { getDb: () => fakeDb2 },
  };
  delete require.cache[require.resolve("../api/_lib/rateLimit")];
  const { checkRateLimit } = require("../api/_lib/rateLimit");

  const req = {
    headers: { "x-forwarded-for": "9.9.9.9" },
    socket: {},
  };

  for (let i = 0; i < 5; i++) {
    const r = await checkRateLimit(req, {
      keyPrefix: "test",
      max: 5,
      windowMs: 60_000,
      email: "guest@example.com",
      emailMax: 2,
    });
    if (i < 2) assert.strictEqual(r.ok, true, `ip+email ok at ${i}`);
    else {
      assert.strictEqual(r.ok, false, `email cap should trip at ${i}`);
      break;
    }
  }

  console.log("PASS: Firestore fixed-window rate limit + per-email cap");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
