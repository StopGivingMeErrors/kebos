import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatAppointmentDate } from "./dateFormat";

/**
 * Guest cancel UI.
 *
 * Existing email links use ?token=<bookingDocId> (doc id === cancelToken).
 * This page never writes to Firestore — it calls /api/cancel, which resolves
 * the token by document ID first (legacy + current), then by cancelToken field.
 */
function CancelBookingPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState("loading"); // loading | confirm | success | error
  const [message, setMessage] = useState("");
  const [bookingInfo, setBookingInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Missing cancel token.");
        return;
      }

      try {
        const response = await fetch(
          `/api/cancel?token=${encodeURIComponent(token)}`
        );
        let data = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (response.status === 404 || data?.error === "NOT_FOUND") {
          setStatus("error");
          setMessage(
            "This cancel link is invalid or expired. Contact the shop to cancel."
          );
          return;
        }

        if (response.status === 410 || data?.error === "ALREADY_CANCELLED") {
          setStatus("error");
          setMessage("This booking was already cancelled.");
          return;
        }

        if (!response.ok || !data?.booking) {
          setStatus("error");
          setMessage("Could not load booking. Please try again.");
          return;
        }

        setBookingInfo(data.booking);
        setStatus("confirm");
      } catch (error) {
        console.error(error);
        setMessage("Could not load booking. Please try again.");
        setStatus("error");
      }
    };

    load();
  }, [token]);

  const handleCancel = async () => {
    if (!token || !bookingInfo || busy) return;
    setBusy(true);

    try {
      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelToken: token }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.status === 410 || data?.error === "ALREADY_CANCELLED") {
        setMessage("This booking was already cancelled.");
        setStatus("error");
        return;
      }

      if (response.status === 404 || data?.error === "NOT_FOUND") {
        setMessage(
          "This cancel link is invalid or expired. Contact the shop to cancel."
        );
        setStatus("error");
        return;
      }

      if (response.status === 429) {
        setMessage("Too many requests. Please wait a moment and try again.");
        setStatus("error");
        return;
      }

      if (!response.ok) {
        setMessage("Failed to cancel booking. Please contact the shop.");
        setStatus("error");
        return;
      }

      setStatus("success");
      setMessage("Your booking has been cancelled.");
    } catch (error) {
      console.error(error);
      setMessage("Failed to cancel booking. Please contact the shop.");
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f5f5f7",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: "1.4rem" }}>Cancel booking</h1>

        {status === "loading" && <p>Loading…</p>}

        {status === "confirm" && bookingInfo && (
          <>
            <p>
              Cancel appointment for <strong>{bookingInfo.name}</strong>?
            </p>
            <p>
              <strong>Date:</strong> {formatAppointmentDate(bookingInfo.date)}
              <br />
              <strong>Time:</strong> {bookingInfo.time}
            </p>
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              style={{
                width: "100%",
                padding: "12px",
                border: "none",
                borderRadius: "8px",
                background: busy ? "#fca5a5" : "#ef4444",
                color: "#fff",
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Cancelling…" : "Confirm cancel"}
            </button>
          </>
        )}

        {(status === "success" || status === "error") && (
          <p style={{ color: status === "success" ? "#15803d" : "#b91c1c" }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default CancelBookingPage;
