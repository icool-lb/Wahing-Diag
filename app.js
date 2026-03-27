const AUTH = { user: "admin", pass: "iCool2026" };
const store = {
  brands: [],
  brandMap: {},
  datasets: {},
  sourceMeta: {},
  activeBrand: null,
  activeModel: null,
  searchQuery: ""
};

const $ = (s) => document.querySelector(s);

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function escapeHtml(str) {
  return (str || "").toString().replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

function normalize(s) {
  return (s || "").toString().toLowerCase().trim();
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function setStatus(msg, good = true) {
  const el = $("#adminStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `admin-status ${good ? "ok" : "bad"}`;
}

function downloadText(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getOverrideKey(brandId) {
  return `washer_override_${brandId}`;
}

function getSourceLabel(brandId) {
  return store.sourceMeta[brandId] || "bundled";
}

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function uniqueBy(items, keyFn) {
  const out = [];
  const seen = new Set();
  for (const item of ensureArray(items)) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function mergeArraysByKey(baseItems, newItems, keyFn, mergeFn) {
  const map = new Map();
  for (const item of ensureArray(baseItems)) {
    map.set(keyFn(item), deepClone(item));
  }
  for (const item of ensureArray(newItems)) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, deepClone(item));
    else map.set(key, mergeFn(map.get(key), item));
  }
  return Array.from(map.values());
}

function normalizeStringList(list) {
  return uniqueBy(ensureArray(list).map(v => String(v).trim()).filter(Boolean), v => normalize(v));
}

function normalizeLinkedItems(items, titleKey) {
  return uniqueBy(ensureArray(items).map(item => ({
    ...item,
    title: item.title || item[titleKey] || "",
    notes: item.notes || "",
    url: item.url || ""
  })), item => normalize(`${item.title}|${item.url}`));
}

function mergeModelData(a, b) {
  const merged = { ...a, ...b };
  merged.aliases = normalizeStringList([...(a.aliases || []), ...(b.aliases || [])]);
  merged.documents = normalizeLinkedItems([...(a.documents || []), ...(b.documents || [])], "title");
  merged.images = normalizeLinkedItems([...(a.images || []), ...(b.images || [])], "title");
  merged.faults = mergeArraysByKey(a.faults, b.faults, f => normalize(`${f.code}|${f.title}`), (x, y) => ({ ...x, ...y }));
  merged.boards = mergeArraysByKey(a.boards, b.boards, x => normalize(`${x.name}|${x.serial}`), (x, y) => ({ ...x, ...y }));
  merged.parts = mergeArraysByKey(a.parts, b.parts, x => normalize(`${x.part_name}|${x.part_number}`), (x, y) => ({ ...x, ...y }));
  const identity = { ...(a.service_identity || {}), ...(b.service_identity || {}) };
  identity.sticker_checkpoints = normalizeStringList([...(a.service_identity?.sticker_checkpoints || []), ...(b.service_identity?.sticker_checkpoints || [])]);
  merged.service_identity = identity;
  return merged;
}

function normalizeBrandDoc(doc, brandMeta = null) {
  const safe = deepClone(doc || {});
  safe.brand = { ...(brandMeta || safe.brand || {}), ...(safe.brand || {}) };
  const models = ensureArray(safe.models).map((m, idx) => {
    const model = { ...m };
    model.id = model.id || normalize(model.model).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `model-${idx+1}`;
    model.model = model.model || `MODEL-${idx+1}`;
    model.aliases = normalizeStringList(model.aliases || []);
    model.faults = uniqueBy(ensureArray(model.faults).map(f => ({ code: f.code || "", title: f.title || "", description: f.description || "" })), f => normalize(`${f.code}|${f.title}`));
    model.boards = uniqueBy(ensureArray(model.boards).map(b => ({ name: b.name || "", serial: b.serial || "", notes: b.notes || "" })), b => normalize(`${b.name}|${b.serial}`));
    model.parts = uniqueBy(ensureArray(model.parts).map(p => ({ part_name: p.part_name || "", part_number: p.part_number || "", notes: p.notes || "" })), p => normalize(`${p.part_name}|${p.part_number}`));
    model.documents = normalizeLinkedItems(model.documents || [], "title");
    model.images = normalizeLinkedItems(model.images || [], "title");
    model.service_identity = {
      ...(model.service_identity || {}),
      sticker_checkpoints: normalizeStringList(model.service_identity?.sticker_checkpoints || [])
    };
    return model;
  });

  safe.models = Array.from(models.reduce((map, model) => {
    const key = normalize(model.model || model.id);
    if (!map.has(key)) map.set(key, model);
    else map.set(key, mergeModelData(map.get(key), model));
    return map;
  }, new Map()).values()).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.model.localeCompare(b.model));

  return safe;
}

async function boot() {
  bindAuth();
  await loadData();
  renderBrands();
  refreshStats();
  showHome();
  bindGlobalEvents();
  populateAdminBrandSelect();
}

function bindAuth() {
  const overlay = $("#loginOverlay");
  const ok = sessionStorage.getItem("washer_auth_v25") === "ok";
  if (ok) overlay.classList.add("hidden");

  $("#loginBtn").addEventListener("click", () => {
    const u = $("#loginUser").value.trim();
    const p = $("#loginPass").value.trim();
    if (u === AUTH.user && p === AUTH.pass) {
      sessionStorage.setItem("washer_auth_v25", "ok");
      overlay.classList.add("hidden");
      $("#loginMsg").textContent = "";
    } else {
      $("#loginMsg").textContent = "Invalid username or password";
    }
  });

  $("#logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("washer_auth_v25");
    overlay.classList.remove("hidden");
  });
}

async function loadData() {
  const brandsDoc = await loadJSON("data/brands.json");
  store.brands = brandsDoc.brands || [];
  store.brandMap = {};
  store.datasets = {};
  store.sourceMeta = {};

  for (const brand of store.brands) {
    store.brandMap[brand.id] = brand;
    const bundled = normalizeBrandDoc(await loadJSON(`data/${brand.id}.json`), brand);
    const overrideRaw = localStorage.getItem(getOverrideKey(brand.id));
    if (overrideRaw) {
      try {
        store.datasets[brand.id] = normalizeBrandDoc(JSON.parse(overrideRaw), brand);
        store.sourceMeta[brand.id] = "local override";
      } catch {
        store.datasets[brand.id] = bundled;
        store.sourceMeta[brand.id] = "bundled";
      }
    } else {
      store.datasets[brand.id] = bundled;
      store.sourceMeta[brand.id] = "bundled";
    }
  }
}

function refreshStats() {
  const totalModels = Object.values(store.datasets).reduce((sum, doc) => sum + (doc.models?.length || 0), 0);
  $("#statsBox").textContent = `${store.brands.length} brands · ${totalModels} models loaded`;
}

function bindGlobalEvents() {
  $("#searchBtn").addEventListener("click", runSearch);
  $("#globalSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
  $("#goHomeBtn").addEventListener("click", showHome);
  $("#toggleAdminBtn").addEventListener("click", toggleAdminPanel);
  $("#adminBrandSelect").addEventListener("change", adminBrandChanged);
  $("#saveOverrideBtn").addEventListener("click", saveAdminOverride);
  $("#resetOverrideBtn").addEventListener("click", resetAdminOverride);
  $("#exportBrandBtn").addEventListener("click", exportSelectedBrandJSON);
  $("#exportAllBtn").addEventListener("click", exportAllJSON);
  $("#applyAiBtn").addEventListener("click", applyAIUpdate);
  $("#applyAiAllBtn").addEventListener("click", applyAIUpdateAll);
  $("#importBrandFile").addEventListener("change", importBrandFile);
  $("#dedupeBtn").addEventListener("click", normalizeCurrentBrandJson);
  $("#cloudSaveBtn").addEventListener("click", cloudSaveBrand);
  $("#cloudLoadBtn").addEventListener("click", cloudLoadBrand);
}

function renderBrands() {
  const root = $("#brandList");
  root.innerHTML = "";
  for (const brand of store.brands) {
    const count = store.datasets[brand.id]?.models?.length || 0;
    const btn = document.createElement("button");
    btn.className = "brand-btn" + (store.activeBrand === brand.id ? " active" : "");
    btn.innerHTML = `
      <img src="${brand.logo}" alt="${escapeHtml(brand.name_en)}">
      <div class="brand-names">
        <div>${escapeHtml(brand.name_en)}</div>
        <small>${escapeHtml(brand.name_ar)} · ${count} models</small>
      </div>`;
    btn.onclick = () => {
      store.activeBrand = brand.id;
      store.activeModel = null;
      renderBrands();
      showBrand(brand.id);
    };
    root.appendChild(btn);
  }
}

function populateAdminBrandSelect() {
  const sel = $("#adminBrandSelect");
  sel.innerHTML = store.brands.map(b => `<option value="${b.id}">${b.name_en}</option>`).join("");
  if (store.brands[0]) {
    sel.value = store.activeBrand || store.brands[0].id;
    adminBrandChanged();
  }
}

function toggleAdminPanel() {
  $("#adminPanel").classList.toggle("hidden");
  if (!$("#adminPanel").classList.contains("hidden")) adminBrandChanged();
}

function adminBrandChanged() {
  const brandId = $("#adminBrandSelect").value;
  const doc = store.datasets[brandId];
  $("#adminSourceMeta").textContent = `Source: ${getSourceLabel(brandId)}`;
  $("#adminJson").value = JSON.stringify(doc, null, 2);
  $("#aiInstruction").value = `Expand ${brandId} with older and newer models, fuller error families, cleaner aliases, board mapping notes, and more complete parts while preserving the same JSON structure and avoiding duplicates.`;
  setStatus("");
}

function setCrumbs(parts = []) {
  $("#crumbs").textContent = parts.join(" / ") || "Home";
}

function showHome() {
  setCrumbs(["Home"]);
  const cards = store.brands.map(b => {
    const count = store.datasets[b.id]?.models?.length || 0;
    return `
      <div class="model-card">
        <div class="meta-badges">
          <span class="badge">${count} models</span>
          <span class="badge">${getSourceLabel(b.id)}</span>
        </div>
        <h3>${escapeHtml(b.name_en)} · ${escapeHtml(b.name_ar)}</h3>
        <div class="dim">Browse ordered models, boards, parts, documents, and service notes.</div>
        <div class="action-row"><button onclick="openBrand('${b.id}')">Open Brand</button></div>
      </div>`;
  }).join("");

  $("#viewRoot").innerHTML = `
    <h2 class="section-title">Dashboard</h2>
    <div class="brand-header">
      <div class="dim">Search above, open a brand, or use Smart Admin to grow one brand or all brands without replacing deployed JSON files.</div>
    </div>
    <div class="models-grid">${cards}</div>`;
}
window.showHome = showHome;
window.openBrand = function(brandId) {
  store.activeBrand = brandId;
  store.activeModel = null;
  renderBrands();
  showBrand(brandId);
};

function showBrand(brandId) {
  const brand = store.brandMap[brandId];
  const data = store.datasets[brandId];
  const models = [...(data.models || [])];
  setCrumbs(["Home", brand.name_en]);
  $("#viewRoot").innerHTML = `
    <div class="brand-header">
      <div class="brand-title-wrap">
        <img src="${brand.logo}" alt="${escapeHtml(brand.name_en)}">
        <div>
          <h2 class="section-title" style="margin-bottom:4px">${escapeHtml(brand.name_en)} · ${escapeHtml(brand.name_ar)}</h2>
          <div class="dim">${models.length} ordered models · source: ${getSourceLabel(brandId)}</div>
        </div>
      </div>
      <button class="ghost-btn" onclick="showHome()">Dashboard</button>
    </div>
    <div class="models-grid">${models.map(m => renderModelCard(m, brandId)).join("")}</div>`;
}

function renderModelCard(model, brandId) {
  const counts = [`${model.faults?.length || 0} faults`, `${model.boards?.length || 0} boards`, `${model.parts?.length || 0} parts`];
  return `
    <div class="model-card">
      <div class="meta-badges">
        <span class="badge">${escapeHtml(model.category || "-")}</span>
        <span class="badge">${escapeHtml(model.capacity_kg || "-")} kg</span>
        <span class="badge">${escapeHtml(model.generation || "-")}</span>
      </div>
      <h3>${escapeHtml(model.model)}</h3>
      <div class="dim">${counts.join(" · ")}</div>
      <div class="action-row"><button onclick="openModel('${brandId}','${model.id}')">Details</button></div>
    </div>`;
}

window.openModel = function(brandId, modelId) {
  store.activeBrand = brandId;
  store.activeModel = modelId;
  renderBrands();
  showModel(brandId, modelId);
};

function showModel(brandId, modelId) {
  const brand = store.brandMap[brandId];
  const model = (store.datasets[brandId]?.models || []).find(m => m.id === modelId);
  if (!model) return;
  setCrumbs(["Home", brand.name_en, model.model]);

  const renderList = (items, kind) => {
    if (!items?.length) return `<div class="empty">No ${kind} added yet for this model.</div>`;
    return `<ul>${items.map(item => {
      if (kind === "faults") return `<li><strong>${escapeHtml(item.code)}</strong> — ${escapeHtml(item.title)}<br><span class="dim">${escapeHtml(item.description || "")}</span></li>`;
      if (kind === "boards") return `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.serial || "-")}<br><span class="dim">${escapeHtml(item.notes || "")}</span></li>`;
      if (kind === "parts") return `<li><strong>${escapeHtml(item.part_name)}</strong> — ${escapeHtml(item.part_number || "-")}<br><span class="dim">${escapeHtml(item.notes || "")}</span></li>`;
      return `<li><strong>${escapeHtml(item.title)}</strong>${item.url ? ` — <a target="_blank" rel="noreferrer" href="${item.url}">Open</a>` : ""}<br><span class="dim">${escapeHtml(item.notes || "")}</span></li>`;
    }).join("")}</ul>`;
  };

  const identity = model.service_identity || {};
  $("#viewRoot").innerHTML = `
    <div class="brand-header">
      <div>
        <h2 class="section-title" style="margin-bottom:6px">${escapeHtml(model.model)}</h2>
        <div class="meta-badges">
          <span class="badge">${escapeHtml(brand.name_en)}</span>
          <span class="badge">${escapeHtml(model.category || "-")}</span>
          <span class="badge">${escapeHtml(model.capacity_kg || "-")} kg</span>
          <span class="badge">${escapeHtml(model.generation || "-")}</span>
        </div>
      </div>
      <div class="action-row" style="min-width:220px"><button onclick="showBrand('${brandId}')">Back to models</button></div>
    </div>

    <div class="detail-grid">
      <div class="detail-card">
        <h3>Model Information</h3>
        <div class="kv"><strong>Series</strong><div>${escapeHtml(model.series || "-")}</div></div>
        <div class="kv"><strong>Aliases</strong><div>${escapeHtml((model.aliases || []).join(" · ") || "-")}</div></div>
        <div class="kv"><strong>Service Notes</strong><div>${escapeHtml(model.service_notes || "-")}</div></div>
      </div>

      <div class="detail-card">
        <h3>Service Identity</h3>
        <div class="kv"><strong>Platform</strong><div>${escapeHtml(identity.platform_family || "-")}</div></div>
        <div class="kv"><strong>Checkpoints</strong><div>${escapeHtml((identity.sticker_checkpoints || []).join(" · ") || "-")}</div></div>
        <div class="kv"><strong>Board Match Rule</strong><div>${escapeHtml(identity.board_match_rule || "-")}</div></div>
      </div>

      <div class="detail-card"><h3>Error Codes</h3>${renderList(model.faults, "faults")}</div>
      <div class="detail-card"><h3>Boards / PCBs</h3>${renderList(model.boards, "boards")}</div>
      <div class="detail-card"><h3>Parts</h3>${renderList(model.parts, "parts")}</div>
      <div class="detail-card"><h3>Documents</h3>${renderList(model.documents, "documents")}</div>
      <div class="detail-card"><h3>Images / Links</h3>${renderList(model.images, "documents")}</div>
    </div>`;
}

function collectSearchResults(query) {
  const q = normalize(query.trim());
  const results = [];
  if (!q) return results;

  for (const brand of store.brands) {
    for (const model of store.datasets[brand.id]?.models || []) {
      const hitReasons = [];
      if (normalize(model.model).includes(q) || normalize((model.aliases || []).join(" ")).includes(q)) hitReasons.push("model");
      if ((model.faults || []).some(f => normalize(`${f.code} ${f.title} ${f.description}`).includes(q))) hitReasons.push("fault");
      if ((model.boards || []).some(b => normalize(`${b.name} ${b.serial} ${b.notes}`).includes(q))) hitReasons.push("board");
      if ((model.parts || []).some(p => normalize(`${p.part_name} ${p.part_number} ${p.notes}`).includes(q))) hitReasons.push("part");
      if (hitReasons.length) results.push({ brand, model, hitReasons: [...new Set(hitReasons)] });
    }
  }
  return results.sort((a, b) => a.model.model.localeCompare(b.model.model));
}

function runSearch() {
  const query = $("#globalSearch").value.trim();
  store.searchQuery = query;
  if (!query) return store.activeBrand ? showBrand(store.activeBrand) : showHome();
  const results = collectSearchResults(query);
  setCrumbs(["Search", query]);
  if (!results.length) {
    $("#viewRoot").innerHTML = `<div class="empty">No results found for <strong>${escapeHtml(query)}</strong>.</div>`;
    return;
  }
  $("#viewRoot").innerHTML = `
    <h2 class="section-title">Search results</h2>
    <div class="search-results">${results.map(r => `
      <div class="result-card">
        <div>
          <h3>${escapeHtml(r.model.model)}</h3>
          <div class="meta-badges">
            <span class="badge">${escapeHtml(r.brand.name_en)}</span>
            <span class="badge">${escapeHtml(r.model.category || "-")}</span>
            <span class="badge">${escapeHtml(r.model.capacity_kg || "-")} kg</span>
            <span class="badge">matched: ${escapeHtml(r.hitReasons.join(", "))}</span>
          </div>
          <div class="dim">${r.model.faults?.length || 0} faults · ${r.model.boards?.length || 0} boards · ${r.model.parts?.length || 0} parts</div>
        </div>
        <div class="action-row" style="min-width:180px"><button onclick="openModel('${r.brand.id}','${r.model.id}')">Open details</button></div>
      </div>`).join("")}</div>`;
}

function normalizeCurrentBrandJson() {
  const brandId = $("#adminBrandSelect").value;
  try {
    const parsed = JSON.parse($("#adminJson").value);
    const normalized = normalizeBrandDoc(parsed, store.brandMap[brandId]);
    $("#adminJson").value = JSON.stringify(normalized, null, 2);
    setStatus(`Normalized and removed duplicates for ${brandId}.`);
  } catch (err) {
    setStatus(err.message, false);
  }
}

function saveAdminOverride() {
  const brandId = $("#adminBrandSelect").value;
  try {
    const parsed = JSON.parse($("#adminJson").value);
    const normalized = normalizeBrandDoc(parsed, store.brandMap[brandId]);
    localStorage.setItem(getOverrideKey(brandId), JSON.stringify(normalized));
    store.datasets[brandId] = normalized;
    store.sourceMeta[brandId] = "local override";
    $("#adminJson").value = JSON.stringify(normalized, null, 2);
    renderBrands();
    refreshStats();
    setStatus(`Saved ${brandId} override to browser storage.`);
    if (store.activeBrand === brandId) showBrand(brandId);
  } catch (err) {
    setStatus(err.message, false);
  }
}

function resetAdminOverride() {
  const brandId = $("#adminBrandSelect").value;
  localStorage.removeItem(getOverrideKey(brandId));
  loadJSON(`data/${brandId}.json`).then(doc => {
    store.datasets[brandId] = normalizeBrandDoc(doc, store.brandMap[brandId]);
    store.sourceMeta[brandId] = "bundled";
    $("#adminJson").value = JSON.stringify(store.datasets[brandId], null, 2);
    renderBrands();
    refreshStats();
    setStatus(`Reset ${brandId} to bundled JSON.`);
    if (store.activeBrand === brandId) showBrand(brandId);
  }).catch(err => setStatus(err.message, false));
}

function exportSelectedBrandJSON() {
  const brandId = $("#adminBrandSelect").value;
  downloadText(`${brandId}.json`, JSON.stringify(store.datasets[brandId], null, 2));
  setStatus(`Exported ${brandId}.json`);
}

function exportAllJSON() {
  const bundle = { brands: store.brands, datasets: store.datasets };
  downloadText(`washer_catalog_all_brands.json`, JSON.stringify(bundle, null, 2));
  setStatus(`Exported all brand datasets.`);
}

async function importBrandFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const brandId = $("#adminBrandSelect").value;
    const normalized = normalizeBrandDoc(parsed, store.brandMap[brandId]);
    $("#adminJson").value = JSON.stringify(normalized, null, 2);
    setStatus(`Imported file for ${brandId}. Review then click Save Override.`);
  } catch (err) {
    setStatus(err.message, false);
  } finally {
    event.target.value = "";
  }
}

async function applyAIUpdate() {
  const brandId = $("#adminBrandSelect").value;
  const instruction = $("#aiInstruction").value.trim();
  const currentDoc = $("#adminJson").value.trim();
  if (!instruction) return setStatus("Write an AI instruction first.", false);
  setStatus(`Updating ${brandId} with AI...`);
  $("#applyAiBtn").disabled = true;
  try {
    const res = await fetch("/api/brand-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, instruction, currentDoc })
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "AI update failed.");
    const normalized = normalizeBrandDoc(payload.brandDoc, store.brandMap[brandId]);
    $("#adminJson").value = JSON.stringify(normalized, null, 2);
    setStatus(`AI draft ready for ${brandId}. Review and click Save Override.`);
  } catch (err) {
    setStatus(err.message, false);
  } finally {
    $("#applyAiBtn").disabled = false;
  }
}

async function applyAIUpdateAll() {
  const instruction = $("#aiInstruction").value.trim();
  if (!instruction) return setStatus("Write an AI instruction first.", false);
  $("#applyAiAllBtn").disabled = true;
  setStatus("Updating all brands. This can take a while depending on your Vercel timeout and model speed...");
  try {
    const payload = { brands: store.brands.map(b => ({ brandId: b.id, currentDoc: JSON.stringify(store.datasets[b.id]) })), instruction };
    const res = await fetch("/api/brand-update-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Bulk AI update failed.");
    for (const item of data.results || []) {
      if (!item.brandId || !item.brandDoc) continue;
      const normalized = normalizeBrandDoc(item.brandDoc, store.brandMap[item.brandId]);
      store.datasets[item.brandId] = normalized;
      localStorage.setItem(getOverrideKey(item.brandId), JSON.stringify(normalized));
      store.sourceMeta[item.brandId] = "local override";
    }
    adminBrandChanged();
    renderBrands();
    refreshStats();
    if (store.activeBrand) showBrand(store.activeBrand);
    setStatus(`Bulk AI update completed for ${(data.results || []).length} brands.`);
  } catch (err) {
    setStatus(err.message, false);
  } finally {
    $("#applyAiAllBtn").disabled = false;
  }
}

async function cloudSaveBrand() {
  const brandId = $("#adminBrandSelect").value;
  try {
    const brandDoc = normalizeBrandDoc(JSON.parse($("#adminJson").value), store.brandMap[brandId]);
    setStatus(`Saving ${brandId} to cloud...`);
    const res = await fetch("/api/cloud-brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, brandDoc })
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Cloud save failed.");
    setStatus(`Saved ${brandId} to cloud.`);
  } catch (err) {
    setStatus(err.message, false);
  }
}

async function cloudLoadBrand() {
  const brandId = $("#adminBrandSelect").value;
  try {
    setStatus(`Loading ${brandId} from cloud...`);
    const res = await fetch(`/api/cloud-brand?brandId=${encodeURIComponent(brandId)}`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Cloud load failed.");
    const normalized = normalizeBrandDoc(payload.brandDoc, store.brandMap[brandId]);
    $("#adminJson").value = JSON.stringify(normalized, null, 2);
    setStatus(`Loaded ${brandId} from cloud. Review and Save Override if you want it active locally.`);
  } catch (err) {
    setStatus(err.message, false);
  }
}

boot().catch(err => {
  $("#viewRoot").innerHTML = `<div class="empty">Failed to load app data.<br><br>${escapeHtml(err.message)}</div>`;
});
