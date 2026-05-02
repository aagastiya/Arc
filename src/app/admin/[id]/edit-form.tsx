"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type StorylineItem = {
  date: string;
  event: string;
};

type EditFormProps = {
  story: {
    id: string;
    arc_headline: string;
    arc_summary: string;
    arc_storyline: StorylineItem[];
    clip_url: string | null;
    cover_image_url: string | null;
    is_live: boolean;
  };
};

export function EditForm({ story }: EditFormProps) {
  const router = useRouter();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);

  const [arcHeadline, setArcHeadline] = useState(story.arc_headline);
  const [arcSummary, setArcSummary] = useState(story.arc_summary);
  const [arcStoryline, setArcStoryline] = useState<StorylineItem[]>(story.arc_storyline);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(story.cover_image_url);
  const [clipUrl, setClipUrl] = useState<string | null>(story.clip_url);
  const [isLive, setIsLive] = useState(Boolean(story.is_live));

  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingClip, setIsUploadingClip] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingPublish, setIsTogglingPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Keep local form state in sync with fresh server props after `router.refresh()`.
  useEffect(() => {
    setArcHeadline(story.arc_headline);
    setArcSummary(story.arc_summary);
    setArcStoryline(story.arc_storyline);
    setIsLive(Boolean(story.is_live));
  }, [
    story.arc_headline,
    story.arc_summary,
    story.arc_storyline,
    story.is_live,
  ]);

  useEffect(() => {
    if (!savedMessage) {
      return;
    }
    const timer = window.setTimeout(() => setSavedMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  const isBusy = useMemo(
    () => isSaving || isUploadingCover || isUploadingClip || isTogglingPublish,
    [isSaving, isUploadingCover, isUploadingClip, isTogglingPublish],
  );

  const handleUpload = async (file: File, bucket: "clips" | "cover") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", bucket);

    const response = await fetch("/api/arc/upload", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof payload?.error === "string" ? payload.error : "Upload failed.";
      throw new Error(message);
    }

    if (typeof payload?.url !== "string" || !payload.url) {
      throw new Error("Upload succeeded but no URL was returned.");
    }

    return payload.url as string;
  };

  const onCoverSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError(null);
    setIsUploadingCover(true);
    try {
      const url = await handleUpload(file, "cover");
      setCoverImageUrl(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload cover image.");
    } finally {
      setIsUploadingCover(false);
    }
  };

  const onClipSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError(null);
    setIsUploadingClip(true);
    try {
      const url = await handleUpload(file, "clips");
      setClipUrl(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload clip.");
    } finally {
      setIsUploadingClip(false);
    }
  };

  const updateStorylineItem = (index: number, key: "date" | "event", value: string) => {
    setArcStoryline((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const removeStorylineItem = (index: number) => {
    setArcStoryline((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const addStorylineItem = () => {
    setArcStoryline((prev) => [...prev, { date: "", event: "" }]);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSavedMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/arc/stories/${encodeURIComponent(story.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arc_headline: arcHeadline,
          arc_summary: arcSummary,
          arc_storyline: arcStoryline,
          clip_url: clipUrl,
          cover_image_url: coverImageUrl,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "Save failed.";
        throw new Error(message);
      }

      setSavedMessage("Saved");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    setError(null);
    setSavedMessage(null);

    if (!isLive) {
      if (!arcHeadline.trim()) {
        setError("Cannot publish: arc_headline is required");
        return;
      }
      if (!arcSummary.trim()) {
        setError("Cannot publish: arc_summary is required");
        return;
      }
    }

    setIsTogglingPublish(true);
    try {
      const nextIsLive = !isLive;
      const response = await fetch(`/api/arc/stories/${encodeURIComponent(story.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_live: nextIsLive }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : nextIsLive
              ? "Publishing failed."
              : "Unpublishing failed.";
        throw new Error(message);
      }

      setIsLive(nextIsLive);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update publish status.");
    } finally {
      setIsTogglingPublish(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm text-zinc-400">Arc headline</label>
        <input
          value={arcHeadline}
          onChange={(event) => setArcHeadline(event.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none ring-[#c8ff00] focus:ring-2"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm text-zinc-400">Arc summary</label>
        <textarea
          rows={5}
          value={arcSummary}
          onChange={(event) => setArcSummary(event.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none ring-[#c8ff00] focus:ring-2"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm text-zinc-400">Arc storyline</label>
          <button
            type="button"
            onClick={addStorylineItem}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
          >
            Add event
          </button>
        </div>
        <div className="space-y-2">
          {arcStoryline.map((item, index) => (
            <div key={`${index}-${item.date}-${item.event}`} className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
              <input
                value={item.date}
                onChange={(event) => updateStorylineItem(index, "date", event.target.value)}
                placeholder="YYYY-MM-DD"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none ring-[#c8ff00] focus:ring-2"
              />
              <input
                value={item.event}
                onChange={(event) => updateStorylineItem(index, "event", event.target.value)}
                placeholder="Event"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none ring-[#c8ff00] focus:ring-2"
              />
              <button
                type="button"
                onClick={() => removeStorylineItem(index)}
                className="rounded border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:border-zinc-500"
              >
                Remove
              </button>
            </div>
          ))}
          {arcStoryline.length === 0 ? (
            <p className="text-sm text-zinc-500">No events yet.</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-4">
        <p className="mb-2 text-sm text-zinc-400">Cover image</p>
        {coverImageUrl ? (
          <img src={coverImageUrl} alt="Cover preview" className="mb-3 max-h-48 rounded-md border border-zinc-800" />
        ) : (
          <p className="mb-3 text-sm text-zinc-500">No cover image uploaded.</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={isUploadingCover}
            className="rounded border border-[#c8ff00]/50 px-3 py-1 text-xs font-semibold text-[#c8ff00] hover:border-[#c8ff00] hover:bg-[#c8ff00]/10 disabled:opacity-60"
          >
            {isUploadingCover ? "Uploading..." : "Upload cover image"}
          </button>
          <button
            type="button"
            onClick={() => setCoverImageUrl(null)}
            className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500"
          >
            Remove
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onCoverSelected}
            className="hidden"
          />
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-4">
        <p className="mb-2 text-sm text-zinc-400">Clip (MP4)</p>
        {clipUrl ? (
          <video controls src={clipUrl} className="mb-3 max-h-56 w-full rounded-md border border-zinc-800" />
        ) : (
          <p className="mb-3 text-sm text-zinc-500">No clip uploaded.</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => clipInputRef.current?.click()}
            disabled={isUploadingClip}
            className="rounded border border-[#c8ff00]/50 px-3 py-1 text-xs font-semibold text-[#c8ff00] hover:border-[#c8ff00] hover:bg-[#c8ff00]/10 disabled:opacity-60"
          >
            {isUploadingClip ? "Uploading..." : "Upload clip"}
          </button>
          <button
            type="button"
            onClick={() => setClipUrl(null)}
            className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500"
          >
            Remove
          </button>
          <input
            ref={clipInputRef}
            type="file"
            accept="video/mp4"
            onChange={onClipSelected}
            className="hidden"
          />
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-4">
        <p className="text-sm text-zinc-400">Publish status:</p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
              isLive ? "border-[#c8ff00] text-[#c8ff00]" : "border-zinc-600 text-zinc-300"
            }`}
          >
            {isLive ? "Live" : "Draft"}
          </span>
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={isBusy}
            className={
              isLive
                ? "rounded border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-60"
                : "rounded border border-[#c8ff00]/50 px-3 py-1 text-xs font-semibold text-[#c8ff00] hover:border-[#c8ff00] hover:bg-[#c8ff00]/10 disabled:opacity-60"
            }
          >
            {isTogglingPublish
              ? isLive
                ? "Unpublishing..."
                : "Publishing..."
              : isLive
                ? "Unpublish"
                : "Publish"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isBusy}
          className="rounded bg-[#c8ff00] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </button>
        {savedMessage ? <p className="text-sm text-green-400">{savedMessage}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
    </form>
  );
}
