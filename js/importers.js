// importers.js — clean CSV/XLSX importer
import { areas } from './state.js';
import { getCell, renderTaskEl, serializeRich } from './grid.js';
import { persistNoHistory } from './state.js';

function splitCsvLine(line) {
  const re = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/g;
  return line.split(re).map(s=>s.replace(/^"|"$/g,"").trim());
}

// Long-format CSV/XLSX: Area, Day, Role, Task, Workers, Crew, HoursPerDay
async function importCleanCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return alert("Empty CSV");

  const idx = Object.fromEntries(splitCsvLine(lines[0]).map((h,i)=>[h.trim(),i]));
  const need = ["Area","Day","Role","Task","Workers","HoursPerDay"];
  for (const k of need) if (!(k in idx)) return alert(`CSV missing column: ${k}`);

  // clear existing
  document.querySelectorAll('tbody td .task').forEach(el=>el.remove());

  let imported=0;
  for (let i=1;i<lines.length;i++){
    const cells = splitCsvLine(lines[i]);
    const area   = cells[idx.Area]||"";
    const day    = parseInt(cells[idx.Day],10);
    const role   = cells[idx.Role]||"";
    const name   = cells[idx.Task]||role||"Task";
    const workers= Number(cells[idx.Workers]||0);
    const hours  = Number(cells[idx.HoursPerDay]||0);

    if (!area || !Number.isFinite(day)) continue;
    const ai = areas.indexOf(area);
    if (ai===-1) { console.warn("Unknown area:", area); continue; }
    const td = getCell(ai, day); if (!td) continue;

    const t = { name, role, workers:workers||0, hours:hours||0, crew:cells[idx.Crew]||"",
      vendor:"", materials:"", cost:0, ordered:false, delivered:false, orderDue:"", deliveryDue:"", done:false };
    td.insertBefore(renderTaskEl(t), td.querySelector('.cell-actions'));
    imported++;
  }
  persistNoHistory(serializeRich);
  alert(`Imported ${imported} tasks.`);
}

function isXlsx(filename){ return /\.xlsx?$/i.test(filename||""); }

function readFileAsText(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(fr.result);
    fr.onerror= rej;
    fr.readAsText(file);
  });
}

async function handleFile(file){
  if (!file) return;
  if (isXlsx(file.name)){
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws,{defval:""});
    // normalize to CSV header set:
    const header = ["Area","Day","Role","Task","Workers","Crew","HoursPerDay"];
    const lines = [header.join(",")];
    json.forEach(r=>{
      lines.push([
        r.Area, r.Day, r.Role, r.Task, r.Workers, r.Crew||"", r.HoursPerDay
      ].map(v => `"${String(v??"").replace(/"/g,'""')}"`).join(","));
    });
    await importCleanCSV(lines.join("\n"));
  }else{
    const text = await readFileAsText(file);
    await importCleanCSV(text);
  }
}

// wire
const input = document.getElementById('csvFileInput');
const btn   = document.getElementById('importCsvBtn');
if (btn && input){
  btn.addEventListener('click', ()=> input.click());
  input.addEventListener('change', e=> handleFile(e.target.files[0]));
}
