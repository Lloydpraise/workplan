// The day, in order. start/end are 24h "HH:MM" — used to compute each block's
// allotted duration for the countdown timer. Edit freely as your schedule shifts.
export const BLOCKS = [
  { id: "prayer", label: "Prayer", start: "05:00", end: "06:00" },
  { id: "bible_study", label: "Bible study", start: "06:00", end: "06:45" },
  { id: "reading_pd", label: "Reading & personal development", start: "06:45", end: "07:15" },
  { id: "tbv_work", label: "TBV work", start: "08:00", end: "12:00" },
  { id: "kitchen_and_all", label: "Kitchen and All", start: "12:00", end: "14:00" },
  { id: "heysasa", label: "HeySasa", start: "14:00", end: "17:00" },
  { id: "family_time", label: "Family time", start: "17:00", end: "21:00" },
  { id: "heysasa_topup", label: "HeySasa top-up", start: "21:00", end: "22:00" },
  { id: "wind_down", label: "Reading & wind down", start: "22:00", end: "23:00" },
];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function blockDurationMinutes(block) {
  return toMinutes(block.end) - toMinutes(block.start);
}

export function formatTimeRange(block) {
  const fmt = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
  };
  return `${fmt(block.start)} – ${fmt(block.end)}`;
}