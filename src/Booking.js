import React, { useState, useEffect } from "react";
import { db } from "./firebase/firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  runTransaction,
} from "firebase/firestore";
import ThemeToggle from "./ThemeToggle";
import { v4 as uuidv4 } from "uuid";

function Booking() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const fetchSlots = async () => {
    try {
      const snapshot = await getDocs(collection(db, "schedules"));
      const now = new Date();

      const slots = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((slot) => {
          if (slot.isBooked) return false;
          const slotDateTime = new Date(`${slot.date}T${slot.time}`);
          return slotDateTime > now;
        })
        .sort(
          (a, b) =>
            new Date(`${a.date} ${a.time}`) -
            new Date(`${b.date} ${b.time}`)
        );

      setAvailableSlots(slots);
    } catch (error) {
      console.error("Error fetching slots:", error);
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

      const bookingData = await runTransaction(db, async (transaction) => {
        const slotDoc = await transaction.get(slotRef);

        if (!slotDoc.exists()) throw new Error("SLOT_NOT_FOUND");

        const slotData = slotDoc.data();

        if (slotData.isBooked) throw new Error("SLOT_TAKEN");

        transaction.update(slotRef, { isBooked: true });

        return slotData;
      });

      const cancelToken = uuidv4();

      await addDoc(collection(db, "bookings"), {
        name,
        email,
        slotId: selectedSlot,
        date: bookingData.date,
        time: bookingData.time,
        timestamp: new Date(),
        cancelToken,
        status: "active",
      });

      const cancelUrl = `https://www.kebos.online/cancel-booking?token=${cancelToken}`;

      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: "Tsaat to rantevou ekleise brat 💈",
          html: `
            <h2>Your appointment is confirmed!</h2>
            <p>Hi ${name},</p>
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
      } else {
        alert("Booking failed");
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

  const inputStyle = (darkMode) => ({
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid rgba(0,0,0,0.1)",
    outline: "none",
    fontSize: "0.95rem",
    background: darkMode ? "#1a1a1a" : "#fff",
    color: darkMode ? "#fff" : "#000",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: darkMode ? "#0a0a0a" : "#f5f5f7",
        color: darkMode ? "#fff" : "#000",
      }}
    >
      {/* 🍎 Navbar */}
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
        <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>
          Kebos ✂️
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>
            {today}
          </span>

          {/* ✅ YOUR ORIGINAL BUTTON RESTORED */}
          <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
        </div>
      </div>

      {/* Page */}
      <div style={{ maxWidth: "420px", margin: "40px auto", padding: "0 16px" }}>
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
            disabled={submitting}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: submitting ? "#666" : "#0071e3",
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