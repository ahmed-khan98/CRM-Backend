// src/utils/maps.js
import { norm } from "./normalize.js";

// Excel → DB enum mapping
export const mapPaid = (val) => {
  const v = norm(val);
  if (v === "paid") return "paid";
  if (v === "partial" || v === "partially paid") return "partial";
  if (v === "failed" || v === "payment failed") return "failed";
  if (v === "refunded") return "refunded";
  return "pending"; // default
};

export const mapLastAction = (val) => {
  const v = norm(val);
  const allowed = [
    "no action",
    "no answer",
    "interested",
    "non interested",
    "in loop",
    "invalid",
    "schedule",
    "general",
  ];
  return allowed.includes(v) ? v : "no action";
};
