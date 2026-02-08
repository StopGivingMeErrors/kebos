// src/Booking.js
import React, { useState, useEffect } from "react";
import { db } from "./firebase/firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  getDoc,
  doc,
} from "firebase/firestore";
import ThemeToggle from "./ThemeToggle";

function Booking() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const fetchAvailableSlots = async () => {
      try {
        const snapshot = await getDocs(collection(db, "schedules"));
        const slots = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((slot) => !slot.isBooked)
          .sort((a, b) => new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`));

        setAvailableSlots(slots);
      } catch (error) {
        console.error("Error fetching available slots:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAvailableSlots();
  }, []);

  const handleBooking = async (e) => {
    e.preventDefault();
    if (!name || !email || !selectedSlot) return alert("Fill all fields");

    try {
      // IMPORTANT — read actual Firestore doc
      const slotRef = doc(db, "schedules", selectedSlot);
      const slotSnap = await getDoc(slotRef);

      if (!slotSnap.exists()) return alert("Error: Slot not found.");
      
      const slotData = slotSnap.data();

      // If someone else booked it first
      if (slotData.isBooked) {
        alert("Bro someone just grabbed this slot before you 😭");
        return;
      }

      // Create booking document
      await addDoc(collection(db, "bookings"), {
        name,
        email,
        date: slotData.date,
        time: slotData.time,
        timestamp: new Date(),
      });

      // Mark slot booked – NOW safe
      await updateDoc(slotRef, { isBooked: true });

      alert("Arakse bro mou to rantevou ekleise!");

      // Reset fields
      setName("");
      setEmail("");
      setSelectedSlot("");

      // Refresh slots immediately
      const snapshot = await getDocs(collection(db, "schedules"));
      const refreshedSlots = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((slot) => !slot.isBooked);

      setAvailableSlots(refreshedSlots);

    } catch (error) {
      console.error("Error adding booking:", error);
      alert("Error making booking");
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <h2>Loading available slots...</h2>
      </div>
    );
  }

  return (
    <div
      style={{
        background: darkMode ? "#111111" : "#eeeeee",
        color: darkMode ? "#eeeeee" : "#000000",
        minHeight: "100vh",
        padding: "1rem",
        transition: "all 0.3s ease",
      }}
    >
      <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "80vh",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "500px", width: "100%" }}>
          <h1 style={{ textAlign: "center", marginBottom: "2rem" }}>
            Pote thes bro?
          </h1>
          <form
            onSubmit={handleBooking}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                padding: "0.75rem",
                fontSize: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
                background: darkMode ? "#222" : "#fff",
                color: darkMode ? "#eee" : "#000",
              }}
            />

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                padding: "0.75rem",
                fontSize: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
                background: darkMode ? "#222" : "#fff",
                color: darkMode ? "#eee" : "#000",
              }}
            />

            <select
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              style={{
                padding: "0.75rem",
                fontSize: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
                background: darkMode ? "#222" : "#fff",
                color: darkMode ? "#eee" : "#000",
              }}
            >
              <option value="">Select a Slot</option>
              {availableSlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.date} – {slot.time}
                </option>
              ))}
            </select>

            <button
              type="submit"
              style={{
                padding: "0.75rem",
                fontSize: "1rem",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Book
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Booking;
