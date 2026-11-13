import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "./firebase/firebaseConfig";
import { doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { formatAppointmentDate } from "./dateFormat";

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
        // New bookings use cancel token as the booking document ID.
        const bookingSnap = await getDoc(doc(db, "bookings", token));

        if (!bookingSnap.exists()) {
          setStatus("error");
          setMessage(
            "This cancel link is invalid or expired. Contact the shop to cancel."
          );
          return;
        }

        const data = bookingSnap.data();
        if (data.status === "cancelled") {
          setStatus("error");
          setMessage("This booking was already cancelled.");
          return;
        }

        setBookingInfo({
          bookingId: bookingSnap.id,
          slotId: data.slotId,
          name: data.name,
          date: data.date,
          time: data.time,
        });
        setStatus("confirm");
      } catch (error) {
        console.error(error);
        if (error.code === "resource-exhausted") {
          setMessage(
            "System is temporarily over its daily limit. Please try again later."
          );
        } else if (error.code === "permission-denied") {
          setMessage(
            "Cancel link cannot be verified right now. Please contact the shop."
          );
        } else {
          setMessage("Could not load booking. Please try again.");
        }
        setStatus("error");
      }
    };

    load();
  }, [token]);

  const handleCancel = async () => {
    if (!token || !bookingInfo || busy) return;
    setBusy(true);

    try {
      const bookingRef = doc(db, "bookings", bookingInfo.bookingId);
      const slotRef = bookingInfo.slotId
        ? doc(db, "schedules", bookingInfo.slotId)
        : null;

      // Free the slot first (allowed publicly by current rules).
      if (slotRef) {
        const slotSnap = await getDoc(slotRef);
        if (slotSnap.exists()) {
          await updateDoc(slotRef, { isBooked: false });
        }
      }

      // Public rules usually allow status update; delete is staff-only.
      try {
        await updateDoc(bookingRef, {
          status: "cancelled",
          cancelledAt: new Date(),
        });
      } catch {
        await deleteDoc(bookingRef);
      }

      setStatus("success");
      setMessage("Your booking has been cancelled.");
    } catch (error) {
      console.error(error);
      if (error.message === "ALREADY_CANCELLED") {
        setMessage("This booking was already cancelled.");
        setStatus("error");
      } else if (error.code === "resource-exhausted") {
        setMessage(
          "System is temporarily over its daily limit. Please try again later."
        );
        setStatus("error");
      } else if (error.code === "permission-denied") {
        // Slot may already be freed even if booking doc can't be deleted publicly.
        setStatus("success");
        setMessage(
          "Your slot has been released. If it still appears booked, contact the shop."
        );
      } else {
        setMessage("Failed to cancel booking. Please contact the shop.");
        setStatus("error");
      }
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
