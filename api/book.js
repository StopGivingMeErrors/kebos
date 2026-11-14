const { applyCors } = require("./_lib/cors");
const { enforceRateLimit } = require("./_lib/rateLimit");
const { getDb } = require("./_lib/firebaseAdmin");
const {
  validateBookInput,
  createBookingTransaction,
  sendConfirmationForBooking,
} = require("./_lib/bookings");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const cors = applyCors(req, res);
  if (cors.handled) return;
  if (!cors.ok) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const validation = validateBookInput(body);
    if (!validation.ok) {
      return res.status(400).json(validation);
    }

    const { name, email, slotId } = body;

    // Generous: many retries + household NAT; email cap still stops spray abuse
    if (
      !(await enforceRateLimit(req, res, {
        keyPrefix: "book",
        max: 60,
        windowMs: 60_000,
        email: email,
        emailMax: 20,
      }))
    ) {
      return;
    }

    const db = getDb();

    const { cancelToken, booking } = await createBookingTransaction(db, {
      name,
      email,
      slotId,
    });

    const emailResult = await sendConfirmationForBooking(booking, cors.origin);

    return res.status(200).json({
      success: true,
      cancelToken,
      date: booking.date,
      time: booking.time,
      emailSent: emailResult.ok,
      ...(emailResult.ok ? {} : { emailError: emailResult.error }),
    });
  } catch (error) {
    if (error.code === "ADMIN_CONFIG") {
      console.error(error.message);
      return res.status(500).json({ error: "Server is not configured for bookings" });
    }
    if (error.code === "SLOT_TAKEN" || error.message === "SLOT_TAKEN") {
      return res.status(409).json({ error: "SLOT_TAKEN" });
    }
    if (error.code === "SLOT_NOT_FOUND" || error.message === "SLOT_NOT_FOUND") {
      return res.status(404).json({ error: "SLOT_NOT_FOUND" });
    }
    console.error("Book error:", error);
    return res.status(500).json({ error: "Booking failed" });
  }
};
