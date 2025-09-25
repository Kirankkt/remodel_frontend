// state.js
export let totalDays = 60;

// You can adjust this order to match your sheet
export const areas = [
  'Car Park',
  'Sit out',
  'Living/Dining Room',
  'Hallway',
  'Stairs',
  'Bedroom 1',
  'Toilet 1',
  'Bedroom 2',
  'Toilet 2',
  'Veranda',
  "Maid's Room",
  "Maid's Toilet",
  'Kitchen',
  'Pantry / Work Area',
  'Back Slab',
  'Outside Bathroom',
  'Library',
  'Conference Area',
  'New Bedroom 3',
  'Toilet 3',
  'Office',
  'Terrace Patio',
  'Outside wall',
  'Parapet wall',
  'Sunshade',
  'Yard',
  'Coumpound wall',
  'Septic tank construction',
  'Second floor terrace / Roof',
  'Waste Removal',
  'Termite Treatment',
  'Building Exterior',
  'Landscaping'
];

// Palette (use role names that match your CSS color map)
export const defaultPalette = [
  { name:"Demolition",  role:"Demolition",  workers:2, hours:8 },
  { name:"Civil Work",  role:"Civil Work",  workers:3, hours:8 },
  { name:"Plumbing",    role:"Plumbing",    workers:2, hours:6 },
  { name:"Electrical",  role:"Electrical",  workers:2, hours:6 },
  { name:"Carpentry",   role:"Carpentry",   workers:2, hours:8 },
  { name:"Tiling",      role:"Tiling",      workers:2, hours:8 },
  { name:"Painting",    role:"Painting",    workers:2, hours:6 },
  { name:"Other",       role:"Other",       workers:1, hours:1 }
];

// ---------- Settings (persisted locally) ----------
const LS_SETTINGS = "app_settings";
export const settings = {
  apiBase: "",
  apiKey: "",
  planId: "default",
};
export function loadSettings(){
  try{
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS)||"{}");
    Object.assign(settings, s||{});
  }catch{}
}
export function saveSettings(){ localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }

// ---------- History (Undo/Redo) ----------
const MAX_HISTORY = 40;
const history = { stack:[], idx:-1 };

export function seedHistory(snapshotFn){
  const snap = snapshotFn(); history.stack=[snap]; history.idx=0;
}
export function pushHistory(snapshotFn){
  // drop future
  if (history.idx < history.stack.length-1) history.stack = history.stack.slice(0, history.idx+1);
  const snap = snapshotFn();
  history.stack.push(snap);
  if (history.stack.length > MAX_HISTORY) history.stack.shift();
  history.idx = history.stack.length - 1;
}
export function canUndo(){ return history.idx > 0; }
export function canRedo(){ return history.idx < history.stack.length-1; }
export function undo(){ if (!canUndo()) return null; history.idx--; return history.stack[history.idx]; }
export function redo(){ if (!canRedo()) return null; history.idx++; return history.stack[history.idx]; }

// ---------- Encode / decode a task to a JSON string ----------
export function encodeTaskString(t){
  // Keep a verbose JSON form that the backend already understands.
  return JSON.stringify({
    name: String(t.name ?? ''),
    role: String(t.role ?? ''),
    workers: Number.isFinite(+t.workers) ? +t.workers : 0,
    hours: Number.isFinite(+t.hours) ? +t.hours : 0,

    // extra fields we use in UI (kept if present)
    crew: t.crew || '',
    materials: t.materials || '',
    vendor: t.vendor || '',
    cost: Number.isFinite(+t.cost) ? +t.cost : 0,
    ordered: !!t.ordered,
    delivered: !!t.delivered,
    orderDue: t.orderDue || '',
    deliveryDue: t.deliveryDue || '',

    // unified done flag
    done: !!t.done
  });
}

export function decodeTaskString(s){
  // Accept either a plain string or a JSON-encoded task (compact or verbose)
  if (typeof s !== 'string') {
    try {
      const t = s || {};
      return _normalizeTaskObject(t);
    } catch {
      return { name: String(s||''), role:'', workers:0, hours:0, done:false };
    }
  }

  // Try JSON parse first; if it fails, it's just a plain name string
  try {
    const t = JSON.parse(s);
    return _normalizeTaskObject(t);
  } catch {
    return { name: String(s||''), role:'', workers:0, hours:0, done:false };
  }
}

// helper: unify verbose & compact keys into the shape used by the UI
function _normalizeTaskObject(t){
  const name = t.name ?? t.task ?? t.n ?? '';
  const role = t.role ?? t.r ?? '';

  const workers = Number.isFinite(+t.workers) ? +t.workers : (Number.isFinite(+t.w) ? +t.w : 0);
  const hours   = Number.isFinite(+t.hours)   ? +t.hours   : (Number.isFinite(+t.h) ? +t.h : 0);

  // done can be in any of these compact flags written by checklist
  const done = !!(t.done || t.d === true || t.x === true || t.dd === true);

  return {
    name,
    role,
    workers,
    hours,
    crew: t.crew || '',
    materials: t.materials || '',
    vendor: t.vendor || '',
    cost: Number.isFinite(+t.cost) ? +t.cost : 0,
    ordered: !!(t.ordered || t.o),
    delivered: !!(t.delivered || t.di),
    orderDue: t.orderDue || '',
    deliveryDue: t.deliveryDue || '',
    done
  };
}

// ---------- Project dates ----------
export function fmtDate(d){
  return d ? d.toLocaleDateString(undefined,{day:"2-digit",month:"short"}) : "";
}
export function dateForDay(day){
  const start = localStorage.getItem("project_start_date")||"";
  if (!start) return null;
  const [y,m,d] = start.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + (day-1));
  return dt;
}

// ---------- Backend persistence ----------
function header(){
  const h = { "Content-Type": "application/json" };
  if (settings.apiKey) h["X-API-Key"] = settings.apiKey;
  return h;
}

export async function persist(snapshot){
  // always cache locally so UI never blocks
  localStorage.setItem("grid", JSON.stringify(snapshot || {}));

  // no server configured? just return
  if (!settings.apiBase || !settings.planId) return;

  try {
    // FastAPI expects: {"cells":[{area, day, activities}], "allow_multiple": bool}
    const payload = {
      cells: (snapshot?.cells || []).map(c => ({
        area: c.area,
        day: Number(c.day),
        activities: Array.isArray(c.activities) ? c.activities : []
      })),
      allow_multiple: !!snapshot?.allowMultiple
    };

    const res = await fetch(
      `${settings.apiBase}/plans/${encodeURIComponent(settings.planId)}/grid`,
      { method: "PUT", headers: header(), body: JSON.stringify(payload) }
    );

    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      throw new Error(`Persist failed ${res.status}: ${txt}`);
    }
  } catch (e) {
    console.warn("Persist error:", e);
  }
}

export function persistNoHistory(snapshotFn){
  // call persist with the live snapshot
  persist(snapshotFn());
}

// keep this
export function initState(){ loadSettings(); }
