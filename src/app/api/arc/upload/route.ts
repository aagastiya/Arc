import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CLIP_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_COVER_SIZE_BYTES = 5 * 1024 * 1024;
const COVER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getFileExtension(filename: string): string {
  const trimmed = filename.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const bucketValue = formData.get("bucket");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        { error: "Invalid file: 'file' is required and must be a File." },
        { status: 400 },
      );
    }

    if (typeof bucketValue !== "string") {
      return NextResponse.json(
        { error: "Invalid bucket: 'bucket' is required." },
        { status: 400 },
      );
    }

    if (bucketValue !== "clips" && bucketValue !== "cover") {
      return NextResponse.json(
        { error: "Invalid bucket: must be exactly 'clips' or 'cover'." },
        { status: 400 },
      );
    }

    if (bucketValue === "clips") {
      if (fileValue.type !== "video/mp4") {
        return NextResponse.json(
          { error: "Invalid clips file: only video/mp4 is allowed." },
          { status: 400 },
        );
      }
      if (fileValue.size > MAX_CLIP_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Invalid clips file: max size is 100 MB." },
          { status: 400 },
        );
      }
    }

    if (bucketValue === "cover") {
      if (!COVER_MIME_TYPES.has(fileValue.type)) {
        return NextResponse.json(
          {
            error:
              "Invalid covers file: allowed MIME types are image/jpeg, image/png, image/webp.",
          },
          { status: 400 },
        );
      }
      if (fileValue.size > MAX_COVER_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Invalid covers file: max size is 5 MB." },
          { status: 400 },
        );
      }
    }

    const ext = getFileExtension(fileValue.name);
    if (!ext) {
      return NextResponse.json(
        { error: "Invalid file name: file must include an extension." },
        { status: 400 },
      );
    }

    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const supabase = createAdminClient();

    const { error: uploadError } = await supabase.storage
      .from(bucketValue)
      .upload(filename, fileValue, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Failed to upload file", details: uploadError.message },
        { status: 500 },
      );
    }

    const { data } = supabase.storage.from(bucketValue).getPublicUrl(filename);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
