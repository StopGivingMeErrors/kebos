/**
 * Email endpoint — recipient is NEVER caller-supplied.
 * Requires bookingId or cancelToken; loads email from Firestore server-side.
 * Prefer /api/book and /api/cancel which send email after their transactions.
 */
const { applyCors } = require("./_lib/cors");
const { enforceRateLimit } = require("./_lib/rateLimit");
const { getDb } = require("./_lib/firebaseAdmin");
const { sendBookingEmail } = require("./_lib/email");
const {
  findBookingByCancelToken,
  findBookingById,
  buildCancelUrl,
} = require("./_lib/bookings");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const cors = applyCors(req, res);
  if (cors.handled) return;
  if (!cors.ok) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!enforceRateLimit(req, res, { keyPrefix: "email", max: 10, windowMs: 60_000 })) {
    return;
  }

  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return res.status(500).json({ error: "Email service is not configured" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { type, bookingId, cancelToken } = body;

    if (!type) {
      return res.status(400).json({ error: "Missing type" });
    }
    if (type !== "booking_confirmed" && type !== "booking_cancelled") {
      return res.status(400).json({ error: "Unknown email type" });
    }
    if (!bookingId && !cancelToken) {
      return res.status(400).json({
        error: "Missing bookingId or cancelToken",
        required: ["type", "bookingId|cancelToken"],
      });
    }

    // Reject any attempt to supply a recipient from the client
    if (body.to != null || body.email != null || body.recipient != null) {
      return res.status(400).json({
        error: "Caller-supplied recipient is not allowed",
      });
    }

    const db = getDb();
    let record = null;
    if (cancelToken) {
      record = await findBookingByCancelToken(db, cancelToken);
    } else {
      record = await findBookingById(db, bookingId);
    }

    if (!record) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = {
      name: record.data.name,
      email: record.data.email,
      date: record.data.date,
      time: record.data.time,
      cancelToken: record.data.cancelToken || record.id,
    };

    const cancelUrl =
      type === "booking_confirmed"
        ? buildCancelUrl(cors.origin, booking.cancelToken)
        : "";

    const result = await sendBookingEmail({ type, booking, cancelUrl });

    return res.status(200).json({ success: true, id: result.id || null });
  } catch (error) {
    if (error.code === "ADMIN_CONFIG") {
      console.error(error.message);
      return res.status(500).json({ error: "Server is not configured" });
    }
    if (error.code === "EMAIL_CONFIG" || error.code === "INVALID_BOOKING_EMAIL") {
      return res.status(500).json({ error: error.message });
    }
    if (error.code === "RESEND_ERROR") {
      console.error("Resend error:", error.detail || error);
      return res.status(502).json({
        error: "Failed to send email",
        detail: error.message,
      });
    }
    console.error("Email error:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
};
