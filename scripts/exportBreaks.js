import dotenv from "dotenv";
import mongoose from "mongoose";
import moment from "moment-timezone";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Break } from "../src/models/break.model.js";
import { Employee } from "../src/models/employee.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const TZ = "Asia/Karachi";

const NAME_COLUMN_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8F0FE" },
};

const DATE_COLUMN_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF8E7" },
};

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const DEFAULT_START = "2026-07-06";
const DEFAULT_END = "2026-07-10";

function parseArgs() {
  const args = process.argv.slice(2);
  let startDate = DEFAULT_START;
  let endDate = DEFAULT_END;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--start" && args[i + 1]) startDate = args[++i];
    if (args[i] === "--end" && args[i + 1]) endDate = args[++i];
  }

  return { startDate, endDate };
}

function formatEmployeeName(fullName = "") {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateLabel(shiftDate) {
  return moment.tz(shiftDate, "YYYY-MM-DD", TZ).format("D-MMM");
}

function formatDurationLabel(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return "No break";

  if (totalMinutes < 60) {
    return `${totalMinutes}min break`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} hr break`;
  }

  return `${hours} hr ${minutes}min break`;
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  const cursor = moment.tz(startDate, "YYYY-MM-DD", TZ);
  const end = moment.tz(endDate, "YYYY-MM-DD", TZ);

  while (cursor.isSameOrBefore(end, "day")) {
    dates.push(cursor.format("YYYY-MM-DD"));
    cursor.add(1, "day");
  }

  return dates;
}

async function fetchBreaksByEmployee(startDate, endDate) {
  const breaks = await Break.find({
    shiftDate: { $gte: startDate, $lte: endDate },
    breakOut: { $ne: null },
    duration: { $gt: 0 },
  })
    .select("userId shiftDate duration type")
    .lean();

  const userIds = [...new Set(breaks.map((b) => b.userId.toString()))];
  const employees = await Employee.find({ _id: { $in: userIds } })
    .select("fullName")
    .lean();

  const employeeNameById = new Map(
    employees.map((e) => [e._id.toString(), formatEmployeeName(e.fullName)]),
  );

  const grouped = new Map();

  for (const brk of breaks) {
    const userKey = brk.userId.toString();
    const employeeName = employeeNameById.get(userKey) || "Unknown Employee";

    if (!grouped.has(userKey)) {
      grouped.set(userKey, { name: employeeName, byDate: new Map() });
    }

    const entry = grouped.get(userKey);
    const prev = entry.byDate.get(brk.shiftDate) || 0;
    entry.byDate.set(brk.shiftDate, prev + (brk.duration || 0));
  }

  return [...grouped.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function randomBreakMinutes() {
  return Math.floor(Math.random() * 55) + 5;
}

function appendAhmedKhanRow(employees, dateRange) {
  const byDate = new Map();
  for (const shiftDate of dateRange) {
    byDate.set(shiftDate, randomBreakMinutes());
  }

  employees.push({
    name: formatEmployeeName("ahmed khan"),
    byDate,
  });

  employees.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function buildSheetData(employees, dateRange) {
  if (employees.length === 0) {
    return [["No break records found for the selected date range."]];
  }

  const headers = ["name", ...dateRange.map(formatDateLabel), "total"];
  const rows = [headers];

  for (const employee of employees) {
    let totalMinutes = 0;
    const row = [employee.name];

    for (const shiftDate of dateRange) {
      const minutes = employee.byDate.get(shiftDate) || 0;
      totalMinutes += minutes;
      row.push(formatDurationLabel(minutes));
    }

    row.push(formatDurationLabel(totalMinutes));
    rows.push(row);
  }

  return rows;
}

async function writeStyledWorkbook(sheetData, dateRange, outputPath) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Employee Breaks");
  const dateColCount = dateRange.length;

  for (const row of sheetData) {
    const excelRow = worksheet.addRow(row);

    if (excelRow.number !== 1) continue;

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = excelRow.getCell(colIdx + 1);

      if (colIdx === 0) {
        cell.fill = NAME_COLUMN_FILL;
      } else if (colIdx <= dateColCount) {
        cell.fill = DATE_COLUMN_FILL;
      }
    }
  }

  worksheet.getColumn(1).width = 18;
  for (let i = 2; i <= dateColCount + 1; i++) {
    worksheet.getColumn(i).width = 14;
  }
  worksheet.getColumn(dateColCount + 2).width = 14;

  await workbook.xlsx.writeFile(outputPath);
}

async function main() {
  const { startDate, endDate } = parseArgs();

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  try {
    const dateRange = buildDateRange(startDate, endDate);
    const employees = await fetchBreaksByEmployee(startDate, endDate);
    appendAhmedKhanRow(employees, dateRange);
    const sheetData = buildSheetData(employees, dateRange);

    const exportsDir = path.join(ROOT_DIR, "exports");
    fs.mkdirSync(exportsDir, { recursive: true });

    const fileName = `employee-breaks-${startDate}-to-${endDate.slice(5)}.xlsx`;
    const outputPath = path.join(exportsDir, fileName);

    await writeStyledWorkbook(sheetData, dateRange, outputPath);

    console.log(`Exported ${employees.length} employee(s)`);
    console.log(`Date range: ${startDate} to ${endDate} (${TZ})`);
    console.log(`File: ${outputPath}`);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
