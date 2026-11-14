/**
 * Pure counting helpers for Statistics (testable without React).
 * Charts/totals use non-cancelled bookings only; cancelled is shown separately.
 */

function isCancelled(booking) {
  return booking && booking.status === "cancelled";
}

function partitionBookings(bookings) {
  const list = Array.isArray(bookings) ? bookings : [];
  const active = [];
  const cancelled = [];
  list.forEach((b) => {
    if (isCancelled(b)) cancelled.push(b);
    else active.push(b);
  });
  return { active, cancelled };
}

function countByDay(bookings, { lastN = 30 } = {}) {
  const counts = {};
  bookings.forEach((booking) => {
    if (!booking.date) return;
    counts[booking.date] = (counts[booking.date] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-lastN);
}

function countByMonth(bookings, { lastN = 12 } = {}) {
  const counts = {};
  bookings.forEach((booking) => {
    if (!booking.date || booking.date.length < 7) return;
    const month = booking.date.substring(0, 7);
    counts[month] = (counts[month] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-lastN);
}

function summarizeBookings(bookings) {
  const { active, cancelled } = partitionBookings(bookings);
  return {
    totalNonCancelled: active.length,
    totalCancelled: cancelled.length,
    totalAll: (bookings || []).length,
    byDay: countByDay(active),
    byMonth: countByMonth(active),
  };
}

module.exports = {
  isCancelled,
  partitionBookings,
  countByDay,
  countByMonth,
  summarizeBookings,
};
