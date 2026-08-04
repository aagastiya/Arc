import { syncAllRssFeeds } from "@/lib/rss/sync-feeds";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Allow CRON_SECRET Bearer, or the same HTTP Basic Auth used for /admin. */
function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${secret}`) {
      return true;
    }
  } else if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const expectedUser = process.env.ADMIN_USERNAME?.trim() ?? "";
  const expectedPass = process.env.ADMIN_PASSWORD?.trim() ?? "";
  if (!expectedUser || !expectedPass) {
    return false;
  }

  const auth = request.headers.get("authorization");
  if (!auth) {
    return false;
  }

  const [scheme, encoded] = auth.split(/\s+/, 2);
  if (!scheme || !encoded || scheme.toLowerCase() !== "basic") {
    return false;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }

  const colon = decoded.indexOf(":");
  if (colon === -1) {
    return false;
  }

  const username = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  return (
    safeEqualString(username, expectedUser) &&
    safeEqualString(password, expectedPass)
  );
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAllRssFeeds();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
