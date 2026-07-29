export function parseAllowedEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export function isEmailAllowed(email: string, allowedEmails: string[]): boolean {
  return allowedEmails.includes(email.trim().toLowerCase());
}
