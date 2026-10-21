import { buildSimplePdfBuffer } from "./joiningHelpers.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function payrollMonthLabel(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!m || !y || m < 1 || m > 12) return "";
  return `${MONTHS[m - 1]} ${y}`;
}

/** e.g. Jun-2025 */
export function payrollShortPeriod(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!m || !y || m < 1 || m > 12) return "";
  return `${SHORT_MONTHS[m - 1]}-${y}`;
}

function rs(n) {
  return `Rs ${Number(n || 0).toLocaleString("en-PK")}`;
}

export function payslipNetPay(entry) {
  const gross = Number(entry?.grossPay || 0);
  const deductions = Number(entry?.deductionsTotal || 0);
  return Math.max(0, Math.round(gross - deductions));
}

function escapePdf(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Approximate Helvetica string width at given size */
function approxWidth(str, size) {
  return String(str).length * size * 0.5;
}

/**
 * Professional single-page payslip PDF (no extra deps).
 * Brand header, employee grid, dual tables, net-pay hero, attendance strip.
 */
export function buildPayslipPdfBuffer({
  entry,
  companyName = "Zytron World",
  run = {},
}) {
  const monthLabel = payrollMonthLabel(run.month, run.year) || "Payslip period";
  const name = entry.employeeName || entry.employeeId?.fullName || "Employee";
  const designation = entry.designation || "-";
  const department =
    entry.departmentName || entry.employeeId?.departmentId?.name || "-";
  const absentCount = Number(entry.absentDays || 0);
  const lateCount = Number(entry.lateDays || 0);
  const netPay = payslipNetPay(entry);
  const status = String(entry.status || run.status || "").toLowerCase();
  const statusLabel =
    status === "paid" ? "PAID" : status === "finalized" ? "FINALIZED" : "";
  const periodRange =
    run.periodStart && run.periodEnd
      ? `${formatDate(run.periodStart)} – ${formatDate(run.periodEnd)}`
      : "";

  const earnings = [];
  if (Number(entry.basicSalary) > 0) {
    earnings.push(["Basic Salary", rs(entry.basicSalary)]);
  }
  for (const a of entry.allowances || []) {
    if (Number(a.amount) > 0) {
      earnings.push([String(a.name || "Allowance"), rs(a.amount)]);
    }
  }
  if (!earnings.length) earnings.push(["Basic Salary", rs(0)]);

  const deductions = [];
  if (Number(entry.tax) > 0) deductions.push(["Income Tax", rs(entry.tax)]);
  if (Number(entry.pf) > 0) deductions.push(["Provident Fund", rs(entry.pf)]);
  if (Number(entry.absentDeduction) > 0 || absentCount > 0) {
    deductions.push([
      `Absent (${absentCount} day${absentCount === 1 ? "" : "s"})`,
      rs(entry.absentDeduction),
    ]);
  }
  if (Number(entry.lateDeduction) > 0 || lateCount > 0) {
    deductions.push([
      `Late (${lateCount} day${lateCount === 1 ? "" : "s"})`,
      rs(entry.lateDeduction),
    ]);
  }
  for (const d of entry.extraDeductions || []) {
    if (Number(d.amount) > 0) {
      deductions.push([String(d.name || "Deduction"), rs(d.amount)]);
    }
  }
  if (deductions.length === 0) deductions.push(["—", rs(0)]);

  // Pad shorter column so both tables match height visually
  const minRows = Math.max(earnings.length, deductions.length, 3);
  while (earnings.length < minRows) earnings.push(["", ""]);
  while (deductions.length < minRows) deductions.push(["", ""]);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const M = 40;
  const CONTENT_W = PAGE_W - M * 2;
  const ops = [];

  // Palette
  const INK = [0.11, 0.12, 0.15];
  const MUTED = [0.42, 0.44, 0.48];
  const LINE = [0.86, 0.88, 0.9];
  const TEAL = [0.05, 0.48, 0.52];
  const TEAL_SOFT = [0.9, 0.96, 0.96];
  const ROSE = [0.55, 0.22, 0.28];
  const ROSE_SOFT = [0.98, 0.94, 0.94];
  const DARK = [0.1, 0.11, 0.14];
  const WHITE = [1, 1, 1];

  const fill = (r, g, b) => ops.push(`${r} ${g} ${b} rg`);
  const stroke = (r, g, b) => ops.push(`${r} ${g} ${b} RG`);
  const fillRect = (x, y, w, h) => ops.push(`${x} ${y} ${w} ${h} re f`);
  const strokeRect = (x, y, w, h) => ops.push(`${x} ${y} ${w} ${h} re S`);
  const roundish = (x, y, w, h) => {
    // Soft card: fill + thin stroke (Type1 PDF has no true rounded corners without paths)
    fillRect(x, y, w, h);
  };
  const line = (x1, y1, x2, y2) => {
    ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const text = (str, x, y, size = 10, font = "F1", color = INK) => {
    fill(...color);
    ops.push("BT");
    ops.push(`/${font} ${size} Tf`);
    ops.push(`${x} ${y} Td`);
    ops.push(`(${escapePdf(String(str))}) Tj`);
    ops.push("ET");
  };
  const textRight = (str, rightX, y, size = 10, font = "F1", color = INK) => {
    text(str, rightX - approxWidth(str, size), y, size, font, color);
  };
  const textCenter = (str, cx, y, size = 10, font = "F1", color = INK) => {
    text(str, cx - approxWidth(str, size) / 2, y, size, font, color);
  };

  // ── Soft page wash ──
  fill(0.97, 0.975, 0.982);
  fillRect(0, 0, PAGE_W, PAGE_H);

  // ── Top brand bar ──
  fill(...DARK);
  fillRect(0, PAGE_H - 108, PAGE_W, 108);
  // Teal underline
  fill(...TEAL);
  fillRect(0, PAGE_H - 112, PAGE_W, 4);

  // Brand mark (letter circle)
  const mark = String(companyName || "C").trim().charAt(0).toUpperCase() || "C";
  fill(...TEAL);
  fillRect(M, PAGE_H - 72, 36, 36);
  textCenter(mark, M + 18, PAGE_H - 58, 16, "F2", WHITE);

  text(companyName, M + 48, PAGE_H - 48, 16, "F2", WHITE);
  text("Salary Payslip", M + 48, PAGE_H - 66, 9, "F1", [0.65, 0.68, 0.72]);

  // Period block (right)
  textRight(monthLabel, PAGE_W - M, PAGE_H - 46, 14, "F2", WHITE);
  if (periodRange) {
    textRight(periodRange, PAGE_W - M, PAGE_H - 62, 8, "F1", [0.68, 0.7, 0.74]);
  }
  if (statusLabel) {
    const badgeW = statusLabel === "PAID" ? 52 : 78;
    const bx = PAGE_W - M - badgeW;
    const by = PAGE_H - 88;
    if (statusLabel === "PAID") fill(0.1, 0.52, 0.38);
    else fill(0.32, 0.38, 0.48);
    fillRect(bx, by, badgeW, 16);
    textCenter(statusLabel, bx + badgeW / 2, by + 4.5, 8, "F2", WHITE);
  }

  let y = PAGE_H - 140;

  // ── Employee card ──
  const infoH = 88;
  fill(...WHITE);
  roundish(M, y - infoH + 20, CONTENT_W, infoH);
  stroke(...LINE);
  ops.push("0.75 w");
  strokeRect(M, y - infoH + 20, CONTENT_W, infoH);
  fill(...TEAL);
  fillRect(M, y - infoH + 20, 4, infoH);

  text("EMPLOYEE", M + 16, y + 4, 7.5, "F2", TEAL);
  text(String(name).slice(0, 48), M + 16, y - 14, 13, "F2", INK);
  text(String(designation).slice(0, 52), M + 16, y - 30, 9, "F1", MUTED);

  // Divider
  stroke(...LINE);
  ops.push("0.5 w");
  line(M + 16, y - 42, PAGE_W - M - 16, y - 42);

  // Meta row
  const metaY = y - 58;
  const col1 = M + 16;
  const col2 = M + CONTENT_W / 2 + 8;
  text("DEPARTMENT", col1, metaY, 7, "F2", MUTED);
  text(String(department).slice(0, 36), col1, metaY - 14, 9, "F2", INK);
  text("PAY PERIOD", col2, metaY, 7, "F2", MUTED);
  text(monthLabel, col2, metaY - 14, 9, "F2", INK);

  y = y - infoH - 8;

  // ── Section label ──
  text("PAY BREAKDOWN", M, y, 8, "F2", MUTED);
  y -= 14;

  // ── Two-column tables ──
  const gap = 16;
  const colW = (CONTENT_W - gap) / 2;
  const leftX = M;
  const rightX = M + colW + gap;
  const tableTop = y;

  const drawTable = (title, rows, totalLabel, totalAmount, x, startY, accent, softBg) => {
    let yy = startY;
    const rowH = 20;
    const headerH = 24;
    const titleH = 26;
    const footerH = 26;
    const bodyRows = rows.length;
    const boxH = titleH + headerH + bodyRows * rowH + footerH + 6;

    fill(...WHITE);
    fillRect(x, startY - boxH + 14, colW, boxH);
    stroke(...LINE);
    ops.push("0.75 w");
    strokeRect(x, startY - boxH + 14, colW, boxH);

    // Title bar
    fill(...accent);
    fillRect(x, startY - 8, colW, titleH);
    text(title, x + 12, startY + 2, 9, "F2", WHITE);
    yy = startY - titleH - 2;

    // Column headers
    fill(...softBg);
    fillRect(x + 1, yy - 14, colW - 2, headerH);
    text("Description", x + 12, yy - 4, 8, "F2", MUTED);
    textRight("Amount", x + colW - 12, yy - 4, 8, "F2", MUTED);
    yy -= headerH;

    for (let i = 0; i < rows.length; i++) {
      const [label, amount] = rows[i];
      if (i % 2 === 1) {
        fill(0.975, 0.978, 0.985);
        fillRect(x + 1, yy - 14, colW - 2, rowH);
      }
      if (label) {
        text(String(label).slice(0, 30), x + 12, yy - 5, 9, "F1", INK);
        textRight(amount, x + colW - 12, yy - 5, 9, "F1", INK);
      }
      yy -= rowH;
    }

    // Total footer
    fill(...softBg);
    fillRect(x + 1, yy - 16, colW - 2, footerH);
    stroke(...LINE);
    ops.push("0.5 w");
    line(x + 10, yy + 4, x + colW - 10, yy + 4);
    text(totalLabel, x + 12, yy - 6, 9, "F2", accent);
    textRight(totalAmount, x + colW - 12, yy - 6, 10, "F2", accent);

    return startY - boxH + 14;
  };

  const yLeft = drawTable(
    "EARNINGS",
    earnings,
    "Gross pay",
    rs(entry.grossPay),
    leftX,
    tableTop,
    TEAL,
    TEAL_SOFT
  );
  const yRight = drawTable(
    "DEDUCTIONS",
    deductions,
    "Total deducted",
    rs(entry.deductionsTotal),
    rightX,
    tableTop,
    ROSE,
    ROSE_SOFT
  );
  y = Math.min(yLeft, yRight) - 22;

  // ── Net pay hero ──
  const netH = 78;
  fill(...DARK);
  fillRect(M, y - netH + 18, CONTENT_W, netH);
  // Left teal rail
  fill(...TEAL);
  fillRect(M, y - netH + 18, 5, netH);
  // Soft highlight strip on right third
  fill(0.14, 0.16, 0.2);
  fillRect(M + CONTENT_W * 0.58, y - netH + 18, CONTENT_W * 0.42, netH);

  text("NET PAYABLE", M + 20, y + 2, 8, "F2", [0.55, 0.58, 0.62]);
  text(
    `Gross ${rs(entry.grossPay)}  −  Deductions ${rs(entry.deductionsTotal)}`,
    M + 20,
    y - 14,
    8,
    "F1",
    [0.55, 0.58, 0.62]
  );
  text(rs(netPay), M + 20, y - 42, 22, "F2", WHITE);

  textCenter("TAKE HOME", M + CONTENT_W * 0.79, y - 8, 7.5, "F2", [0.55, 0.58, 0.62]);
  textCenter(rs(netPay), M + CONTENT_W * 0.79, y - 36, 14, "F2", TEAL);

  y -= netH + 16;

  // ── Attendance strip ──
  text("ATTENDANCE SUMMARY", M, y, 8, "F2", MUTED);
  y -= 12;

  const chipH = 44;
  const chipGap = 10;
  const chips = [
    { label: "Absent days", value: String(absentCount), tone: absentCount > 0 ? ROSE : TEAL },
    { label: "Late days", value: String(lateCount), tone: lateCount > 0 ? ROSE : TEAL },
    {
      label: "Absent deduction",
      value: rs(entry.absentDeduction || 0),
      tone: Number(entry.absentDeduction) > 0 ? ROSE : MUTED,
    },
    {
      label: "Late deduction",
      value: rs(entry.lateDeduction || 0),
      tone: Number(entry.lateDeduction) > 0 ? ROSE : MUTED,
    },
  ];
  const chipW = (CONTENT_W - chipGap * (chips.length - 1)) / chips.length;
  chips.forEach((chip, i) => {
    const cx = M + i * (chipW + chipGap);
    fill(...WHITE);
    fillRect(cx, y - chipH + 10, chipW, chipH);
    stroke(...LINE);
    ops.push("0.65 w");
    strokeRect(cx, y - chipH + 10, chipW, chipH);
    fill(...chip.tone);
    fillRect(cx, y - chipH + 10, chipW, 2.5);
    text(chip.label, cx + 8, y - 2, 7, "F1", MUTED);
    text(chip.value, cx + 8, y - 20, 11, "F2", INK);
  });
  y -= chipH + 28;

  // ── Acknowledgement lines ──
  stroke(...LINE);
  ops.push("0.6 w");
  const sigW = (CONTENT_W - 40) / 2;
  line(M, y, M + sigW, y);
  line(PAGE_W - M - sigW, y, PAGE_W - M, y);
  text("Employee signature", M, y - 14, 7.5, "F1", MUTED);
  text("Authorized by HR", PAGE_W - M - sigW, y - 14, 7.5, "F1", MUTED);
  y -= 36;

  // ── Footer ──
  stroke(...LINE);
  ops.push("0.5 w");
  line(M, y + 10, PAGE_W - M, y + 10);
  text(
    "System-generated payslip · Attendance deductions follow company attendance records.",
    M,
    y - 2,
    7,
    "F1",
    MUTED
  );
  text(
    `Generated ${formatDate(new Date()) || "—"}  ·  Confidential — for employee use only`,
    M,
    y - 14,
    7,
    "F1",
    [0.55, 0.56, 0.6]
  );

  const stream = ops.join("\n");
  const objs = [];
  objs.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objs.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objs.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>endobj\n"
  );
  objs.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream\nendobj\n`
  );
  objs.push(
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
  );
  objs.push(
    "6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n"
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

/** Fallback simple text PDF if needed elsewhere */
export function buildPayslipTextPdf(entry, companyName, run) {
  return buildSimplePdfBuffer({
    title: `${companyName} Payslip`,
    lines: [`Month: ${payrollMonthLabel(run.month, run.year)}`],
  });
}

export function payslipPdfFilename(entry, run = {}) {
  const period = payrollShortPeriod(run.month, run.year) || "payslip";
  const name = String(entry.employeeName || "Employee")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `Payslip_${name}_${period}.pdf`;
}
