import { logger } from "./logger.js";

function isMailboxPath(url = "") {
  return String(url).includes("/mailbox");
}

function redactDeep(value, key = "") {
  if (value == null) return value;
  const k = String(key).toLowerCase();
  if (
    k === "password" ||
    k === "token" ||
    k === "secret" ||
    k === "contentbase64" ||
    k === "encryptedpassword" ||
    k.endsWith("secret")
  ) {
    return "[redacted]";
  }
  if (Array.isArray(value)) {
    if (k === "attachments") {
      return value.map((att) => {
        if (!att || typeof att !== "object") return att;
        const copy = { ...att };
        if ("contentBase64" in copy) copy.contentBase64 = "[redacted]";
        if ("content" in copy) copy.content = "[redacted]";
        return copy;
      });
    }
    return value.map((v) => redactDeep(v));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [childKey, childVal] of Object.entries(value)) {
      out[childKey] = redactDeep(childVal, childKey);
    }
    return out;
  }
  return value;
}

export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  const clientIP =
    req.ip ||
    req.socket?.remoteAddress ||
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    "Unknown";

  const sanitizeBody = (body) => {
    if (!body) return {};
    const clone = { ...body };
    if (clone.password) clone.password = "******";
    if (clone.token) clone.token = "******";
    if (clone.secret) clone.secret = "[redacted]";
    if (isMailboxPath(req.originalUrl)) {
      return redactDeep(clone);
    }
    if (Array.isArray(clone.attachments)) {
      clone.attachments = redactDeep(clone.attachments, "attachments");
    }
    return clone;
  };

  const sanitizeQuery = (query) => {
    if (!query) return {};
    const clone = { ...query };
    if (clone.secret) clone.secret = "[redacted]";
    if (clone.token) clone.token = "[redacted]";
    if (isMailboxPath(req.originalUrl)) {
      return redactDeep(clone);
    }
    return clone;
  };

  logger.info("Incoming Request", {
    method: req.method,
    url: req.originalUrl,
    ip: clientIP,
    userAgent: req.get("user-agent"),
    query: sanitizeQuery(req.query),
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
