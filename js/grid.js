// grid.js
import {
  areas, totalDays, defaultPalette,
  encodeTaskString, decodeTaskString, dateForDay, fmtDate,
  pushHistory, persist, persistNoHistory, seedHistory, pullLatest,
  undo, redo, settings
} from './state.js';
import { els } from './ui.js';
import { openReports } from './reports.js';

function roleKey(raw) {
  const k = String(raw || '').trim().toLowerCase();
  if (k === 'plumber' || k === 'plumbing') return 'plumbing';
  if (k === 'tiler' || k === 'tiling') return 'tiling';
  if (k === 'painter' || k === 'painting') return 'painting';
  if (k === 'civil work' || k === 'civil') return 'civil';
  if (k === 'demolition') return 'demolition';
  if (k === 'carpentry') return 'carpentry';
  if (k === 'electrical') return 'electrical';
  if (k === 'other') return 'other';
  return k;
}

// Convert DD-MM-YYYY or DD/MM/YYYY → YYYY-MM-DD
function toISODate(s) {
  if (!s) return '';
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear(), mo = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return '';
}

async function refreshStartDateFromServer() {
  try {
    const base = (settings.apiBase || '').trim().replace(/\/+$/, '');
    const plan = (settings.planId || 'default').trim();
    const tok = (settings.token || '').trim();
    if (!base || !plan) return;

    const url = `${base}/plans/${encodeURIComponent(plan)}/grid${tok ? `?t=${encodeURIComponent(tok)}` : ''}`;
    const r = await fetch(url);
    if (!r.ok) return;

    const j = await r.json();
    if (j && j.start_date) {
      localStorage.setItem('project_start_date', j.start_date);
      const el = document.getElementById('startDate');
      if (el) el.value = j.start_date;
    }
  } catch (_) { }
}

// ---- modal + inputs
let editingTarget = null;
let currentEditCell = null;
let selectedCell = null;
let lastHoverCell = null;

const taskModal = document.getElementById('taskModal');
const taskList = document.getElementById('taskList');
const taskModalTitle = document.getElementById('taskModalTitle');
const closeTaskBtn = document.getElementById('closeTaskBtn');
const addTaskBtn = document.getElementById('addTaskBtn');

const tName = document.getElementById('tName');
const tRole = document.getElementById('tRole');
const tWorkers = document.getElementById('tWorkers');
const tHours = document.getElementById('tHours');
const tVendor = document.getElementById('tVendor');
const tCost = document.getElementById('tCost');
const tMaterials = document.getElementById('tMaterials');
const tOrderDue = document.getElementById('tOrderDue');
const tOrdered = document.getElementById('tOrdered');
const tDelivered = document.getElementById('tDelivered');
const tDeliveryDue = document.getElementById('tDeliveryDue');

// Quick Add
const qName = document.getElementById('quickName');
const qRole = document.getElementById('quickRole');
const qWorkers = document.getElementById('quickWorkers');
const qHours = document.getElementById('quickHours');

export function initGrid() {
  // role options
  const opts = [...new Set(defaultPalette.map(p => p.role))].map(r => `<option>${r}</option>`).join('');
  tRole.innerHTML = opts;
  qRole.innerHTML = opts;

  // cells
  document.querySelectorAll('td').forEach(td => {
    td.addEventListener('mouseenter', () => { lastHoverCell = td; });
    td.addEventListener('click', (e) => { if (!e.target.closest('.cell-actions')) selectedCell = td; });
    td.addEventListener('dblclick', () => openTaskEditor(td));

    td.querySelector('.addBtn').addEventListener('click', (e) => { e.stopPropagation(); handleCellAdd(td); });
    td.querySelector('.editBtn').addEventListener('click', (e) => { e.stopPropagation(); openTaskEditor(td); });

    td.addEventListener('dragover', e => { e.preventDefault(); td.classList.add('drag-over'); });
    td.addEventListener('dragleave', () => td.classList.remove('drag-over'));
    td.addEventListener('drop', e => {
      // If ui.js handled a multi-move, ignore here
      const types = e.dataTransfer?.types || [];
      if (types.includes("application/x-remodel-tasks")) return;

      e.preventDefault(); td.classList.remove('drag-over');
      try {
        // palette / quick-add drop (text/plain)
        const p = JSON.parse(e.dataTransfer.getData('text/plain'));
        const t = {
          name: p.name, role: p.role, workers: p.workers, hours: p.hours,
          crew: '', materials: '', vendor: '', cost: 0,
          ordered: false, delivered: false, orderDue: '', deliveryDue: '', done: false
        };
        pushHistory(serializeRich);
        td.insertBefore(renderTaskEl(t), td.querySelector('.cell-actions'));
        persistNoHistory(serializeRich); // local only
      } catch { }
    });
  });

  // palette drag
  document.querySelectorAll('#palette .pal').forEach(p => {
    p.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', p.dataset.palette); });
  });

  document.getElementById('quickAddBtn').addEventListener('click', () => {
    const td = currentEditCell || selectedCell || lastHoverCell;
    if (!td) { alert('Select a cell or open the editor, then click "+ Add".'); return; }
    quickInsertInto(td);
  });

  // Apply Dates -> saves locally; admin can push via Publish button
  document.getElementById('applyDatesBtn').addEventListener('click', async () => {
    const raw = document.getElementById('startDate').value || '';
    const iso = toISODate(raw);
    if (!iso) { alert('Please enter a valid date (YYYY-MM-DD or DD-MM-YYYY).'); return; }
    localStorage.setItem('project_start_date', iso);
    refreshHeadersWithDates();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('Clear all tasks?')) return;
    pushHistory(serializeRich);
    document.querySelectorAll('td .task').forEach(el => el.remove());
    persistNoHistory(serializeRich); // local only
  });

  document.getElementById('reportsBtn').addEventListener('click', () => openReports());

  // undo/redo
  els.undoBtn.addEventListener('click', () => { const s = undo(); if (s) restoreFrom(s); });
  els.redoBtn.addEventListener('click', () => { const s = redo(); if (s) restoreFrom(s); });

  // After ui.js MOVE-drop, persist locally once
  document.addEventListener('tasks:dropped', () => {
    pushHistory(serializeRich);
    persistNoHistory(serializeRich);
  });

  // Sync (pull-only)
  const syncBtn = document.getElementById('syncBtn') || document.getElementById('sync');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      try {
        syncBtn.disabled = true;
        const old = syncBtn.textContent; syncBtn.textContent = 'Syncing...';
        const snap = await pullLatest();
        restoreFrom(snap);
        await refreshStartDateFromServer();
        seedHistory(serializeRich);
        syncBtn.textContent = old || 'Sync';
        alert('Pulled latest from server ✓');
      } catch (e) {
        console.error(e);
        alert('Sync failed: ' + (e.message || e));
      } finally {
        syncBtn.disabled = false;
      }
    });
  }

  // initial
  const local = JSON.parse(localStorage.getItem('grid') || '{}');
  if (local.cells) restoreFrom(local);
  refreshHeadersWithDates();
  seedHistory(serializeRich);

  refreshStartDateFromServer();
}

function refreshHeadersWithDates() {
  const ths = document.querySelectorAll('#theadRow th');
  for (let d = 1; d <= totalDays; d++) {
    const dt = dateForDay(d);
    ths[d].textContent = dt ? `Day ${d} (${fmtDate(dt)})` : `Day ${d}`;
  }
}

export function getCell(ai, day) {
  return document.querySelector(`tbody tr:nth-child(${ai + 1}) td[data-day="${day}"]`);
}

export function renderTaskEl(t) {
  const el = document.createElement('span'); el.className = 'task'; el.draggable = true;
  el.dataset.task = JSON.stringify(t);
  el.dataset.role = roleKey(t.role);
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <input type="checkbox" class="done" ${t.done ? 'checked' : ''} title="Mark complete" />
      <span class="label">${escapeHtml(t.name || '')}</span>
      <span class="meta">w:${t.workers || 0}${t.crew ? `@${t.crew}` : ''} h:${t.hours || 0}</span>
      <span class="role" data-role="${roleKey(t.role)}">${escapeHtml(t.role || '')}</span>
      <span class="flags">${t.ordered ? '📦' : ''}${t.delivered ? '✅' : ''}</span>
      <span style="flex:1"></span>
      <button class="edit" title="Edit">✎</button>
      <button class="x" title="Remove">×</button>
    </div>
  `;
  // palette-style single-drag support (multi-drag handled in ui.js)
  el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', el.dataset.task); });
  el.querySelector('.x').addEventListener('click', () => { pushHistory(serializeRich); el.remove(); persistNoHistory(serializeRich); });
  el.querySelector('.edit').addEventListener('click', () => openTaskEditor(el.closest('td'), el));
  el.querySelector('.done').addEventListener('change', (e) => {
    const t = JSON.parse(el.dataset.task); t.done = e.target.checked; el.dataset.task = JSON.stringify(t);
    pushHistory(serializeRich); persistNoHistory(serializeRich);
  });
  return el;
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[m])); }

function quickInsertInto(td) {
  const t = {
    name: qName.value.trim() || 'Task',
    role: qRole.value,
    workers: +qWorkers.value || 0,
    hours: +qHours.value || 0,
    crew: '', materials: '', vendor: '', cost: 0,
    ordered: false, delivered: false, orderDue: '', deliveryDue: '', done: false
  };
  pushHistory(serializeRich);
  td.insertBefore(renderTaskEl(t), td.querySelector('.cell-actions'));
  persistNoHistory(serializeRich); // local only
  qName.value = ''; qWorkers.value = ''; qHours.value = '';
}

function handleCellAdd(td) {
  const hasQuick =
    (qName.value && qName.value.trim().length > 0) ||
    (+qWorkers.value > 0) ||
    (+qHours.value > 0);
  if (hasQuick) { quickInsertInto(td); }
  else { openTaskEditor(td); }
}

// Editor
export function openTaskEditor(td, chip = null) {
  editingTarget = chip;
  currentEditCell = td;
  taskModal.setAttribute('aria-hidden', 'false');

  const area = td.dataset.area;
  const day = +td.dataset.day;
  taskModalTitle.textContent = `${area} — Day ${day}`;
  taskList.innerHTML = '';

  td.querySelectorAll('.task').forEach(ch => {
    const t = JSON.parse(ch.dataset.task);
    const row = document.createElement('div');
    row.innerHTML = `
      <div>${escapeHtml(t.name)} · ${escapeHtml(t.role)} · w:${t.workers}${t.crew ? `@${t.crew}` : ''} h:${t.hours}</div>
      <div style="display:flex;gap:6px;margin:6px 0">
        <button class="btn editRow">Edit</button>
        <button class="btn danger delRow">Delete</button>
      </div>`;
    row.querySelector('.editRow').addEventListener('click', () => { fillEditor(t); editingTarget = ch; });
    row.querySelector('.delRow').addEventListener('click', () => {
      pushHistory(serializeRich); ch.remove(); persistNoHistory(serializeRich); row.remove();
    });
    taskList.appendChild(row);
  });

  fillEditor({
    name: '', role: tRole.options[0]?.value || '', workers: 0, hours: 0,
    crew: '', vendor: '', materials: '', cost: 0,
    ordered: false, delivered: false, orderDue: '', deliveryDue: '', done: false
  });
}
function fillEditor(t) {
  tName.value = t.name || '';
  tRole.value = t.role || tRole.options[0]?.value || '';
  tWorkers.value = t.workers || 0;
  tHours.value = t.hours || 0;
  tVendor.value = t.vendor || '';
  tCost.value = t.cost || '';
  tMaterials.value = t.materials || '';
  tOrderDue.value = t.orderDue || '';
  tOrdered.checked = !!t.ordered;
  tDelivered.checked = !!t.delivered;
  tDeliveryDue.value = t.deliveryDue || '';
}
closeTaskBtn.addEventListener('click', () => {
  taskModal.setAttribute('aria-hidden', 'true');
  editingTarget = null; currentEditCell = null;
});
addTaskBtn.addEventListener('click', () => {
  if (!currentEditCell) { alert('No target cell found.'); return; }
  const t = {
    name: tName.value.trim() || 'Task', role: tRole.value,
    workers: +tWorkers.value || 0, hours: +tHours.value || 0,
    crew: '', vendor: tVendor.value.trim(), cost: +tCost.value || 0,
    materials: tMaterials.value.trim(),
    ordered: !!tOrdered.checked, orderDue: tOrderDue.value,
    delivered: !!tDelivered.checked, deliveryDue: tDeliveryDue.value,
    done: editingTarget ? JSON.parse(editingTarget.dataset.task).done : false
  };
  pushHistory(serializeRich);
  if (editingTarget) {
    editingTarget.dataset.task = JSON.stringify(t);
    editingTarget.dataset.role = roleKey(t.role);
    editingTarget.querySelector('.label').textContent = t.name;
    editingTarget.querySelector('.meta').textContent = `w:${t.workers}${t.crew ? `@${t.crew}` : ''} h:${t.hours}`;
    const rs = editingTarget.querySelector('.role'); rs.textContent = t.role; rs.dataset.role = roleKey(t.role);
    editingTarget.querySelector('.flags').textContent = `${t.ordered ? '📦' : ''}${t.delivered ? '✅' : ''}`;
  } else {
    currentEditCell.insertBefore(renderTaskEl(t), currentEditCell.querySelector('.cell-actions'));
  }
  persistNoHistory(serializeRich); // local only
});

// Serialize/restore
export function serializeRich() {
  const allowMultiple = !!els.allowMultiple.checked;
  const cells = [];
  document.querySelectorAll('tbody tr').forEach((tr, ai) => {
    tr.querySelectorAll('td').forEach(td => {
      const day = +td.dataset.day; const area = td.dataset.area;
      const tasks = Array.from(td.querySelectorAll('.task')).map(el => encodeTaskString(JSON.parse(el.dataset.task)));
      cells.push({ area, day, activities: tasks });
    });
  });
  const snap = { allowMultiple, cells };
  localStorage.setItem('grid', JSON.stringify(snap));
  return snap;
}
export function restoreFrom(json) {
  document.querySelectorAll('td').forEach(td => td.querySelectorAll('.task').forEach(el => el.remove()));
  (json.cells || []).forEach(c => {
    const ai = areas.indexOf(c.area); if (ai === -1) return;
    const td = getCell(ai, c.day); if (!td) return;
    (c.activities || []).forEach(s => {
      td.insertBefore(renderTaskEl(decodeTaskString(s)), td.querySelector('.cell-actions'));
    });
  });
  els.allowMultiple.checked = !!json.allowMultiple;
  const sd = localStorage.getItem('project_start_date') || '';
  if (sd) document.getElementById('startDate').value = sd;
  persist(json); // LOCAL ONLY
}

export function massRollover(targetDay = 98) {
  // Save history state before changing DOM
  pushHistory(serializeRich);

  let movedTasksCount = 0;
  // Iterate through all td elements in the grid body
  const cells = document.querySelectorAll('tbody td[data-day]');

  cells.forEach(td => {
    const currentDay = parseInt(td.dataset.day, 10);
    // If td's day is less than targetDay, look for child tasks
    if (currentDay < targetDay) {
      const tr = td.closest('tr'); // same area (row)
      const targetTd = tr.querySelector(`td[data-day="${targetDay}"]`);
      if (!targetTd) return; // skip if target day doesn't exist in this row

      const tasks = Array.from(td.querySelectorAll('.task'));

      tasks.forEach(taskEl => {
        try {
          const taskData = JSON.parse(taskEl.dataset.task);
          // If the task is unfinished
          if (!taskData.done) {
            const actionsDiv = targetTd.querySelector('.cell-actions');
            // Append under the target td, placed before the .cell-actions div
            targetTd.insertBefore(taskEl, actionsDiv);
            movedTasksCount++;
          }
        } catch (e) {
          console.error("Failed to parse task:", e);
        }
      });
    }
  });

  // Save the new state locally without adding another history entry
  persistNoHistory(serializeRich);
  console.log(`Mass rollover complete. Moved ${movedTasksCount} unfinished tasks to Day ${targetDay}.`);
  return movedTasksCount;
}

// Make it available in the console globally for easy manual execution
window.massRollover = massRollover;

