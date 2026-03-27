const DATA_FILES = [
  'data/brands.json','data/models.json','data/boards.json','data/parts.json','data/error_codes.json',
  'data/symptoms.json','data/documents.json','data/model_parts.json','data/model_boards.json','data/board_parts.json'
];
const state = {data:{}, currentView:'dashboard', currentBrand:null, currentModel:null, currentBoard:null, currentPart:null, currentTab:'overview', query:''};
const app = document.getElementById('app');
const brandList = document.getElementById('brandList');
const dataStatus = document.getElementById('dataStatus');
const globalSearch = document.getElementById('globalSearch');

globalSearch.addEventListener('input', e=>{state.query=e.target.value.trim().toLowerCase(); render();});
document.getElementById('reloadBtn').addEventListener('click', loadData);
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click', ()=>{document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); state.currentView=btn.dataset.view; state.currentModel=null; state.currentBoard=null; state.currentPart=null; render();}));

function indexBy(arr,key='id'){return Object.fromEntries(arr.map(item=>[item[key],item]));}
function applyQuery(items, fields){ if(!state.query) return items; return items.filter(item=>fields.some(f=>String(item[f]||'').toLowerCase().includes(state.query))); }
function escapeHtml(s){ return String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function loadData(){
  try{
    dataStatus.textContent='Loading JSON files...';
    const loaded = await Promise.all(DATA_FILES.map(async file=>{ const res=await fetch(file,{cache:'no-store'}); if(!res.ok) throw new Error(file); return [file.split('/').pop().replace('.json',''), await res.json()]; }));
    state.data = Object.fromEntries(loaded);
    state.data.brandsById = indexBy(state.data.brands);
    state.data.modelsById = indexBy(state.data.models);
    state.data.partsById = indexBy(state.data.parts);
    state.data.boardsById = indexBy(state.data.boards);
    dataStatus.textContent = `Loaded ${loaded.length} JSON files`;
    renderBrandButtons(); render();
  }catch(err){
    dataStatus.textContent='Failed to load JSON. Run via local server.'; console.error(err);
    app.innerHTML=`<div class="card"><h3>تعذر تحميل JSON</h3><p class="muted">افتح المشروع عبر local server أو Vercel / Netlify / GitHub Pages.</p></div>`;
  }
}

function renderBrandButtons(){
  brandList.innerHTML='';
  state.data.brands.forEach(brand=>{
    const btn=document.createElement('button');
    btn.className='brand-btn'+(state.currentBrand===brand.id?' active':'');
    btn.textContent=`${brand.name_ar} · ${brand.name}`;
    btn.onclick=()=>{state.currentBrand=brand.id; state.currentView='brand'; state.currentModel=null; state.currentBoard=null; state.currentPart=null; renderBrandButtons(); render();};
    brandList.appendChild(btn);
  });
}
function getBrandModels(brandId){ return state.data.models.filter(m=>m.brand_id===brandId); }
function getModelBoards(modelId){ const rel=state.data.model_boards.filter(x=>x.model_id===modelId); return rel.map(x=>({...x, board: state.data.boardsById[x.board_id]})).filter(x=>x.board); }
function getModelParts(modelId){ const rel=state.data.model_parts.filter(x=>x.model_id===modelId); return rel.map(x=>({...x, part: state.data.partsById[x.part_id]})).filter(x=>x.part); }
function getModelDocs(modelId){ return state.data.documents.filter(d=>d.model_id===modelId); }
function getBrandErrorCodes(brandId){ return state.data.error_codes.filter(e=>e.brand_id===brandId); }
function getModelSymptoms(modelId){ return state.data.symptoms.filter(s=>s.model_ids.includes(modelId)); }
function getBoardModels(boardId){ return state.data.model_boards.filter(x=>x.board_id===boardId).map(x=>state.data.modelsById[x.model_id]).filter(Boolean); }
function getBoardParts(boardId){ return state.data.board_parts.filter(x=>x.board_id===boardId).map(x=>({...x, part: state.data.partsById[x.part_id]})).filter(x=>x.part); }
function getPartModels(partId){ return state.data.model_parts.filter(x=>x.part_id===partId).map(x=>state.data.modelsById[x.model_id]).filter(Boolean); }
function getCompatibleModels(model){ const boardIds=getModelBoards(model.id).map(x=>x.board_id); return state.data.model_boards.filter(x=>boardIds.includes(x.board_id) && x.model_id!==model.id).map(x=>state.data.modelsById[x.model_id]).filter(Boolean); }

function render(){
  if(!state.data.brands) return;
  if(state.currentView==='dashboard') return renderDashboard();
  if(state.currentView==='brand') return renderBrandPage();
  if(state.currentView==='boards') return renderBoardsPage();
  if(state.currentView==='parts') return renderPartsPage();
  if(state.currentView==='symptoms') return renderSymptomsPage();
  if(state.currentView==='model' && state.currentModel) return renderModelPage();
  renderDashboard();
}

function renderDashboard(){
  const q=state.query;
  const brands = q ? state.data.brands.filter(b=>`${b.name} ${b.name_ar}`.toLowerCase().includes(q)) : state.data.brands;
  app.innerHTML=`<div class="section-title"><h2>Dashboard</h2><span class="muted">5 brands · relational JSON · diagnostics-first</span></div>
  <div class="grid">${brands.map(brand=>{ const models=getBrandModels(brand.id); const codes=getBrandErrorCodes(brand.id); return `<article class="card"><h3>${brand.name_ar} / ${brand.name}</h3><p class="muted">${brand.note}</p><div><span class="badge">${models.length} models</span><span class="badge">${state.data.boards.filter(b=>b.brand_id===brand.id).length} boards</span><span class="badge">${state.data.parts.filter(p=>p.brand_id===brand.id).length} parts</span><span class="badge">${codes.length} codes</span></div><p class="small" style="margin-top:10px">Brand page includes models, error codes, and quick diagnostics.</p><button class="inline link-btn" data-brand-open="${brand.id}">Open brand</button></article>`;}).join('')}</div>
  <div class="card" style="margin-top:16px"><h3>Data structure</h3><pre class="schema">brands.json
models.json
boards.json
parts.json
error_codes.json
symptoms.json
documents.json
model_parts.json
model_boards.json
board_parts.json</pre></div>`;
  app.querySelectorAll('[data-brand-open]').forEach(btn=>btn.onclick=()=>{state.currentBrand=btn.dataset.brandOpen; state.currentView='brand'; renderBrandButtons(); render();});
}

function renderBrandPage(){
  const brand = state.data.brandsById[state.currentBrand] || state.data.brands[0];
  if(!brand) return renderDashboard();
  const models = applyQuery(getBrandModels(brand.id), ['model_no','platform','type','note']);
  const codes = getBrandErrorCodes(brand.id);
  app.innerHTML=`<div class="section-title"><h2>${brand.name_ar} / ${brand.name}</h2><span class="muted">${brand.note}</span></div>
  <div class="split"><div class="card"><h3>Models</h3><div class="table"><div class="model-row head"><div>Model</div><div>Boards</div><div>Parts</div><div>Details</div></div>${models.map(model=>`<div class="model-row"><div><strong>${model.model_no}</strong><div class="muted">${model.platform} • ${model.type}</div></div><div>${getModelBoards(model.id).map(x=>x.board.board_no).join('<br>')||'—'}</div><div>${getModelParts(model.id).length}</div><div><button class="inline" data-model-open="${model.id}">Open</button></div></div>`).join('') || document.getElementById('emptyStateTpl').innerHTML}</div></div><div class="card"><h3>Error Codes</h3><div class="list">${codes.map(c=>`<div class="note"><strong>${c.code}</strong> — ${c.title}<div class="small">${c.diagnosis}</div></div>`).join('')}</div></div></div>`;
  app.querySelectorAll('[data-model-open]').forEach(btn=>btn.onclick=()=>{state.currentModel=btn.dataset.modelOpen; state.currentView='model'; state.currentTab='overview'; render();});
}

function renderBoardsPage(){
  const boards = applyQuery(state.data.boards,['board_no','family','notes','common_loads']).filter(b=>!state.currentBrand || b.brand_id===state.currentBrand || !state.currentBrand);
  app.innerHTML=`<div class="section-title"><h2>Boards Catalog</h2><span class="muted">Board-centric view with models and controlled loads</span></div><div class="board-list">${boards.map(board=>{ const models=getBoardModels(board.id); const parts=getBoardParts(board.id); return `<article class="board-item"><h3>${board.board_no}</h3><div class="badge">${state.data.brandsById[board.brand_id].name}</div><div class="small">${board.family}</div><p class="small" style="margin-top:8px">${board.notes}</p><p class="small" style="margin-top:8px"><strong>Controlled loads:</strong> ${board.common_loads}</p><div class="compat-list" style="margin-top:10px">${models.map(m=>`<span class="badge">${m.model_no}</span>`).join('')}</div><div class="compat-list" style="margin-top:10px">${parts.slice(0,6).map(p=>`<span class="pill">${p.part.name}</span>`).join('')}</div></article>`;}).join('') || document.getElementById('emptyStateTpl').innerHTML}</div>`;
}

function renderPartsPage(){
  const parts = applyQuery(state.data.parts,['part_number','name','category','notes']).filter(p=>!state.currentBrand || p.brand_id===state.currentBrand || !state.currentBrand);
  app.innerHTML=`<div class="section-title"><h2>Parts Catalog</h2><span class="muted">Part numbers linked to models and categories</span></div><div class="part-list">${parts.map(part=>{ const models=getPartModels(part.id); return `<article class="part-item"><h3>${part.name}</h3><div><span class="badge">${part.part_number}</span><span class="badge">${part.category}</span><span class="badge">${state.data.brandsById[part.brand_id].name}</span></div><p class="small" style="margin-top:8px">${part.notes}</p><div class="compat-list" style="margin-top:10px">${models.map(m=>`<span class="pill">${m.model_no}</span>`).join('')}</div></article>`;}).join('') || document.getElementById('emptyStateTpl').innerHTML}</div>`;
}

function renderSymptomsPage(){
  const symptoms = state.data.symptoms.filter(s=>!state.currentBrand || s.brand_only===state.currentBrand).filter(s=>!state.query || `${s.symptom_ar} ${s.symptom_en} ${s.category} ${s.possible_causes.join(' ')}`.toLowerCase().includes(state.query));
  app.innerHTML=`<div class="section-title"><h2>Fault Diagnosis</h2><span class="muted">Symptom-based checks with related parts and board sections</span></div><div class="list">${symptoms.map(s=>{ const parts=(s.related_part_ids||[]).map(id=>state.data.partsById[id]).filter(Boolean); return `<article class="card"><h3>${s.symptom_ar} <span class="badge">${s.category}</span></h3><p class="muted">${s.symptom_en}</p><div class="split" style="margin-top:12px"><div><strong>Possible causes</strong><ul>${s.possible_causes.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div><strong>Quick checks</strong><ul>${s.quick_checks.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div></div><p class="small" style="margin-top:10px"><strong>Board sections:</strong> ${s.related_board_sections.join(' · ')}</p><div class="compat-list" style="margin-top:10px">${parts.map(p=>`<span class="pill">${p.name}</span>`).join('')}</div></article>`;}).join('') || document.getElementById('emptyStateTpl').innerHTML}</div>`;
}

function renderModelPage(){
  const model = state.data.modelsById[state.currentModel]; if(!model) return renderBrandPage();
  const brand = state.data.brandsById[model.brand_id];
  const boards = getModelBoards(model.id); const parts = getModelParts(model.id); const docs = getModelDocs(model.id); const errors = getBrandErrorCodes(model.brand_id); const symptoms = getModelSymptoms(model.id); const compatible=getCompatibleModels(model);
  const tabs=['overview','faults','boards','parts','documents','codes'];
  let body='';
  if(state.currentTab==='overview'){
    body=`<div class="card"><div class="kv"><div>Brand</div><div>${brand.name_ar} / ${brand.name}</div><div>Model</div><div>${model.model_no}</div><div>Platform</div><div>${model.platform}</div><div>Type</div><div>${model.type}</div><div>Note</div><div>${model.note||'—'}</div></div></div><div class="grid" style="margin-top:16px"><div class="card"><h3>Faults</h3><p>${symptoms.length}</p></div><div class="card"><h3>Boards</h3><p>${boards.length}</p></div><div class="card"><h3>Parts</h3><p>${parts.length}</p></div><div class="card"><h3>Documents</h3><p>${docs.length}</p></div></div><div class="card" style="margin-top:16px"><h3>Compatible models</h3><div class="compat-list" style="margin-top:10px">${compatible.length?compatible.map(m=>`<span class="badge">${m.model_no}</span>`).join(''):'<span class="small">No shared-board models in current dataset.</span>'}</div></div>`;
  }
  if(state.currentTab==='faults'){
    body=`<div class="list">${symptoms.map(s=>{ const parts=(s.related_part_ids||[]).map(id=>state.data.partsById[id]).filter(Boolean); return `<article class="card"><h3>${s.symptom_ar} <span class="badge">${s.category}</span></h3><p class="muted">${s.symptom_en}</p><div class="split" style="margin-top:12px"><div><strong>Possible causes</strong><ul>${s.possible_causes.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div><strong>Quick checks</strong><ul>${s.quick_checks.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div></div><p class="small" style="margin-top:10px"><strong>Board sections:</strong> ${s.related_board_sections.join(' · ')}</p><div class="compat-list" style="margin-top:10px">${parts.map(p=>`<span class="pill">${p.part_number} · ${p.name}</span>`).join('')}</div></article>`;}).join('') || document.getElementById('emptyStateTpl').innerHTML}</div>`;
  }
  if(state.currentTab==='boards'){
    body=`<div class="board-list">${boards.map(rel=>{ const board=rel.board; const bparts=getBoardParts(board.id); return `<article class="board-item"><h3>${board.board_no}</h3><div class="badge">${board.family}</div><p class="small" style="margin-top:8px">${board.notes}</p><p class="small" style="margin-top:8px"><strong>Loads:</strong> ${board.common_loads}</p><div class="compat-list" style="margin-top:10px">${bparts.slice(0,8).map(p=>`<span class="pill">${p.section}: ${p.part.name}</span>`).join('')}</div></article>`;}).join('') || document.getElementById('emptyStateTpl').innerHTML}</div>`;
  }
  if(state.currentTab==='parts'){
    body=`<div class="part-list">${parts.map(rel=>`<article class="part-item"><h3>${rel.part.name}</h3><div><span class="badge">${rel.part.part_number}</span><span class="badge">${rel.part.category}</span></div><p class="small" style="margin-top:8px">${rel.part.notes}</p></article>`).join('') || document.getElementById('emptyStateTpl').innerHTML}</div>`;
  }
  if(state.currentTab==='documents'){
    body=`<div class="doc-list">${docs.map(doc=>`<article class="doc-item"><h3>${doc.title_ar} / ${doc.title}</h3><div><span class="badge">${doc.type}</span><span class="doc-status ${doc.status}">${doc.status}</span><span class="badge">${doc.source}</span></div>${doc.url?`<a class="inline link-btn" href="${doc.url}" target="_blank" rel="noopener">Open document</a>`:`<p class="small" style="margin-top:8px">No live link stored in current dataset.</p>`}</article>`).join('') || document.getElementById('emptyStateTpl').innerHTML}</div>`;
  }
  if(state.currentTab==='codes'){
    body=`<div class="list">${errors.map(e=>`<div class="note"><strong>${e.code}</strong> — ${e.title}<div class="small">${e.diagnosis}</div></div>`).join('') || document.getElementById('emptyStateTpl').innerHTML}</div>`;
  }
  app.innerHTML=`<div class="section-title"><h2>${model.model_no}</h2><span class="muted">${brand.name_ar} / ${brand.name} · ${model.platform}</span></div><div class="tabs">${tabs.map(tab=>`<button class="tab-btn ${state.currentTab===tab?'active':''}" data-tab="${tab}">${tab}</button>`).join('')}</div>${body}`;
  app.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{state.currentTab=btn.dataset.tab; renderModelPage();});
}

loadData();