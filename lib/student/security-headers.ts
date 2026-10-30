export function studentCSP(nonce: string, backend: string | undefined, development: boolean) {
  let origin = "";
  try { origin = new URL(backend ?? "").origin; } catch { /* Missing setup fails closed in the app. */ }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Existing responsive chart/layout styles require inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${origin} ${origin.replace(/^https:/, "wss:")}${development ? " ws://127.0.0.1:* ws://localhost:*" : ""}`.trim(),
    "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
