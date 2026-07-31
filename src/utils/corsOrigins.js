/**
 * Shared CORS origins for Express + Socket.IO.
 * Extra origins can be set via CORS_ORIGINS (comma-separated).
 */
const DEFAULT_ORIGINS = [
  "https://www.zytronworld.online",
  "https://zytronworld.online",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://crm-virid-nine-17.vercel.app",
  "https://customer-payment-link.vercel.app",
];

export const getAllowedOrigins = () => {
  const fromEnv = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])];
};

export const isOriginAllowed = (origin) => {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
};
