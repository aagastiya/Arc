import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runEditorScan } from "@/app/api/admin/editor/scan/route";
import {
  normalizeStoryCategory,
  parseReviewCategorySlug,
  type StoryCategoryBucket,
} from "@/lib/categories";

export const runtime = "nodejs";
/** One category per call — keep under free-plan / Actions timeouts. */
export const maxDuration = 60;

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Allow CRON_SECRET Bearer, or the same HTTP Basic Auth used for /admin. */
function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  } else if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const expectedUser = process.env.ADMIN_USERNAME?.trim() ?? "";
  const expectedPass = process.env.ADMIN_PASSWORD?.trim() ?? "";
  if (!expectedUser || !expectedPass) return false;

  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const [scheme, encoded] = auth.split(/\s+/, 2);
  if (!scheme || !encoded || scheme.toLowerCase() !== "basic") return false;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }

  const colon = decoded.indexOf(":");
  if (colon === -1) return false;

  return (
    safeEqualString(decoded.slice(0, colon), expectedUser) &&
    safeEqualString(decoded.slice(colon + 1), expectedPass)
  );
}

function parseCategory(request: Request): StoryCategoryBucket | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("category")?.trim();
  if (fromQuery) {
    return (
      parseReviewCategorySlug(fromQuery) ??
      (normalizeStoryCategory(fromQuery) as StoryCategoryBucket)
    );
  }
  return null;
}

async function parseCategoryFromBody(
  request: Request,
): Promise<StoryCategoryBucket | null> {
  try {
    const body = (await request.clone().json()) as { category?: unknown };
    if (typeof body?.category === "string" && body.category.trim()) {
      return (
        parseReviewCategorySlug(body.category) ??
        (normalizeStoryCategory(body.category) as StoryCategoryBucket)
      );
    }
  } catch {
    // no body
  }
  return null;
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfigured", details: "Missing OPENAI_API_KEY" },
        { status: 500 },
      );
    }

    const onlyBucket =
      parseCategory(request) ?? (await parseCategoryFromBody(request));

    if (!onlyBucket) {
      return NextResponse.json(
        {
          error: "Missing category",
          details:
            "Pass ?category=World (or Finance, Tech, …). One category per call.",
        },
        { status: 400 },
      );
    }

    const result = await runEditorScan({ onlyBucket });
    return NextResponse.json({ ok: true, category: onlyBucket, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scan cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
