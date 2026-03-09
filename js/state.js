// state.js
export let totalDays = Number(localStorage.getItem('plan_total_days') || 60);
export function setTotalDays(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n) || n < 1) n = 60;
  if (n > 730) n = 730; // cap ~2y
  totalDays = n;
  localStorage.setItem('plan_total_days', String(n));
}

// Areas
export const areas = [
  'Car Park', 'Sit out', 'Living/Dining Room', 'Hallway', 'Stairs',
  'Bedroom 1', 'Toilet 1', 'Bedroom 2', 'Toilet 2', 'Veranda',
  "Maid's Room", "Maid's Toilet", 'Kitchen', 'Pantry / Work Area', 'Back Slab',
  'Outside Bathroom', 'Library', 'Conference Area', 'New Bedroom 3', 'Toilet 3',
  'Office', 'Terrace Patio', 'Outside wall', 'Parapet wall', 'Sunshade',
  'Yard', 'Coumpound wall', 'Septic tank construction', 'Second floor terrace / Roof',
  'Waste Removal', 'Termite Treatment', 'Building Exterior', 'Landscaping'
];

// Palette
export const defaultPalette = [
  { name: "Demolition", role: "Demolition", workers: 2, hours: 8 },
  { name: "Civil Work", role: "Civil Work", workers: 3, hours: 8 },
  { name: "Plumbing", role: "Plumbing", workers: 2, hours: 6 },
  { name: "Electrical", role: "Electrical", workers: 2, hours: 6 },
  { name: "Carpentry", role: "Carpentry", workers: 2, hours: 8 },
  { name: "Tiling", role: "Tiling", workers: 2, hours: 8 },
  { name: "Painting", role: "Painting", workers: 2, hours: 6 },
  { name: "Other", role: "Other", workers: 1, hours: 1 }
];

// ---------- Settings ----------
const LS_SETTINGS = "app_settings";
// default apiBase is empty to avoid accidental calls
export const settings = { apiBase: "", apiKey: "", planId: "default", token: "" };

export function loadSettings() {
  try { Object.assign(settings, JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}") || {}); }
  catch { }
}
export function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }

export function applySettingsFromQuery() {
  try {
    const q = new URLSearchParams(location.search);
    const api = q.get('apiBase') || q.get('api');
    const key = q.get('apiKey') || q.get('key');
    const plan = q.get('plan') || q.get('p');
    const tok = q.get('t') || q.get('token') || q.get('edit');
    let touched = false;
    if (api) { settings.apiBase = api.replace(/\/+$/, ''); touched = true; }
    if (key) { settings.apiKey = key; touched = true; }
    if (plan) { settings.planId = plan; touched = true; }
    if (tok) { settings.token = tok; touched = true; }
    if (touched) saveSettings();
  } catch { }
}

// ---------- History ----------
const MAX_HISTORY = 40;
const history = { stack: [], idx: -1 };
export function seedHistory(snapshotFn) { const s = snapshotFn(); history.stack = [s]; history.idx = 0; }
export function pushHistory(snapshotFn) {
  if (history.idx < history.stack.length - 1) history.stack = history.stack.slice(0, history.idx + 1);
  const s = snapshotFn(); history.stack.push(s);
  if (history.stack.length > MAX_HISTORY) history.stack.shift();
  history.idx = history.stack.length - 1;
}
export function canUndo() { return history.idx > 0; }
export function canRedo() { return history.idx < history.stack.length - 1; }
export function undo() { if (!canUndo()) return null; history.idx--; return history.stack[history.idx]; }
export function redo() { if (!canRedo()) return null; history.idx++; return history.stack[history.idx]; }

// ---------- Task encode/decode ----------
export function encodeTaskString(t) {
  return JSON.stringify({
    name: String(t.name ?? ''), role: String(t.role ?? ''),
    workers: Number.isFinite(+t.workers) ? +t.workers : 0,
    hours: Number.isFinite(+t.hours) ? +t.hours : 0,
    crew: t.crew || '', materials: t.materials || '', vendor: t.vendor || '',
    cost: Number.isFinite(+t.cost) ? +t.cost : 0,
    ordered: !!t.ordered, delivered: !!t.delivered,
    orderDue: t.orderDue || '', deliveryDue: t.deliveryDue || '',
    progress: (Number.isFinite(+t.progress)
      ? Math.max(0, Math.min(100, +t.progress))
      : (Number.isFinite(+t.p) ? Math.max(0, Math.min(100, +t.p)) : 0)),
    done: !!t.done
  });
}
export function decodeTaskString(s) {
  if (typeof s !== 'string') {
    try { return _normalizeTaskObject(s || {}); }
    catch { return { name: String(s || ''), role: '', workers: 0, hours: 0, done: false, progress: 0 }; }
  }
  try { return _normalizeTaskObject(JSON.parse(s)); }
  catch { return { name: String(s || ''), role: '', workers: 0, hours: 0, done: false, progress: 0 }; }
}
function _normalizeTaskObject(t) {
  const name = t.name ?? t.task ?? t.n ?? '';
  const role = t.role ?? t.r ?? '';
  const workers = Number.isFinite(+t.workers) ? +t.workers : (Number.isFinite(+t.w) ? +t.w : 0);
  const hours = Number.isFinite(+t.hours) ? +t.hours : (Number.isFinite(+t.h) ? +t.h : 0);
  const done = !!(t.done || t.d === true || t.x === true || t.dd === true);
  const progress = Number.isFinite(+t.progress)
    ? Math.max(0, Math.min(100, +t.progress))
    : (Number.isFinite(+t.p) ? Math.max(0, Math.min(100, +t.p)) : 0);
  return {
    name, role, workers, hours,
    crew: t.crew || '', materials: t.materials || '', vendor: t.vendor || '',
    cost: Number.isFinite(+t.cost) ? +t.cost : 0,
    ordered: !!(t.ordered || t.o), delivered: !!(t.delivered || t.di),
    orderDue: t.orderDue || '', deliveryDue: t.deliveryDue || '', done, progress
  };
}

// ---------- Dates ----------
// --- Dates (holiday aware) ---
export function fmtDate(d) {
  return d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "";
}

// Fixed holidays to skip (MM-DD)
export const HOLIDAYS = new Set(["12-24", "12-25", "12-26", "12-31", "01-01", "03-03", "03-20", "04-03", "04-15", "05-01", "05-27"]);

export function dateForDay(day) {
  const start = localStorage.getItem("project_start_date") || ""; // "YYYY-MM-DD"
  if (!start) return null;
  const [y, m, d] = start.split("-").map(Number);
  let dt = new Date(y, m - 1, d);
  let remain = Math.max(0, day - 1);
  while (remain > 0) {
    dt.setDate(dt.getDate() + 1);
    const mmdd = String(dt.getMonth() + 1).padStart(2, '0') + "-" + String(dt.getDate()).padStart(2, '0');
    if (dt.getDay() === 0) continue;       // skip Sundays
    if (HOLIDAYS.has(mmdd)) continue;      // skip fixed holidays
    remain--;
  }
  return dt;
}

export function getWorkingDaysLeft(endDateStr) {
  if (!endDateStr) return 0;

  // Parse end date (expected format YYYY-MM-DD)
  const dtParts = endDateStr.split('-');
  if (dtParts.length !== 3) return 0;

  const end = new Date(parseInt(dtParts[0], 10), parseInt(dtParts[1], 10) - 1, parseInt(dtParts[2], 10));
  // ensure start of day for comparison
  end.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today >= end) return 0; // It's past the end date

  let workDays = 0;
  let curr = new Date(today);

  while (curr < end) {
    curr.setDate(curr.getDate() + 1);
    const mmdd = String(curr.getMonth() + 1).padStart(2, '0') + "-" + String(curr.getDate()).padStart(2, '0');
    if (curr.getDay() !== 0 && !HOLIDAYS.has(mmdd)) {
      workDays++;
    }
  }

  return workDays;
}


// ---------- Backend helpers (read-only here) ----------
function normalizedBase() { return (settings.apiBase || '').replace(/\/+$/, ''); }
function queryWithToken() { return settings.token ? `?t=${encodeURIComponent(settings.token)}` : ""; }

// IMPORTANT: local-only persistence (no server writes here)
export function persist(snapshot) {
  localStorage.setItem("grid", JSON.stringify(snapshot || {}));
}

// Helper used throughout UI to autosave locally without history push
export function persistNoHistory(snapshotFn) { persist(snapshotFn()); }

// Pull latest grid from server (does not write back)
export async function pullLatest() {
  if (!settings.apiBase || !settings.planId) throw new Error('Missing Settings');
  const res = await fetch(`${normalizedBase()}/plans/${encodeURIComponent(settings.planId)}/grid${queryWithToken()}`);
  if (!res.ok) throw new Error(`Pull failed ${res.status}`);
  const data = await res.json(); // {allowMultiple, cells, start_date?}
  const snap = { allowMultiple: !!data.allowMultiple, cells: data.cells || [] };
  localStorage.setItem('grid', JSON.stringify(snap));
  return snap;
}

// Boot
export function initState() { loadSettings(); applySettingsFromQuery(); }
