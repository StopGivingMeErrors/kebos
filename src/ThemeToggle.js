// src/ThemeToggle.js
import React from "react";

export default function ThemeToggle({ darkMode, setDarkMode }) {
  return (
    <div style={{ position: "relative", marginBottom: "2rem", height: "100px" }}>
      <input
        type="checkbox"
        id="hide-checkbox"
        checked={darkMode}
        onChange={() => setDarkMode(!darkMode)}
        style={{ display: "none" }}
      />
      <label
        htmlFor="hide-checkbox"
        style={{
          position: "relative",
          cursor: "pointer",
          display: "inline-block",
          width: "200px",
          height: "100px",
          background: darkMode ? "#211042" : "#24D7F7",
          borderRadius: "50px",
          transition: "500ms",
          overflow: "hidden",
        }}
      >
       
        <span
          className="toggle-button"
          style={{
            position: "absolute",
            top: "7px",
            left: darkMode ? "102px" : "6px",
            width: "86px",
            height: "86px",
            borderRadius: "50%",
            background: "#FAEAF1",
            overflow: "hidden",
            boxShadow: "0 0 35px 4px rgba(255,255,255,0.8)",
            transition: "all 500ms ease-out",
          }}
        >
          {[...Array(7)].map((_, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                borderRadius: "50%",
                background: "#FAEAF1",
                width: [86, 20, 16, 10, 15, 10, 12][i] + "px",
                height: [86, 20, 16, 10, 15, 10, 12][i] + "px",
                left: [10, 44, "auto", 30, 48, 20, 35][i],
                right: ["auto", "auto", -4, "auto", "auto", "auto", "auto"][i],
                top: [-7, 20, 20, 24, 40, 48, "auto"][i],
                bottom: [10, "auto", "auto", "auto", "auto", "auto", 5][i],
                transition: "500ms",
              }}
            />
          ))}
        </span>

        {[...Array(8)].map((_, i) => (
        <span
  key={i}
  style={{
    position: "absolute",
    borderRadius: "50%",
    background: "#FFF",
    width: [6, 8, 5, 3, 4, 10, 10, 10][i] + "px",
    height: [6, 8, 5, 3, 4, 2, 2, 2][i] + "px",
    right: [90, 70, 60, 40, 10, 30, 50, 90][i] + "px",
    bottom: [40, "auto", 15, 50, 35, 30, 60, "auto"][i],
    top: ["auto", 10, "auto", "auto", "auto", "auto", "auto", 10][i],
    transform: i >= 5 ? "rotate(-45deg)" : "none",
    boxShadow: i >= 5
      ? "5px 0px 4px 1px #FFF"   // animated stars
      : "1px 0 2px 2px rgba(255,255,255,0.9)",  // static stars
    animationName: i >= 5 ? "travel" : undefined,
    animationDuration: i >= 5 ? "1.5s" : undefined,
    animationTimingFunction: i >= 5 ? "ease-out" : undefined,
    animationIterationCount: i >= 5 ? "infinite" : undefined,
    animationDelay: [undefined, undefined, undefined, undefined, undefined, "-2s", undefined, "-4s"][i],
  }}
/>
        ))}

        {/* Keyframes for stars */}
        <style>{`
          @keyframes travel {
            0% { transform: rotate(-45deg) translateX(70px); }
            50% { transform: rotate(-45deg) translateX(-20px); box-shadow: 5px 0 6px 1px #FFF; }
            100% { transform: rotate(-45deg) translateX(-30px); width: 2px; height: 2px; opacity: 0; box-shadow: none; }
          }
        `}</style>
      </label>
    </div>
  );
};
