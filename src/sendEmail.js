/**
 * Client helper for the /api/send-email serverless endpoint.
 * Templates are built on the server — never send raw HTML from the browser.
 */
export async function sendAppEmail(payload) {
  try {
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
