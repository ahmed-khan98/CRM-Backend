import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom log format (for console)
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  return `[${timestamp}] ${level}: ${message} ${
    Object.keys(meta).length ? JSON.stringify(meta) : ""
  }`;
});

// File transport (rotates daily)
const fileRotateTransport = new DailyRotateFile({
  filename: "logs/application-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
});

// Error log file
const errorFileTransport = new winston.transports.File({
  filename: "logs/error.log",
  level: "error",
});

export const logger = winston.createLogger({
  level: "info",
  format: combine(timestamp(), json()),
  transports: [
    fileRotateTransport,
    errorFileTransport,
  ],
});

// Console output only in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        consoleFormat
      ),
    })
  );
}
