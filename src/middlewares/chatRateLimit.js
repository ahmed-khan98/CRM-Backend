/**
 * Simple in-memory rate limit for chat message sends (per user).
 * 30 messages / 10 seconds.
 */
const buckets = new Map();

export function chatSendRateLimit(req, res, next) {
  const userId = req.user?._id?.toString();
  if (!userId) return next();
  const now = Date.now();
  const windowMs = 10_000;
  const max = 30;
  let bucket = buckets.get(userId);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(userId, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return res.status(429).json({
      statusCode: 429,
      message: "Too many messages. Please slow down.",
      success: false,
    });
  }
  next();
}
