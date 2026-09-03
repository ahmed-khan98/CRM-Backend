/** Align frontend "not interested" with Lead model "non interested". */
export function normalizeLastAction(action) {
  if (!action) return action;
  if (action === "not interested") return "non interested";
  return action;
}

export const LEAD_PIPELINE_ACTIONS = [
  "no action",
  "no answer",
  "interested",
  "non interested",
  "in loop",
  "invalid",
  "schedule",
  "general",
];
