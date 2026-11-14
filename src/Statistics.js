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
import statsLogic from "./statsLogic";
import statsCache from "./statsCache";
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
  const toast = useToast();
  const [bookings, setBookings] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [cacheMeta, setCacheMeta] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) navigate("/login");
    });
    return unsubscribe;
  }, [navigate]);

  // Open page: cache only — never auto-scan Firestore
  useEffect(() => {
    const cached = statsCache.readCache();
    if (cached) {
      setBookings(cached.bookings);
      setCacheMeta(cached.fetchedAt);
      setFromCache(true);
      setHasCache(true);
    } else {
      setHasCache(false);
      setBookings([]);
      setCacheMeta(null);
      setFromCache(false);
    }
    setCooldownUntil(statsCache.getCooldownUntil());
  }, []);

  // Tick once per second while cooling down so the button re-enables
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return undefined;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const refreshAllowed = nowTick >= cooldownUntil;
  const cooldownSec = Math.ceil(
    Math.max(0, cooldownUntil - nowTick) / 1000
  );

  const loadStatsFromServer = async ({ notify = true } = {}) => {
    if (!statsCache.isRefreshAllowed() || loadingStats) return;
    setLoadingStats(true);
    try {
      const snapshot = await getDocs(collection(db, "bookings"));
      const fetched = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          date: data.date || "",
          status: data.status || "active",
        };
      });
      const cached = statsCache.writeCache(fetched);
      const until = statsCache.markRefreshDone();
      setBookings(cached.bookings);
      setCacheMeta(cached.fetchedAt);
      setFromCache(false);
      setHasCache(true);
      setCooldownUntil(until);
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
      // Keep existing bookings/cache on screen
    } finally {
      setLoadingStats(false);
    }
  };

  const summary = useMemo(
    () => statsLogic.summarizeBookings(bookings),
    [bookings]
  );

  const bookingsByDay = useMemo(
    () =>
      summary.byDay.map((row) => ({
        ...row,
        label: formatAppointmentDateShort(row.date),
      })),
    [summary]
  );

  const bookingsByMonth = useMemo(
    () =>
      summary.byMonth.map((row) => ({
        ...row,
        label: formatMonthLabel(row.month),
      })),
    [summary]
  );

  const totalBookings = summary.totalNonCancelled;
  const totalCancelled = summary.totalCancelled;
  const cacheLabel = cacheMeta
    ? new Date(cacheMeta).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const canClickRefresh = refreshAllowed && !loadingStats;

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
          alignItems: "center",
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
        {hasCache && (
          <button
            type="button"
            onClick={() => loadStatsFromServer({ notify: true })}
            disabled={!canClickRefresh}
            style={{
              padding: "0.5rem 1rem",
              background: canClickRefresh ? "#2563eb" : "#93c5fd",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: canClickRefresh ? "pointer" : "not-allowed",
            }}
          >
            {loadingStats
              ? "Loading from server…"
              : !refreshAllowed
                ? `Refresh available in ${cooldownSec}s`
                : "Refresh"}
          </button>
        )}
      </div>

      {cacheLabel && (
        <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.85rem", opacity: 0.7 }}>
          {fromCache ? "Showing cached data" : "Fresh from server"} · Last
          updated {cacheLabel}
        </p>
      )}

      {!hasCache && (
        <div
          style={{
            background: darkMode ? "#181818" : "#ffffff",
            padding: "1.5rem",
            borderRadius: "8px",
            marginBottom: "2rem",
            textAlign: "center",
          }}
        >
          <p style={{ marginTop: 0 }}>
            Statistics are not loaded yet. Loading them reads your full booking
            history once — use the button when you need fresh numbers.
          </p>
          <button
            type="button"
            onClick={() => loadStatsFromServer({ notify: true })}
            disabled={!canClickRefresh}
            style={{
              padding: "0.65rem 1.25rem",
              background: canClickRefresh ? "#2563eb" : "#93c5fd",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: canClickRefresh ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            {loadingStats
              ? "Loading…"
              : !refreshAllowed
                ? `Available in ${cooldownSec}s`
                : "Load statistics"}
          </button>
        </div>
      )}

      {hasCache && (
        <>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "2rem",
            }}
          >
            <div
              style={{
                flex: "1 1 200px",
                background: darkMode ? "#2a2a2a" : "#f3f4f6",
                padding: "2rem",
                borderRadius: "8px",
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
              <p style={{ margin: 0, fontSize: "1.1rem", opacity: 0.8 }}>
                Bookings (excl. cancelled)
              </p>
            </div>
            <div
              style={{
                flex: "1 1 200px",
                background: darkMode ? "#2a2a2a" : "#f3f4f6",
                padding: "2rem",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <h2
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "#9ca3af",
                  fontSize: "3rem",
                }}
              >
                {totalCancelled}
              </h2>
              <p style={{ margin: 0, fontSize: "1.1rem", opacity: 0.8 }}>
                Cancelled (all time)
              </p>
            </div>
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
        </>
      )}
    </div>
  );
};

export default Statistics;
