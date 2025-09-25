// reports.js
import { areas, dateForDay, fmtDate, settings, totalDays } from './state.js';

const modal = document.getElementById('reportsModal');
const tabs  = document.getElementById('reportsTabs');
const body  = document.getElementById('reportsBody');
const btnClose = document.getElementById('closeReportsBtn');
const btnExportCsv = document.getElementById('exportCsvBtn');
const btnEmail = document.getElementById('emailFromReportsBtn');

export function wireReports(){
  btnClose.addEventListener('click', ()=> modal.setAttribute('aria-hidden','true'));
  btnExportCsv.addEventListener('click', exportCsv);
  btnEmail.addEventListener('click', emailChecklist);
}

export function openReports(){
  render();
  modal.setAttribute('aria-hidden','false');
}

function readGrid(){
  // convert visible grid to structured rows
  const rows = [];
  document.querySelectorAll('tbody tr').forEach(tr=>{
    const area = tr.querySelector('th').textContent.trim();
    tr.querySelectorAll('td').forEach(td=>{
      const day = +td.dataset.day;
      td.querySelectorAll('.task').forEach(ch=>{
        const t = JSON.parse(ch.dataset.task);
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

function render(){
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

function drawTable(day, rows){
  const dt = dateForDay(day);
  const hdr = `<h3 style="margin:0 0 8px 0">Day ${day}${dt ? ' — ' + fmtDate(dt) : ''}</h3>`;
  const tbl = [
    `<table class="table">`,
    `<thead><tr><th>Area</th><th>Task</th><th>Role</th><th>Workers</th><th>Hours</th></tr></thead><tbody>`
  ];
  if (rows.length) {
    rows.forEach(r=>{
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

function esc(s){
  return String(s || "").replace(/[&<>]/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[m]));
}

function exportCsv(){
  const rows = readGrid();
  const head = ["day","area","task","role","workers","hours"];
  const lines = [head.join(",")];
  rows.forEach(r=>{
    lines.push([r.day,r.area,r.task,r.role,r.workers,r.hours]
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = "tasks.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function emailChecklist(){
  if (!settings.apiBase || !settings.planId){
    alert("Set Backend URL and Plan ID in Settings first."); return;
  }
  const base = (settings.apiBase || '').trim().replace(/\/+$/, '');
  try{
    const resp = await fetch(
      `${base}/ops/send_daily_email?plan_id=${encodeURIComponent(settings.planId)}`,
      { headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined }
    );
    if (!resp.ok) throw new Error(await resp.text());
    alert("Email sent (backend confirmed).");
  }catch(e){
    alert("Email failed: " + e.message);
  }
}
