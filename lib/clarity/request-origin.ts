// Next can expose an internal hostname in Request.url. Bind browser mutations
// to the actual Host header instead; do not trust arbitrary forwarded hosts.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const protocol = new URL(request.url).protocol;
    if (protocol !== "https:" && protocol !== "http:") return false;
    return origin === new URL(`${protocol}//${host}`).origin;
  } catch { return false; }
}
