const AUTH = { user: localStorage.getItem("washer_user") || "admin", pass: localStorage.getItem("washer_pass") || "1234" };
const adminState = { brands: [], docs: {}, activeBrand: "" };
const $ = (s) => document.querySelector(s);
const safeArray = (v) => Array.isArray(v) ? v : [];
const text = (v) => v == null ? "" : String(v);
const normalize = (v) => text(v).trim().toLowerCase();
const slugify = (v) => normalize(v).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
async function loadJSON(path){ const r = await fetch(path, { cache: 'no-store' }); if(!r.ok) throw new Error(`Failed to load ${path}`); return r.json(); }
function setStatus(msg,bad=false){ const el = $("#adminStatus"); el.textContent = msg || ''; el.style.color = bad ? '#ff9ca3' : ''; }
function getLocalRegistry(){ try { return JSON.parse(localStorage.getItem("washer_brand_registry_local")||"[]"); } catch { return []; } }
function saveLocalRegistry(brands){ localStorage.setItem("washer_brand_registry_local", JSON.stringify(brands)); }
function saveOverride(id, doc){ localStorage.setItem(`washer_doc_override_${id}`, JSON.stringify(doc)); }
function loadOverride(id){ try { return JSON.parse(localStorage.getItem(`washer_doc_override_${id}`)||"null"); } catch { return null; } }
function loginOk(){ return sessionStorage.getItem("washer_auth") === "ok"; }
function bindLogin(){
  const overlay = $("#loginOverlay"); if (loginOk()) overlay.classList.add('hidden');
  $("#loginBtn")?.addEventListener('click', ()=>{
    if ($("#loginUser").value.trim() === AUTH.user && $("#loginPass").value.trim() === AUTH.pass) { sessionStorage.setItem("washer_auth", "ok"); overlay.classList.add('hidden'); $("#loginMsg").textContent = ''; }
    else $("#loginMsg").textContent = 'Wrong username or password';
  });
  $("#logoutBtn")?.addEventListener('click', ()=> { sessionStorage.removeItem("washer_auth"); overlay.classList.remove('hidden'); });
}

function obj(v, fallback = {}) { return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback; }
function mergeStringArrays(a, b) {
  const map = new Map();
  [...safeArray(a), ...safeArray(b)].forEach((item) => {
    const val = text(item).trim();
    if (!val) return;
    const key = normalize(val);
    if (!map.has(key)) map.set(key, val);
  });
  return Array.from(map.values());
}
function uniqueBy(list, keyFn, mergeFn) {
  const map = new Map();
  safeArray(list).forEach((item) => {
    const key = normalize(keyFn(item));
    if (!key) return;
    if (!map.has(key)) map.set(key, item);
    else map.set(key, mergeFn ? mergeFn(map.get(key), item) : { ...map.get(key), ...item });
  });
  return Array.from(map.values());
}
function prefer(oldVal, newVal) {
  const oldTxt = text(oldVal).trim();
  const newTxt = text(newVal).trim();
  if (oldTxt && oldTxt.toLowerCase() !== 'unknown') return oldVal;
  return newTxt ? newVal : oldVal;
}
function normalizeFault(f = {}) {
  return {
    code: text(f.code),
    title: text(f.title),
    description: text(f.description),
    cause: text(f.cause),
    checks: mergeStringArrays(f.checks, []),
    repair: mergeStringArrays(f.repair || f.remedy, []),
    source_ref: text(f.source_ref),
    verified: Boolean(f.verified),
    confidence: text(f.confidence || '')
  };
}
function normalizeBoard(b = {}) {
  return {
    name: text(b.name),
    serial: text(b.serial),
    notes: text(b.notes),
    verify_by_sticker: Boolean(b.verify_by_sticker),
    image: text(b.image),
    source_ref: text(b.source_ref),
    verified: Boolean(b.verified)
  };
}
function normalizePart(p = {}) {
  return {
    part_name: text(p.part_name),
    part_number: text(p.part_number),
    notes: text(p.notes),
    verify_by_sticker: Boolean(p.verify_by_sticker),
    source_ref: text(p.source_ref),
    verified: Boolean(p.verified)
  };
}
function normalizeDoc(d = {}) {
  return { title: text(d.title), url: text(d.url), type: text(d.type), source_ref: text(d.source_ref) };
}
function normalizeImage(i = {}) {
  return { title: text(i.title), url: text(i.url), type: text(i.type), source_ref: text(i.source_ref) };
}
function normalizeSource(s = {}) {
  return { id: text(s.id), title: text(s.title), type: text(s.type), url: text(s.url), verified: Boolean(s.verified), notes: text(s.notes) };
}
function mergeFaults(oldFaults, newFaults) {
  return uniqueBy(
    [...safeArray(oldFaults).map(normalizeFault), ...safeArray(newFaults).map(normalizeFault)],
    (f) => `${f.code} ${f.title}`,
    (a, b) => ({
      code: a.code || b.code,
      title: a.title || b.title,
      description: prefer(a.description, b.description),
      cause: prefer(a.cause, b.cause),
      checks: mergeStringArrays(a.checks, b.checks),
      repair: mergeStringArrays(a.repair, b.repair),
      source_ref: prefer(a.source_ref, b.source_ref),
      verified: a.verified || b.verified,
      confidence: prefer(a.confidence, b.confidence)
    })
  );
}
function mergeBoards(oldBoards, newBoards) {
  return uniqueBy(
    [...safeArray(oldBoards).map(normalizeBoard), ...safeArray(newBoards).map(normalizeBoard)],
    (b) => `${b.name} ${b.serial}`,
    (a, b) => ({
      name: a.name || b.name,
      serial: prefer(a.serial, b.serial),
      notes: prefer(a.notes, b.notes),
      verify_by_sticker: a.verify_by_sticker || b.verify_by_sticker,
      image: prefer(a.image, b.image),
      source_ref: prefer(a.source_ref, b.source_ref),
      verified: a.verified || b.verified
    })
  );
}
function mergeParts(oldParts, newParts) {
  return uniqueBy(
    [...safeArray(oldParts).map(normalizePart), ...safeArray(newParts).map(normalizePart)],
    (p) => `${p.part_name} ${p.part_number}`,
    (a, b) => ({
      part_name: a.part_name || b.part_name,
      part_number: prefer(a.part_number, b.part_number),
      notes: prefer(a.notes, b.notes),
      verify_by_sticker: a.verify_by_sticker || b.verify_by_sticker,
      source_ref: prefer(a.source_ref, b.source_ref),
      verified: a.verified || b.verified
    })
  );
}
function mergeDocs(oldDocs, newDocs) {
  return uniqueBy(
    [...safeArray(oldDocs).map(normalizeDoc), ...safeArray(newDocs).map(normalizeDoc)],
    (d) => `${d.title} ${d.url}`,
    (a, b) => ({ title: a.title || b.title, url: prefer(a.url, b.url), type: prefer(a.type, b.type), source_ref: prefer(a.source_ref, b.source_ref) })
  );
}
function mergeImages(oldImages, newImages) {
  return uniqueBy(
    [...safeArray(oldImages).map(normalizeImage), ...safeArray(newImages).map(normalizeImage)],
    (i) => `${i.title} ${i.url}`,
    (a, b) => ({ title: a.title || b.title, url: prefer(a.url, b.url), type: prefer(a.type, b.type), source_ref: prefer(a.source_ref, b.source_ref) })
  );
}
function mergeSources(oldSources, newSources) {
  return uniqueBy(
    [...safeArray(oldSources).map(normalizeSource), ...safeArray(newSources).map(normalizeSource)],
    (s) => s.id || `${s.title} ${s.url}`,
    (a, b) => ({ id: a.id || b.id, title: prefer(a.title, b.title), type: prefer(a.type, b.type), url: prefer(a.url, b.url), verified: a.verified || b.verified, notes: prefer(a.notes, b.notes) })
  );
}
function normalizeModel(m = {}, index = 0) {
  const years = obj(m.years);
  const serviceIdentity = obj(m.service_identity);
  const dc = obj(m.data_confidence);
  return {
    id: text(m.id || slugify(m.model || m.display_name || `model-${index + 1}`)),
    model: text(m.model),
    display_name: text(m.display_name || m.model),
    category: text(m.category),
    series: text(m.series),
    generation: text(m.generation),
    capacity_kg: m.capacity_kg == null ? '' : m.capacity_kg,
    sort_order: Number(m.sort_order || index + 1),
    aliases: mergeStringArrays(m.aliases, []),
    service_notes: text(m.service_notes),
    years: { from: Number(years.from || 0), to: Number(years.to || 0) },
    service_identity: {
      platform_family: text(serviceIdentity.platform_family),
      sticker_required: Boolean(serviceIdentity.sticker_required),
      notes: text(serviceIdentity.notes)
    },
    faults: mergeFaults([], m.faults),
    boards: mergeBoards([], m.boards),
    parts: mergeParts([], m.parts),
    documents: mergeDocs([], m.documents),
    wiring: mergeImages([], m.wiring),
    images: mergeImages([], m.images),
    data_confidence: {
      faults: text(dc.faults),
      boards: text(dc.boards),
      parts: text(dc.parts),
      manuals: text(dc.manuals)
    }
  };
}
function mergeOneModel(oldModel, newModel) {
  const a = normalizeModel(oldModel);
  const b = normalizeModel(newModel);
  return {
    id: a.id || b.id,
    model: a.model || b.model,
    display_name: prefer(a.display_name, b.display_name),
    category: prefer(a.category, b.category),
    series: prefer(a.series, b.series),
    generation: prefer(a.generation, b.generation),
    capacity_kg: a.capacity_kg || b.capacity_kg,
    sort_order: Math.min(Number(a.sort_order || 999999), Number(b.sort_order || 999999)),
    aliases: mergeStringArrays(a.aliases, b.aliases),
    service_notes: prefer(a.service_notes, b.service_notes),
    years: {
      from: a.years.from || b.years.from || 0,
      to: a.years.to || b.years.to || 0
    },
    service_identity: {
      platform_family: prefer(a.service_identity.platform_family, b.service_identity.platform_family),
      sticker_required: a.service_identity.sticker_required || b.service_identity.sticker_required,
      notes: prefer(a.service_identity.notes, b.service_identity.notes)
    },
    faults: mergeFaults(a.faults, b.faults),
    boards: mergeBoards(a.boards, b.boards),
    parts: mergeParts(a.parts, b.parts),
    documents: mergeDocs(a.documents, b.documents),
    wiring: mergeImages(a.wiring, b.wiring),
    images: mergeImages(a.images, b.images),
    data_confidence: {
      faults: prefer(a.data_confidence.faults, b.data_confidence.faults),
      boards: prefer(a.data_confidence.boards, b.data_confidence.boards),
      parts: prefer(a.data_confidence.parts, b.data_confidence.parts),
      manuals: prefer(a.data_confidence.manuals, b.data_confidence.manuals)
    }
  };
}
function mergeBrandDocs(oldDoc, newDoc) {
  const oldD = obj(oldDoc);
  const newD = obj(newDoc);
  const oldModels = safeArray(oldD.models);
  const newModels = safeArray(newD.models);
  const modelMap = new Map();

  oldModels.forEach((m, idx) => {
    const normModel = normalizeModel(m, idx);
    const key = normalize(normModel.id || normModel.model || normModel.display_name);
    if (key) modelMap.set(key, normModel);
  });

  newModels.forEach((m, idx) => {
    const normModel = normalizeModel(m, idx);
    const key = normalize(normModel.id || normModel.model || normModel.display_name);
    if (!key) return;
    if (!modelMap.has(key)) modelMap.set(key, normModel);
    else modelMap.set(key, mergeOneModel(modelMap.get(key), normModel));
  });

  return {
    brand: {
      id: oldD.brand?.id || newD.brand?.id || '',
      name_en: oldD.brand?.name_en || newD.brand?.name_en || '',
      name_ar: oldD.brand?.name_ar || newD.brand?.name_ar || '',
      logo: oldD.brand?.logo || newD.brand?.logo || '',
      color: oldD.brand?.color || newD.brand?.color || '#1f6fff'
    },
    updated_at: new Date().toISOString().slice(0, 10),
    coverage_notes: oldD.coverage_notes || newD.coverage_notes || '',
    source_registry: mergeSources(oldD.source_registry, newD.source_registry),
    models: Array.from(modelMap.values()).sort((a, b) => String(a.model || '').localeCompare(String(b.model || ''), undefined, { numeric: true, sensitivity: 'base' }))
  };
}

async function loadCloudRegistry(){ try { const res = await fetch('/api/cloud-brand?brand=__brand_registry__'); if(!res.ok) return []; const data = await res.json(); return safeArray(data?.data?.brands); } catch { return []; } }
async function boot(){
  bindLogin();
  const base = await loadJSON('data/brands.json');
  const local = getLocalRegistry();
  const cloud = await loadCloudRegistry();
  const map = new Map(); [...safeArray(base.brands), ...cloud, ...local].forEach(b => { if (b?.id) map.set(b.id,b); });
  adminState.brands = Array.from(map.values());
  for (const brand of adminState.brands){
    const override = loadOverride(brand.id);
    if (override) { adminState.docs[brand.id] = override; continue; }
    try { adminState.docs[brand.id] = await loadJSON(brand.data_file || `data/brands/${brand.id}.json`); }
    catch { adminState.docs[brand.id] = { brand, updated_at: new Date().toISOString().slice(0,10), coverage_notes: 'New brand or missing file.', source_registry: [], models: [] }; }
  }
  fillBrandSelect();
  bindEvents();
  if (adminState.brands[0]) { adminState.activeBrand = adminState.brands[0].id; $('#brandSelect').value = adminState.activeBrand; renderEditor(); }
}
function bindEvents(){
  $('#brandSelect')?.addEventListener('change', ()=> { adminState.activeBrand = $('#brandSelect').value; renderEditor(); });
  $('#homeBtn')?.addEventListener('click', ()=> window.location.href = 'index.html');
  $('#saveOverrideBtn')?.addEventListener('click', saveCurrentOverride);
  $('#resetOverrideBtn')?.addEventListener('click', resetCurrentOverride);
  $('#exportBrandBtn')?.addEventListener('click', exportCurrentBrand);
  $('#cloudSaveBtn')?.addEventListener('click', cloudSaveCurrentBrand);
  $('#cloudLoadBtn')?.addEventListener('click', cloudLoadCurrentBrand);
  $('#applyAiBtn')?.addEventListener('click', applyAIUpdate);
  $('#updateAllBtn')?.addEventListener('click', updateAllBrands);
  $('#addBrandBtn')?.addEventListener('click', addBrand);
  $('#saveRegistryCloudBtn')?.addEventListener('click', saveRegistryToCloud);
}
function fillBrandSelect(){ $('#brandSelect').innerHTML = adminState.brands.map(b => `<option value="${b.id}">${b.name_en} · ${b.name_ar || ''}</option>`).join(''); }
function renderEditor(){ const bid = adminState.activeBrand; $('#brandJson').value = adminState.docs[bid] ? JSON.stringify(adminState.docs[bid], null, 2) : ''; }
function saveCurrentOverride(){ const bid = adminState.activeBrand; if(!bid) return setStatus('Select a brand first.', true); try { const parsed = JSON.parse($('#brandJson').value || '{}'); adminState.docs[bid] = parsed; saveOverride(bid, parsed); setStatus(`Saved local override for ${bid}.`); } catch(err){ setStatus(`Invalid JSON: ${err.message}`, true); } }
function resetCurrentOverride(){ const bid = adminState.activeBrand; localStorage.removeItem(`washer_doc_override_${bid}`); setStatus(`Removed override for ${bid}. Reload page to restore the base file.`); }
function exportCurrentBrand(){ const bid = adminState.activeBrand; const blob = new Blob([JSON.stringify(adminState.docs[bid], null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${bid}.json`; a.click(); }
async function cloudSaveCurrentBrand(){ const bid = adminState.activeBrand; try { setStatus(`Saving ${bid} to cloud...`); const res = await fetch('/api/cloud-brand', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ brand: bid, data: adminState.docs[bid] }) }); const data = await res.json(); if(!res.ok) throw new Error(data?.error || 'Cloud save failed'); setStatus(`Saved ${bid} to cloud.`); } catch(err){ setStatus(err.message, true); } }
async function cloudLoadCurrentBrand(){ const bid = adminState.activeBrand; try { setStatus(`Loading ${bid} from cloud...`); const res = await fetch(`/api/cloud-brand?brand=${encodeURIComponent(bid)}`); const data = await res.json(); if(!res.ok) throw new Error(data?.error || 'Cloud load failed'); if(!data?.data) throw new Error('No cloud brand found'); adminState.docs[bid] = data.data; saveOverride(bid, data.data); renderEditor(); setStatus(`Loaded ${bid} from cloud.`); } catch(err){ setStatus(err.message, true); } }
async function saveRegistryToCloud(){ try { setStatus('Saving brand registry to cloud...'); const res = await fetch('/api/cloud-brand', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ brand: '__brand_registry__', data: { brands: adminState.brands } }) }); const data = await res.json(); if(!res.ok) throw new Error(data?.error || 'Failed to save registry'); setStatus('Brand registry saved to cloud.'); } catch(err){ setStatus(err.message, true); } }
function addBrand(){
  const id = slugify($('#newBrandId').value || '');
  const name_en = text($('#newBrandNameEn').value).trim();
  const name_ar = text($('#newBrandNameAr').value).trim();
  const color = text($('#newBrandColor').value || '#1f6fff').trim() || '#1f6fff';
  if(!id || !name_en) return setStatus('Brand id and English name are required.', true);
  if(adminState.brands.some(b => b.id === id)) return setStatus('Brand id already exists.', true);
  const brand = { id, name_en, name_ar, color, logo: `assets/brands/${id}.svg`, data_file: `data/brands/${id}.json` };
  adminState.brands.push(brand);
  adminState.docs[id] = { brand, updated_at: new Date().toISOString().slice(0,10), coverage_notes: 'New brand created from admin page. Add verified models and sources.', source_registry: [], models: [] };
  const local = getLocalRegistry().filter(b => b.id !== id); local.push(brand); saveLocalRegistry(local); saveOverride(id, adminState.docs[id]);
  fillBrandSelect(); adminState.activeBrand = id; $('#brandSelect').value = id; renderEditor(); setStatus(`Added brand ${id}. Upload or create matching SVG later if needed.`);
}
async function applyAIUpdate(){
  const bid = adminState.activeBrand;
  const instruction = $('#aiInstruction').value.trim() || `Add verified models and fill missing data only. Do not remove existing models. Do not omit existing faults, boards, parts, documents, wiring, or images. Return additive updates suitable for merge.`;
  try {
    setStatus(`Applying AI update to ${bid}...`);
    const oldDoc = adminState.docs[bid] || { brand: adminState.brands.find(b => b.id === bid), source_registry: [], models: [] };
    const res = await fetch('/api/brand-update', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ brand: bid, instruction, currentData: oldDoc }) });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || 'AI update failed');
    const merged = mergeBrandDocs(oldDoc, data);
    adminState.docs[bid] = merged;
    saveOverride(bid, merged);
    renderEditor();
    setStatus(`AI merged ${bid}. Models before: ${safeArray(oldDoc.models).length}, after: ${safeArray(merged.models).length}. Review then Cloud Save if needed.`);
  } catch(err){ setStatus(err.message, true); }
}
async function updateAllBrands(){
  try {
    setStatus('Updating all brands with AI...');
    const instruction = $('#aiInstruction').value.trim() || 'Add verified models and fill missing data only. Do not remove existing models. Return additive updates suitable for merge.';
    const payload = adminState.brands.map(b => adminState.docs[b.id]).filter(Boolean);
    const res = await fetch('/api/brand-update-all', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ brands: payload, instruction }) });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || 'Update all failed');
    safeArray(data.brands).forEach(doc => {
      const bid = doc?.brand?.id;
      if(!bid) return;
      const oldDoc = adminState.docs[bid] || { brand: doc.brand, source_registry: [], models: [] };
      const merged = mergeBrandDocs(oldDoc, doc);
      adminState.docs[bid] = merged;
      saveOverride(bid, merged);
    });
    renderEditor();
    setStatus('AI merged all returned brands. Review each one before Cloud Save.');
  } catch(err){ setStatus(err.message, true); }
}
boot().catch(err => setStatus(err.message, true));
