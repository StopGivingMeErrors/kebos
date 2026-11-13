// src/Statistics.js
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase/firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import ThemeToggle from "./ThemeToggle";
import {
  formatAppointmentDateShort,
  formatMonthLabel,
} from "./dateFormat";
import { useToast } from "./ToastContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const CACHE_KEY = "kebos_stats_cache_v1";

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.bookings)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (bookings) => {
  const payload = {
    fetchedAt: new Date().toISOString(),
    total: bookings.length,
    // Slim records only — enough for charts, keeps localStorage small
    bookings: bookings.map((b) => ({
      date: b.date || "",
      status: b.status || "active",
    })),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  return payload;
};

const Statistics = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [bookings, setBookings] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [cacheMeta, setCacheMeta] = useState(null);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) navigate("/login");
    });
    return unsubscribe;
  }, [navigate]);

  const loadStatsFromServer = async ({ notify = true } = {}) => {
    setLoadingStats(true);
    try {
      // Full history once, then cached locally — avoids re-reading ~4k docs every visit
      const snapshot = await getDocs(collection(db, "bookings"));
      const fetched = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          date: data.date || "",
          status: data.status || "active",
        };
      });
      const cached = writeCache(fetched);
      setBookings(cached.bookings);
      setCacheMeta(cached.fetchedAt);
      setFromCache(false);
      if (notify) toast.success("Statistics updated from server.");
    } catch (error) {
      console.error("Error fetching bookings:", error);
      if (error.code === "resource-exhausted") {
        toast.error(
          "Daily limit reached. Showing cached stats if available."
        );
      } else {
        toast.error("Failed to load statistics from server.");
      }
    } finally {
      setLoadingStats(false);
    }
  };

  // Show cache immediately; only hit Firestore when empty or user refreshes
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setBookings(cached.bookings);
      setCacheMeta(cached.fetchedAt);
      setFromCache(true);
      setLoadingStats(false);
    } else {
      loadStatsFromServer({ notify: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bookingsByDay = useMemo(() => {
    const counts = {};
    bookings.forEach((booking) => {
      if (!booking.date) return;
      counts[booking.date] = (counts[booking.date] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([date, count]) => ({
        date,
        label: formatAppointmentDateShort(date),
        count,
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-30);
  }, [bookings]);

  const bookingsByMonth = useMemo(() => {
    const counts = {};
    bookings.forEach((booking) => {
      if (!booking.date || booking.date.length < 7) return;
      const month = booking.date.substring(0, 7);
      counts[month] = (counts[month] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([month, count]) => ({
        month,
        label: formatMonthLabel(month),
        count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [bookings]);

  const totalBookings = bookings.length;
  const cacheLabel = cacheMeta
    ? new Date(cacheMeta).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      style={{
        background: darkMode ? "#111111" : "#eeeeee",
        color: darkMode ? "#eeeeee" : "#000000",
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "Arial, sans-serif",
        transition: "all 0.3s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <h1 style={{ color: "#2563eb", margin: 0 }}>Booking Statistics</h1>
        <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          style={{
            padding: "0.5rem 1rem",
            background: "#6b7280",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          ← Back to Dashboard
        </button>
        <button
          type="button"
          onClick={() => loadStatsFromServer({ notify: true })}
          disabled={loadingStats}
          style={{
            padding: "0.5rem 1rem",
            background: loadingStats ? "#93c5fd" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: loadingStats ? "not-allowed" : "pointer",
          }}
        >
          {loadingStats ? "Loading from server…" : "Refresh from server"}
        </button>
      </div>

      {cacheLabel && (
        <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.85rem", opacity: 0.7 }}>
          {fromCache ? "Showing cached data" : "Fresh from server"} · last
          updated {cacheLabel}
        </p>
      )}

      <div
        style={{
          background: darkMode ? "#2a2a2a" : "#f3f4f6",
          padding: "2rem",
          borderRadius: "8px",
          marginBottom: "2rem",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            margin: "0 0 0.5rem 0",
            color: "#2563eb",
            fontSize: "3rem",
          }}
        >
          {totalBookings}
        </h2>
        <p style={{ margin: 0, fontSize: "1.2rem", opacity: 0.8 }}>
          Total bookings (all time)
        </p>
      </div>

      <div
        style={{
          background: darkMode ? "#181818" : "#ffffff",
          padding: "1.5rem",
          borderRadius: "8px",
          marginBottom: "2rem",
        }}
      >
        <h3 style={{ marginBottom: "1rem" }}>
          Bookings per Day (Last 30 Days with data)
        </h3>
        {bookingsByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bookingsByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                angle={-45}
                textAnchor="end"
                height={90}
                style={{ fontSize: "0.75rem" }}
              />
              <YAxis />
              <Tooltip
                contentStyle={{
                  background: darkMode ? "#2a2a2a" : "#ffffff",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                }}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.label || ""
                }
              />
              <Bar dataKey="count" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ textAlign: "center", opacity: 0.6, padding: "2rem" }}>
            {loadingStats ? "Loading…" : "No booking data available"}
          </p>
        )}
      </div>

      <div
        style={{
          background: darkMode ? "#181818" : "#ffffff",
          padding: "1.5rem",
          borderRadius: "8px",
        }}
      >
        <h3 style={{ marginBottom: "1rem" }}>
          Bookings per Month (Last 12 Months)
        </h3>
        {bookingsByMonth.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={bookingsByMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" style={{ fontSize: "0.85rem" }} />
              <YAxis />
              <Tooltip
                contentStyle={{
                  background: darkMode ? "#2a2a2a" : "#ffffff",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ fill: "#10b981", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ textAlign: "center", opacity: 0.6, padding: "2rem" }}>
            {loadingStats ? "Loading…" : "No booking data available"}
          </p>
        )}
      </div>
    </div>
  );
};

export default Statistics;
