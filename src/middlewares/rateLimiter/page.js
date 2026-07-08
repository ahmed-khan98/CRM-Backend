import rateLimit from "express-rate-limit";

 const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 150, // max 150 requests per IP
  message: {
    status: 429,
    message: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  max:5, // sirf 5 attempts
  message: {
    status: 429,
    message: "Too many login attempts, try again after 5 minutes",
  },
});

export{
    limiter,
    loginLimiter
}