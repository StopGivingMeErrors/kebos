// src/Dashboard.js
import React, { useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase/firebaseConfig";
import { signOut } from "firebase/auth";
import ThemeToggle from "./ThemeToggle";
import "./Dashboard.css";
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
  getDoc,
} from "firebase/firestore";

const groupBookingsByDate = (list) => {
  const groups = {};
  list.forEach((b) => {
    if (!groups[b.date]) groups[b.date] = [];
    groups[b.date].push(b);
  });
  return Object.keys(groups)
    .sort()
    .map((date) => ({
      date,
      items: groups[date].sort((a, b) => a.time.localeCompare(b.time)),
    }));
};

const formatGroupDate = (dateStr) => {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [daysAhead, setDaysAhead] = useState(1);

  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState("");
  const [expandedDates, setExpandedDates] = useState(() => new Set());
  const hasSetInitialExpand = useRef(false);
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

  // helper: parse appointment (date + time) into a JS Date reliably
  const parseDateTime = (dateStr, timeStr) => {
    // Expect dateStr: "YYYY-MM-DD", timeStr: "HH:mm"
    // Construct ISO-like local string with seconds to help parsing
    // e.g. "2026-02-10T14:30:00"
    try {
      return new Date(`${dateStr}T${timeStr}:00`);
    } catch {
      return new Date(`${dateStr} ${timeStr}`);
    }
  };

  // helper: format date/time for UI in Europe's Athens timezone
  const formatDateTime = (d) => {
    if (!d) return "";
    try {
      const dateObj = typeof d.toDate === "function" ? d.toDate() : new Date(d);
      return dateObj.toLocaleString("en-GB", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(d);
    }
  };

  // Real-time listener for slots (eliminates need for fetchData)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "schedules"),
      (snapshot) => {
        const now = new Date();

        const fetchedSlots = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((slot) => {
            // Only show future slots
            const slotDateTime = parseDateTime(slot.date, slot.time);
            return slotDateTime > now;
          });

        // Sort slots chronologically by appointment datetime (ascending)
        fetchedSlots.sort((a, b) => {
          const dateTimeA = parseDateTime(a.date, a.time).getTime();
          const dateTimeB = parseDateTime(b.date, b.time).getTime();
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
        const now = new Date();

        const fetchedBookings = snapshot.docs
          .map((doc) => {
            const raw = doc.data();

            // Convert Firestore Timestamp to JS Date if necessary
            let createdAt = null;
            if (raw.timestamp) {
              // Firestore stores Timestamp objects that have .toDate()
              createdAt =
                typeof raw.timestamp.toDate === "function"
                  ? raw.timestamp.toDate()
                  : new Date(raw.timestamp);
            }

            return {
              id: doc.id,
              createdAt, // may be null if timestamp missing
              ...raw,
            };
          })
          .filter((booking) => {
            // Only show future/today bookings (same logic as before)
            const bookingDateTime = parseDateTime(booking.date, booking.time);
            return bookingDateTime > now;
          });

        // Sort by upcoming appointment (soonest first)
        fetchedBookings.sort((a, b) => {
          const aDt = parseDateTime(a.date, a.time).getTime();
          const bDt = parseDateTime(b.date, b.time).getTime();
          return aDt - bDt;
        });

        setBookings(fetchedBookings);
      },
      (error) => {
        console.error("Error fetching bookings:", error);
        alert("Failed to load bookings");
      }
    );

    return () => unsubscribe();
  }, []);

  // Auto-expand the next 7 days of bookings once on first load
  useEffect(() => {
    if (hasSetInitialExpand.current || bookings.length === 0) return;

    const groups = groupBookingsByDate(bookings);
    if (groups.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAhead = new Date(today);
    weekAhead.setDate(weekAhead.getDate() + 7);

    const auto = new Set();
    for (const { date } of groups) {
      const d = new Date(`${date}T00:00:00`);
      if (d <= weekAhead) auto.add(date);
    }
    if (auto.size === 0) auto.add(groups[0].date);

    setExpandedDates(auto);
    hasSetInitialExpand.current = true;
  }, [bookings]);

  const filteredBookings = bookings.filter((b) => {
    if (!bookingSearch.trim()) return true;
    const q = bookingSearch.trim().toLowerCase();
    return (
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.email && b.email.toLowerCase().includes(q))
    );
  });

  const groupedBookings = groupBookingsByDate(filteredBookings);

  const toggleDateExpanded = (date) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const expandAllDates = () => {
    setExpandedDates(new Set(groupedBookings.map((g) => g.date)));
  };

  const collapseAllDates = () => {
    setExpandedDates(new Set());
  };

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

    // Check if date is in the past
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      return alert("Cannot create slots in the past!");
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

        while (current < endMinutes) {
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

      if (promises.length === 0) {
        alert("No new slots to add - all selected slots already exist!");
        setLoading(false);
        return;
      }

      await Promise.all(promises);

      // Reset form
      setDate("");
      setStartTime("");
      setEndTime("");
      setDaysAhead(1);

      alert(`${promises.length} slots generated successfully!`);
    } catch (err) {
      console.error("Error adding slots:", err);
      alert("Failed to generate slots. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (booking) => {
    if (!window.confirm(`Cancel booking for ${booking.name}?`)) {
      return;
    }

    setLoading(true);

    try {
      // Check if booking still exists
      const bookingRef = doc(db, "bookings", booking.id);
      const bookingSnap = await getDoc(bookingRef);
      
      if (!bookingSnap.exists()) {
        alert("This booking has already been cancelled.");
        setLoading(false);
        return;
      }

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
      try {
        const response = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: booking.email,
            subject: "Sorry bratan den prolavainw re💔",
            html: `
              <h2>Your appointment has been cancelled</h2>
              <p>Hi ${booking.name},</p>
              <p>Your appointment on <strong>${booking.date}</strong> at <strong>${booking.time}</strong> has been cancelled.</p>
              <p>Ama thes kleise gia allh mera </p>
            `,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error("❌ Email failed:", data);
        } else {
          console.log("✅ Email sent!", data);
        }
      } catch (emailError) {
        console.error("❌ Email error:", emailError);
      }

      // Delete booking
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
    try {
      // Check if slot is booked
      const slotRef = doc(db, "schedules", slotId);
      const slotSnap = await getDoc(slotRef);

      if (!slotSnap.exists()) {
        return alert("Slot not found");
      }

      const slotData = slotSnap.data();

      if (slotData.isBooked) {
        return alert("Cannot delete a booked slot! Cancel the booking first.");
      }

      if (!window.confirm("Delete this slot?")) {
        return;
      }

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
      className={`dashboard ${darkMode ? "dashboard--dark" : ""}`}
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

      <div className="slots-table-wrap">
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
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

      <div className="bookings-section-header">
        <h2>
          Client Bookings
          {bookings.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: "0.9rem", opacity: 0.75 }}>
              {" "}
              ({bookings.length})
            </span>
          )}
        </h2>
        {bookings.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="bookings-expand-all"
              onClick={expandAllDates}
            >
              Expand all
            </button>
            <button
              type="button"
              className="bookings-expand-all"
              onClick={collapseAllDates}
            >
              Collapse all
            </button>
          </div>
        )}
        <input
          type="search"
          className="booking-search"
          placeholder="Search name or email…"
          value={bookingSearch}
          onChange={(e) => setBookingSearch(e.target.value)}
          aria-label="Search bookings"
        />
      </div>

      <div className="bookings-panel">
        {bookings.length === 0 ? (
          <p className="bookings-empty">No upcoming bookings</p>
        ) : filteredBookings.length === 0 ? (
          <p className="bookings-empty">No bookings match your search</p>
        ) : (
          groupedBookings.map(({ date: groupDate, items }) => {
            const isExpanded = expandedDates.has(groupDate);
            return (
              <div key={groupDate} className="booking-date-group">
                <button
                  type="button"
                  className="booking-date-header"
                  onClick={() => toggleDateExpanded(groupDate)}
                  aria-expanded={isExpanded}
                >
                  <span>
                    {formatGroupDate(groupDate)}
                    <span className="booking-date-count">
                      {" "}
                      · {items.length} booking{items.length !== 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="booking-date-chevron" aria-hidden>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>
                {isExpanded && (
                  <div className="booking-cards">
                    {items.map((b) => (
                      <article key={b.id} className="booking-card">
                        <div className="booking-card-main">
                          <h3 className="booking-card-name">{b.name}</h3>
                          <span className="booking-card-time">{b.time}</span>
                        </div>
                        <p className="booking-card-email">{b.email}</p>
                        {b.createdAt && (
                          <p className="booking-card-meta">
                            Booked {formatDateTime(b.createdAt)}
                          </p>
                        )}
                        <button
                          type="button"
                          className="booking-card-cancel"
                          onClick={() => cancelBooking(b)}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Dashboard;