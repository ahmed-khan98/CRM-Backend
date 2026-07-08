export const generateMonthCodeFromName = (name) => {
  if (!name) throw new Error("Month name is required");

  const cleanName = name.trim().toUpperCase();

  const validMonths = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];

  const monthMap = {
    JANUARY: "JAN",
    FEBRUARY: "FEB",
    MARCH: "MAR",
    APRIL: "APR",
    MAY: "MAY",
    JUNE: "JUN",
    JULY: "JUL",
    AUGUST: "AUG",
    SEPTEMBER: "SEP",
    OCTOBER: "OCT",
    NOVEMBER: "NOV",
    DECEMBER: "DEC",
  };

  // ✅ exact match check
  const matchedMonth = validMonths.find((m) =>
    cleanName.includes(m)
  );

  if (!matchedMonth) {
    throw new Error(
      "Invalid month name. Use full month name like 'April', 'May 2026'"
    );
  }

  // year extract
  const yearMatch = cleanName.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear();

  return `${monthMap[matchedMonth]}-${year}`;
};