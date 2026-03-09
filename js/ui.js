// ui.js
console.log('ui.js loaded');

import { defaultPalette, areas, totalDays, settings, saveSettings, pullLatest, setTotalDays, getWorkingDaysLeft, HOLIDAYS } from './state.js';

export const els = {
  allowMultiple: document.getElementById('allowMultiple'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  daysRemainingCounter: document.getElementById('daysRemainingCounter'),
  applyDatesBtn: document.getElementById('applyDatesBtn'),

  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  cfgApiBase: document.getElementById('cfgApiBase'),
  cfgApiKey: document.getElementById('cfgApiKey'),
  cfgPlanId: document.getElementById('cfgPlanId'),
  cfgToken: document.getElementById('cfgToken'),
  cfgTotalDays: document.getElementById('cfgTotalDays'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  emailNowBtn: document.getElementById('emailNowBtn'),

  // Go-to-day controls
  gotoDay: document.getElementById('gotoDay'),
  gotoDayBtn: document.getElementById('gotoDayBtn'),

  // Optional sync button in topbar
  syncBtn: document.getElementById('syncBtn'),

  importBtn: document.getElementById('importCsvBtn'),
  importInput: document.getElementById('csvFileInput'),

  gridHeadRow: document.getElementById('theadRow'),
  gridBody: document.getElementById('tbody'),
  palette: document.getElementById('palette'),

  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),

  reportsBtn: document.getElementById('reportsBtn'),
};

/* ---------------------------
   Role -> normalized key
---------------------------- */
function roleKey(r) {
  const s = String(r || '').trim().toLowerCase();
  const MAP = {
    // canonical buckets
    'demolition': 'demolition',
    'civil work': 'civil',
    'civil': 'civil',
    'plumbing': 'plumbing',
    'carpentry': 'carpentry',
    'tiling': 'tiling',
    'painting': 'painting',
    'electrical': 'electrical',
    'cleaning': 'cleaning',
    'other': 'other',

    // aliases / typos → canonical
    'plumbing work': 'plumbing',
    'electric work': 'electrical',
    'electical': 'electrical',
    'electric work, solar': 'electrical',
    'tiiles': 'tiling',
    'glass work': 'other',
    'metal work': 'other',
    'metal and roofing work': 'other',
  };
  return MAP[s] || 'other';
}

export function buildPalette() {
  els.palette.innerHTML = defaultPalette.map(p => {
    const rk = roleKey(p.role);
    return `
      <div class="pal" draggable="true"
           data-role="${rk}"
           data-palette='${JSON.stringify(p)}'>
        <div class="label">${p.name}</div>
        <div class="meta">
          <span class="role">${p.role || ''}</span>
          · w:${p.workers} h:${p.hours}
        </div>
      </div>
    `;
  }).join("");
}

export function buildGridFrame() {
  // header
  let h = '<th>Area / Day</th>';
  for (let d = 1; d <= totalDays; d++) { h += `<th>Day ${d}</th>`; }
  els.gridHeadRow.innerHTML = h;

  // body rows
  const rows = areas.map((area, ai) => {
    let tds = `<th>${area}</th>`;
    for (let d = 1; d <= totalDays; d++) {
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
const selectedUIDs = new Set();

function ensureTaskDraggable(node) {
  if (!node || !node.classList || !node.classList.contains('task')) return;
  if (!node.dataset.uid) node.dataset.uid = Math.random().toString(36).slice(2);
  if (!node.hasAttribute('draggable')) node.setAttribute('draggable', 'true');
  applySelectionVisual(node, selectedUIDs.has(node.dataset.uid));
}
function applySelectionVisual(taskEl, on) { taskEl.classList.toggle('selected', on); }
function markSelected(taskEl, on) {
  if (!taskEl?.dataset?.uid) return;
  if (on) selectedUIDs.add(taskEl.dataset.uid);
  else selectedUIDs.delete(taskEl.dataset.uid);
  applySelectionVisual(taskEl, on);
}
function clearAllSelection() {
  selectedUIDs.clear();
  document.querySelectorAll('.task.selected').forEach(el => el.classList.remove('selected'));
}
function observeTasks() {
  document.querySelectorAll('.task').forEach(ensureTaskDraggable);
  const mo = new MutationObserver(muts => {
    muts.forEach(m => {
      m.addedNodes?.forEach(n => {
        if (!(n instanceof HTMLElement)) return;
        if (n.classList?.contains('task')) ensureTaskDraggable(n);
        n.querySelectorAll?.('.task').forEach(ensureTaskDraggable);
      });
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
function wireSelection() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.task');
    if (!t) return;
    if (e.target.closest('button, a, input, textarea, select, [contenteditable="true"], .edit, .x')) return;
    if (e.metaKey || e.ctrlKey) markSelected(t, !selectedUIDs.has(t.dataset.uid));
    else {
      const keep = t.dataset.uid;
      document.querySelectorAll('.task.selected').forEach(x => {
        if (x.dataset.uid !== keep) markSelected(x, false);
      });
      markSelected(t, true);
    }
  }, true);
  document.addEventListener('change', (e) => {
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox') return;
    if (box.classList.contains('done')) return;
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearAllSelection(); });
}
function wireMultiDrag() {
  observeTasks(); wireSelection();

  document.addEventListener('dragstart', (e) => {
    const t = e.target.closest('task'); // noop safeguard
  }, true);

  document.addEventListener('dragstart', (e) => {
    const t = e.target.closest('.task');
    if (!t) return;
    ensureTaskDraggable(t);

    const group = (selectedUIDs.size
      ? [...selectedUIDs].map(uid => document.querySelector(`.task[data-uid="${uid}"]`)).filter(Boolean)
      : [t]);

    const items = group.map(el => {
      const td = el.closest('td');
      el.classList.add('dragging');
      return { area: td?.dataset.area || "", day: +(td?.dataset.day || 0), _uid: el.dataset.uid };
    });

    try {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(items));
      e.dataTransfer.effectAllowed = 'move';
    } catch (_) { }
    e.stopPropagation();
  }, true);

  document.addEventListener('dragend', () => { document.querySelectorAll('.task.dragging').forEach(el => el.classList.remove('dragging')); }, true);

  document.addEventListener('dragover', (e) => {
    const types = e.dataTransfer?.types || [];
    if (!types.includes(DRAG_MIME)) return;
    const td = e.target.closest('td[data-area][data-day]'); if (!td) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    td.classList.add('drag-over');
    e.stopPropagation();
  }, true);

  document.addEventListener('dragleave', (e) => {
    const td = e.target.closest('td[data-area][data-day]');
    if (td) td.classList.remove('drag-over');
  }, true);

  document.addEventListener('drop', (e) => {
    const types = e.dataTransfer?.types || [];
    if (!types.includes(DRAG_MIME)) return;
    const td = e.target.closest('td[data-area][data-day]'); if (!td) return;

    e.preventDefault();
    td.classList.remove('drag-over');

    let items = [];
    try { items = JSON.parse(e.dataTransfer.getData(DRAG_MIME) || "[]"); } catch (_) { }

    const actions = td.querySelector('.cell-actions');
    items.forEach(it => {
      const node = document.querySelector(`.task[data-uid="${it._uid}"]`);
      if (!node) return;
      if (actions) td.insertBefore(node, actions);
      else td.appendChild(node);
      applySelectionVisual(node, selectedUIDs.has(it._uid));
    });

    document.dispatchEvent(new CustomEvent('tasks:dropped', {
      detail: { items, to: { area: td.dataset.area, day: +td.dataset.day } }
    }));

    e.stopPropagation();
  }, true);
}

/* -----------------------
   Admin helpers & ops
------------------------ */

// Use local start date to hint the backend which "today" is
function todayIndexFromLocalStart() {
  const sd = localStorage.getItem('project_start_date') || '';
  if (!sd) return null;
  const [y, m, d] = sd.split('-').map(Number);

  // Workday calculation
  let dt = new Date(y, m - 1, d); dt.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);

  if (now <= dt) return 1;

  let idx = 1;
  while (dt < now) {
    dt.setDate(dt.getDate() + 1);
    const dayOfWeek = dt.getDay();
    const mmdd = String(dt.getMonth() + 1).padStart(2, '0') + "-" + String(dt.getDate()).padStart(2, '0');

    if (dayOfWeek !== 0 && !HOLIDAYS.has(mmdd)) {
      idx++;
    }
  }
  return idx;
}
function qStartDay() { const i = todayIndexFromLocalStart(); return (i ? `&start_day=${i}` : ''); }

function isTodayOff() {
  const d = new Date();
  if (d.getDay() === 0) return true;
  const mmdd = String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
  return HOLIDAYS.has(mmdd);
}

function updateAdminButtonsVisibility(visible) {
  const r = document.getElementById('rolloverNowBtn');
  const u = document.getElementById('undoRolloverBtn');
  if (!r || !u) return;

  const off = isTodayOff();
  r.style.display = (visible && !off) ? 'inline-block' : 'none';
  if (visible && off) r.title = "Cannot rollover on Sundays or holidays";
  else r.title = "Rollover now";

  u.style.display = visible ? 'inline-block' : 'none';
}

function ensureAdminButtons() {
  const emailBtn = document.getElementById('emailNowBtn');
  if (!emailBtn) return;
  if (document.getElementById('rolloverNowBtn')) return; // already added

  const mk = (id, label) => {
    const b = document.createElement('button');
    b.id = id; b.className = 'btn'; b.style.marginLeft = '8px'; b.textContent = label;
    emailBtn.parentNode.insertBefore(b, emailBtn.nextSibling);
    return b;
  };
  mk('rolloverNowBtn', 'Rollover now');
  mk('undoRolloverBtn', 'Undo last rollover');
  updateAdminButtonsVisibility(!!(els.cfgApiKey?.value || '').trim());

  const callOps = async (path) => {
    const apiBase = (els.cfgApiBase.value || '').trim().replace(/\/+$/, '');
    const apiKey = (els.cfgApiKey.value || '').trim();
    const planId = (els.cfgPlanId.value || 'default').trim();
    if (!apiBase) { alert('Set Backend URL first.'); return; }
    if (!apiKey) { alert('Enter API Key (admin only).'); return; }
    const headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey };
    const url = `${apiBase}/ops/${path}?plan_id=${encodeURIComponent(planId)}${qStartDay()}`;
    const res = await fetch(url, { method: 'POST', headers });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    return res.json();
  };

  document.getElementById('rolloverNowBtn').addEventListener('click', async () => {
    try {
      const j = await callOps('rollover_logged');
      alert(`Rollover done: moved ${j.moved} task(s) from Day ${j.from_day} → ${j.to_day}.`);
      await pullLatest(); location.reload();
    } catch (e) { alert('Rollover failed: ' + (e.message || e)); }
  });

  document.getElementById('undoRolloverBtn').addEventListener('click', async () => {
    try {
      const j = await callOps('unrollover_last');
      alert(`Undo ok (log ${j.undone_log_id}). Moved back ${j.moved_back} task(s).`);
      await pullLatest(); location.reload();
    } catch (e) { alert('Undo failed: ' + (e.message || e)); }
  });
}

/* -----------------------
   Publish schedule (API key OR token)
------------------------ */
function collectGridSnapshot() {
  const allow_multiple = !!els.allowMultiple?.checked;
  const cells = [];
  document.querySelectorAll('#tbody tr').forEach(tr => {
    tr.querySelectorAll('td[data-area][data-day]').forEach(td => {
      const area = td.dataset.area;
      const day = +td.dataset.day || 0;
      const activities = Array.from(td.querySelectorAll('.task')).map(ch => {
        const raw = ch.dataset.task || '{}';
        return (typeof raw === 'string') ? raw : JSON.stringify(raw);
      });
      cells.push({ area, day, activities });
    });
  });
  return { allow_multiple, cells };
}

async function publishNow() {
  const apiBase = (els.cfgApiBase.value || settings.apiBase || '').trim().replace(/\/+$/, '');
  const apiKey = (els.cfgApiKey.value || settings.apiKey || '').trim();
  const planId = (els.cfgPlanId.value || settings.planId || 'default').trim();
  const token = (els.cfgToken?.value || settings.token || '').trim();

  if (!apiBase) { alert('Set Backend URL first.'); return; }
  if (!planId) { alert('Enter Plan ID.'); return; }
  if (!apiKey && !token) {
    alert('Enter API Key (admin) or Token (t) to publish.'); return;
  }

  const payload = collectGridSnapshot();
  const q = (!apiKey && token) ? `?t=${encodeURIComponent(token)}` : '';
  const headers = { 'Content-Type': 'application/json', ...(apiKey ? { 'X-API-Key': apiKey } : {}) };

  const url = `${apiBase}/plans/${encodeURIComponent(planId)}/grid${q}`;
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  alert('Published to backend ✓');
}

/* -----------------------
   Go to Day helpers
------------------------ */
function getScrollContainer() {
  // 1) Preferred explicit class
  let sc = document.querySelector('.grid-scroll');
  if (sc) return sc;

  // 2) Nearest horizontally scrollable ancestor of the header row
  const start = els.gridHeadRow?.parentElement || els.gridHeadRow;
  let node = start;
  while (node) {
    const cs = node instanceof HTMLElement ? getComputedStyle(node) : null;
    if (cs && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) return node;
    node = node.parentElement;
  }

  // 3) Fallback to page scroll
  return document.scrollingElement || document.documentElement;
}

function scrollToDay(day) {
  let d = parseInt(day, 10);
  if (!Number.isFinite(d) || d < 1) return;
  if (d > totalDays) d = totalDays;

  const sc = getScrollContainer();
  if (!sc) return;

  // Width of the sticky first column ("Area / Day") if present
  const firstTh = document.querySelector('#theadRow th:first-child');
  let stickyW = 0;
  if (firstTh) {
    const cs = getComputedStyle(firstTh);
    if (cs.position === 'sticky' || cs.position === 'fixed') {
      stickyW = firstTh.getBoundingClientRect().width;
    }
  }

  // Header cell for the requested day (Day 1 is the 2nd <th>)
  const th = document.querySelector(`#theadRow th:nth-child(${d + 1})`);
  const target = th || document.querySelector(`td[data-day="${d}"]`);
  if (!target) return;

  if (sc === document.scrollingElement) {
    const x = target.getBoundingClientRect().left + window.pageXOffset - stickyW - 8;
    window.scrollTo({ left: x, top: window.pageYOffset, behavior: 'smooth' });
  } else {
    const x = target.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft - stickyW - 8;
    sc.scrollTo({ left: x, behavior: 'smooth' });
  }
}

/* -----------------------
   Init UI
------------------------ */
export function initUI() {
  buildPalette();
  buildGridFrame();

  // settings modal initial values
  els.cfgApiBase.value = settings.apiBase || "";
  els.cfgApiKey.value = settings.apiKey || "";
  els.cfgPlanId.value = settings.planId || "default";
  if (els.cfgToken) els.cfgToken.value = settings.token || "";
  if (els.cfgTotalDays) els.cfgTotalDays.value = String(totalDays || 60);

  els.settingsBtn.addEventListener('click', () => {
    els.settingsModal.setAttribute('aria-hidden', 'false');
    ensureAdminButtons();
    updateAdminButtonsVisibility(!!(els.cfgApiKey?.value || '').trim());
  });
  els.closeSettingsBtn.addEventListener('click', () => els.settingsModal.setAttribute('aria-hidden', 'true'));

  els.saveSettingsBtn.addEventListener('click', () => {
    // Save API/plan/token
    settings.apiBase = els.cfgApiBase.value.trim();
    settings.apiKey = els.cfgApiKey.value.trim();
    settings.planId = (els.cfgPlanId.value.trim() || "default");
    settings.token = (els.cfgToken?.value || "").trim();

    // Save total days
    const prev = totalDays;
    const n = parseInt(els.cfgTotalDays?.value, 10);
    if (Number.isFinite(n) && n >= 1) setTotalDays(n);

    saveSettings();
    updateAdminButtonsVisibility(!!settings.apiKey);
    alert('Saved.');

    // Rebuild the grid if column count changed
    if (prev !== totalDays) location.reload();
  });

  // Publish (API key or token)
  const publishBtn = document.getElementById('publishBtn');
  publishBtn?.addEventListener('click', async () => {
    try {
      publishBtn.disabled = true;
      const old = publishBtn.textContent; publishBtn.textContent = 'Publishing…';
      await publishNow();
      publishBtn.textContent = old;
    } catch (e) { alert('Publish failed: ' + (e.message || e)); }
    finally { publishBtn.disabled = false; }
  });

  // Sync button = read-only pull (no API key required)
  els.syncBtn?.addEventListener('click', async () => {
    try { await pullLatest(); alert('Pulled latest from server.'); location.reload(); }
    catch (e) { alert('Sync failed: ' + (e.message || e)); }
  });

  // Apply Dates -> persist to backend (requires API key)
  els.applyDatesBtn?.addEventListener('click', async () => {
    const iso = els.startDate?.value;
    if (!iso) return;

    localStorage.setItem('project_start_date', iso);

    const api = (document.getElementById('cfgApiBase')?.value || '').trim().replace(/\/+$/, '');
    const key = (document.getElementById('cfgApiKey')?.value || '').trim();
    const pid = (document.getElementById('cfgPlanId')?.value || 'default').trim();
    if (!api || !key) { alert('Enter Backend URL + API Key in Settings to persist start date.'); return; }

    try {
      const url = `${api}/ops/set_start_date?plan_id=${encodeURIComponent(pid)}&start=${encodeURIComponent(iso)}`;
      const r = await fetch(url, { method: 'POST', headers: { 'X-API-Key': key } });
      if (!r.ok) throw new Error(await r.text());
      alert('Start date saved to server.');
    } catch (e) {
      console.warn('Persist start_date failed:', e);
      alert('Could not save start date to server.');
    }
  });

  // Go to Day (click or Enter)
  els.gotoDayBtn?.addEventListener('click', () => scrollToDay(els.gotoDay?.value));
  els.gotoDay?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') scrollToDay(els.gotoDay.value);
  });

  // End date logic
  function updateDaysRemainingUI() {
    const endStr = localStorage.getItem('project_end_date');
    if (!endStr) {
      if (els.endDate) els.endDate.value = '';
      if (els.daysRemainingCounter) {
        els.daysRemainingCounter.textContent = '';
        els.daysRemainingCounter.style.display = 'none';
      }
      return;
    }

    if (els.endDate && els.endDate.value !== endStr) {
      els.endDate.value = endStr;
    }

    if (els.daysRemainingCounter) {
      const daysLeft = getWorkingDaysLeft(endStr);
      els.daysRemainingCounter.textContent = `⏳ ${daysLeft} Working Days Left`;
      els.daysRemainingCounter.style.display = 'inline-block';
    }
  }

  // Initial load
  updateDaysRemainingUI();

  // On date change
  els.endDate?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      localStorage.setItem('project_end_date', val);
    } else {
      localStorage.removeItem('project_end_date');
    }
    updateDaysRemainingUI();
  });

  // Enable multi-select + multi-drag with persistence
  wireMultiDrag();
}

// ---- "Send 3-day checklist" (admin-only) ----
(function wireEmailNow() {
  const btn = document.getElementById('emailNowBtn');
  const base = document.getElementById('cfgApiBase');
  const key = document.getElementById('cfgApiKey');
  const plan = document.getElementById('cfgPlanId');
  if (!btn || !base || !plan) return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    const apiBase = (base.value || '').trim().replace(/\/+$/, '');
    const apiKey = (key?.value || '').trim();
    const planId = (plan.value || 'default').trim();
    if (!apiBase) { alert('Set Backend URL first.'); return; }
    if (!apiKey) { alert('Enter API Key (admin only).'); return; }

    const endStr = localStorage.getItem('project_end_date');
    const daysLeft = endStr ? getWorkingDaysLeft(endStr) : 0;

    try {
      const url = `${apiBase}/ops/send_daily_email?plan_id=${encodeURIComponent(planId)}&days_left=${daysLeft}${qStartDay()}`;
      const headers = { 'X-API-Key': apiKey };
      const res = await fetch(url, { headers });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      alert('✅ Sent: 3-day checklist email (check inbox/spam).');
    } catch (err) { alert('❌ Email failed: ' + (err?.message || err)); }
  });
})();
