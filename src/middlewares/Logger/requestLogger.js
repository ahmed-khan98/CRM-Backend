import { logger } from "./logger.js";

export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  const clientIP =
    req.ip ||
    req.socket?.remoteAddress ||
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    "Unknown";

  // Mask sensitive fields
  const sanitizeBody = (body) => {
    if (!body) return {};
    const clone = { ...body };
    if (clone.password) clone.password = "******";
    if (clone.token) clone.token = "******";
    return clone;
  };

  logger.info("Incoming Request", {
    method: req.method,
    url: req.originalUrl,
    ip: clientIP,
    userAgent: req.get("user-agent"),
    query: req.query,
    body:
      req.method === "POST" ||
      req.method === "PUT" ||
      req.method === "PATCH"
        ? sanitizeBody(req.body)
        : undefined,
  });

  res.on("finish", () => {
    const duration = Date.now() - startTime;

    logger.info("Response Sent", {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
};
