// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Booking from "./Booking";
import Dashboard from "./Dashboard";
import Login from "./Login";
import { auth } from "./firebase/firebaseConfig";
import Statistics from "./Statistics";
import CancelBookingPage from "./CancelBookingPage";

function App() {
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return unsubscribe;
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Booking />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cancel-booking" element={<CancelBookingPage />} /> 

        <Route
          path="/dashboard"
          element={
            user ? <Dashboard /> : <Navigate to="/login" />
          }
        />
        <Route
          path="/statistics"
          element={user ? <Statistics /> : <Navigate to="/login" />}
          />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
