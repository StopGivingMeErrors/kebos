// src/Statistics.js
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase/firebaseConfig";
import { collection, getDocs, query, where } from "firebase/firestore";
import ThemeToggle from "./ThemeToggle";
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

const monthsAgoISO = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const Statistics = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);

  // Redirect if not logged in
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate("/login");
      }
    });
    return unsubscribe;
  }, [navigate]);

  // One-shot load — last 90 days only (enough for day chart + recent months)
  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const q = query(
        collection(db, "bookings"),
        where("date", ">=", monthsAgoISO(3))
      );
      const snapshot = await getDocs(q);
      setBookings(
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
      );
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  // Process bookings by day
  const bookingsByDay = useMemo(() => {
    const counts = {};
    bookings.forEach((booking) => {
      const date = booking.date;
      counts[date] = (counts[date] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-30); // Last 30 days
  }, [bookings]);

  // Process bookings by month
  const bookingsByMonth = useMemo(() => {
    const counts = {};
    bookings.forEach((booking) => {
      const month = booking.date.substring(0, 7); // YYYY-MM
      counts[month] = (counts[month] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12); // Last 12 months
  }, [bookings]);

  const totalBookings = bookings.length;

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

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
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
          onClick={loadStats}
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
          {loadingStats ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Summary */}
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
          Bookings (last 90 days)
        </p>
      </div>

      {/* Bookings per Day Chart */}
      <div
        style={{
          background: darkMode ? "#181818" : "#ffffff",
          padding: "1.5rem",
          borderRadius: "8px",
          marginBottom: "2rem",
        }}
      >
        <h3 style={{ marginBottom: "1rem" }}>
          Bookings per Day (Last 30 Days)
        </h3>
        {bookingsByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bookingsByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={80}
                style={{ fontSize: "0.85rem" }}
              />
              <YAxis />
              <Tooltip
                contentStyle={{
                  background: darkMode ? "#2a2a2a" : "#ffffff",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                }}
              />
              <Bar dataKey="count" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ textAlign: "center", opacity: 0.6, padding: "2rem" }}>
            No booking data available
          </p>
        )}
      </div>

      {/* Bookings per Month Chart */}
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
              <XAxis dataKey="month" style={{ fontSize: "0.85rem" }} />
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
            No booking data available
          </p>
        )}
      </div>
    </div>
  );
};

export default Statistics;