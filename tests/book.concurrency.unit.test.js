/**
 * In-memory concurrency test for createBookingTransaction.
 * Always runnable (no Java / emulator). Complements the emulator test.
 *
 * Run: node tests/book.concurrency.unit.test.js
 */
const assert = require("assert");
const { randomUUID } = require("crypto");

/**
 * Minimal Firestore-like DB: transactions are serialized (like Firestore
 * contention on the same document), reads see committed state only.
 */
function createFakeDb(initial) {
  const store = new Map(Object.entries(initial));
  let chain = Promise.resolve();

  function docRef(path) {
    return {
      path,
      async get() {
        const data = store.get(path);
        return {
          exists: data !== undefined,
          data: () => (data === undefined ? undefined : { ...data }),
          ref: docRef(path),
        };
      },
    };
  }

  return {
    collection(col) {
      return {
        doc(id) {
          const path = `${col}/${id}`;
          return {
            id,
            path,
            async get() {
              return docRef(path).get();
            },
          };
        },
      };
    },
    runTransaction(fn) {
      const run = chain.then(async () => {
        const writes = [];
        const transaction = {
          async get(ref) {
            const data = store.get(ref.path);
            return {
              exists: data !== undefined,
              data: () => (data === undefined ? undefined : { ...data }),
            };
          },
          update(ref, patch) {
            writes.push({ type: "update", path: ref.path, patch });
          },
          set(ref, data) {
            writes.push({ type: "set", path: ref.path, data: { ...data } });
          },
        };
        const result = await fn(transaction);
        for (const w of writes) {
          if (w.type === "update") {
            const cur = store.get(w.path);
            if (!cur) throw new Error("NOT_FOUND");
            store.set(w.path, { ...cur, ...w.patch });
          } else {
            store.set(w.path, w.data);
          }
        }
        return result;
      });
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
    _store: store,
  };
}

/** Mirror of api/_lib/bookings.createBookingTransaction using crypto.randomUUID */
async function createBookingTransaction(db, { name, email, slotId }) {
  const cancelToken = randomUUID();
  const slotRef = db.collection("schedules").doc(slotId);
  const bookingRef = db.collection("bookings").doc(cancelToken);

  const bookingData = await db.runTransaction(async (transaction) => {
    const slotDoc = await transaction.get(slotRef);
    if (!slotDoc.exists) {
      const err = new Error("SLOT_NOT_FOUND");
      err.code = "SLOT_NOT_FOUND";
      throw err;
    }
    const slotData = slotDoc.data();
    if (slotData.isBooked) {
      const err = new Error("SLOT_TAKEN");
      err.code = "SLOT_TAKEN";
      throw err;
    }
    const payload = {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      slotId,
      date: slotData.date,
      time: slotData.time,
      timestamp: new Date(),
      cancelToken,
      status: "active",
    };
    transaction.update(slotRef, { isBooked: true });
    transaction.set(bookingRef, payload);
    return payload;
  });

  return { cancelToken, booking: bookingData };
}

async function run() {
  const slotId = "slot-1";
  const db = createFakeDb({
    [`schedules/${slotId}`]: {
      date: "2099-06-01",
      time: "14:00",
      isBooked: false,
    },
  });

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

  assert.strictEqual(successes.length, 1, `expected 1 success, got ${successes.length}`);
  assert.strictEqual(failures.length, 1, `expected 1 failure, got ${failures.length}`);
  assert.strictEqual(failures[0].reason.code, "SLOT_TAKEN");
  assert.strictEqual(db._store.get(`schedules/${slotId}`).isBooked, true);

  const bookingEntries = [...db._store.entries()].filter(([k]) =>
    k.startsWith("bookings/")
  );
  assert.strictEqual(bookingEntries.length, 1);
  const [path, booking] = bookingEntries[0];
  assert.strictEqual(path, `bookings/${booking.cancelToken}`);
  assert.match(
    booking.cancelToken,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  console.log("PASS: parallel book calls → exactly one success");
  console.log("PASS: cancelToken is crypto.randomUUID() and equals booking doc id");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
