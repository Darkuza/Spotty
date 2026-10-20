import type { Profile } from "@shared/types.ts";

/** Telefonnummer der behandelnden Klinik (erster passender Kontakt). */
export function clinicPhone(profile: Profile | null): string | null {
  const contacts = profile?.data?.contacts || [];
  const primary = contacts.find((c) => c.phone && /behandel|aktuell|notfall/i.test(`${c.role || ""}`));
  return (primary || contacts.find((c) => c.phone))?.phone || null;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, "")}`;
}
