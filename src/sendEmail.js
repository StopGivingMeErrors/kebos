/**
 * Client helper for /api/send-email.
 * Recipient is never sent from the browser — pass bookingId or cancelToken only.
 * Prefer letting /api/book and /api/cancel send email after their transactions.
 */
export async function sendAppEmail({ type, bookingId, cancelToken }) {
  try {
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, bookingId, cancelToken }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: data?.error || data?.detail || "Email request failed",
      };
    }

    return { ok: true, id: data?.id || null };
  } catch (error) {
    console.error("sendAppEmail network error:", error);
    return { ok: false, error: "Network error while sending email" };
  }
}
