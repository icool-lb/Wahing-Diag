
const state = {
  brands: [],
  docs: {},
  activeBrand: null,
  activeModel: null,
  search: ""
};

const $ = (s) => document.querySelector(s);
const safeArray = (v) => Array.isArray(v) ? v : [];
const text = (v) => v == null ? "" : String(v);
const normalize = (v) => text(v).trim().toLowerCase();

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function escapeHtml(str) {
  return text(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getLocalBrands() {
  try { return JSON.parse(localStorage.getItem("washer_brand_registry_local") || "[]"); }
  catch { return []; }
}

async function loadCloudRegistry() {
  try {
    const res = await fetch("/api/cloud-brand?brand=__brand_registry__");
    if (!res.ok) return [];
    const data = await res.json();
    return safeArray(data?.data?.brands);
  } catch {
    return [];
  }
}

async function boot() {
  const base = await loadJSON("data/brands.json");
  const local = getLocalBrands();
  const cloud = await loadCloudRegistry();
  const map = new Map();
  [...safeArray(base.brands), ...cloud, ...local].forEach(b => { if (b?.id) map.set(b.id, b); });
  state.brands = Array.from(map.values());
  for (const brand of state.brands) {
    const override = localStorage.getItem(`washer_doc_override_${brand.id}`);
    if (override) {
      try { state.docs[brand.id] = JSON.parse(override); continue; } catch {}
    }
    try {
      const path = brand.data_file || `data/brands/${brand.id}.json`;
      state.docs[brand.id] = await loadJSON(path);
    } catch {
      state.docs[brand.id] = { brand, models: [], source_registry: [] };
    }
  }
  renderBrandList();
  const first = state.brands[0]?.id || null;
  state.activeBrand = first;
  updateStats();
  showHome();
  bindEvents();
}

function bindEvents() {
  $("#searchBtn")?.addEventListener("click", runSearch);
  $("#globalSearch")?.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
  $("#homeBtn")?.addEventListener("click", showHome);
  $("#adminBtn")?.addEventListener("click", () => { window.location.href = "admin.html"; });
}

function updateStats() {
  const total = state.brands.reduce((sum, b) => sum + safeArray(state.docs[b.id]?.models).length, 0);
  $("#statsBox").textContent = `${state.brands.length} brands · ${total} models loaded`;
}

function renderBrandList() {
  const root = $("#brandList");
  root.innerHTML = "";
  state.brands.forEach(brand => {
    const btn = document.createElement("button");
    btn.className = "brand-btn" + (state.activeBrand === brand.id ? " active" : "");
    btn.innerHTML = `${brand.logo ? `<img src="${brand.logo}" alt="${escapeHtml(brand.name_en)}">` : ""}<div><div>${escapeHtml(brand.name_en)}</div><small>${escapeHtml(brand.name_ar || "")}</small></div>`;
    btn.onclick = () => {
      state.activeBrand = brand.id;
      state.activeModel = null;
      renderBrandList();
      showBrand(brand.id);
    };
    root.appendChild(btn);
  });
}

function setCrumbs(parts) {
  $("#crumbs").textContent = parts.join(" / ");
}

function showHome() {
  setCrumbs(["Home"]);
  const cards = state.brands.map(b => {
    const count = safeArray(state.docs[b.id]?.models).length;
    return `<div class="card"><div class="topline"><span class="pill">${count} models</span></div><h3>${escapeHtml(b.name_en)}</h3><div class="muted">${escapeHtml(b.name_ar || "")}</div><div class="row"><button onclick="openBrand('${escapeHtml(b.id)}')">Open brand</button></div></div>`;
  }).join("");
  $("#viewRoot").innerHTML = `<h2 class="section-title">Dashboard</h2><div class="grid">${cards}</div>`;
}
window.openBrand = (id) => { state.activeBrand = id; renderBrandList(); showBrand(id); };

function sortModels(arr) {
  return [...safeArray(arr)].sort((a,b) => (Number(a.sort_order||0)-Number(b.sort_order||0)) || text(a.model).localeCompare(text(b.model), undefined, {numeric:true,sensitivity:'base'}));
}

function showBrand(brandId) {
  const brand = state.brands.find(b => b.id === brandId);
  const doc = state.docs[brandId] || { models: [] };
  const models = sortModels(doc.models);
  setCrumbs(["Home", brand?.name_en || brandId]);
  $("#viewRoot").innerHTML = `
    <div class="hero-row">
      <div class="brand-wrap">${brand?.logo ? `<img class="hero-brand-logo" src="${brand.logo}" alt="${escapeHtml(brand.name_en)}">` : ''}
      <div><h2 class="section-title">${escapeHtml(brand?.name_en || brandId)} · ${escapeHtml(brand?.name_ar || '')}</h2><div class="muted">${models.length} models</div></div></div>
      <button class="ghost-btn" onclick="showHome()">Dashboard</button>
    </div>
    <div class="grid">${models.map(m => renderModelCard(m, brandId)).join("")}</div>`;
}
window.showHome = showHome;

function renderModelCard(model, brandId) {
  return `<div class="card"><div class="topline"><span class="pill">${escapeHtml(model.category || 'Model')}</span>${model.capacity_kg ? `<span class="pill">${escapeHtml(model.capacity_kg)} kg</span>` : ''}</div><h3>${escapeHtml(model.display_name || model.model)}</h3><div class="muted">${escapeHtml(model.model || '')}</div><div class="muted">${safeArray(model.faults).length} faults · ${safeArray(model.boards).length} boards · ${safeArray(model.parts).length} parts</div><div class="row"><button onclick="openModel('${escapeHtml(brandId)}','${escapeHtml(model.id)}')">Details</button></div></div>`;
}

window.openModel = (brandId, modelId) => {
  state.activeBrand = brandId;
  state.activeModel = modelId;
  renderBrandList();
  showModel(brandId, modelId);
};

function renderSourceTag(item) {
  const ref = item?.source_ref;
  return ref ? `<span class="source-tag">source: ${escapeHtml(ref)}</span>` : '';
}

function listRenderer(items, type) {
  if (!safeArray(items).length) return `<div class="empty">No ${type} added yet.</div>`;
  return `<ul class="clean-list">${items.map(item => {
    if (type === 'faults') {
      return `<li><strong>${escapeHtml(item.code)}</strong> — ${escapeHtml(item.title)} ${renderSourceTag(item)}<br><span class="muted">${escapeHtml(item.description || '')}</span>${item.cause ? `<br><span class="muted">Cause: ${escapeHtml(item.cause)}</span>` : ''}${safeArray(item.checks).length ? `<br><span class="muted">Checks: ${escapeHtml(item.checks.join(' · '))}</span>` : ''}${safeArray(item.repair).length ? `<br><span class="muted">Remedy: ${escapeHtml(item.repair.join(' · '))}</span>` : ''}</li>`;
    }
    if (type === 'boards') {
      return `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.serial || '-')} ${renderSourceTag(item)}<br><span class="muted">${escapeHtml(item.notes || '')}</span>${item.image ? `<br><a target="_blank" rel="noopener" href="${escapeHtml(item.image)}">Open image</a>` : ''}</li>`;
    }
    if (type === 'parts') {
      return `<li><strong>${escapeHtml(item.part_name)}</strong> — ${escapeHtml(item.part_number || '-')} ${renderSourceTag(item)}<br><span class="muted">${escapeHtml(item.notes || '')}</span></li>`;
    }
    return `<li><strong>${escapeHtml(item.title || item.name || 'Link')}</strong>${item.url ? ` — <a target="_blank" rel="noopener" href="${escapeHtml(item.url)}">Open</a>` : ''}<br><span class="muted">${escapeHtml(item.type || item.notes || '')}</span></li>`;
  }).join("")}</ul>`;
}

function showModel(brandId, modelId) {
  const brand = state.brands.find(b => b.id === brandId);
  const model = safeArray(state.docs[brandId]?.models).find(m => m.id === modelId);
  if (!model) return;
  setCrumbs(["Home", brand?.name_en || brandId, model.model]);
  $("#viewRoot").innerHTML = `
    <div class="hero-row"><div><h2 class="section-title">${escapeHtml(model.display_name || model.model)}</h2><div class="topline"><span class="pill">${escapeHtml(brand?.name_en || brandId)}</span>${model.category ? `<span class="pill">${escapeHtml(model.category)}</span>` : ''}${model.capacity_kg ? `<span class="pill">${escapeHtml(model.capacity_kg)} kg</span>` : ''}${model.generation ? `<span class="pill">${escapeHtml(model.generation)}</span>` : ''}</div></div><button class="ghost-btn" onclick="openBrand('${escapeHtml(brandId)}')">Back</button></div>
    <div class="details-grid">
      <section class="panel"><h3>Overview</h3><div class="kv"><strong>Model</strong><div>${escapeHtml(model.model || '-')}</div></div><div class="kv"><strong>Series</strong><div>${escapeHtml(model.series || '-')}</div></div><div class="kv"><strong>Aliases</strong><div>${escapeHtml(safeArray(model.aliases).join(' · ') || '-')}</div></div><div class="kv"><strong>Platform</strong><div>${escapeHtml(model.service_identity?.platform_family || '-')}</div></div><div class="kv"><strong>Sticker Required</strong><div>${model.service_identity?.sticker_required ? 'Yes' : 'No'}</div></div><div class="kv"><strong>Service Notes</strong><div>${escapeHtml(model.service_identity?.notes || model.service_notes || '-')}</div></div></section>
      <section class="panel"><h3>Error Codes</h3>${listRenderer(model.faults, 'faults')}</section>
      <section class="panel"><h3>Boards / PCBs</h3>${listRenderer(model.boards, 'boards')}</section>
      <section class="panel"><h3>Parts</h3>${listRenderer(model.parts, 'parts')}</section>
      <section class="panel"><h3>Documents</h3>${listRenderer(model.documents, 'docs')}</section>
      <section class="panel"><h3>Wiring / Images</h3>${listRenderer([...(safeArray(model.wiring)), ...(safeArray(model.images))], 'docs')}</section>
    </div>`;
}

function runSearch() {
  const q = normalize($("#globalSearch")?.value || "");
  if (!q) return state.activeBrand ? showBrand(state.activeBrand) : showHome();
  const results = [];
  state.brands.forEach(brand => {
    safeArray(state.docs[brand.id]?.models).forEach(model => {
      const hay = [model.model, model.display_name, model.category, model.series, ...safeArray(model.aliases)].join(' ');
      const matchModel = normalize(hay).includes(q);
      const matchFault = safeArray(model.faults).some(f => normalize(`${f.code} ${f.title} ${f.description} ${f.cause}`).includes(q));
      const matchBoard = safeArray(model.boards).some(b => normalize(`${b.name} ${b.serial} ${b.notes}`).includes(q));
      const matchPart = safeArray(model.parts).some(p => normalize(`${p.part_name} ${p.part_number} ${p.notes}`).includes(q));
      if (matchModel || matchFault || matchBoard || matchPart) results.push({ brand, model, hits:[matchModel&&'model',matchFault&&'fault',matchBoard&&'board',matchPart&&'part'].filter(Boolean) });
    });
  });
  setCrumbs(["Search", q]);
  if (!results.length) { $("#viewRoot").innerHTML = `<div class="empty">No results found.</div>`; return; }
  $("#viewRoot").innerHTML = `<h2 class="section-title">Search Results</h2><div class="search-list">${results.map(r => `<div class="result-card"><div><h3>${escapeHtml(r.model.display_name || r.model.model)}</h3><div class="topline"><span class="pill">${escapeHtml(r.brand.name_en)}</span><span class="pill">matched: ${escapeHtml(r.hits.join(', '))}</span></div><div class="muted">${escapeHtml(r.model.model)}</div></div><button onclick="openModel('${escapeHtml(r.brand.id)}','${escapeHtml(r.model.id)}')">Open</button></div>`).join("")}</div>`;
}

boot().catch(err => {
  $("#viewRoot").innerHTML = `<div class="empty">Failed to load app.<br>${escapeHtml(err.message)}</div>`;
  $("#statsBox").textContent = err.message;
});
