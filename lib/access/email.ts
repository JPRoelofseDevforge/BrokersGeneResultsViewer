const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const LOCAL_PART = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

/** Returns the canonical database lookup form, or null for invalid input. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH) return null;

  const at = email.lastIndexOf("@");
  if (at <= 0 || at !== email.indexOf("@")) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (
    local.length > MAX_LOCAL_LENGTH ||
    !LOCAL_PART.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return null;
  }

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL.test(label))) {
    return null;
  }

  return `${local}@${domain}`;
}
