/** System / owner accounts that must never appear in employee, payroll, attendance, leave lists */
export const HIDDEN_EMPLOYEE_EMAILS = [
  "ahmedkhan@pentaprime-innovations.com",
];

/**
 * Merge list query with hidden-email exclusion.
 * Replaces the old blanket `role: { $ne: "ADMIN" }` so other admins can appear.
 */
export function withHiddenEmployeesExcluded(query = {}) {
  const hidden = HIDDEN_EMPLOYEE_EMAILS.map((e) => e.toLowerCase());
  const { email, ...rest } = query || {};

  if (email == null) {
    return { ...rest, email: { $nin: hidden } };
  }

  if (typeof email === "string") {
    const normalized = email.toLowerCase().trim();
    if (hidden.includes(normalized)) {
      return { ...rest, _id: null }; // impossible match — hide completely
    }
    return { ...rest, email: normalized };
  }

  const existingNin = Array.isArray(email.$nin) ? email.$nin : [];
  return {
    ...rest,
    email: {
      ...email,
      $nin: [...new Set([...existingNin, ...hidden])],
    },
  };
}
