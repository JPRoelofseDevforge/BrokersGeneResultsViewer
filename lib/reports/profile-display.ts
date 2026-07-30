import type { GeneReportProfile } from "@/lib/gene-processing/types";

export const GENERIC_BROKER_DAY_PROFILE_NAME = "Your broker day profile";

function cleanText(value: string | undefined) {
  const text = value?.trim();
  return text || null;
}

export function reportDisplayName(profile: GeneReportProfile): string | null {
  const canonical = cleanText(profile.displayName);
  if (canonical && canonical !== GENERIC_BROKER_DAY_PROFILE_NAME) {
    return canonical;
  }

  // firstName/lastName are used by the local demonstration and by a future
  // validated gene source. A Broker Day identity without a name is projected
  // with blank components, so it stays generic.
  const fallback = [
    cleanText(profile.firstName),
    cleanText(profile.lastName),
  ]
    .filter(Boolean)
    .join(" ");
  return fallback || null;
}

export function reportInitials(profile: GeneReportProfile): string {
  const name = reportDisplayName(profile);
  if (!name) return "SAM";

  const parts = name.split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] ?? "")[0] ?? "S";
  const last =
    parts.length > 1 ? Array.from(parts.at(-1) ?? "")[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}
