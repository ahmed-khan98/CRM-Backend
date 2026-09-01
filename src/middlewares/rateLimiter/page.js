import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 150,
  message: {
    status: 429,
    message: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/uploads/"),
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