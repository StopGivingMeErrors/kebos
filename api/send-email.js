const { Resend } = require("resend");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { to, subject, html } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const result = await resend.emails.send({
      from: "Your App <onboarding@resend.dev>", // ✅ change later
      to,
      subject,
      html,
    });

    return res.status(200).json({ success: true, id: result.id });

  } catch (error) {
    console.error("Email error:", error);
    return res.status(500).json({
      error: "Failed to send email",
    });
  }
};