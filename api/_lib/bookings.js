const { randomUUID } = require("crypto");
const { sendBookingEmail } = require("./email");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resolve a booking by cancel token.
 *
 * SURGICAL COMPAT: Existing cancel links use ?token=<bookingDocId> because
 * older client code set the booking document ID equal to cancelToken.
 * Always try document ID first, then fall back to a cancelToken field query
 * so both legacy and any future field-only tokens keep working.
 */
async function findBookingByCancelToken(db, token) {
  const tokenStr = String(token || "").trim();
  if (!tokenStr) return null;

  const byId = await db.collection("bookings").doc(tokenStr).get();
  if (byId.exists) {
    return { id: byId.id, ref: byId.ref, data: byId.data() };
  }

  const q = await db
    .collection("bookings")
    .where("cancelToken", "==", tokenStr)
    .limit(1)
    .get();

  if (q.empty) return null;

  const docSnap = q.docs[0];
  return { id: docSnap.id, ref: docSnap.ref, data: docSnap.data() };
}

async function findBookingById(db, bookingId) {
  const id = String(bookingId || "").trim();
  if (!id) return null;
  const snap = await db.collection("bookings").doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ref: snap.ref, data: snap.data() };
}

/**
 * Atomic book: check slot free → set isBooked → create booking.
 * Document ID === cancelToken (crypto.randomUUID) so cancel URLs stay
 * /cancel-booking?token=<uuid> for both old and new bookings.
 */
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

/**
 * Atomic cancel: free slot + mark booking cancelled in one transaction.
 */
async function cancelBookingTransaction(db, bookingRecord) {
  const { ref, data } = bookingRecord;

  if (data.status === "cancelled") {
    const err = new Error("ALREADY_CANCELLED");
    err.code = "ALREADY_CANCELLED";
    throw err;
  }

  const slotId = data.slotId || null;

  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(ref);
    if (!fresh.exists) {
      const err = new Error("NOT_FOUND");
      err.code = "NOT_FOUND";
      throw err;
    }
    const live = fresh.data();
    if (live.status === "cancelled") {
      const err = new Error("ALREADY_CANCELLED");
      err.code = "ALREADY_CANCELLED";
      throw err;
    }

    const liveSlotId = live.slotId || slotId;
    if (liveSlotId) {
      const slotRef = db.collection("schedules").doc(liveSlotId);
      const slotSnap = await transaction.get(slotRef);
      if (slotSnap.exists) {
        transaction.update(slotRef, { isBooked: false });
      }
    }

    transaction.update(ref, {
      status: "cancelled",
      cancelledAt: new Date(),
    });
  });

  return {
    name: data.name,
    email: data.email,
    date: data.date,
    time: data.time,
    slotId,
    cancelToken: data.cancelToken || bookingRecord.id,
  };
}

function validateBookInput({ name, email, slotId }) {
  if (!name || !email || !slotId) {
    return { ok: false, error: "Missing fields", required: ["name", "email", "slotId"] };
  }
  if (String(name).trim().length < 2 || String(name).length > 80) {
    return { ok: false, error: "Invalid name" };
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    return { ok: false, error: "Invalid email" };
  }
  if (typeof slotId !== "string" || slotId.length < 1 || slotId.length > 128) {
    return { ok: false, error: "Invalid slotId" };
  }
  return { ok: true };
}

function buildCancelUrl(origin, cancelToken) {
  const base = (origin || "https://kevos.site").replace(/\/$/, "");
  return `${base}/cancel-booking?token=${encodeURIComponent(cancelToken)}`;
}

async function sendConfirmationForBooking(booking, origin) {
  const cancelUrl = buildCancelUrl(origin, booking.cancelToken);
  try {
    const result = await sendBookingEmail({
      type: "booking_confirmed",
      booking,
      cancelUrl,
    });
    return { ok: true, id: result.id };
  } catch (error) {
    console.error("Confirmation email failed:", error);
    return { ok: false, error: error.message || "Email failed" };
  }
}

async function sendCancellationForBooking(booking) {
  try {
    const result = await sendBookingEmail({
      type: "booking_cancelled",
      booking,
    });
    return { ok: true, id: result.id };
  } catch (error) {
    console.error("Cancellation email failed:", error);
    return { ok: false, error: error.message || "Email failed" };
  }
}

module.exports = {
  findBookingByCancelToken,
  findBookingById,
  createBookingTransaction,
  cancelBookingTransaction,
  validateBookInput,
  buildCancelUrl,
  sendConfirmationForBooking,
  sendCancellationForBooking,
  EMAIL_RE,
};
