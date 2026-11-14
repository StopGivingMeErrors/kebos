/**
 * Concurrency: two parallel createBookingTransaction calls for the same slot
 * must yield exactly one success.
 *
 * Run: npm run test:book-concurrency
 * Uses the Firestore emulator (Admin SDK bypasses rules; tests transaction logic).
 */
const assert = require("assert");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const {
  createBookingTransaction,
} = require("../api/_lib/bookings");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "kebos-concurrency-test";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT_ID });
}

const db = getFirestore();

async function resetSlot(slotId) {
  await db.collection("schedules").doc(slotId).set({
    date: "2099-06-01",
    time: "14:00",
    isBooked: false,
  });

  const existing = await db.collection("bookings").get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  if (!existing.empty) await batch.commit();
}

async function run() {
  const slotId = "concurrency-slot-1";
  await resetSlot(slotId);

  const results = await Promise.allSettled([
    createBookingTransaction(db, {
      name: "Guest A",
      email: "a@example.com",
      slotId,
    }),
    createBookingTransaction(db, {
      name: "Guest B",
      email: "b@example.com",
      slotId,
    }),
  ]);

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  assert.strictEqual(
    successes.length,
    1,
    `Expected exactly 1 success, got ${successes.length}. Failures: ${failures
      .map((f) => f.reason?.code || f.reason?.message)
      .join(", ")}`
  );
  assert.strictEqual(
    failures.length,
    1,
    `Expected exactly 1 failure, got ${failures.length}`
  );
  assert.strictEqual(
    failures[0].reason?.code || failures[0].reason?.message,
    "SLOT_TAKEN"
  );

  const slotSnap = await db.collection("schedules").doc(slotId).get();
  assert.strictEqual(slotSnap.data().isBooked, true);

  const bookingsSnap = await db.collection("bookings").get();
  assert.strictEqual(bookingsSnap.size, 1);

  const booking = bookingsSnap.docs[0].data();
  assert.ok(booking.cancelToken, "cancelToken must be set");
  assert.strictEqual(
    bookingsSnap.docs[0].id,
    booking.cancelToken,
    "document id must equal cancelToken (legacy cancel URL scheme)"
  );
  // crypto.randomUUID() format
  assert.match(
    booking.cancelToken,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  console.log("PASS: exactly one of two parallel /api/book transactions succeeded");
  console.log("PASS: cancelToken is crypto.randomUUID() and equals booking doc id");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAIL:", err);
    process.exit(1);
  });
