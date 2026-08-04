"use client";

import { useCallback, useEffect, useState } from "react";

type GraphEntity = {
  entity_id: string;
  role: string;
  approved: boolean;
  kind: string;
  name: string;
  aliases: string[];
  short_description: string;
};

type GraphEvent = {
  event_id: string;
  approved: boolean;
  title: string;
  open_question: string;
  status: string;
  created_at: string;
  is_new_proposal: boolean;
};

type GraphPayload = {
  entities: GraphEntity[];
  events: GraphEvent[];
};

type AdminGraphPanelProps = {
  storyId: string;
};

async function postDecide(body: {
  type: "entity" | "event";
  story_id: string;
  target_id: string;
  decision: "approve" | "reject";
}): Promise<void> {
  const res = await fetch("/api/admin/graph/decide", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Decision failed",
    );
  }
}

export function AdminGraphPanel({ storyId }: AdminGraphPanelProps) {
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [events, setEvents] = useState<GraphEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/stories/${encodeURIComponent(storyId)}/graph`,
        { credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as GraphPayload & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to load graph",
        );
      }
      const nextEntities = Array.isArray(data.entities) ? data.entities : [];
      const nextEvents = Array.isArray(data.events) ? data.events : [];
      setEntities(nextEntities);
      setEvents(nextEvents);
      setStatus(
        nextEntities.length === 0 && nextEvents.length === 0 ? "empty" : "ready",
      );
    } catch (err: unknown) {
      setEntities([]);
      setEvents([]);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load graph");
    }
  }, [storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decideEntity = async (
    entityId: string,
    decision: "approve" | "reject",
  ) => {
    const prev = entities;
    const key = `entity:${entityId}`;
    setBusyKey(key);
    setActionError(null);

    if (decision === "approve") {
      setEntities((rows) =>
        rows.map((r) =>
          r.entity_id === entityId ? { ...r, approved: true } : r,
        ),
      );
    } else {
      setEntities((rows) => rows.filter((r) => r.entity_id !== entityId));
    }

    try {
      await postDecide({
        type: "entity",
        story_id: storyId,
        target_id: entityId,
        decision,
      });
      setEntities((rows) => {
        if (rows.length === 0 && events.length === 0) {
          setStatus("empty");
        }
        return rows;
      });
    } catch (err: unknown) {
      setEntities(prev);
      setActionError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusyKey(null);
    }
  };

  const decideEvent = async (
    eventId: string,
    decision: "approve" | "reject",
  ) => {
    const prev = events;
    const key = `event:${eventId}`;
    setBusyKey(key);
    setActionError(null);

    if (decision === "approve") {
      setEvents((rows) =>
        rows.map((r) =>
          r.event_id === eventId ? { ...r, approved: true } : r,
        ),
      );
    } else {
      setEvents((rows) => rows.filter((r) => r.event_id !== eventId));
    }

    try {
      await postDecide({
        type: "event",
        story_id: storyId,
        target_id: eventId,
        decision,
      });
      setEvents((rows) => {
        if (entities.length === 0 && rows.length === 0) {
          setStatus("empty");
        }
        return rows;
      });
    } catch (err: unknown) {
      setEvents(prev);
      setActionError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusyKey(null);
    }
  };

  const approveAll = async () => {
    const pendingEntities = entities.filter((e) => !e.approved);
    const pendingEvents = events.filter((e) => !e.approved);
    if (pendingEntities.length === 0 && pendingEvents.length === 0) {
      return;
    }

    const prevEntities = entities;
    const prevEvents = events;
    setBusyKey("all");
    setActionError(null);

    setEntities((rows) => rows.map((r) => ({ ...r, approved: true })));
    setEvents((rows) => rows.map((r) => ({ ...r, approved: true })));

    try {
      await Promise.all([
        ...pendingEntities.map((e) =>
          postDecide({
            type: "entity",
            story_id: storyId,
            target_id: e.entity_id,
            decision: "approve",
          }),
        ),
        ...pendingEvents.map((e) =>
          postDecide({
            type: "event",
            story_id: storyId,
            target_id: e.event_id,
            decision: "approve",
          }),
        ),
      ]);
    } catch (err: unknown) {
      setEntities(prevEntities);
      setEvents(prevEvents);
      setActionError(err instanceof Error ? err.message : "Approve all failed");
    } finally {
      setBusyKey(null);
    }
  };

  const pendingCount =
    entities.filter((e) => !e.approved).length +
    events.filter((e) => !e.approved).length;

  return (
    <section className="mt-6 rounded-lg border border-zinc-800 bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-zinc-100">Graph</h2>
        {status === "ready" && pendingCount > 0 ? (
          <button
            type="button"
            onClick={() => void approveAll()}
            disabled={busyKey !== null}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyKey === "all" ? "Approving…" : "Approve all"}
          </button>
        ) : null}
      </div>

      {status === "loading" ? (
        <p className="mt-4 text-sm text-zinc-500">Loading graph…</p>
      ) : null}

      {status === "error" ? (
        <div className="mt-4">
          <p className="text-sm text-red-400">{error ?? "Failed to load graph"}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 text-sm text-zinc-300 underline hover:text-zinc-100"
          >
            Retry
          </button>
        </div>
      ) : null}

      {status === "empty" ? (
        <p className="mt-4 text-sm text-zinc-500">No graph data for this story</p>
      ) : null}

      {actionError ? (
        <p className="mt-3 text-sm text-red-400">{actionError}</p>
      ) : null}

      {status === "ready" ? (
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              People &amp; Organizations
            </h3>
            {entities.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No entities linked</p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-800">
                {entities.map((entity) => {
                  const key = `entity:${entity.entity_id}`;
                  const busy = busyKey === key || busyKey === "all";
                  return (
                    <li
                      key={entity.entity_id}
                      className={`flex flex-wrap items-start justify-between gap-3 py-3 ${
                        entity.approved ? "opacity-60" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                            {entity.kind === "organization" ? "org" : "person"}
                          </span>
                          <span className="font-medium text-zinc-100">
                            {entity.name}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {entity.role}
                          </span>
                          {entity.approved ? (
                            <span className="text-xs text-zinc-500">
                              Approved
                            </span>
                          ) : null}
                        </div>
                        {entity.short_description ? (
                          <p className="mt-1 text-sm text-zinc-400">
                            {entity.short_description}
                          </p>
                        ) : null}
                      </div>
                      {!entity.approved ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void decideEntity(entity.entity_id, "approve")
                            }
                            className="rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                            aria-label={`Approve ${entity.name}`}
                          >
                            ✓ Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void decideEntity(entity.entity_id, "reject")
                            }
                            className="rounded-md border border-zinc-700 bg-transparent px-2.5 py-1 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                            aria-label={`Reject ${entity.name}`}
                          >
                            ✗ Reject
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Event
            </h3>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No event linked</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {events.map((event) => {
                  const key = `event:${event.event_id}`;
                  const busy = busyKey === key || busyKey === "all";
                  return (
                    <li
                      key={event.event_id}
                      className={`rounded-md border border-zinc-800 p-3 ${
                        event.approved ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {event.is_new_proposal ? (
                            <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
                              New event proposed
                            </p>
                          ) : null}
                          <p className="text-zinc-100">
                            Part of:{" "}
                            <span className="font-medium">{event.title}</span>
                          </p>
                          {event.open_question ? (
                            <p className="mt-1 text-sm text-zinc-400">
                              {event.open_question}
                            </p>
                          ) : null}
                          {event.approved ? (
                            <p className="mt-1 text-xs text-zinc-500">
                              Approved
                            </p>
                          ) : null}
                        </div>
                        {!event.approved ? (
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void decideEvent(event.event_id, "approve")
                              }
                              className="rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                              aria-label={`Approve event ${event.title}`}
                            >
                              ✓ Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void decideEvent(event.event_id, "reject")
                              }
                              className="rounded-md border border-zinc-700 bg-transparent px-2.5 py-1 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                              aria-label={`Reject event ${event.title}`}
                            >
                              ✗ Reject
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
