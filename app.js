
const AUTH = {
  user: localStorage.getItem("washer_user") || "admin",
  pass: localStorage.getItem("washer_pass") || "1234"
};
const state = { brands: [], docs: {}, activeBrand: null, activeModel: null, search: "", currentTab: "overview" };
const $ = (s) => document.querySelector(s);
const safeArray = (v) => Array.isArray(v) ? v : [];
const text = (v) => v == null ? "" : String(v);
const normalize = (v) => text(v).trim().toLowerCase();

function esc(str) {
  return text(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function loadJSON(path) { const r = await fetch(path, { cache: "no-store" }); if (!r.ok) throw new Error(`Failed to load ${path}`); return r.json(); }
function loginOk() { return sessionStorage.getItem("washer_auth") === "ok"; }
function bindLogin() {
  const overlay = $("#loginOverlay");
  if (!overlay) return;
  if (loginOk()) overlay.classList.add("hidden");
  $("#loginBtn")?.addEventListener("click", () => {
    const u = $("#loginUser").value.trim();
    const p = $("#loginPass").value.trim();
    if (u === AUTH.user && p === AUTH.pass) {
      sessionStorage.setItem("washer_auth", "ok");
      overlay.classList.add("hidden");
      $("#loginMsg").textContent = "";
    } else $("#loginMsg").textContent = "Wrong username or password";
  });
  $("#logoutBtn")?.addEventListener("click", () => { sessionStorage.removeItem("washer_auth"); overlay.classList.remove("hidden"); });
}
function getLocalBrands(){ try { return JSON.parse(localStorage.getItem("washer_brand_registry_local")||"[]"); } catch { return []; } }
async function loadCloudRegistry(){ try { const r = await fetch("/api/cloud-brand?brand=__brand_registry__"); if(!r.ok) return []; const d = await r.json(); return safeArray(d?.data?.brands); } catch { return []; } }
function getOverride(id){ try { return JSON.parse(localStorage.getItem(`washer_doc_override_${id}`)||"null"); } catch { return null; } }
function setCrumbs(parts){ $("#crumbs").textContent = parts.join(" / ") || "Home"; }
function updateStats(){ const total = state.brands.reduce((n,b)=> n + safeArray(state.docs[b.id]?.models).length, 0); $("#statsBox").textContent = `${state.brands.length} brands · ${total} models loaded`; }

function normalizeModel(m, idx=0){
  return {
    id: text(m.id || m.model || `model-${idx}`), model: text(m.model || m.display_name || ""), display_name: text(m.display_name || m.model || ""),
    category: text(m.category || ""), series: text(m.series || ""), generation: text(m.generation || ""), capacity_kg: text(m.capacity_kg || ""), sort_order: Number(m.sort_order || idx+1),
    aliases: safeArray(m.aliases), service_notes: text(m.service_notes || ""), years: m.years || { from: 0, to: 0 },
    service_identity: { platform_family: text(m.service_identity?.platform_family || ""), sticker_required: !!m.service_identity?.sticker_required, notes: text(m.service_identity?.notes || "") },
    faults: safeArray(m.faults).map(f => ({...f, repair: safeArray(f.repair || f.remedy)})),
    boards: safeArray(m.boards), parts: safeArray(m.parts), documents: safeArray(m.documents), wiring: safeArray(m.wiring), images: safeArray(m.images), data_confidence: m.data_confidence || {}
  };
}
function normalizeDoc(doc, brandFallback){
  const brand = { ...(brandFallback || {}), ...(doc.brand || {}) };
  return { ...doc, brand, models: safeArray(doc.models).map(normalizeModel).sort((a,b)=> (a.sort_order-b.sort_order)||a.model.localeCompare(b.model,undefined,{numeric:true,sensitivity:'base'})), source_registry: safeArray(doc.source_registry) };
}

async function boot(){
  bindLogin();
  const base = await loadJSON("data/brands.json");
  const local = getLocalBrands();
  const cloud = await loadCloudRegistry();
  const map = new Map();
  [...safeArray(base.brands), ...cloud, ...local].forEach(b => { if (b?.id) map.set(b.id, b); });
  state.brands = Array.from(map.values());
  for (const b of state.brands){
    const override = getOverride(b.id);
    if (override) { state.docs[b.id] = normalizeDoc(override, b); continue; }
    try { state.docs[b.id] = normalizeDoc(await loadJSON(b.data_file || `data/brands/${b.id}.json`), b); }
    catch { state.docs[b.id] = normalizeDoc({ brand: b, models: [], source_registry: [] }, b); }
  }
  state.activeBrand = state.brands[0]?.id || null;
  updateStats();
  renderBrandList();
  bindEvents();
  showHome();
}
function bindEvents(){
  $("#searchBtn")?.addEventListener("click", runSearch);
  $("#globalSearch")?.addEventListener("keydown", e => { if (e.key === "Enter") runSearch(); });
  $("#homeBtn")?.addEventListener("click", showHome);
  $("#adminBtn")?.addEventListener("click", ()=> window.location.href = "admin.html");
}
function renderBrandList(){
  const root = $("#brandList"); root.innerHTML = "";
  state.brands.forEach(brand => {
    const btn = document.createElement("button");
    btn.className = "brand-btn" + (state.activeBrand === brand.id ? " active" : "");
    btn.innerHTML = `${brand.logo ? `<img src="${brand.logo}" alt="${esc(brand.name_en)}">` : ""}<div><div>${esc(brand.name_en)}</div><small class="muted">${esc(brand.name_ar || "")}</small></div>`;
    btn.onclick = ()=>{ state.activeBrand = brand.id; state.activeModel = null; renderBrandList(); showBrand(brand.id); };
    root.appendChild(btn);
  });
}
function showHome(){
  setCrumbs(["Home"]);
  const cards = state.brands.map(b => {
    const count = safeArray(state.docs[b.id]?.models).length;
    return `<div class="card"><div class="topline"><span class="pill">${count} models</span></div><h3>${esc(b.name_en)}</h3><div class="muted">${esc(b.name_ar || "")}</div><div class="row"><button onclick="openBrand('${esc(b.id)}')">Open brand</button></div></div>`;
  }).join("");
  $("#viewRoot").innerHTML = `<h2 class="section-title">Dashboard</h2><div class="grid">${cards}</div>`;
}
window.openBrand = function(id){ state.activeBrand = id; renderBrandList(); showBrand(id); };
function showBrand(brandId){
  const brand = state.brands.find(b => b.id === brandId) || { id: brandId, name_en: brandId };
  const doc = state.docs[brandId] || { models: [] };
  const models = safeArray(doc.models);
  setCrumbs(["Home", brand.name_en]);
  $("#viewRoot").innerHTML = `<div class="brand-header"><div class="brand-wrap">${brand.logo ? `<img class="hero-brand-logo" src="${brand.logo}" alt="${esc(brand.name_en)}">` : ""}<div><h2 class="section-title">${esc(brand.name_en)} · ${esc(brand.name_ar || "")}</h2><div class="muted">${models.length} models</div></div></div><button class="ghost-btn" onclick="showHome()">Dashboard</button></div><div class="grid">${models.map(m=>renderModelCard(m, brandId)).join("")}</div>`;
}
window.showHome = showHome;
function renderModelCard(m, brandId){
  return `<div class="card"><div class="topline"><span class="pill">${esc(m.category || 'Model')}</span>${m.capacity_kg ? `<span class="pill">${esc(m.capacity_kg)} kg</span>` : ""}${m.generation ? `<span class="pill">${esc(m.generation)}</span>` : ""}</div><h3>${esc(m.display_name || m.model)}</h3><div class="muted">${esc(m.model || '')}</div><div class="muted">${safeArray(m.faults).length} faults · ${safeArray(m.boards).length} boards · ${safeArray(m.parts).length} parts</div><div class="row"><button onclick="openModel('${esc(brandId)}','${esc(m.id)}')">Details</button></div></div>`;
}
window.openModel = function(brandId, modelId){ state.activeBrand = brandId; state.activeModel = modelId; state.currentTab = 'overview'; renderBrandList(); showModel(brandId, modelId); };
function sourceTag(item){ return item?.source_ref ? `<span class="source-tag">source: ${esc(item.source_ref)}</span>` : ''; }
function listFaults(items){ if(!items.length) return `<div class="empty">No error codes added yet.</div>`; return items.map(f => `<div class="detail-card"><div class="topline"><span class="pill">${esc(f.code)}</span>${sourceTag(f)}</div><h3>${esc(f.title || '')}</h3><div class="muted">${esc(f.description || '')}</div>${f.cause ? `<div class="kv"><strong>Cause</strong><div>${esc(f.cause)}</div></div>` : ''}${safeArray(f.checks).length ? `<div><strong>Checks</strong><ul class="clean-list">${safeArray(f.checks).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${safeArray(f.repair||f.remedy).length ? `<div><strong>Repair</strong><ul class="clean-list">${safeArray(f.repair||f.remedy).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>`).join(''); }
function listBoards(items){ if(!items.length) return `<div class="empty">No boards added yet.</div>`; return items.map(b => `<div class="detail-card"><div class="topline">${sourceTag(b)}${b.verify_by_sticker ? `<span class="pill">verify by sticker</span>` : ''}</div><h3>${esc(b.name || '')}</h3><div class="kv"><strong>Serial</strong><div>${esc(b.serial || '-')}</div></div><div class="kv"><strong>Notes</strong><div>${esc(b.notes || '')}</div></div>${b.image ? `<a target="_blank" rel="noopener" href="${esc(b.image)}">Open image</a>` : ''}</div>`).join(''); }
function listParts(items){ if(!items.length) return `<div class="empty">No parts added yet.</div>`; return items.map(p => `<div class="detail-card"><div class="topline">${sourceTag(p)}${p.verify_by_sticker ? `<span class="pill">verify by sticker</span>` : ''}</div><h3>${esc(p.part_name || '')}</h3><div class="kv"><strong>Part number</strong><div>${esc(p.part_number || '-')}</div></div><div class="kv"><strong>Notes</strong><div>${esc(p.notes || '')}</div></div></div>`).join(''); }
function listLinks(items, empty){ if(!items.length) return `<div class="empty">${empty}</div>`; return items.map(d => `<div class="detail-card"><div class="topline">${d.type ? `<span class="pill">${esc(d.type)}</span>` : ''}${sourceTag(d)}</div><h3>${esc(d.title || d.name || 'Link')}</h3>${d.url ? `<a target="_blank" rel="noopener" href="${esc(d.url)}">Open link</a>` : ''}${d.notes ? `<div class="muted">${esc(d.notes)}</div>` : ''}</div>`).join(''); }
function showModel(brandId, modelId){
  const brand = state.brands.find(b => b.id === brandId) || { name_en: brandId };
  const model = safeArray(state.docs[brandId]?.models).find(m => m.id === modelId);
  if (!model) return;
  setCrumbs(["Home", brand.name_en, model.model]);
  const tabs = [ ['overview','Overview'], ['faults','Errors'], ['boards','Boards'], ['parts','Parts'], ['manuals','Manuals'] ].map(([id,label]) => `<button class="tab-btn ${state.currentTab===id?'active':''}" onclick="switchTab('${id}','${esc(brandId)}','${esc(modelId)}')">${label}</button>`).join('');
  let body = '';
  if (state.currentTab === 'overview') body = `<div class="details-grid"><section class="detail-card"><h3>Model information</h3><div class="kv"><strong>Model</strong><div>${esc(model.model || '-')}</div></div><div class="kv"><strong>Display</strong><div>${esc(model.display_name || '-')}</div></div><div class="kv"><strong>Category</strong><div>${esc(model.category || '-')}</div></div><div class="kv"><strong>Series</strong><div>${esc(model.series || '-')}</div></div><div class="kv"><strong>Capacity</strong><div>${esc(model.capacity_kg || '-')}</div></div><div class="kv"><strong>Years</strong><div>${model.years?.from || '-'} — ${model.years?.to || '-'}</div></div><div class="kv"><strong>Platform</strong><div>${esc(model.service_identity?.platform_family || '-')}</div></div><div class="kv"><strong>Sticker required</strong><div>${model.service_identity?.sticker_required ? 'Yes' : 'No'}</div></div><div class="kv"><strong>Notes</strong><div>${esc(model.service_identity?.notes || model.service_notes || '-')}</div></div><div class="kv"><strong>Aliases</strong><div>${esc(safeArray(model.aliases).join(' · ') || '-')}</div></div></section><section class="detail-card"><h3>Coverage</h3><div class="kv"><strong>Faults</strong><div>${esc(model.data_confidence?.faults || '-')}</div></div><div class="kv"><strong>Boards</strong><div>${esc(model.data_confidence?.boards || '-')}</div></div><div class="kv"><strong>Parts</strong><div>${esc(model.data_confidence?.parts || '-')}</div></div><div class="kv"><strong>Manuals</strong><div>${esc(model.data_confidence?.manuals || '-')}</div></div></section></div>`;
  if (state.currentTab === 'faults') body = listFaults(safeArray(model.faults));
  if (state.currentTab === 'boards') body = `<div class="details-grid">${listBoards(safeArray(model.boards))}</div>`;
  if (state.currentTab === 'parts') body = `<div class="details-grid">${listParts(safeArray(model.parts))}</div>`;
  if (state.currentTab === 'manuals') body = `<div class="details-grid">${listLinks(safeArray(model.documents), 'No documents added yet.')}${listLinks(safeArray(model.wiring), 'No wiring links added yet.')}${listLinks(safeArray(model.images), 'No images added yet.')}</div>`;
  $("#viewRoot").innerHTML = `<div class="brand-header"><div><h2 class="section-title">${esc(model.display_name || model.model)}</h2><div class="topline"><span class="pill">${esc(brand.name_en)}</span>${model.category ? `<span class="pill">${esc(model.category)}</span>` : ''}${model.capacity_kg ? `<span class="pill">${esc(model.capacity_kg)} kg</span>` : ''}</div></div><button class="ghost-btn" onclick="openBrand('${esc(brandId)}')">Back to models</button></div><div class="tabs">${tabs}</div>${body}`;
}
window.switchTab = function(tab, brandId, modelId){ state.currentTab = tab; showModel(brandId, modelId); };
function runSearch(){
  const q = normalize($("#globalSearch")?.value || '');
  if (!q) return state.activeBrand ? showBrand(state.activeBrand) : showHome();
  const results = [];
  state.brands.forEach(brand => {
    safeArray(state.docs[brand.id]?.models).forEach(model => {
      const hay = [model.model, model.display_name, model.category, model.series, model.generation, model.capacity_kg, model.service_identity?.platform_family, ...safeArray(model.aliases)].join(' ');
      let matched = normalize(hay).includes(q);
      if (!matched) matched = safeArray(model.faults).some(f => normalize([f.code, f.title, f.description, f.cause, ...safeArray(f.checks), ...safeArray(f.repair||f.remedy)].join(' ')).includes(q));
      if (!matched) matched = safeArray(model.boards).some(b => normalize([b.name, b.serial, b.notes].join(' ')).includes(q));
      if (!matched) matched = safeArray(model.parts).some(p => normalize([p.part_name, p.part_number, p.notes].join(' ')).includes(q));
      if (matched) results.push({ brand, model });
    });
  });
  setCrumbs(["Search", q]);
  $("#viewRoot").innerHTML = results.length ? `<h2 class="section-title">Search results</h2><div class="grid">${results.map(r => renderModelCard(r.model, r.brand.id)).join('')}</div>` : `<div class="empty">No results found for <strong>${esc(q)}</strong>.</div>`;
}
boot().catch(err => { $("#statsBox").textContent = err.message; $("#statsBox").style.color = '#ff9ca3'; $("#viewRoot").innerHTML = `<div class="empty">${esc(err.message)}</div>`; });
