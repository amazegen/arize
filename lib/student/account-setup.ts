export function validSetupToken(token: unknown, type: unknown): boolean {
  return typeof token === "string" && /^[a-zA-Z0-9_-]{32,256}$/.test(token) && (type === "invite" || type === "recovery");
}

export function passwordSetupError(password: string, confirmation: string): string | null {
  if (password.length < 12 || password.length > 128) return "Use a password between 12 and 128 characters.";
  if (password !== confirmation) return "Your passwords do not match. Please enter them again.";
  return null;
}
