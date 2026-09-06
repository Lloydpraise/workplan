import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import { BLOCKS, blockDurationMinutes, formatTimeRange } from "./blocks";

function toISODate(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function formatLongDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatClock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function formatCurrentTime(date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default function App() {
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const tomorrowISO = useMemo(() => addDays(todayISO, 1), [todayISO]);

  const [mode, setMode] = useState("today"); // today | plan | month
  const [tasksByBlock, setTasksByBlock] = useState({});
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [addingOn, setAddingOn] = useState(null); // blockId currently showing its add-input
  const [monthStats, setMonthStats] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [congratsOpen, setCongratsOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  // ---- timer state ----
  const [timer, setTimer] = useState(null); // { blockId, label, totalSeconds, secondsLeft, running, pinned }
  const tickRef = useRef(null);
  const endTimestampRef = useRef(null);

  const activeDate = mode === "today" ? todayISO : mode === "plan" ? tomorrowISO : selectedDate;
  const workplan = supabase?.schema("workplan");

  const loadDay = useCallback(async (dateISO) => {
    setLoading(true);
    setError(null);
    if (!workplan) {
      setError("Connect Supabase by adding VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.");
      setLoading(false);
      return;
    }
    const { data: rows, error: err } = await workplan
      .from("tasks")
      .select("*")
      .or(`date.eq.${dateISO},recurring.eq.true`)
      .order("position", { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const templates = rows.filter((row) => row.recurring);
    const dayRows = rows.filter((row) => !row.recurring && row.date === dateISO);
    const missingInstances = templates.filter(
      (template) => !dayRows.some((row) => row.recurrence_id === template.id)
    );
    let createdInstances = [];

    if (missingInstances.length > 0) {
      const { data, error: createErr } = await workplan
        .from("tasks")
        .insert(
          missingInstances.map((template) => ({
            block_id: template.block_id,
            date: dateISO,
            text: template.text,
            position: template.position,
            recurring: false,
            recurrence_id: template.id,
          }))
        )
        .select();
      if (createErr) setError(createErr.message);
      createdInstances = data || [];
    }

    const grouped = {};
    for (const b of BLOCKS) grouped[b.id] = [];
    for (const row of [...dayRows, ...createdInstances]) {
      if (!grouped[row.block_id]) grouped[row.block_id] = [];
      grouped[row.block_id].push(row);
    }
    setTasksByBlock(grouped);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === "month") return;
    loadDay(activeDate);
  }, [activeDate, mode, loadDay]);

  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    const isNight = currentTime.getHours() >= 20 || currentTime.getHours() < 5;
    document.documentElement.dataset.theme = isNight ? "night" : "day";
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      isNight ? "#14130F" : "#0D1B2A"
    );
  }, [currentTime]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  useEffect(() => {
    if (mode !== "month") return;
    (async () => {
      setLoading(true);
      setError(null);
      if (!workplan) {
        setError("Connect Supabase by adding VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.");
        setLoading(false);
        return;
      }
      const now = new Date();
      const first = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
      const last = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const { data, error: err } = await workplan
        .from("tasks")
        .select("date, done")
        .gte("date", first)
        .lte("date", last);

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const byDate = {};
      for (const row of data) {
        if (!byDate[row.date]) byDate[row.date] = { total: 0, done: 0 };
        byDate[row.date].total += 1;
        if (row.done) byDate[row.date].done += 1;
      }
      setMonthStats({ first, last, byDate });
      setLoading(false);
    })();
  }, [mode]);

  async function addTask(blockId) {
    if (!workplan) return;
    const text = (drafts[blockId] || "").trim();
    if (!text) return;
    const position = (tasksByBlock[blockId] || []).length;
    const { data, error: err } = await workplan
      .from("tasks")
      .insert({ block_id: blockId, date: activeDate, text, position })
      .select()
      .single();

    if (err) {
      setError(err.message);
      return;
    }
    setTasksByBlock((prev) => ({
      ...prev,
      [blockId]: [...(prev[blockId] || []), data],
    }));
    setDrafts((prev) => ({ ...prev, [blockId]: "" }));
  }

  async function toggleTask(blockId, task) {
    if (!workplan) return;
    const nextDone = !task.done;
    setTasksByBlock((prev) => ({
      ...prev,
      [blockId]: prev[blockId].map((t) =>
        t.id === task.id ? { ...t, done: nextDone } : t
      ),
    }));
    const { error: err } = await workplan
      .from("tasks")
      .update({ done: nextDone })
      .eq("id", task.id);
    if (err) setError(err.message);
  }

  async function removeTask(blockId, task) {
    if (!workplan) return;
    setTasksByBlock((prev) => ({
      ...prev,
      [blockId]: prev[blockId].filter((t) => t.id !== task.id),
    }));
    const { error: err } = await workplan.from("tasks").delete().eq("id", task.id);
    if (err) setError(err.message);
  }

  async function toggleRecurring(task) {
    if (!workplan) return;
    const isRecurring = Boolean(task.recurring || task.recurrence_id);
    const sourceId = task.recurrence_id || task.id;
    const { error: err } = await workplan
      .from("tasks")
      .update({ recurring: !isRecurring })
      .eq("id", sourceId);
    if (err) {
      setError(err.message);
      return;
    }
    await loadDay(activeDate);
  }

  const dayTotals = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const b of BLOCKS) {
      const list = tasksByBlock[b.id] || [];
      total += list.length;
      done += list.filter((t) => t.done).length;
    }
    return { total, done };
  }, [tasksByBlock]);

  useEffect(() => {
    if (mode === "today" && dayTotals.total > 0 && dayTotals.done === dayTotals.total) {
      setCongratsOpen(true);
    }
  }, [dayTotals, mode]);

  // ---- timer engine: uses a real end-timestamp so it stays accurate even if
  // the tab is backgrounded, rather than trusting setInterval's 1000ms ticks. ----
  useEffect(() => {
    if (!timer || !timer.running) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => {
      const remainingMs = endTimestampRef.current - Date.now();
      const remainingSec = Math.max(0, Math.round(remainingMs / 1000));
      setTimer((prev) =>
        prev ? { ...prev, secondsLeft: remainingSec, running: remainingSec > 0 } : prev
      );
    }, 250);
    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.running, timer?.blockId]);

  function startTimer(block) {
    const totalSeconds = blockDurationMinutes(block) * 60;
    endTimestampRef.current = Date.now() + totalSeconds * 1000;
    setTimer({
      blockId: block.id,
      label: block.label,
      totalSeconds,
      secondsLeft: totalSeconds,
      running: true,
      pinned: false,
    });
  }

  async function completeBlock(blockId) {
    if (!workplan) return;
    const tasks = tasksByBlock[blockId] || [];
    const isComplete = tasks.length > 0 && tasks.every((task) => task.done);
    const nextDone = !isComplete;
    setTasksByBlock((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] || []).map((task) => ({ ...task, done: nextDone })),
    }));

    const { error: err } = await workplan
      .from("tasks")
      .update({ done: nextDone })
      .eq("date", activeDate)
      .eq("block_id", blockId);
    if (err) setError(err.message);
  }

  function openDate(iso) {
    setSelectedDate(iso);
    setMode("day");
  }

  function togglePause() {
    setTimer((prev) => {
      if (!prev) return prev;
      if (prev.running) {
        return { ...prev, running: false };
      }
      endTimestampRef.current = Date.now() + prev.secondsLeft * 1000;
      return { ...prev, running: true };
    });
  }

  function resetTimer() {
    setTimer((prev) => {
      if (!prev) return prev;
      endTimestampRef.current = Date.now() + prev.totalSeconds * 1000;
      return { ...prev, secondsLeft: prev.totalSeconds, running: true };
    });
  }

  async function endTimer() {
    const activeTimer = timer;
    if (!activeTimer) return;

    const tasks = tasksByBlock[activeTimer.blockId] || [];
    if (tasks.length > 0) {
      setTasksByBlock((prev) => ({
        ...prev,
        [activeTimer.blockId]: (prev[activeTimer.blockId] || []).map((task) => ({
          ...task,
          done: true,
        })),
      }));

      if (workplan) {
        const { error: err } = await workplan
          .from("tasks")
          .update({ done: true })
          .eq("date", activeDate)
          .eq("block_id", activeTimer.blockId);
        if (err) setError(err.message);
      }
    }

    setTimer(null);
  }

  function togglePin() {
    setTimer((prev) => (prev ? { ...prev, pinned: !prev.pinned } : prev));
  }

  return (
    <div className="app">
      <div className="live-clock" aria-label="Current time">{formatCurrentTime(currentTime)}</div>
      {installPrompt && (
        <button className="install-button" onClick={installApp}>
          Install Workplan
        </button>
      )}
      <header className="header">
        <div>
          <p className="eyebrow">Workplan</p>
          <h1>{formatLongDate(activeDate)}</h1>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={mode === "today" ? "tab active" : "tab"}
          onClick={() => setMode("today")}
        >
          Today
        </button>
        <button
          className={mode === "plan" ? "tab active" : "tab"}
          onClick={() => setMode("plan")}
        >
          Plan tomorrow
        </button>
        <button
          className={mode === "month" ? "tab active" : "tab"}
          onClick={() => setMode("month")}
        >
          Month
        </button>
      </nav>

      {error && <p className="error">{error}</p>}

      {mode !== "month" ? (
        <div className="grid-dashboard">
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            BLOCKS.map((block) => {
              const tasks = tasksByBlock[block.id] || [];
              const isAdding = addingOn === block.id;
              const blockComplete = tasks.length > 0 && tasks.every((task) => task.done);
              return (
                <div className={blockComplete ? "card completed" : "card"} key={block.id}>
                  <div className="card-head">
                    <div>
                      <p className="card-time">{formatTimeRange(block)}</p>
                      <p className="card-label">{block.label}</p>
                    </div>
                    {mode === "today" && (
                      <div className="card-actions">
                        <button
                          className={blockComplete ? "complete-btn active" : "complete-btn"}
                          onClick={() => completeBlock(block.id)}
                          disabled={tasks.length === 0}
                          aria-label={blockComplete ? "Mark block incomplete" : "Complete block"}
                        >
                          {blockComplete ? "✓" : "○"}
                        </button>
                        <button
                          className="start-btn"
                          onClick={() => startTimer(block)}
                          title={`Start ${blockDurationMinutes(block)}min timer`}
                        >
                          ▶ Start
                        </button>
                      </div>
                    )}
                  </div>

                  {blockComplete && <p className="completed-label">Completed!</p>}

                  <div className="card-tasks">
                    {tasks.map((t) =>
                      mode === "today" ? (
                        <div className="task" key={t.id}>
                          <label className="task-toggle">
                          <input
                            type="checkbox"
                            checked={t.done}
                            onChange={() => toggleTask(block.id, t)}
                          />
                          <span className={t.done ? "task-text done" : "task-text"}>
                            {t.text}
                          </span>
                          </label>
                          <RecurringButton task={t} onToggle={toggleRecurring} />
                        </div>
                      ) : (
                        <div className="task" key={t.id}>
                          <span className="task-text">{t.text}</span>
                          <button
                            className="remove"
                            onClick={() => removeTask(block.id, t)}
                            aria-label="Remove task"
                          >
                            ×
                          </button>
                          <RecurringButton task={t} onToggle={toggleRecurring} />
                        </div>
                      )
                    )}

                    {tasks.length === 0 && !isAdding && (
                      <p className="empty">Nothing here yet.</p>
                    )}

                    {isAdding && (
                      <div className="add-row">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Add a task"
                          value={drafts[block.id] || ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [block.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addTask(block.id);
                            if (e.key === "Escape") setAddingOn(null);
                          }}
                          onBlur={() => {
                            if (!(drafts[block.id] || "").trim()) setAddingOn(null);
                          }}
                        />
                        <button onClick={() => addTask(block.id)}>Add</button>
                      </div>
                    )}
                  </div>

                  <button
                    className="plus-btn"
                    onClick={() => setAddingOn(isAdding ? null : block.id)}
                    aria-label="Add task"
                  >
                    +
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <MonthView stats={monthStats} loading={loading} onSelectDate={openDate} />
      )}

      {timer && !timer.pinned && (
        <TimerModal timer={timer} onPause={togglePause} onReset={resetTimer} onClose={endTimer} onPin={togglePin} />
      )}
      {timer && timer.pinned && (
        <PinnedTimer timer={timer} onExpand={togglePin} onPause={togglePause} />
      )}
      {congratsOpen && (
        <CongratulationsModal
          onClose={() => setCongratsOpen(false)}
          onPlanTomorrow={() => {
            setCongratsOpen(false);
            setMode("plan");
          }}
        />
      )}
    </div>
  );
}

function RecurringButton({ task, onToggle }) {
  const isRecurring = Boolean(task.recurring || task.recurrence_id);
  return (
    <button
      className={isRecurring ? "recurring-btn active" : "recurring-btn"}
      onClick={() => onToggle(task)}
      aria-label={isRecurring ? "Stop recurring task" : "Make task recurring"}
      title={isRecurring ? "Recurring task" : "Repeat every day"}
    >
      ↻
    </button>
  );
}

function TimerModal({ timer, onPause, onReset, onClose, onPin }) {
  const pct = 1 - timer.secondsLeft / timer.totalSeconds;
  return (
    <div className="modal-overlay">
      <div className="modal">
        <p className="modal-label">{timer.label}</p>
        <div className="digital-clock">{formatClock(timer.secondsLeft)}</div>
        <div className="modal-bar">
          <div className="modal-bar-fill" style={{ width: `${Math.min(100, pct * 100)}%` }} />
        </div>
        <div className="modal-actions">
          <button onClick={onPause}>{timer.running ? "Pause" : "Resume"}</button>
          <button onClick={onReset}>Reset</button>
          <button onClick={onPin}>Pin</button>
          <button className="danger" onClick={onClose}>
            End
          </button>
        </div>
      </div>
    </div>
  );
}

function PinnedTimer({ timer, onExpand, onPause }) {
  return (
    <div className="pinned-timer" onClick={onExpand}>
      <span className="pinned-label">{timer.label}</span>
      <span className="pinned-clock">{formatClock(timer.secondsLeft)}</span>
      <button
        className="pinned-pause"
        onClick={(e) => {
          e.stopPropagation();
          onPause();
        }}
      >
        {timer.running ? "⏸" : "▶"}
      </button>
    </div>
  );
}

function MonthView({ stats, loading, onSelectDate }) {
  if (loading || !stats) return <p className="muted">Loading…</p>;

  const start = new Date(stats.first + "T00:00:00");
  const end = new Date(stats.last + "T00:00:00");
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toISODate(d));
  }

  const leadingBlanks = start.getDay();

  let totalDays = 0;
  let sumAdherence = 0;
  for (const iso of days) {
    const s = stats.byDate[iso];
    if (s && s.total > 0) {
      totalDays += 1;
      sumAdherence += s.done / s.total;
    }
  }
  const avg = totalDays > 0 ? Math.round((sumAdherence / totalDays) * 100) : null;

  return (
    <div className="month card">
      <div className="month-summary">
        <span className="progress-num">{avg !== null ? `${avg}%` : "—"}</span>
        <span className="muted"> average adherence this month</span>
      </div>
      <div className="grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div className="grid-head" key={i}>
            {d}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={"blank" + i} />
        ))}
        {days.map((iso) => {
          const s = stats.byDate[iso];
          const ratio = s && s.total > 0 ? s.done / s.total : null;
          const opacity = ratio === null ? 0 : 0.15 + ratio * 0.85;
          return (
            <button
              key={iso}
              type="button"
              className="cell"
              onClick={() => onSelectDate(iso)}
              title={ratio === null ? "No tasks logged" : `${s.done}/${s.total} done`}
              style={{
                background: ratio === null ? "transparent" : `rgba(184, 147, 90, ${opacity})`,
              }}
            >
              {parseInt(iso.slice(-2), 10)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CongratulationsModal({ onClose, onPlanTomorrow }) {
  return (
    <div className="modal-overlay">
      <div className="modal congratulations-modal">
        <p className="modal-label">A day well spent</p>
        <h2>Congratulations for Today!</h2>
        <p className="congratulations-copy">Take 5 minutes, then plan tomorrow.</p>
        <div className="modal-actions">
          <button onClick={onClose}>Stay here</button>
          <button className="primary-action" onClick={onPlanTomorrow}>Plan tomorrow</button>
        </div>
      </div>
    </div>
  );
}