// src/ThemeToggle.js
import React from "react";

export default function ThemeToggle({ darkMode, setDarkMode }) {
  return (
    <button
      type="button"
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      title={darkMode ? "Light mode" : "Dark mode"}
      onClick={() => setDarkMode(!darkMode)}
      style={{
        width: "40px",
        height: "22px",
        padding: 0,
        border: darkMode ? "1px solid #444" : "1px solid #d1d5db",
        borderRadius: "999px",
        background: darkMode ? "#1f2937" : "#e5e7eb",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: "2px",
          left: darkMode ? "20px" : "2px",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: darkMode ? "#fbbf24" : "#ffffff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          transition: "left 0.2s ease, background 0.2s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "9px",
          lineHeight: 1,
        }}
      >
        {darkMode ? "☾" : "☀"}
      </span>
    </button>
  );
}
