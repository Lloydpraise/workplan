import React, { useEffect, useState } from "react";
import { BLOCKS, formatTimeRange } from "./blocks";

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Block that's running right now, or the next one coming up (falls back to the first block).
function pickBlock(now) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const current = BLOCKS.find((b) => mins >= toMinutes(b.start) && mins < toMinutes(b.end));
  if (current) return current.id;
  const next = BLOCKS.find((b) => toMinutes(b.start) > mins);
  return (next || BLOCKS[0]).id;
}

function shortDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function NotesDrawer({ open, onClose, workplan, todayISO, tomorrowISO, onScheduled }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [scheduling, setScheduling] = useState(null); // the note being turned into a task

  // Reload every time the drawer opens so the list is always fresh.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setError(null);
      if (!workplan) {
        setError("Connect Supabase by adding VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.");
        return;
      }
      setLoading(true);
      const { data, error: err } = await workplan
        .from("notes")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) setError(err.message);
      else setNotes(data || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape" && !scheduling) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, scheduling, onClose]);

  async function addNote(andSchedule) {
    const text = draft.trim();
    if (!text || !workplan) return;
    const { data, error: err } = await workplan.from("notes").insert({ text }).select().single();
    if (err) {
      setError(err.message);
      return;
    }
    setNotes((prev) => [data, ...prev]);
    setDraft("");
    if (andSchedule) setScheduling(data);
  }

  async function removeNote(note) {
    if (!workplan) return;
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    const { error: err } = await workplan.from("notes").delete().eq("id", note.id);
    if (err) setError(err.message);
  }

  async function scheduleNote(note, { date, blockId, text }) {
    // Put the new task at the end of its block for that day.
    const { count } = await workplan
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("date", date)
      .eq("block_id", blockId);

    const { data: task, error: taskErr } = await workplan
      .from("tasks")
      .insert({ block_id: blockId, date, text, position: count || 0 })
      .select()
      .single();
    if (taskErr) throw taskErr;

    const { error: noteErr } = await workplan
      .from("notes")
      .update({ task_id: task.id, scheduled_date: date })
      .eq("id", note.id);
    if (noteErr) throw noteErr;

    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, task_id: task.id, scheduled_date: date } : n))
    );
    onScheduled?.(task);
    setScheduling(null);
  }

  function dateLabel(iso) {
    if (iso === todayISO) return "Today";
    if (iso === tomorrowISO) return "Tomorrow";
    return shortDate(iso);
  }

  if (!open) return null;

  return (
    <>
      <div className="notes-scrim" onClick={onClose} />
      <aside className="notes-drawer" aria-label="Notes">
        <div className="notes-head">
          <div>
            <p className="eyebrow">Every day</p>
            <h2>Notes</h2>
          </div>
          <button className="notes-close" onClick={onClose} aria-label="Close notes">
            ×
          </button>
        </div>

        <div className="notes-compose">
          <textarea
            rows={3}
            placeholder="Jot something down…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addNote(false);
              }
            }}
          />
          <div className="notes-compose-actions">
            <button onClick={() => addNote(false)} disabled={!draft.trim()}>
              Add note
            </button>
            <button className="primary-action" onClick={() => addNote(true)} disabled={!draft.trim()}>
              Add &amp; schedule
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <ul className="notes-list">
          {loading && notes.length === 0 && <li className="muted">Loading…</li>}
          {!loading && notes.length === 0 && !error && <li className="empty">No notes yet.</li>}
          {notes.map((n) => (
            <li className={n.task_id ? "note scheduled" : "note"} key={n.id}>
              <button
                className="note-body"
                onClick={() => !n.task_id && setScheduling(n)}
                disabled={Boolean(n.task_id)}
                title={n.task_id ? "Already a task" : "Turn into a task"}
              >
                {n.text}
              </button>
              <div className="note-meta">
                {n.task_id ? (
                  <span className="note-badge">✓ {dateLabel(n.scheduled_date)}</span>
                ) : (
                  <button className="note-task-btn" onClick={() => setScheduling(n)}>
                    → Task
                  </button>
                )}
                <button className="remove" onClick={() => removeNote(n)} aria-label="Delete note">
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {scheduling && (
        <ScheduleModal
          note={scheduling}
          todayISO={todayISO}
          tomorrowISO={tomorrowISO}
          onCancel={() => setScheduling(null)}
          onConfirm={(choice) => scheduleNote(scheduling, choice)}
        />
      )}
    </>
  );
}

function ScheduleModal({ note, todayISO, tomorrowISO, onCancel, onConfirm }) {
  const [text, setText] = useState(() => note.text.replace(/\s+/g, " ").trim());
  const [when, setWhen] = useState("today"); // today | tomorrow | custom
  const [custom, setCustom] = useState("");
  const [blockId, setBlockId] = useState(() => pickBlock(new Date()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const date = when === "today" ? todayISO : when === "tomorrow" ? tomorrowISO : custom;
  const canSave = text.trim() && date && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setErr(null);
    try {
      await onConfirm({ date, blockId, text: text.trim() });
    } catch (e) {
      setErr(e.message || "Could not schedule this task.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay schedule-overlay" onClick={onCancel}>
      <div className="modal schedule-modal" onClick={(e) => e.stopPropagation()}>
        <p className="modal-label schedule-title">Schedule task</p>

        <input
          className="schedule-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Task"
        />

        <p className="schedule-field-label">When</p>
        <div className="tabs schedule-tabs">
          {[
            ["today", "Today"],
            ["tomorrow", "Tomorrow"],
            ["custom", "Custom"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={when === key ? "tab active" : "tab"}
              onClick={() => setWhen(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {when === "custom" && (
          <input
            className="schedule-input"
            type="date"
            min={todayISO}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Custom date"
          />
        )}

        <p className="schedule-field-label">Block</p>
        <select
          className="schedule-input"
          value={blockId}
          onChange={(e) => setBlockId(e.target.value)}
          aria-label="Block"
        >
          {BLOCKS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} ({formatTimeRange(b)})
            </option>
          ))}
        </select>

        {err && <p className="error">{err}</p>}

        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary-action" onClick={save} disabled={!canSave}>
            {busy ? "Scheduling…" : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}