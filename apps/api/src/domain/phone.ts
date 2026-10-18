const EASTERN_ARABIC_ZERO = 0x0660;

function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - EASTERN_ARABIC_ZERO));
}

/** Returns the canonical +20 1XXXXXXXXX form for an Egyptian mobile number, or null if invalid. */
export function normalizeEgyptPhone(raw: string): string | null {
  const compact = toWesternDigits(raw).replace(/[\s\-()]/g, "");
  const match = /^(?:\+?20|0)?(1[0125]\d{8})$/.exec(compact);
  return match ? `+20${match[1]}` : null;
}
