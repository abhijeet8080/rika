/** Only app-owned transcript citations are eligible for in-place playback. */
export function parseMeetingCitation(href: string | undefined): {
  meetingId: string;
  chunkId: string;
} | null {
  if (!href?.startsWith("/meetings/")) return null;
  try {
    const url = new URL(href, "https://rika.local");
    const match = url.pathname.match(/^\/meetings\/([^/]+)$/);
    const chunkId = url.searchParams.get("source");
    if (!match || !chunkId) return null;
    return { meetingId: decodeURIComponent(match[1]), chunkId };
  } catch {
    return null;
  }
}
