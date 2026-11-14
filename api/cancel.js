const { applyCors } = require("./_lib/cors");
const { enforceRateLimit } = require("./_lib/rateLimit");
const { getDb, getAuth } = require("./_lib/firebaseAdmin");
const {
  findBookingByCancelToken,
  findBookingById,
  cancelBookingTransaction,
  sendCancellationForBooking,
} = require("./_lib/bookings");

function publicBookingView(record) {
  const { id, data } = record;
  return {
    bookingId: id,
    name: data.name,
    date: data.date,
    time: data.time,
    status: data.status || "active",
    // email intentionally omitted
  };
}

async function verifyStaffToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    return decoded;
  } catch (error) {
    console.error("ID token verify failed:", error.message);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const cors = applyCors(req, res);
  if (cors.handled) return;
  if (!cors.ok) return;

  if (!enforceRateLimit(req, res, { keyPrefix: "cancel", max: 20, windowMs: 60_000 })) {
    return;
  }

  try {
    const db = getDb();

    // Guest preview: load booking summary by cancel token (no email exposed)
    if (req.method === "GET") {
      const token = String(req.query?.token || "").trim();
      if (!token) {
        return res.status(400).json({ error: "Missing token" });
      }

      const record = await findBookingByCancelToken(db, token);
      if (!record) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
      if (record.data.status === "cancelled") {
        return res.status(410).json({ error: "ALREADY_CANCELLED" });
      }

      return res.status(200).json({ booking: publicBookingView(record) });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const cancelToken = body.cancelToken ? String(body.cancelToken).trim() : "";
    const bookingId = body.bookingId ? String(body.bookingId).trim() : "";

    let record = null;

    if (cancelToken) {
      // Guest path — possession of the token from the email link
      record = await findBookingByCancelToken(db, cancelToken);
    } else if (bookingId) {
      // Barber path — must present a verified Firebase ID token
      const staff = await verifyStaffToken(req);
      if (!staff) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      record = await findBookingById(db, bookingId);
    } else {
      return res.status(400).json({
        error: "Missing cancelToken or bookingId",
      });
    }

    if (!record) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const cancelled = await cancelBookingTransaction(db, record);
    const emailResult = await sendCancellationForBooking(cancelled);

    return res.status(200).json({
      success: true,
      emailSent: emailResult.ok,
      ...(emailResult.ok ? {} : { emailError: emailResult.error }),
      booking: {
        name: cancelled.name,
        date: cancelled.date,
        time: cancelled.time,
      },
    });
  } catch (error) {
    if (error.code === "ADMIN_CONFIG") {
      console.error(error.message);
      return res.status(500).json({ error: "Server is not configured for cancellations" });
    }
    if (error.code === "ALREADY_CANCELLED" || error.message === "ALREADY_CANCELLED") {
      return res.status(410).json({ error: "ALREADY_CANCELLED" });
    }
    if (error.code === "NOT_FOUND" || error.message === "NOT_FOUND") {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    console.error("Cancel error:", error);
    return res.status(500).json({ error: "Cancel failed" });
  }
};
