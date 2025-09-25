import {initUI} from './ui.js';
import {initGrid,serializeRich,restoreFrom} from './grid.js';
import {wireImporters} from './importers.js';
import {wireInventory} from './inventory.js';
import {pullFromServer,persist,seedHistory,setCreds} from './state.js';

// bootstrap
initUI();
initGrid();
wireImporters();
wireInventory();

// Sync pulls from backend to overwrite local
document.getElementById('syncBtn').addEventListener('click', async ()=>{
  try{
    const json = await pullFromServer();
    restoreFrom(json||{});
    seedHistory(serializeRich);
  }catch(e){ alert('Sync failed (using local data).'); }
});

// Summary = open Reports
document.getElementById('summaryBtn').addEventListener('click', ()=>{
  document.getElementById('reportsBtn').click();
});

// Persist toggle
document.getElementById('allowMultiple').addEventListener('change', ()=> persist(serializeRich));

// NEW: Settings button (enter/change API key + plan id)
document.getElementById('settingsBtn').addEventListener('click', ()=>{
  const apiKey = prompt('X-API-Key', localStorage.getItem('api_key') || 'roymenterprises@9406');
  const planId = prompt('Plan ID', localStorage.getItem('plan_id') || 'default');
  setCreds({apiKey, planId});
  alert('Saved. New edits/imports will sync to backend.');
});

// First load: if no API key known, offer to set it once
(function maybeAskCreds(){
  const have = localStorage.getItem('api_key');
  if (have) return;
  const useServer = confirm('Save to shared backend? Click OK to enter API key & plan id. (Cancel = local-only)');
  if (!useServer) return;
  const apiKey = prompt('Enter API key (X-API-Key):','roymenterprises@9406');
  const planId = prompt('Enter Plan ID (e.g., default):','default');
  setCreds({apiKey, planId});
})();

// Expose a few globals (lets CSV fallback work even if XLSX CDN is blocked)
import * as State from './state.js';
import { getCell, renderTaskEl } from './grid.js';
window.areas = State.areas;
window.totalDays = State.totalDays;
window.defaultPalette = State.defaultPalette;
window.getCell = getCell;
window.renderTaskEl = renderTaskEl;
