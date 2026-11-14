/**
 * Rate-limit behaviour tests against the Firestore emulator (fallback path).
 * Also unit-tests trusted client IP parsing and enforceRateLimit 429 headers.
 *
 * Run: npm run test:ratelimit
 * (uses firebase emulators:exec — JDK 21+)
 */
const assert = require("assert");
const { initializeApp, getApps, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "kebos-ratelimit-test";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

// Force Firestore fallback (no Upstash in tests)
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

async function setupDb() {
  for (const app of getApps()) {
    await deleteApp(app);
  }
  initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

function mockRes() {
  const headers = {};
  let statusCode = null;
  let body = null;
  return {
    headers,
    setHeader(k, v) {
      headers[k] = String(v);
    },
    status(code) {
      statusCode = code;
      return {
        json(payload) {
          body = payload;
          return payload;
        },
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

async function clearRateLimits(db) {
  const snap = await db.collection("_rateLimits").get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (!snap.empty) await batch.commit();
}

async function run() {
  const { getClientIp } = require("../api/_lib/clientIp");

  // --- Trusted IP (not leftmost X-Forwarded-For) ---
  assert.strictEqual(
    getClientIp({
      headers: {
        "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3",
      },
    }),
    "3.3.3.3",
    "must use rightmost X-Forwarded-For, not client-spoofable leftmost"
  );

  assert.strictEqual(
    getClientIp({
      headers: {
        "x-vercel-forwarded-for": "9.9.9.9",
        "x-forwarded-for": "1.1.1.1, 9.9.9.9",
      },
    }),
    "9.9.9.9",
    "must prefer x-vercel-forwarded-for"
  );

  console.log("PASS: getClientIp prefers x-vercel-forwarded-for / rightmost XFF");

  // --- Emulator Firestore fallback ---
  const db = await setupDb();
  await clearRateLimits(db);

  const firebaseAdminPath = require.resolve("../api/_lib/firebaseAdmin");
  require.cache[firebaseAdminPath] = {
    id: firebaseAdminPath,
    filename: firebaseAdminPath,
    loaded: true,
    exports: {
      getDb: () => db,
      adminConfigClientMessage: () => "misconfigured",
    },
  };
  delete require.cache[require.resolve("../api/_lib/rateLimit")];
  const {
    firestoreFixedWindow,
    checkRateLimit,
    enforceRateLimit,
  } = require("../api/_lib/rateLimit");

  const windowMs = 60_000;
  const max = 3;
  const key = "test:ip:10.0.0.1";

  const a1 = await firestoreFixedWindow(db, { fullKey: key, max, windowMs });
  const a2 = await firestoreFixedWindow(db, { fullKey: key, max, windowMs });
  const a3 = await firestoreFixedWindow(db, { fullKey: key, max, windowMs });
  const a4 = await firestoreFixedWindow(db, { fullKey: key, max, windowMs });

  assert.strictEqual(a1.ok, true);
  assert.strictEqual(a2.ok, true);
  assert.strictEqual(a3.ok, true);
  assert.strictEqual(a4.ok, false, "N+1st request must fail");
  assert.ok(a4.retryAfterSec >= 1, "failed window must expose retryAfterSec");

  // Doc must carry expireAt for TTL policy
  const docSnap = await db
    .collection("_rateLimits")
    .doc(require("../api/_lib/rateLimit").sanitizeKeyPart(key).slice(0, 700))
    .get();
  assert.ok(docSnap.exists);
  assert.ok(docSnap.data().expireAt, "expireAt must be stored for TTL");

  // Different key must not interfere
  const other = await firestoreFixedWindow(db, {
    fullKey: "test:ip:10.0.0.2",
    max,
    windowMs,
  });
  assert.strictEqual(other.ok, true, "different IP key must start fresh");

  // Per-email limit via checkRateLimit + enforceRateLimit headers
  await clearRateLimits(db);
  const req = {
    headers: { "x-vercel-forwarded-for": "8.8.8.8" },
    socket: {},
  };

  for (let i = 0; i < 2; i++) {
    const r = await checkRateLimit(req, {
      keyPrefix: "book",
      max: 50,
      windowMs,
      email: "guest@example.com",
      emailMax: 2,
    });
    assert.strictEqual(r.ok, true, `email attempt ${i} should pass`);
  }

  const blocked = await checkRateLimit(req, {
    keyPrefix: "book",
    max: 50,
    windowMs,
    email: "guest@example.com",
    emailMax: 2,
  });
  assert.strictEqual(blocked.ok, false, "3rd email attempt must hit emailMax");
  assert.ok(blocked.retryAfterSec >= 1);

  const res = mockRes();
  const allowed = await enforceRateLimit(req, res, {
    keyPrefix: "book",
    max: 50,
    windowMs,
    email: "guest@example.com",
    emailMax: 2,
  });
  assert.strictEqual(allowed, false);
  assert.strictEqual(res.statusCode, 429);
  assert.ok(res.headers["Retry-After"], "429 must set Retry-After");
  assert.ok(Number(res.headers["Retry-After"]) >= 1);

  // Different email still allowed on same IP
  const otherEmail = await checkRateLimit(req, {
    keyPrefix: "book",
    max: 50,
    windowMs,
    email: "other@example.com",
    emailMax: 2,
  });
  assert.strictEqual(otherEmail.ok, true, "different email must not share cap");

  console.log(
    "PASS: emulator N+1 → fail+retryAfter; keys isolated; email cap; 429 Retry-After"
  );
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
