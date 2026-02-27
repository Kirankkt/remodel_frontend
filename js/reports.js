import { areas, dateForDay, fmtDate, settings, totalDays, getWorkingDaysLeft } from './state.js';

const modal = document.getElementById('reportsModal');
const tabs = document.getElementById('reportsTabs');
const body = document.getElementById('reportsBody');
const btnClose = document.getElementById('closeReportsBtn');
const btnExportCsv = document.getElementById('exportCsvBtn');
const btnExportXlsx = document.getElementById('exportXlsxBtn');   // NEW
const btnEmail = document.getElementById('emailFromReportsBtn');

export function wireReports() {
  btnClose.addEventListener('click', () => modal.setAttribute('aria-hidden', 'true'));
  btnExportCsv.addEventListener('click', exportCsv);
  btnEmail.addEventListener('click', emailChecklist);
  btnExportXlsx.addEventListener('click', exportXlsxAll);
}

export function openReports() {
  render();
  modal.setAttribute('aria-hidden', 'false');
}

/* ====== FIXED: scope to #grid tbody only and guard for missing <th> ====== */
function readGrid() {
  const rows = [];
  const gridBody = document.querySelector('#grid tbody');
  if (!gridBody) return rows;

  gridBody.querySelectorAll('tr').forEach(tr => {
    const areaEl = tr.querySelector('th');
    if (!areaEl) return; // safety: ignore non-grid rows
    const area = areaEl.textContent.trim();

    tr.querySelectorAll('td[data-day]').forEach(td => {
      const day = +td.dataset.day || 0;
      td.querySelectorAll('.task').forEach(ch => {
        let t = {};
        try { t = JSON.parse(ch.dataset.task || '{}'); } catch { }
        rows.push({
          day,
          area,
          task: t.name || "",
          role: t.role || "",
          workers: t.workers || 0,
          hours: t.hours || 0
        });
      });
    });
  });
  return rows;
}

function render() {
  body.innerHTML = "";
  tabs.innerHTML = "";

  const rows = readGrid();

  // group by day
  const byDay = {};
  rows.forEach(r => (byDay[r.day] ||= []).push(r));

  // all days in plan (1..totalDays)
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  // pick initial tab: first day that has rows, else 1
  const activeDay = days.find(d => (byDay[d]?.length)) ?? 1;

  days.forEach(d => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (d === activeDay ? ' active' : '');
    tab.dataset.day = String(d);
    tab.textContent = `Day ${d}`;
    tab.addEventListener('click', () => {
      document.querySelectorAll('#reportsTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      drawTable(d, byDay[d] || []);
    });
    tabs.appendChild(tab);
  });

  drawTable(activeDay, byDay[activeDay] || []);
}

function drawTable(day, rows) {
  const dt = dateForDay(day);
  const hdr = `<h3 style="margin:0 0 8px 0">Day ${day}${dt ? ' — ' + fmtDate(dt) : ''}</h3>`;
  const tbl = [
    `<table class="table">`,
    `<thead><tr><th>Area</th><th>Task</th><th>Role</th><th>Workers</th><th>Hours</th></tr></thead><tbody>`
  ];
  if (rows.length) {
    rows.forEach(r => {
      tbl.push(
        `<tr><td>${esc(r.area)}</td><td>${esc(r.task)}</td>` +
        `<td>${esc(r.role)}</td><td>${r.workers}</td><td>${r.hours}</td></tr>`
      );
    });
  } else {
    tbl.push(`<tr><td colspan="5" style="color:#6b7280">No tasks</td></tr>`);
  }
  tbl.push(`</tbody></table>`);
  body.innerHTML = hdr + tbl.join("");
}

function esc(s) {
  return String(s || "").replace(/[&<>]/g, m => ({ "&": "&amp;", "<": "&lt;", "&gt;": "&gt;" }[m]));
}

function exportCsv() {
  const rows = readGrid();
  const head = ["day", "area", "task", "role", "workers", "hours"];
  const lines = [head.join(",")];
  rows.forEach(r => {
    lines.push([r.day, r.area, r.task, r.role, r.workers, r.hours]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = "tasks.csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportXlsxAll() {
  if (typeof XLSX === 'undefined') {
    alert('Excel export library (SheetJS) did not load.');
    return;
  }
  const rows = readGrid();
  const header = ["day", "area", "task", "role", "workers", "hours"];
  const aoa = [header, ...rows.map(r => [r.day, r.area, r.task, r.role, r.workers, r.hours])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [6, 24, 40, 16, 10, 10].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plan');
  XLSX.writeFile(wb, 'remodel_plan.xlsx');
}

async function emailChecklist() {
  if (!settings.apiBase || !settings.planId) {
    alert("Set Backend URL and Plan ID in Settings first."); return;
  }
  const base = (settings.apiBase || '').trim().replace(/\/+$/, '');

  const endStr = localStorage.getItem('project_end_date');
  const daysLeft = endStr ? getWorkingDaysLeft(endStr) : 0;

  try {
    const resp = await fetch(
      `${base}/ops/send_daily_email?plan_id=${encodeURIComponent(settings.planId)}&days_left=${daysLeft}`,
      { headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined }
    );
    if (!resp.ok) throw new Error(await resp.text());
    alert("Email sent (backend confirmed).");
  } catch (e) {
    alert("Email failed: " + e.message);
  }
}
