/**
 * Date of birth is stored and sent to the backend as ISO "YYYY-MM-DD"
 * (StudentAuthService compares it against date_of_birth->format('Y-m-d')
 * exactly), but the UI should always DISPLAY and be TYPED as "DD-MM-YYYY".
 * These helpers keep that conversion in one place instead of scattering
 * ad-hoc formatting/parsing across pages.
 */

// "YYYY-MM-DD" -> "DD-MM-YYYY" (for showing a stored date to the user)
export function ymdToDmy(ymd) {
  if (!ymd) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!match) return ymd;
  const [, y, m, d] = match;
  return `${d}-${m}-${y}`;
}

// "DD-MM-YYYY" -> "YYYY-MM-DD" (for sending a typed date to the backend)
export function dmyToYmd(dmy) {
  if (!dmy) return "";
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim());
  if (!match) return "";
  const [, d, m, y] = match;
  return `${y}-${m}-${d}`;
}

// Auto-inserts dashes as the user types digits, e.g. "15012001" -> "15-01-2001"
export function autoFormatDmyInput(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("-");
}

export const DMY_PATTERN = "\\d{2}-\\d{2}-\\d{4}";
