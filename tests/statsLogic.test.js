const assert = require("assert");
const {
  summarizeBookings,
  partitionBookings,
  countByDay,
} = require("../src/statsLogic.js");

const sample = [
  { date: "2099-01-01", status: "active" },
  { date: "2099-01-01", status: "cancelled" },
  { date: "2099-01-02", status: "active" },
  { date: "2099-02-10", status: "cancelled" },
  { date: "2099-02-11" }, // missing status → treated as non-cancelled
];

const { active, cancelled } = partitionBookings(sample);
assert.strictEqual(active.length, 3);
assert.strictEqual(cancelled.length, 2);

const summary = summarizeBookings(sample);
assert.strictEqual(summary.totalNonCancelled, 3);
assert.strictEqual(summary.totalCancelled, 2);
assert.strictEqual(summary.totalAll, 5);

const day = countByDay(active);
const jan1 = day.find((d) => d.date === "2099-01-01");
assert.strictEqual(jan1.count, 1, "cancelled must not inflate day chart");

const feb = summary.byMonth.find((m) => m.month === "2099-02");
assert.ok(feb);
assert.strictEqual(feb.count, 1, "Feb chart counts only non-cancelled");

console.log("PASS: statsLogic counts non-cancelled only; cancelled separate");
