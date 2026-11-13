/** Format YYYY-MM-DD for humans, e.g. "Saturday, 15 November 2026" */
export const formatAppointmentDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

/** Shorter label for tight UI, e.g. "Sat 15 Nov 2026" */
export const formatAppointmentDateShort = (dateStr) => {
  if (!dateStr) return "";
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

/** Date + time, e.g. "Saturday, 15 November 2026 · 11:30" */
export const formatAppointmentDateTime = (dateStr, timeStr) => {
  const datePart = formatAppointmentDate(dateStr);
  if (!timeStr) return datePart;
  return `${datePart} · ${timeStr}`;
};

/** Slot picker label, e.g. "Sat 15 Nov 2026 · 11:30" */
export const formatAppointmentSlot = (dateStr, timeStr) => {
  const datePart = formatAppointmentDateShort(dateStr);
  if (!timeStr) return datePart;
  return `${datePart} · ${timeStr}`;
};

/** Chart axis month label, e.g. "Nov 2026" */
export const formatMonthLabel = (yyyyMm) => {
  if (!yyyyMm || yyyyMm.length < 7) return yyyyMm;
  try {
    return new Date(`${yyyyMm}-01T12:00:00`).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return yyyyMm;
  }
};
