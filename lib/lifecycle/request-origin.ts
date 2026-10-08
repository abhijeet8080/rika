// Destructive browser actions must originate from this app. Webhooks and
// scheduled cleanup use their own signature/token verification instead.
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
