"use client";

import { useState } from "react";

type StorylineItem = {
  date: string;
  event: string;
};

function formatTimelineDate(value: string): string {
  if (!value) {
    return "";
  }

  if (/^\d{4}$/.test(value) || /^\d{4}-\d{4}$/.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    const date = new Date(`${value}-01T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en", {
      month: "short",
      year: "numeric",
    });
  }

  return value;
}

type Props = {
  items: StorylineItem[];
};

export function StorylineToggle({ items }: Props) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        style={{
          padding: "8px 12px",
          background: "rgba(255,255,255,0.05)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          fontSize: "11px",
          fontWeight: 600,
          color: "rgba(255,255,255,0.85)",
        }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: "#c8ff00" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          Storyline · {items.length} {items.length === 1 ? "event" : "events"}{" "}
          {open ? "↓" : "→"}
        </span>
      </button>

      {open ? (
        <ul className="flex flex-col gap-3" style={{ paddingTop: "12px" }}>
          {items.map((item, index) => (
            <li key={`${item.date}-${item.event}-${index}`} className="flex gap-2">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: "#c8ff00" }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-xs text-zinc-500">{formatTimelineDate(item.date)}</p>
                <p className="text-sm leading-snug text-zinc-300">{item.event}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
