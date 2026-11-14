const assert = require("assert");
const {
  slimBookings,
  readCache,
  writeCache,
  isRefreshAllowed,
  markRefreshDone,
  cooldownRemainingMs,
  COOLDOWN_MS,
  CACHE_KEY,
} = require("../src/statsCache.js");

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

const storage = memoryStorage();

const slim = slimBookings([
  { date: "2099-01-01", status: "active", email: "secret@example.com", name: "Secret" },
]);
assert.deepStrictEqual(slim, [{ date: "2099-01-01", status: "active" }]);
assert.ok(!("email" in slim[0]) && !("name" in slim[0]));

assert.strictEqual(readCache(storage), null);

const written = writeCache(
  [{ date: "2099-02-01", status: "cancelled", email: "x@y.z", name: "N" }],
  storage,
  new Date("2099-03-01T12:00:00.000Z")
);
assert.strictEqual(written.bookings[0].date, "2099-02-01");
assert.ok(!("email" in written.bookings[0]));
const cached = readCache(storage);
assert.ok(cached);
assert.strictEqual(cached.fetchedAt, "2099-03-01T12:00:00.000Z");
assert.strictEqual(cached.bookings.length, 1);

const t0 = 1_000_000;
assert.strictEqual(isRefreshAllowed(t0, storage), true);
const until = markRefreshDone(t0, storage);
assert.strictEqual(until, t0 + COOLDOWN_MS);
assert.strictEqual(isRefreshAllowed(t0 + 1, storage), false);
assert.strictEqual(cooldownRemainingMs(t0 + 1, storage), COOLDOWN_MS - 1);
assert.strictEqual(isRefreshAllowed(t0 + COOLDOWN_MS, storage), true);

assert.ok(CACHE_KEY);

console.log("PASS: statsCache slim records, read/write, 60s cooldown");
