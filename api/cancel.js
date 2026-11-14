const { applyCors } = require("./_lib/cors");
const { enforceRateLimit } = require("./_lib/rateLimit");
const { getDb, adminConfigClientMessage } = require("./_lib/firebaseAdmin");
const { requireStaff } = require("./_lib/staffAuth");
const {
  findBookingByCancelToken,
  findBookingById,
  cancelBookingTransaction,
  sendCancellationForBooking,
} = require("./_lib/bookings");

function publicBookingView(record) {
  const { data } = record;
  // Only what CancelBookingPage needs — never email
  return {
    name: data.name,
    date: data.date,
    time: data.time,
    status: data.status || "active",
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  // GET preview: allow browser same-origin fetches that omit Origin.
  // POST stays strict (Origin required + allowlisted) — cancel button + staff.
  const cors = applyCors(req, res, {
    allowSameOriginGet: req.method === "GET",
  });
  if (cors.handled) return;
  if (!cors.ok) return;

  try {
    const db = getDb();

    // Guest preview: load booking summary by cancel token (no email exposed)
    if (req.method === "GET") {
      if (
        !(await enforceRateLimit(req, res, {
          keyPrefix: "cancel-get",
          max: 60,
          windowMs: 60_000,
        }))
      ) {
        return;
      }

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
      if (
        !(await enforceRateLimit(req, res, {
          keyPrefix: "cancel",
          max: 30,
          windowMs: 60_000,
          email: null,
        }))
      ) {
        return;
      }
      // Guest path — possession of the token from the email link
      record = await findBookingByCancelToken(db, cancelToken);
    } else if (bookingId) {
      // Barber path — verified ID token + staff:true claim
      const staffGate = await requireStaff(req, res);
      if (!staffGate.ok) return;
      if (
        !(await enforceRateLimit(req, res, {
          keyPrefix: "cancel-staff",
          max: 60,
          windowMs: 60_000,
        }))
      ) {
        return;
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
    if (error.code === "ADMIN_CONFIG" || error.code === "ADMIN_KEY_FORMAT") {
      console.error("[api/cancel]", error.message);
      return res.status(500).json({ error: adminConfigClientMessage(error) });
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
