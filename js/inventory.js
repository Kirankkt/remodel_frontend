import {defaultPalette} from './state.js';
import {buildPalette} from './ui.js';

export function wireInventory(){
  const btn=document.getElementById('inventoryBtn');
  const modal=document.getElementById('inventoryModal');
  const list=document.getElementById('inventoryList');
  const saveBtn=document.getElementById('saveInventoryBtn');
  const closeBtn=document.getElementById('closeInventoryBtn');

  btn.addEventListener('click', ()=>{
    list.innerHTML = defaultPalette.map((p,i)=>`
      <div class="row">
        <input class="input inv-name" data-i="${i}" value="${p.name}">
        <input class="input inv-role" data-i="${i}" value="${p.role}">
      </div>
      <div class="row">
        <input class="input inv-workers" data-i="${i}" type="number" min="0" step="1" value="${p.workers}">
        <input class="input inv-hours" data-i="${i}" type="number" min="0" step="0.5" value="${p.hours}">
      </div>
    `).join('');
    modal.style.display='flex';
  });

  saveBtn.addEventListener('click', ()=>{
    [...list.querySelectorAll('.inv-name')].forEach(inp=> defaultPalette[+inp.dataset.i].name = inp.value.trim());
    [...list.querySelectorAll('.inv-role')].forEach(inp=> defaultPalette[+inp.dataset.i].role = inp.value.trim());
    [...list.querySelectorAll('.inv-workers')].forEach(inp=> defaultPalette[+inp.dataset.i].workers = +inp.value||0);
    [...list.querySelectorAll('.inv-hours')].forEach(inp=> defaultPalette[+inp.dataset.i].hours = +inp.value||0);
    localStorage.setItem('inventory_defaults', JSON.stringify(defaultPalette));
    buildPalette(); modal.style.display='none';
  });
  closeBtn.addEventListener('click', ()=> modal.style.display='none');

  const invRaw=localStorage.getItem('inventory_defaults');
  if(invRaw){ try{ const arr=JSON.parse(invRaw); if(Array.isArray(arr)&&arr.length) Object.assign(defaultPalette, arr); }catch{} }
}
