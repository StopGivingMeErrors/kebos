// src/Dashboard.js
import React, { useEffect, useState } from "react";
import emailjs from "@emailjs/browser";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase/firebaseConfig";
import { signOut } from "firebase/auth";
import ThemeToggle from "./ThemeToggle";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

const Dashboard = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [daysAhead, setDaysAhead] = useState(1);

  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if not logged in + Setup real-time listeners
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate("/login");
      }
    });
    return unsubscribe;
  }, [navigate]);

  // Real-time listener for slots (eliminates need for fetchData)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "schedules"),
      (snapshot) => {
        const fetchedSlots = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Sort slots chronologically
        fetchedSlots.sort((a, b) => {
          const dateTimeA = new Date(`${a.date}T${a.time}`);
          const dateTimeB = new Date(`${b.date}T${b.time}`);
          return dateTimeA - dateTimeB;
        });

        setSlots(fetchedSlots);
      },
      (error) => {
        console.error("Error fetching slots:", error);
        alert("Failed to load schedule slots");
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time listener for bookings
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        const fetchedBookings = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setBookings(fetchedBookings);
      },
      (error) => {
        console.error("Error fetching bookings:", error);
        alert("Failed to load bookings");
      }
    );

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      alert("Failed to logout");
    }
  };

  // Add multiple slots based on start-end range
  const addRangeSlots = async () => {
    if (!date || !startTime || !endTime) {
      return alert("Fill date and time range");
    }

    if (daysAhead < 1 || daysAhead > 10) {
      return alert("You can only generate between 1 and 10 days");
    }

    const duration = 15;
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes >= endMinutes) {
      return alert("End time must be after start time");
    }

    setLoading(true);

    try {
      // Fetch current slots from Firestore
      const snapshot = await getDocs(collection(db, "schedules"));
      
      // Use Set for O(1) lookup instead of O(n)
      const existingSlotKeys = new Set(
        snapshot.docs.map((d) => {
          const data = d.data();
          return `${data.date}-${data.time}`;
        })
      );

      const promises = [];

      // Generate multiple days
      for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
        const currentDate = new Date(date);
        currentDate.setDate(currentDate.getDate() + dayOffset);
        const formattedDate = currentDate.toISOString().split("T")[0];

        let current = startMinutes;

        while (current <= endMinutes) {
          const hours = Math.floor(current / 60)
            .toString()
            .padStart(2, "0");
          const minutes = (current % 60).toString().padStart(2, "0");
          const slotTime = `${hours}:${minutes}`;

          const slotKey = `${formattedDate}-${slotTime}`;

          if (!existingSlotKeys.has(slotKey)) {
            promises.push(
              addDoc(collection(db, "schedules"), {
                date: formattedDate,
                time: slotTime,
                isBooked: false,
              })
            );
          }

          current += duration;
        }
      }

      await Promise.all(promises);

      // Reset form
      setDate("");
      setStartTime("");
      setEndTime("");
      setDaysAhead(1);

      alert("Slots generated successfully!");
    } catch (err) {
      console.error("Error adding slots:", err);
      alert("Failed to generate slots. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Mark a slot booked
  const markBooked = async (slotId) => {
    try {
      const slotRef = doc(db, "schedules", slotId);
      await updateDoc(slotRef, { isBooked: true });
    } catch (error) {
      console.error("Error marking slot booked:", error);
      alert("Failed to mark slot as booked");
    }
  };

  const cancelBooking = async (booking) => {
    if (!window.confirm(`Cancel booking for ${booking.name}?`)) {
      return;
    }

    setLoading(true);

    try {
      // Query Firestore directly instead of relying on state
      const slotsQuery = query(
        collection(db, "schedules"),
        where("date", "==", booking.date),
        where("time", "==", booking.time)
      );

      const querySnapshot = await getDocs(slotsQuery);

      if (!querySnapshot.empty) {
        const slotDoc = querySnapshot.docs[0];
        const slotRef = doc(db, "schedules", slotDoc.id);
        await updateDoc(slotRef, { isBooked: false });
      }

      // Send cancellation email
      await emailjs.send(
        "service_zar9tvk",
        "template_p8rdbnx",
        {
          client_name: booking.name,
          client_email: booking.email,
          date: booking.date,
          time: booking.time,
        },
        "9OaznS6Bz6ThfAwpI"
      );

      // Delete booking
      const bookingRef = doc(db, "bookings", booking.id);
      await deleteDoc(bookingRef);

      alert(`Booking for ${booking.name} has been cancelled`);
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Failed to cancel booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Delete a schedule slot
  const deleteSlot = async (slotId) => {
    if (!window.confirm("Delete this slot?")) {
      return;
    }

    try {
      const slotRef = doc(db, "schedules", slotId);
      await deleteDoc(slotRef);
    } catch (error) {
      console.error("Error deleting slot:", error);
      alert("Failed to delete slot");
    }
  };

  // Clear ALL schedule slots
  const clearAllSlots = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete ALL schedule slots?\nThis cannot be undone."
    );

    if (!confirmDelete) return;

    setLoading(true);

    try {
      const snapshot = await getDocs(collection(db, "schedules"));

      const deletePromises = snapshot.docs.map((d) =>
        deleteDoc(doc(db, "schedules", d.id))
      );

      await Promise.all(deletePromises);

      alert("All slots cleared successfully");
    } catch (error) {
      console.error("Error clearing slots:", error);
      alert("Failed to clear slots");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: darkMode ? "#111111" : "#eeeeee",
        color: darkMode ? "#eeeeee" : "#000000",
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "Arial, sans-serif",
        transition: "all 0.3s ease",
        position: "relative",
      }}
    >
      {loading && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              padding: "2rem",
              borderRadius: "8px",
              fontSize: "1.2rem",
            }}
          >
            Loading...
          </div>
        </div>
      )}

      <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />

      <h1 style={{ color: "#2563eb" }}>Barber Dashboard</h1>
      <button
        onClick={handleLogout}
        style={{
          padding: "0.5rem 1rem",
          marginBottom: "1rem",
          background: "#ef4444",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        Logout
      </button>
<button
  onClick={() => navigate("/statistics")}
  style={{
    padding: "0.5rem 1rem",
    marginBottom: "1rem",
    marginLeft: "0.5rem",
    background: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  }}
>
  📊 Statistics
</button>
      <h2>Add Schedule Slots</h2>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: "0.5rem", flex: 1, minWidth: "150px" }}
          disabled={loading}
        />
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          style={{ padding: "0.5rem", flex: 1, minWidth: "120px" }}
          disabled={loading}
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          style={{ padding: "0.5rem", flex: 1, minWidth: "120px" }}
          disabled={loading}
        />
        <input
          type="number"
          min="1"
          max="10"
          value={daysAhead}
          onChange={(e) => setDaysAhead(Number(e.target.value))}
          placeholder="Days"
          style={{ padding: "0.5rem", width: "90px" }}
          disabled={loading}
        />
        <button
          onClick={addRangeSlots}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            background: loading ? "#94a3b8" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Adding..." : "Add Range"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Existing Slots</h2>
        <button
          onClick={clearAllSlots}
          disabled={loading}
          style={{
            padding: "0.4rem 0.8rem",
            background: loading ? "#fca5a5" : "#dc2626",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Clear All Slots
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: "2rem",
            background: darkMode ? "#181818" : "#ffffff",
          }}
        >
          <thead>
            <tr
              style={{
                background: darkMode ? "#1f1f1f" : "#f3f4f6",
              }}
            >
              <th
                style={{
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                  padding: "8px",
                }}
              >
                Date
              </th>
              <th
                style={{
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                  padding: "8px",
                }}
              >
                Time
              </th>
              <th
                style={{
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                  padding: "8px",
                }}
              >
                Status
              </th>
              <th
                style={{
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                  padding: "8px",
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 ? (
              <tr>
                <td
                  colSpan="4"
                  style={{
                    border: darkMode ? "1px solid #333" : "1px solid #ddd",
                    padding: "16px",
                    textAlign: "center",
                  }}
                >
                  No slots available
                </td>
              </tr>
            ) : (
              slots.map((slot) => (
                <tr key={slot.id}>
                  <td
                    style={{
                      border: darkMode ? "1px solid #333" : "1px solid #ddd",
                      padding: "8px",
                    }}
                  >
                    {slot.date}
                  </td>
                  <td
                    style={{
                      border: darkMode ? "1px solid #333" : "1px solid #ddd",
                      padding: "8px",
                    }}
                  >
                    {slot.time}
                  </td>
                  <td
                    style={{
                      border: darkMode ? "1px solid #333" : "1px solid #ddd",
                      padding: "8px",
                    }}
                  >
                    {slot.isBooked ? "Booked" : "Available"}
                  </td>
               <td
  style={{
    border: darkMode ? "1px solid #333" : "1px solid #ddd",
    padding: "8px",
  }}
>
  {slot.isBooked && (
    <span
      style={{
        marginRight: "0.5rem",
        padding: "0.3rem 0.6rem",
        background: "#24fbb0",
        borderRadius: "4px",
        display: "inline-block",
      }}
    >
      Booked ✓
    </span>
  )}
  <button
    onClick={() => deleteSlot(slot.id)}
    disabled={loading}
    style={{
      padding: "0.3rem 0.6rem",
      background: loading ? "#fca5a5" : "#ef4444",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: loading ? "not-allowed" : "pointer",
    }}
  >
    Delete
  </button>
</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2>Client Bookings</h2>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            background: darkMode ? "#181818" : "#ffffff",
            color: darkMode ? "#eeeeee" : "#000000",
          }}
        >
          <thead>
            <tr
              style={{
                background: darkMode ? "#1f1f1f" : "#f3f4f6",
              }}
            >
              <th
                style={{
                  padding: "8px",
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                }}
              >
                Name
              </th>
              <th
                style={{
                  padding: "8px",
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                }}
              >
                Email
              </th>
              <th
                style={{
                  padding: "8px",
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                }}
              >
                Date
              </th>
              <th
                style={{
                  padding: "8px",
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                }}
              >
                Time
              </th>
              <th
                style={{
                  padding: "8px",
                  border: darkMode ? "1px solid #333" : "1px solid #ddd",
                }}
              >
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {bookings.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    padding: "16px",
                    border: darkMode ? "1px solid #333" : "1px solid #ddd",
                    textAlign: "center",
                  }}
                >
                  No bookings yet
                </td>
              </tr>
            ) : (
              bookings.map((b) => (
                <tr key={b.id}>
                  <td
                    style={{
                      padding: "8px",
                      border: darkMode ? "1px solid #333" : "1px solid #ddd",
                    }}
                  >
                    {b.name}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      border: darkMode ? "1px solid #333" : "1px solid #ddd",
                    }}
                  >
                    {b.email}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      border: darkMode ? "1px solid #333" : "1px solid #ddd",
                    }}
                  >
                    {b.date}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      border: darkMode ? "1px solid #333" : "1px solid #ddd",
                    }}
                  >
                    {b.time}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      border: darkMode ? "1px solid #333" : "1px solid #ddd",
                    }}
                  >
                    <button
                      onClick={() => cancelBooking(b)}
                      disabled={loading}
                      style={{
                        padding: "0.3rem 0.6rem",
                        background: loading ? "#fca5a5" : "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;