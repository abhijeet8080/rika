import { timingSafeEqual } from "node:crypto";
import { runLifecycleCleanup } from "@/lib/lifecycle/cleanup";

export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Cleanup scheduler is not configured" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runLifecycleCleanup(), { headers: { "Cache-Control": "no-store" } });
}
