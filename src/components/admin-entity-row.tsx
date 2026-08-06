"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type EntityCandidate = {
  id: string;
  label: string;
  description: string;
};

export type AdminEntity = {
  id: string;
  kind: string;
  name: string;
  role_title: string;
  short_description: string;
  description_source: string;
  wikidata_id: string | null;
  identity_verified_at: string | null;
  candidates: EntityCandidate[];
  story_count: number;
};

const SOURCE_STYLES: Record<string, string> = {
  human: "border-[#c8ff00]/50 bg-[#c8ff00]/10 text-[#c8ff00]",
  wikidata: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  news: "border-zinc-600 text-zinc-300",
  source_text: "border-zinc-700 text-zinc-400",
  model: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

function SourceBadge({ source }: { source: string }) {
  const classes = SOURCE_STYLES[source] ?? SOURCE_STYLES.model;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${classes}`}
    >
      {source.replace("_", " ")}
    </span>
  );
}

function formatVerified(value: string | null): string {
  if (!value) return "unverified";
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminEntityRow({ entity }: { entity: AdminEntity }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(entity.name);
  const [roleTitle, setRoleTitle] = useState(entity.role_title);
  const [description, setDescription] = useState(entity.short_description);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/entities/${encodeURIComponent(entity.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            name,
            role_title: roleTitle,
            short_description: description,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Save failed",
        );
      }
      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setName(entity.name);
    setRoleTitle(entity.role_title);
    setDescription(entity.short_description);
    setError(null);
    setOpen(false);
  };

  const ambiguous = entity.candidates.length > 0;

  return (
    <li className="border-b border-zinc-900 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 text-left"
      >
        <span className="text-sm font-medium text-zinc-100">{entity.name}</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">
          {entity.kind}
        </span>
        <SourceBadge source={entity.description_source} />
        {ambiguous ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Ambiguous
          </span>
        ) : null}
        <span className="text-[11px] text-zinc-600">
          {entity.story_count} {entity.story_count === 1 ? "story" : "stories"} ·{" "}
          {formatVerified(entity.identity_verified_at)}
        </span>
      </button>

      <div className="mt-1 space-y-0.5">
        {entity.role_title ? (
          <p className="text-xs text-zinc-400">{entity.role_title}</p>
        ) : null}
        <p className="text-xs text-zinc-500">
          {entity.short_description || (
            <span className="italic text-zinc-700">No description</span>
          )}
        </p>
      </div>

      {ambiguous ? (
        <ul className="mt-2 space-y-0.5 border-l-2 border-amber-500/30 pl-3">
          {entity.candidates.map((candidate) => (
            <li key={candidate.id} className="text-[11px] text-zinc-500">
              <a
                href={`https://www.wikidata.org/wiki/${candidate.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 hover:text-[#c8ff00]"
              >
                {candidate.id}
              </a>{" "}
              {candidate.label} — {candidate.description}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-[#c8ff00]"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Role or title
            </span>
            <input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="President of the United States"
              className="mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-[#c8ff00]"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-y rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-[#c8ff00]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || name.trim().length === 0}
              className="rounded-full bg-[#c8ff00] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save as human-verified"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
            >
              Cancel
            </button>
            {entity.wikidata_id ? (
              <a
                href={`https://www.wikidata.org/wiki/${entity.wikidata_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-zinc-500 hover:text-[#c8ff00]"
              >
                {entity.wikidata_id}
              </a>
            ) : null}
            {error ? <span className="text-xs text-red-400">{error}</span> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
