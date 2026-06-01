const { db } = require("../src/firebase/firebaseConfig"); // adjust path if needed
const {
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  doc,
} = require("firebase/firestore");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    // 🔍 Find booking by cancelToken
    const q = query(
      collection(db, "bookings"),
      where("cancelToken", "==", token)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(404).json({ error: "Invalid or expired token" });
    }

    // ⚠️ Assume only ONE booking per token
    const bookingDoc = snapshot.docs[0];
    const bookingRef = doc(db, "bookings", bookingDoc.id);
    const bookingData = bookingDoc.data();

    // ❌ Already canceled
    if (bookingData.status === "cancelled") {
      return res.status(400).json({ error: "Booking already cancelled" });
    }

    if (!bookingData.slotId) {
      return res.status(500).json({ error: "Missing slot reference" });
    }

    const slotRef = doc(db, "schedules", bookingData.slotId);

    // 🔐 Atomic cancel
    await runTransaction(db, async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      const slotSnap = await transaction.get(slotRef);

      if (!bookingSnap.exists()) {
        throw new Error("BOOKING_NOT_FOUND");
      }

      const freshBooking = bookingSnap.data();

      // Double-check status inside transaction
      if (freshBooking.status === "cancelled") {
        throw new Error("ALREADY_CANCELLED");
      }

      // Update booking
      transaction.update(bookingRef, {
        status: "cancelled",
        cancelledAt: new Date(),
      });

      // Free slot ONLY if it exists
      if (slotSnap.exists()) {
        transaction.update(slotRef, {
          isBooked: false,
        });
      }
    });

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
    });

  } catch (error) {
    console.error("Cancel error:", error);

    if (error.message === "ALREADY_CANCELLED") {
      return res.status(400).json({ error: "Already cancelled" });
    }

    return res.status(500).json({
      error: "Failed to cancel booking",
    });
  }
};