// src/Statistics.js
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase/firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";
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

const Statistics = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [darkMode, setDarkMode] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate("/login");
      }
    });
    return unsubscribe;
  }, [navigate]);

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
      }
    );

    return () => unsubscribe();
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
      <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />

      <button
        onClick={() => navigate("/dashboard")}
        style={{
          padding: "0.5rem 1rem",
          marginBottom: "1.5rem",
          background: "#6b7280",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        ← Back to Dashboard
      </button>

      <h1 style={{ color: "#2563eb", marginBottom: "2rem" }}>
        📊 Booking Statistics
      </h1>

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
          Total Bookings
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