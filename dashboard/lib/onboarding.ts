export const BLOCKED_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "me.com",
] as const;

export type BlockedEmailDomain = (typeof BLOCKED_EMAIL_DOMAINS)[number];

export function getEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = trimmed.slice(at + 1);
  if (!domain) return null;
  if (domain.includes(" ")) return null;
  return domain;
}

export function isBusinessEmail(email: string): boolean {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return !BLOCKED_EMAIL_DOMAINS.includes(domain as BlockedEmailDomain);
}


