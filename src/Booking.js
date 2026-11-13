import React, { useState, useEffect } from "react";
import { db } from "./firebase/firebaseConfig";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  runTransaction,
} from "firebase/firestore";
import ThemeToggle from "./ThemeToggle";

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const makeCancelToken = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `tok_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

function Booking() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [loadError, setLoadError] = useState("");

  const fetchSlots = async () => {
    try {
      setLoadError("");
      const now = new Date();
      const today = todayISO();
      let snapshot;

      try {
        // Prefer free + upcoming only (needs composite index)
        snapshot = await getDocs(
          query(
            collection(db, "schedules"),
            where("isBooked", "==", false),
            where("date", ">=", today)
          )
        );
      } catch (indexErr) {
        if (indexErr.code !== "failed-precondition") throw indexErr;
        // Fallback until composite index is built
        snapshot = await getDocs(
          query(collection(db, "schedules"), where("date", ">=", today))
        );
      }

      const slots = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((slot) => {
          if (slot.isBooked) return false;
          const slotDateTime = new Date(`${slot.date}T${slot.time}:00`);
          return !Number.isNaN(slotDateTime.getTime()) && slotDateTime > now;
        })
        .sort(
          (a, b) =>
            new Date(`${a.date}T${a.time}:00`) -
            new Date(`${b.date}T${b.time}:00`)
        );

      setAvailableSlots(slots);
    } catch (error) {
      console.error("Error fetching slots:", error);
      if (error.code === "resource-exhausted") {
        setLoadError(
          "Booking system is temporarily unavailable (daily limit reached). Please try again later today."
        );
      } else {
        setLoadError("Could not load available slots. Please refresh.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, []);

  const handleBooking = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!name || !email || !selectedSlot) {
      return alert("Fill all fields");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return alert("Invalid email");
    }

    if (name.trim().length < 2) {
      return alert("Invalid name");
    }

    setSubmitting(true);

    try {
      const slotRef = doc(db, "schedules", selectedSlot);
      // Use cancel token as booking document ID so cancel links can getDoc
      // without listing the bookings collection or needing a cancelTokens collection.
      const cancelToken = makeCancelToken();
      const bookingRef = doc(db, "bookings", cancelToken);

      const bookingData = await runTransaction(db, async (transaction) => {
        const slotDoc = await transaction.get(slotRef);

        if (!slotDoc.exists()) throw new Error("SLOT_NOT_FOUND");

        const slotData = slotDoc.data();

        if (slotData.isBooked) throw new Error("SLOT_TAKEN");

        transaction.update(slotRef, { isBooked: true });
        transaction.set(bookingRef, {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          slotId: selectedSlot,
          date: slotData.date,
          time: slotData.time,
          timestamp: new Date(),
          cancelToken,
          status: "active",
        });

        return slotData;
      });

      const cancelUrl = `${window.location.origin}/cancel-booking?token=${cancelToken}`;

      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.trim().toLowerCase(),
          subject: "Tsaat to rantevou ekleise brat 💈",
          html: `
            <h2>Your appointment is confirmed!</h2>
            <p>Hi ${name.trim()},</p>
            <p><strong>Date:</strong> ${bookingData.date}</p>
            <p><strong>Time:</strong> ${bookingData.time}</p>

            <br/>

            <a href="${cancelUrl}" style="
              display:inline-block;
              padding:14px 28px;
              background:#ef4444;
              color:white;
              border-radius:8px;
              font-weight:bold;
              text-decoration:none;
            ">
              Cancel Booking
            </a>
          `,
        }),
      }).catch(console.error);

      alert("Arakse bro mou to rantevou ekleise!");

      setName("");
      setEmail("");
      setSelectedSlot("");

      await fetchSlots();
    } catch (error) {
      console.error(error);

      if (error.message === "SLOT_TAKEN") {
        alert("Slot already taken 😭");
        await fetchSlots();
      } else if (error.message === "SLOT_NOT_FOUND") {
        alert("Slot not found");
        await fetchSlots();
      } else if (error.code === "resource-exhausted") {
        alert(
          "Booking system hit its daily read limit. Please try again after midnight US Pacific time."
        );
      } else if (error.code === "permission-denied") {
        alert("Booking is blocked by security rules. Please contact the shop.");
      } else {
        alert(`Booking failed: ${error.code || error.message || "unknown error"}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <h2 style={{ textAlign: "center" }}>Loading...</h2>;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const inputStyle = (isDark) => ({
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid rgba(0,0,0,0.1)",
    outline: "none",
    fontSize: "0.95rem",
    background: isDark ? "#1a1a1a" : "#fff",
    color: isDark ? "#fff" : "#000",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: darkMode ? "#0a0a0a" : "#f5f5f7",
        color: darkMode ? "#fff" : "#000",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          background: darkMode
            ? "rgba(20,20,20,0.6)"
            : "rgba(255,255,255,0.6)",
          borderBottom: darkMode
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(0,0,0,0.08)",
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>Kebos ✂️</div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>{today}</span>
          <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
        </div>
      </div>

      <div style={{ maxWidth: "420px", margin: "40px auto", padding: "0 16px" }}>
        {loadError && (
          <p
            style={{
              background: "#fef2f2",
              color: "#b91c1c",
              padding: "12px",
              borderRadius: "10px",
              marginBottom: "12px",
            }}
          >
            {loadError}
          </p>
        )}

        <form
          onSubmit={handleBooking}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            style={inputStyle(darkMode)}
          />

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={inputStyle(darkMode)}
          />

          <select
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value)}
            style={inputStyle(darkMode)}
          >
            <option value="">Select slot</option>
            {availableSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.date} – {slot.time}
              </option>
            ))}
          </select>

          <button
            disabled={submitting || !!loadError || availableSlots.length === 0}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background:
                submitting || loadError || availableSlots.length === 0
                  ? "#666"
                  : "#0071e3",
              color: "white",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            {submitting ? "Booking..." : "Book Appointment"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Booking;
