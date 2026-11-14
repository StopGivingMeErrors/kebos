// src/Dashboard.js
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase/firebaseConfig";
import { signOut } from "firebase/auth";
import ThemeToggle from "./ThemeToggle";
import { formatAppointmentDate } from "./dateFormat";
import { useToast } from "./ToastContext";
import "./Dashboard.css";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  getDoc,
  writeBatch,
} from "firebase/firestore";

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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

const Dashboard = () => {
  const navigate = useNavigate();
  const toast = useToast();
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  // helper: parse appointment (date + time) into a JS Date reliably
  const parseDateTime = (dateStr, timeStr) => {
    // Expect dateStr: "YYYY-MM-DD", timeStr: "HH:mm"
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

  const loadDashboardData = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const now = new Date();
      const today = todayISO();

      const [slotsSnap, bookingsSnap] = await Promise.all([
        getDocs(
          query(collection(db, "schedules"), where("date", ">=", today))
        ),
        getDocs(
          query(collection(db, "bookings"), where("date", ">=", today))
        ),
      ]);

      const fetchedSlots = slotsSnap.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .filter((slot) => parseDateTime(slot.date, slot.time) > now)
        .sort(
          (a, b) =>
            parseDateTime(a.date, a.time).getTime() -
            parseDateTime(b.date, b.time).getTime()
        );

      const fetchedBookings = bookingsSnap.docs
        .map((docSnap) => {
          const raw = docSnap.data();
          let createdAt = null;
          if (raw.timestamp) {
            createdAt =
              typeof raw.timestamp.toDate === "function"
                ? raw.timestamp.toDate()
                : new Date(raw.timestamp);
          }
          return {
            id: docSnap.id,
            createdAt,
            ...raw,
          };
        })
        .filter((booking) => {
          if (booking.status === "cancelled") return false;
          return parseDateTime(booking.date, booking.time) > now;
        })
        .sort(
          (a, b) =>
            parseDateTime(a.date, a.time).getTime() -
            parseDateTime(b.date, b.time).getTime()
        );

      setSlots(fetchedSlots);
      setBookings(fetchedBookings);
      setLastLoadedAt(new Date());

      if (!hasSetInitialExpand.current && fetchedBookings.length > 0) {
        const groups = groupBookingsByDate(fetchedBookings);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const weekAhead = new Date(start);
        weekAhead.setDate(weekAhead.getDate() + 7);
        const auto = new Set();
        for (const { date: groupDate } of groups) {
          const d = new Date(`${groupDate}T00:00:00`);
          if (d <= weekAhead) auto.add(groupDate);
        }
        if (auto.size === 0) auto.add(groups[0].date);
        setExpandedDates(auto);
        hasSetInitialExpand.current = true;
      }
    } catch (error) {
      console.error("Error loading dashboard:", error);
      if (error.code === "resource-exhausted") {
        toast.error(
          "Daily limit reached. Wait until later today, then refresh."
        );
      } else {
        toast.error("Failed to load dashboard data.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // toast is stable enough for UI feedback; omit from deps to avoid reload loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth gate + one-shot load (no realtime listeners — saves Spark read quota)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate("/login");
        return;
      }
      loadDashboardData();
    });
    return unsubscribe;
  }, [navigate, loadDashboardData]);

  const deleteDocsInBatches = async (docs) => {
    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const batch = writeBatch(db);
      docs.slice(i, i + chunkSize).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };

  // One-time style cleanup: remove past schedule docs so collections stay small
  const cleanupPastSchedules = async () => {
    const ok = await toast.confirm(
      "Delete all past schedule slots (before today)? Upcoming slots are kept.",
      {
        title: "Clean past slots",
        confirmLabel: "Delete past slots",
        danger: true,
      }
    );
    if (!ok) return;

    setLoading(true);
    try {
      const snapshot = await getDocs(
        query(collection(db, "schedules"), where("date", "<", todayISO()))
      );
      if (snapshot.empty) {
        toast.info("No past schedule slots to clean up.");
        return;
      }
      await deleteDocsInBatches(snapshot.docs);
      toast.success(`Deleted ${snapshot.size} past schedule slots.`);
      await loadDashboardData({ silent: true });
    } catch (error) {
      console.error("Cleanup failed:", error);
      toast.error("Failed to clean up past slots.");
    } finally {
      setLoading(false);
    }
  };

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
      toast.error("Failed to log out.");
    }
  };

  // Add multiple slots based on start-end range
  const addRangeSlots = async () => {
    if (!date || !startTime || !endTime) {
      toast.warning("Please fill date and time range.");
      return;
    }

    if (daysAhead < 1 || daysAhead > 10) {
      toast.warning("You can only generate between 1 and 10 days.");
      return;
    }

    // Check if date is in the past
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      toast.warning("Cannot create slots in the past.");
      return;
    }

    const duration = 15;
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes >= endMinutes) {
      toast.warning("End time must be after start time.");
      return;
    }

    setLoading(true);

    try {
      // Only load slots in the date range being generated (not entire history)
      const rangeStart = date;
      const rangeEndDate = new Date(date);
      rangeEndDate.setDate(rangeEndDate.getDate() + daysAhead);
      const rangeEnd = rangeEndDate.toISOString().split("T")[0];

      const snapshot = await getDocs(
        query(
          collection(db, "schedules"),
          where("date", ">=", rangeStart),
          where("date", "<", rangeEnd)
        )
      );

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
        toast.info("No new slots to add — those times already exist.");
        setLoading(false);
        return;
      }

      await Promise.all(promises);

      // Reset form
      setDate("");
      setStartTime("");
      setEndTime("");
      setDaysAhead(1);

      toast.success(`${promises.length} slots generated successfully.`);
      await loadDashboardData({ silent: true });
    } catch (err) {
      console.error("Error adding slots:", err);
      toast.error("Failed to generate slots. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (booking) => {
    const ok = await toast.confirm(
      `Cancel the appointment for ${booking.name}?`,
      {
        title: "Cancel booking",
        confirmLabel: "Cancel booking",
        danger: true,
      }
    );
    if (!ok) return;

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("You must be signed in to cancel bookings.");
        navigate("/login");
        return;
      }

      const idToken = await user.getIdToken();
      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ bookingId: booking.id }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.status === 410 || data?.error === "ALREADY_CANCELLED") {
        toast.info("This booking has already been cancelled.");
        await loadDashboardData({ silent: true });
        return;
      }

      if (response.status === 404 || data?.error === "NOT_FOUND") {
        toast.info("This booking has already been cancelled.");
        await loadDashboardData({ silent: true });
        return;
      }

      if (!response.ok) {
        toast.error("Failed to cancel booking. Please try again.");
        return;
      }

      if (data?.emailSent) {
        toast.success(`Booking for ${booking.name} cancelled. Email sent.`);
      } else {
        toast.warning(
          `Booking for ${booking.name} cancelled, but the email could not be sent.`
        );
      }
      await loadDashboardData({ silent: true });
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      toast.error("Failed to cancel booking. Please try again.");
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
        toast.error("Slot not found.");
        return;
      }

      const slotData = slotSnap.data();

      if (slotData.isBooked) {
        toast.warning("Cannot delete a booked slot. Cancel the booking first.");
        return;
      }

      const ok = await toast.confirm("Delete this schedule slot?", {
        title: "Delete slot",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;

      await deleteDoc(slotRef);
      toast.success("Slot deleted.");
      await loadDashboardData({ silent: true });
    } catch (error) {
      console.error("Error deleting slot:", error);
      toast.error("Failed to delete slot.");
    }
  };

  // Clear upcoming schedule slots
  const clearAllSlots = async () => {
    const ok = await toast.confirm(
      "Delete all upcoming schedule slots? This cannot be undone.",
      {
        title: "Clear upcoming slots",
        confirmLabel: "Clear all",
        danger: true,
      }
    );
    if (!ok) return;

    setLoading(true);

    try {
      const snapshot = await getDocs(
        query(collection(db, "schedules"), where("date", ">=", todayISO()))
      );

      await deleteDocsInBatches(snapshot.docs);

      toast.success(`Cleared ${snapshot.size} upcoming slots.`);
      await loadDashboardData({ silent: true });
    } catch (error) {
      console.error("Error clearing slots:", error);
      toast.error("Failed to clear slots.");
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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <h1 style={{ color: "#2563eb", margin: 0 }}>Barber Dashboard</h1>
        <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "0.5rem",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => loadDashboardData({ silent: true })}
          disabled={loading || refreshing}
          style={{
            padding: "0.5rem 1rem",
            background: refreshing ? "#93c5fd" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: refreshing ? "not-allowed" : "pointer",
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/statistics")}
          style={{
            padding: "0.5rem 1rem",
            background: "#10b981",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Statistics
        </button>
        <button
          type="button"
          onClick={cleanupPastSchedules}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            background: "#6b7280",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Clean past slots
        </button>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: "0.5rem 1rem",
            background: "#ef4444",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>
      {lastLoadedAt && (
        <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", opacity: 0.7 }}>
          Loaded {lastLoadedAt.toLocaleTimeString()} · not live — tap Refresh to
          update
        </p>
      )}
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
                    {formatAppointmentDate(slot.date)}
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
                    {formatAppointmentDate(groupDate)}
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