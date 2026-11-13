const { Resend } = require("resend");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ORIGINS = [
  "https://kebos.vercel.app",
  "https://kevos.site",
  "https://www.kevos.site",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatAppointmentDate = (dateStr) => {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const layout = ({ title, bodyHtml }) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:20px 24px;background:#111827;color:#ffffff;">
                <div style="font-size:18px;font-weight:700;letter-spacing:0.2px;">Kevos</div>
                <div style="font-size:13px;opacity:0.8;margin-top:4px;">Barber appointments</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5;">
                This message was sent by Kevos. If you did not make this request, you can ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const buildBookingConfirmed = ({ name, date, time, cancelUrl }) => {
  const safeName = escapeHtml(name);
  const safeDate = escapeHtml(formatAppointmentDate(date));
  const safeTime = escapeHtml(time);
  const safeCancelUrl = escapeHtml(cancelUrl);

  const subject = "Your Kevos appointment is confirmed";
  const text = [
    `Hi ${name},`,
    "",
    "Your appointment is confirmed.",
    `Date: ${formatAppointmentDate(date)}`,
    `Time: ${time}`,
    "",
    cancelUrl ? `Cancel booking: ${cancelUrl}` : "",
    "",
    "See you soon,",
    "Kevos",
  ]
    .filter(Boolean)
    .join("\n");

  const html = layout({
    title: subject,
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#111827;">Appointment confirmed</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Your booking is confirmed. Here are the details:</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 22px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;font-size:14px;line-height:1.6;">
            <div><strong>Date:</strong> ${safeDate}</div>
            <div style="margin-top:6px;"><strong>Time:</strong> ${safeTime}</div>
          </td>
        </tr>
      </table>
      ${
        cancelUrl
          ? `<a href="${safeCancelUrl}" style="display:inline-block;padding:12px 20px;background:#dc2626;color:#ffffff;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">Cancel booking</a>
             <p style="margin:14px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">If the button does not work, open this link:<br/>${safeCancelUrl}</p>`
          : ""
      }
      <p style="margin:22px 0 0;font-size:15px;line-height:1.6;">See you soon,<br/><strong>Kevos</strong></p>
    `,
  });

  return { subject, html, text };
};

const buildBookingCancelled = ({ name, date, time }) => {
  const safeName = escapeHtml(name);
  const safeDate = escapeHtml(formatAppointmentDate(date));
  const safeTime = escapeHtml(time);

  const subject = "Your Kevos appointment was cancelled";
  const text = [
    `Hi ${name},`,
    "",
    "Your appointment has been cancelled.",
    `Date: ${formatAppointmentDate(date)}`,
    `Time: ${time}`,
    "",
    "You can book another time on the Kevos website whenever you like.",
    "",
    "Kevos",
  ].join("\n");

  const html = layout({
    title: subject,
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#111827;">Appointment cancelled</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Your appointment has been cancelled:</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 22px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;font-size:14px;line-height:1.6;">
            <div><strong>Date:</strong> ${safeDate}</div>
            <div style="margin-top:6px;"><strong>Time:</strong> ${safeTime}</div>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:15px;line-height:1.6;">You can book another time on the Kevos website whenever you like.</p>
      <p style="margin:22px 0 0;font-size:15px;line-height:1.6;"><strong>Kevos</strong></p>
    `,
  });

  return { subject, html, text };
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // same-origin / server-to-server
  return ALLOWED_ORIGINS.includes(origin);
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return res.status(500).json({ error: "Email service is not configured" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { type, to, name, date, time, cancelUrl } = body;

    if (!type || !to || !name || !date || !time) {
      return res.status(400).json({
        error: "Missing fields",
        required: ["type", "to", "name", "date", "time"],
      });
    }

    if (!EMAIL_RE.test(String(to).trim())) {
      return res.status(400).json({ error: "Invalid recipient email" });
    }

    if (String(name).trim().length < 2 || String(name).length > 80) {
      return res.status(400).json({ error: "Invalid name" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ error: "Invalid date" });
    }

    if (!/^\d{2}:\d{2}$/.test(String(time))) {
      return res.status(400).json({ error: "Invalid time" });
    }

    if (cancelUrl && typeof cancelUrl === "string") {
      try {
        const parsed = new URL(cancelUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return res.status(400).json({ error: "Invalid cancel URL" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid cancel URL" });
      }
    }

    let template;
    if (type === "booking_confirmed") {
      template = buildBookingConfirmed({
        name: String(name).trim(),
        date: String(date),
        time: String(time),
        cancelUrl: cancelUrl ? String(cancelUrl) : "",
      });
    } else if (type === "booking_cancelled") {
      template = buildBookingCancelled({
        name: String(name).trim(),
        date: String(date),
        time: String(time),
      });
    } else {
      return res.status(400).json({ error: "Unknown email type" });
    }

    const from = process.env.EMAIL_FROM || "Kevos <bookings@kevos.site>";
    const replyTo = process.env.EMAIL_REPLY_TO || undefined;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to: [String(to).trim().toLowerCase()],
      subject: template.subject,
      html: template.html,
      text: template.text,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(502).json({
        error: "Failed to send email",
        detail: error.message || "Unknown provider error",
      });
    }

    return res.status(200).json({ success: true, id: data?.id || null });
  } catch (error) {
    console.error("Email error:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
};
