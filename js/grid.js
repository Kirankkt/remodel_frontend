// grid.js
import {
  areas,totalDays,defaultPalette,
  encodeTaskString,decodeTaskString,dateForDay,fmtDate,
  pushHistory,persist,persistNoHistory,seedHistory,
  undo,redo
} from './state.js';
import { els } from './ui.js';
import { openReports } from './reports.js';

// ---- role key normalizer (same as ui.js)
function roleKey(raw){
  const k = String(raw || '').trim().toLowerCase();
  if (k === 'plumber'   || k === 'plumbing')  return 'plumbing';
  if (k === 'tiler'     || k === 'tiling')    return 'tiling';
  if (k === 'painter'   || k === 'painting')  return 'painting';
  if (k === 'civil work'|| k === 'civil')     return 'civil';
  if (k === 'demolition')                      return 'demolition';
  if (k === 'carpentry')                       return 'carpentry';
  if (k === 'electrical')                      return 'electrical';
  if (k === 'other')                           return 'other';
  return k;
}

// ---- Modal state/inputs
let editingTarget = null;     // the chip being edited (if any)
let currentEditCell = null;   // the <td> under the editor
let selectedCell = null;      // last cell the user clicked
let lastHoverCell = null;     // last cell the mouse entered

const taskModal       = document.getElementById('taskModal');
const taskList        = document.getElementById('taskList');
const taskModalTitle  = document.getElementById('taskModalTitle');
const closeTaskBtn    = document.getElementById('closeTaskBtn');
const addTaskBtn      = document.getElementById('addTaskBtn');

const tName        = document.getElementById('tName');
const tRole        = document.getElementById('tRole');
const tWorkers     = document.getElementById('tWorkers');
const tHours       = document.getElementById('tHours');
const tVendor      = document.getElementById('tVendor');
const tCost        = document.getElementById('tCost');
const tMaterials   = document.getElementById('tMaterials');
const tOrderDue    = document.getElementById('tOrderDue');
const tOrdered     = document.getElementById('tOrdered');
const tDelivered   = document.getElementById('tDelivered');
const tDeliveryDue = document.getElementById('tDeliveryDue');

// Quick Add inputs (sidebar)
const qName    = document.getElementById('quickName');
const qRole    = document.getElementById('quickRole');
const qWorkers = document.getElementById('quickWorkers');
const qHours   = document.getElementById('quickHours');

export function initGrid(){
  // role selects
  const opts = [...new Set(defaultPalette.map(p=>p.role))].map(r=>`<option>${r}</option>`).join('');
  tRole.innerHTML = opts;
  qRole.innerHTML = opts;

  // wire table cells
  document.querySelectorAll('td').forEach(td=>{
    // remember last hovered cell
    td.addEventListener('mouseenter', ()=>{ lastHoverCell = td; });

    // click anywhere in the cell (not on the action buttons) to select it
    td.addEventListener('click', (e)=>{
      if (e.target.closest('.cell-actions')) return; // ignore clicks on action buttons row
      selectedCell = td;
    });

    td.addEventListener('dblclick', ()=> openTaskEditor(td));

    // SMART “+ Add” in the cell:
    // - if quick fields have any value -> add directly to this cell
    // - else -> open the editor modal for this cell
    td.querySelector('.addBtn').addEventListener('click', (e)=>{
      e.stopPropagation();
      handleCellAdd(td);
    });

    td.querySelector('.editBtn').addEventListener('click', (e)=>{
      e.stopPropagation();
      openTaskEditor(td);
    });

    td.addEventListener('dragover', e=>{ e.preventDefault(); td.classList.add('drag-over'); });
    td.addEventListener('dragleave', ()=> td.classList.remove('drag-over'));
    td.addEventListener('drop', e=>{
      e.preventDefault(); td.classList.remove('drag-over');
      try{
        const p = JSON.parse(e.dataTransfer.getData('text/plain'));
        const t = {
          name:p.name, role:p.role, workers:p.workers, hours:p.hours,
          crew:'', materials:'', vendor:'', cost:0,
          ordered:false, delivered:false, orderDue:'', deliveryDue:'', done:false
        };
        pushHistory(serializeRich);
        td.insertBefore(renderTaskEl(t), td.querySelector('.cell-actions'));
        persistNoHistory(serializeRich);
      }catch{}
    });
  });

  // palette drag
  document.querySelectorAll('#palette .pal').forEach(p=>{
    p.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', p.dataset.palette);
    });
  });

  // sidebar Quick Add (targets: editor cell > selected cell > last hovered cell)
  document.getElementById('quickAddBtn').addEventListener('click', ()=>{
    const td = currentEditCell || selectedCell || lastHoverCell;
    if (!td){ alert('Select a cell (click it) or open the editor, then click "+ Add".'); return; }
    quickInsertInto(td);
  });

  // topbar buttons
  document.getElementById('applyDatesBtn').addEventListener('click', ()=>{
    const sd = document.getElementById('startDate').value||'';
    localStorage.setItem('project_start_date', sd);
    refreshHeadersWithDates();
  });
  document.getElementById('resetBtn').addEventListener('click', ()=>{
    if(!confirm('Clear all tasks?')) return;
    pushHistory(serializeRich);
    document.querySelectorAll('td .task').forEach(el=>el.remove());
    persistNoHistory(serializeRich);
  });

  document.getElementById('reportsBtn').addEventListener('click', ()=> openReports());

  // undo/redo
  els.undoBtn.addEventListener('click', ()=>{
    const snap = undo(); if (!snap) return; restoreFrom(snap);
  });
  els.redoBtn.addEventListener('click', ()=>{
    const snap = redo(); if (!snap) return; restoreFrom(snap);
  });

  // initial
  const local = JSON.parse(localStorage.getItem('grid')||'{}');
  if (local.cells) restoreFrom(local);
  refreshHeadersWithDates();
  seedHistory(serializeRich);
}

function refreshHeadersWithDates(){
  const ths = document.querySelectorAll('#theadRow th');
  for (let d=1; d<=totalDays; d++){
    const dt = dateForDay(d);
    ths[d].textContent = dt ? `Day ${d} (${fmtDate(dt)})` : `Day ${d}`;
  }
}

export function getCell(ai, day){
  return document.querySelector(`tbody tr:nth-child(${ai+1}) td[data-day="${day}"]`);
}

export function renderTaskEl(task){
  // NOTE: task chip is a <span class="task">. We add data-role (normalized) so CSS can color per role.
  const el = document.createElement('span'); el.className='task'; el.draggable=true;
  el.dataset.task = JSON.stringify(task);
  el.dataset.role = roleKey(task.role); // <-- normalized role hook for CSS

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <input type="checkbox" class="done" ${task.done?'checked':''} title="Mark complete" />
      <span class="label">${escapeHtml(task.name||'')}</span>
      <span class="meta">w:${task.workers||0}${task.crew?`@${task.crew}`:''} h:${task.hours||0}</span>
      <span class="role" data-role="${roleKey(task.role)}">${escapeHtml(task.role||'')}</span>
      <span class="flags">${task.ordered?'📦':''}${task.delivered?'✅':''}</span>
      <span style="flex:1"></span>
      <button class="edit" title="Edit">✎</button>
      <button class="x" title="Remove">×</button>
    </div>
  `;

  el.addEventListener('dragstart', e=>{
    e.dataTransfer.setData('text/plain', el.dataset.task);
  });

  // Ctrl/Cmd click toggles visual multi-select without touching the "done" checkbox
  el.addEventListener('click', (e)=>{
    if (e.ctrlKey || e.metaKey){ e.preventDefault(); el.classList.toggle('selected'); }
  });

  el.querySelector('.x').addEventListener('click', ()=>{
    pushHistory(serializeRich); el.remove(); persistNoHistory(serializeRich);
  });

  el.querySelector('.edit').addEventListener('click', ()=> openTaskEditor(el.closest('td'), el));

  el.querySelector('.done').addEventListener('change', (e)=>{
    const t = JSON.parse(el.dataset.task);
    t.done = e.target.checked;
    el.dataset.task = JSON.stringify(t);
    pushHistory(serializeRich); persistNoHistory(serializeRich);
  });

  return el;
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m])); }

// ---- SMART add helpers
function quickInsertInto(td){
  const t = {
    name: qName.value.trim() || 'Task',
    role: qRole.value,
    workers: +qWorkers.value || 0,
    hours: +qHours.value || 0,
    crew:'', materials:'', vendor:'', cost:0,
    ordered:false, delivered:false, orderDue:'', deliveryDue:'', done:false
  };
  pushHistory(serializeRich);
  td.insertBefore(renderTaskEl(t), td.querySelector('.cell-actions'));
  persistNoHistory(serializeRich);
  // clear just the quick fields people usually change
  qName.value=''; qWorkers.value=''; qHours.value='';
}

function handleCellAdd(td){
  // If quick fields have any value, do a quick insert; else open the editor.
  const hasQuick =
    (qName.value && qName.value.trim().length > 0) ||
    (+qWorkers.value > 0) ||
    (+qHours.value > 0);
  if (hasQuick){
    quickInsertInto(td);
  } else {
    openTaskEditor(td);
  }
}

// ---- Task editor
export function openTaskEditor(td, chip=null){
  editingTarget = chip;
  currentEditCell = td; // remember exact cell
  taskModal.setAttribute('aria-hidden','false');

  const area = td.dataset.area;
  const day  = +td.dataset.day;
  taskModalTitle.textContent = `${area} — Day ${day}`;
  taskList.innerHTML='';

  td.querySelectorAll('.task').forEach(ch=>{
    const t = JSON.parse(ch.dataset.task);
    const row = document.createElement('div');
    row.innerHTML = `
      <div>${escapeHtml(t.name)} · ${escapeHtml(t.role)} · w:${t.workers}${t.crew?`@${t.crew}`:''} h:${t.hours}</div>
      <div style="display:flex;gap:6px;margin:6px 0">
        <button class="btn editRow">Edit</button>
        <button class="btn danger delRow">Delete</button>
      </div>`;
    row.querySelector('.editRow').addEventListener('click', ()=>{ fillEditor(t); editingTarget = ch; });
    row.querySelector('.delRow').addEventListener('click', ()=>{
      pushHistory(serializeRich); ch.remove(); persistNoHistory(serializeRich); row.remove();
    });
    taskList.appendChild(row);
  });

  fillEditor({
    name:'', role: tRole.options[0]?.value||'', workers:0, hours:0,
    crew:'', vendor:'', materials:'', cost:0,
    ordered:false, delivered:false, orderDue:'', deliveryDue:'', done:false
  });
}

function fillEditor(t){
  tName.value = t.name||'';
  tRole.value = t.role||tRole.options[0]?.value||'';
  tWorkers.value = t.workers||0;
  tHours.value = t.hours||0;
  tVendor.value = t.vendor||'';
  tCost.value = t.cost||'';
  tMaterials.value = t.materials||'';
  tOrderDue.value = t.orderDue||'';
  tOrdered.checked = !!t.ordered;
  tDelivered.checked = !!t.delivered;
  tDeliveryDue.value = t.deliveryDue||'';
}

closeTaskBtn.addEventListener('click', ()=>{
  taskModal.setAttribute('aria-hidden','true');
  editingTarget = null;
  currentEditCell = null;
});

addTaskBtn.addEventListener('click', ()=>{
  if (!currentEditCell){
    alert('No target cell found. Close and reopen the editor.');
    return;
  }
  const t = {
    name: tName.value.trim()||'Task', role: tRole.value,
    workers: +tWorkers.value||0, hours: +tHours.value||0,
    crew:'', vendor: tVendor.value.trim(), cost:+tCost.value||0,
    materials: tMaterials.value.trim(),
    ordered: !!tOrdered.checked, orderDue: tOrderDue.value,
    delivered: !!tDelivered.checked, deliveryDue: tDeliveryDue.value,
    done: editingTarget ? JSON.parse(editingTarget.dataset.task).done : false
  };

  pushHistory(serializeRich);
  if (editingTarget){
    // Update existing chip content + keep role hooks in sync (normalized)
    editingTarget.dataset.task  = JSON.stringify(t);
    editingTarget.dataset.role  = roleKey(t.role);
    editingTarget.querySelector('.label').textContent = t.name;
    editingTarget.querySelector('.meta').textContent  = `w:${t.workers}${t.crew?`@${t.crew}`:''} h:${t.hours}`;
    const roleSpan = editingTarget.querySelector('.role');
    roleSpan.textContent = t.role;
    roleSpan.setAttribute('data-role', roleKey(t.role));
    editingTarget.querySelector('.flags').textContent = `${t.ordered?'📦':''}${t.delivered?'✅':''}`;
  } else {
    currentEditCell.insertBefore(renderTaskEl(t), currentEditCell.querySelector('.cell-actions'));
  }
  persistNoHistory(serializeRich);
});

// ---- Serialization
export function serializeRich(){
  const allowMultiple = !!els.allowMultiple.checked;
  const cells = [];
  document.querySelectorAll('tbody tr').forEach((tr, ai)=>{
    tr.querySelectorAll('td').forEach(td=>{
      const day = +td.dataset.day; const area = td.dataset.area;
      const tasks = Array.from(td.querySelectorAll('.task')).map(el=> encodeTaskString(JSON.parse(el.dataset.task)));
      cells.push({ area, day, activities: tasks });
    });
  });
  const snap = { allowMultiple, cells };
  localStorage.setItem('grid', JSON.stringify(snap));
  return snap;
}

export function restoreFrom(json){
  document.querySelectorAll('td').forEach(td=> td.querySelectorAll('.task').forEach(el=>el.remove()));
  (json.cells||[]).forEach(c=>{
    const ai = areas.indexOf(c.area); if (ai===-1) return;
    const td = getCell(ai, c.day); if (!td) return;
    (c.activities||[]).forEach(s=>{
      td.insertBefore(renderTaskEl(decodeTaskString(s)), td.querySelector('.cell-actions'));
    });
  });
  els.allowMultiple.checked = !!json.allowMultiple;
  const sd = localStorage.getItem('project_start_date')||'';
  if (sd) document.getElementById('startDate').value = sd;
  persist(json);
}
