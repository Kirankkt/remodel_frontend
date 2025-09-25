// ui.js
console.log('ui.js loaded');

import { defaultPalette, areas, totalDays, settings, saveSettings } from './state.js';

export const els = {
  allowMultiple: document.getElementById('allowMultiple'),
  startDate: document.getElementById('startDate'),
  applyDatesBtn: document.getElementById('applyDatesBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  cfgApiBase: document.getElementById('cfgApiBase'),
  cfgApiKey: document.getElementById('cfgApiKey'),
  cfgPlanId: document.getElementById('cfgPlanId'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  emailNowBtn: document.getElementById('emailNowBtn'),

  importBtn: document.getElementById('importCsvBtn'),
  importInput: document.getElementById('csvFileInput'),

  gridHeadRow: document.getElementById('theadRow'),
  gridBody: document.getElementById('tbody'),
  palette: document.getElementById('palette'),

  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),

  reportsBtn: document.getElementById('reportsBtn'),
};

export function buildPalette(){
  els.palette.innerHTML = defaultPalette.map(p => `
    <div class="pal" draggable="true"
         data-role="${(p.role||'').trim()}"
         data-palette='${JSON.stringify(p)}'>
      <div class="label">${p.name}</div>
      <div class="meta">
        <span class="role" data-role="${(p.role||'').trim()}">${p.role}</span>
        · w:${p.workers} h:${p.hours}
      </div>
    </div>
  `).join("");
}

export function buildGridFrame(){
  // header
  let h = '<th>Area / Day</th>';
  for (let d=1; d<=totalDays; d++){ h += `<th>Day ${d}</th>`; }
  els.gridHeadRow.innerHTML = h;

  // body rows
  const rows = areas.map((area, ai)=>{
    let tds = `<th>${area}</th>`;
    for (let d=1; d<=totalDays; d++){
      tds += `<td data-area="${area}" data-area-index="${ai}" data-day="${d}">
        <div class="cell-actions">
          <button class="btn addBtn">+ Add</button>
          <button class="btn editBtn">✎ Edit</button>
        </div>
      </td>`;
    }
    return `<tr>${tds}</tr>`;
  }).join("");
  els.gridBody.innerHTML = rows;
}

/* ----------------------------------------------------------------
   Multi-select persistence + robust multi-drag (survives Undo/Redo)
------------------------------------------------------------------*/
const DRAG_MIME = "application/x-remodel-tasks";
const selectedUIDs = new Set(); // <-- single source of truth

function ensureTaskDraggable(node){
  if (!node || !node.classList || !node.classList.contains('task')) return;
  if (!node.dataset.uid) node.dataset.uid = Math.random().toString(36).slice(2);
  if (!node.hasAttribute('draggable')) node.setAttribute('draggable','true');
  // Re-apply selection state when a task enters the DOM
  applySelectionVisual(node, selectedUIDs.has(node.dataset.uid));
}

function applySelectionVisual(taskEl, on){
  taskEl.classList.toggle('selected', on);
  const box = taskEl.querySelector('input[type="checkbox"]');
  if (box) box.checked = on;
}

function markSelected(taskEl, on){
  if (!taskEl?.dataset?.uid) return;
  if (on) selectedUIDs.add(taskEl.dataset.uid);
  else selectedUIDs.delete(taskEl.dataset.uid);
  applySelectionVisual(taskEl, on);
}

function clearAllSelection(){
  selectedUIDs.clear();
  document.querySelectorAll('.task.selected').forEach(el=>el.classList.remove('selected'));
  document.querySelectorAll('.task input[type="checkbox"]').forEach(b=>{ b.checked = false; });
}

function observeTasks(){
  // initial pass
  document.querySelectorAll('.task').forEach(ensureTaskDraggable);

  // keep tasks wired as the grid re-renders (e.g., Undo/Redo)
  const mo = new MutationObserver(muts=>{
    muts.forEach(m=>{
      m.addedNodes?.forEach(n=>{
        if (!(n instanceof HTMLElement)) return;
        if (n.classList?.contains('task')) ensureTaskDraggable(n);
        n.querySelectorAll?.('.task').forEach(ensureTaskDraggable);
      });
    });
  });
  mo.observe(document.body, { childList:true, subtree:true });
}

function wireSelection(){
  // Ctrl/Cmd click toggles a card
  document.addEventListener('click', (e)=>{
    const t = e.target.closest('.task');
    if (!t) return;

    // ignore controls inside the task (don’t hijack “done” etc.)
    if (e.target.closest('button, a, input, textarea, select, [contenteditable="true"], .edit, .x')) return;

    if (e.metaKey || e.ctrlKey) {
      markSelected(t, !selectedUIDs.has(t.dataset.uid));
    } else {
      // single select
      const keep = t.dataset.uid;
      document.querySelectorAll('.task.selected').forEach(x=>{
        if (x.dataset.uid !== keep) markSelected(x, false);
      });
      markSelected(t, true);
    }
  }, true);

  // Checkbox directly controls selection
  document.addEventListener('change', (e)=>{
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox') return;
    const t = box.closest('.task');
    if (!t) return;
    markSelected(t, box.checked);
  }, true);

  // ESC clears selection
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') clearAllSelection();
  });
}

function wireMultiDrag(){
  observeTasks();
  wireSelection();

  // dragstart: pack selected set (or just the dragged one)
  document.addEventListener('dragstart', (e)=>{
    const t = e.target.closest('.task');
    if (!t) return;

    ensureTaskDraggable(t);

    const group = (selectedUIDs.size
      ? [...selectedUIDs].map(uid => document.querySelector(`.task[data-uid="${uid}"]`)).filter(Boolean)
      : [t]);

    const items = group.map(el=>{
      const td = el.closest('td');
      el.classList.add('dragging');
      return { area: td?.dataset.area || "", day: +(td?.dataset.day || 0), _uid: el.dataset.uid };
    });

    try {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(items));
      e.dataTransfer.effectAllowed = 'move';
    } catch(_) {}
    e.stopPropagation(); // beat legacy one-item handler
  }, true);

  document.addEventListener('dragend', ()=>{
    document.querySelectorAll('.task.dragging').forEach(el => el.classList.remove('dragging'));
  }, true);

  // ✅ Only react to our multi-drag payload; ignore palette drags
  document.addEventListener('dragover', (e)=>{
    const types = e.dataTransfer?.types || [];
    if (!types.includes(DRAG_MIME)) return; // let palette drags bubble to grid.js
    const td = e.target.closest('td[data-area][data-day]');
    if (!td) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    td.classList.add('drag-over');
    e.stopPropagation();
  }, true);

  document.addEventListener('dragleave', (e)=>{
    const td = e.target.closest('td[data-area][data-day]');
    if (td) td.classList.remove('drag-over');
  }, true);

  // ✅ Only consume the event if it's our multi-drag payload
  document.addEventListener('drop', (e)=>{
    const types = e.dataTransfer?.types || [];
    if (!types.includes(DRAG_MIME)) return; // palette drops go to grid.js cell handler
    const td = e.target.closest('td[data-area][data-day]');
    if (!td) return;

    e.preventDefault();
    td.classList.remove('drag-over');

    const raw = e.dataTransfer.getData(DRAG_MIME);
    let items = [];
    try { items = JSON.parse(raw) || []; } catch(_) {}

    const actions = td.querySelector('.cell-actions');

    items.forEach(it=>{
      const node = document.querySelector(`.task[data-uid="${it._uid}"]`);
      if (!node) return;
      if (actions) td.insertBefore(node, actions);
      else td.appendChild(node);
      // keep selection persistent after drop
      applySelectionVisual(node, selectedUIDs.has(it._uid));
    });

    document.dispatchEvent(new CustomEvent('tasks:dropped', {
      detail:{ items, to:{ area: td.dataset.area, day:+td.dataset.day } }
    }));

    e.stopPropagation(); // we handled our multi-drag
  }, true);
}

/* -----------------------
   Settings & email button
------------------------ */
export function initUI(){
  buildPalette();
  buildGridFrame();

  // settings modal initial values
  els.cfgApiBase.value = settings.apiBase||"";
  els.cfgApiKey.value = settings.apiKey||"";
  els.cfgPlanId.value = settings.planId||"default";

  els.settingsBtn.addEventListener('click', ()=> els.settingsModal.setAttribute('aria-hidden','false'));
  els.closeSettingsBtn.addEventListener('click', ()=> els.settingsModal.setAttribute('aria-hidden','true'));
  els.saveSettingsBtn.addEventListener('click', ()=>{
    settings.apiBase = els.cfgApiBase.value.trim();
    settings.apiKey  = els.cfgApiKey.value.trim();
    settings.planId  = els.cfgPlanId.value.trim()||"default";
    saveSettings();
    alert('Saved.');
  });

  // Enable multi-select + multi-drag with persistence
  wireMultiDrag();
}

// ---- Wire the "Send 3-day checklist" button ----
(function wireEmailNow(){
  const btn  = document.getElementById('emailNowBtn');
  const base = document.getElementById('cfgApiBase');
  const key  = document.getElementById('cfgApiKey');
  const plan = document.getElementById('cfgPlanId');
  if (!btn || !base || !plan) return;

  btn.addEventListener('click', async (e)=>{
    e.preventDefault(); e.stopPropagation();
    const apiBase = (base.value || '').trim().replace(/\/+$/, '');
    const apiKey  = (key?.value || '').trim();
    const planId  = (plan.value || 'default').trim();
    if (!apiBase) { alert('Set Backend URL first.'); return; }

    try {
      const url = `${apiBase}/ops/send_daily_email?plan_id=${encodeURIComponent(planId)}`;
      const headers = apiKey ? { 'X-API-Key': apiKey } : {};
      console.log('[emailNow] GET', url);
      const res = await fetch(url, { headers });
      const text = await res.text();
      console.log('[emailNow] response', res.status, text);
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      alert('✅ Sent: 3-day checklist email (check your inbox/spam).');
    } catch (err) {
      console.error(err);
      alert('❌ Email failed: ' + (err?.message || err));
    }
  });
})();
