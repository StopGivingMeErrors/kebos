/**
 * READ-ONLY consistency audit against Firestore (Admin SDK).
 * Never writes. Never deletes. Safe to run against production.
 *
 * Reports:
 *  - schedules with isBooked:true and no active booking
 *  - active bookings whose slot is missing or isBooked !== true
 *  - slots with multiple active bookings
 *  - booking counts by status and by month
 *
 * Usage:
 *   node scripts/audit-consistency.js
 *
 * Requires: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
const path = require("path");

try {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
} catch {
  // optional
}

const { initFirebaseAdmin, getDb } = require("../api/_lib/firebaseAdmin");

async function main() {
  console.log("--- audit-consistency (READ-ONLY) ---");
  console.log("This script does not modify any data.\n");

  initFirebaseAdmin();
  const db = getDb();

  const [schedulesSnap, bookingsSnap] = await Promise.all([
    db.collection("schedules").get(),
    db.collection("bookings").get(),
  ]);

  const schedules = new Map();
  schedulesSnap.docs.forEach((d) => {
    schedules.set(d.id, { id: d.id, ...d.data() });
  });

  const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const activeBySlot = new Map();
  const statusCounts = { active: 0, cancelled: 0, other: 0 };
  const byMonth = {};

  for (const b of bookings) {
    const status = b.status || "active";
    if (status === "active") statusCounts.active += 1;
    else if (status === "cancelled") statusCounts.cancelled += 1;
    else statusCounts.other += 1;

    if (b.date && String(b.date).length >= 7) {
      const month = String(b.date).substring(0, 7);
      byMonth[month] = (byMonth[month] || 0) + 1;
    }

    if (status === "active" && b.slotId) {
      if (!activeBySlot.has(b.slotId)) activeBySlot.set(b.slotId, []);
      activeBySlot.get(b.slotId).push(b.id);
    }
  }

  const bookedNoActive = [];
  for (const slot of schedules.values()) {
    if (slot.isBooked === true) {
      const actives = activeBySlot.get(slot.id) || [];
      if (actives.length === 0) {
        bookedNoActive.push({
          slotId: slot.id,
          date: slot.date,
          time: slot.time,
        });
      }
    }
  }

  const activeSlotNotBooked = [];
  for (const b of bookings) {
    if ((b.status || "active") !== "active") continue;
    const slot = b.slotId ? schedules.get(b.slotId) : null;
    if (!slot) {
      activeSlotNotBooked.push({
        bookingId: b.id,
        slotId: b.slotId || null,
        reason: "slot_missing",
        date: b.date,
        time: b.time,
      });
    } else if (slot.isBooked !== true) {
      activeSlotNotBooked.push({
        bookingId: b.id,
        slotId: b.slotId,
        reason: "slot_not_marked_booked",
        date: b.date,
        time: b.time,
      });
    }
  }

  const multiActive = [];
  for (const [slotId, ids] of activeBySlot.entries()) {
    if (ids.length > 1) {
      multiActive.push({ slotId, bookingIds: ids, count: ids.length });
    }
  }

  console.log("Counts by status:");
  console.log(`  active:    ${statusCounts.active}`);
  console.log(`  cancelled: ${statusCounts.cancelled}`);
  console.log(`  other:     ${statusCounts.other}`);
  console.log(`  total:     ${bookings.length}`);
  console.log(`  schedules: ${schedules.size}`);
  console.log("");

  console.log("Counts by month (all statuses):");
  Object.keys(byMonth)
    .sort()
    .forEach((m) => console.log(`  ${m}: ${byMonth[m]}`));
  console.log("");

  console.log(
    `Slots isBooked:true with NO active booking: ${bookedNoActive.length}`
  );
  bookedNoActive.slice(0, 50).forEach((r) => {
    console.log(`  - ${r.slotId} ${r.date} ${r.time}`);
  });
  if (bookedNoActive.length > 50) console.log(`  … +${bookedNoActive.length - 50} more`);
  console.log("");

  console.log(
    `Active bookings whose slot missing / not booked: ${activeSlotNotBooked.length}`
  );
  activeSlotNotBooked.slice(0, 50).forEach((r) => {
    console.log(
      `  - booking ${r.bookingId} slot=${r.slotId} (${r.reason}) ${r.date} ${r.time}`
    );
  });
  if (activeSlotNotBooked.length > 50) {
    console.log(`  … +${activeSlotNotBooked.length - 50} more`);
  }
  console.log("");

  console.log(`Slots with multiple active bookings: ${multiActive.length}`);
  multiActive.forEach((r) => {
    console.log(`  - slot ${r.slotId}: ${r.count} → ${r.bookingIds.join(", ")}`);
  });
  console.log("");
  console.log("Done (read-only). No data was modified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
