const AUTH = { user: "admin", pass: "iCool2026" };

const DEFAULT_AI_INSTRUCTION =
  "Expand the selected brand with older and newer models, fuller fault families, cleaner aliases, better board mapping notes, and more complete parts while preserving the same JSON structure and avoiding duplicates.";

const store = {
  appReady: false,
  brands: [],
  brandMap: {},
  datasets: {},
  activeBrand: null,
  activeModel: null,
  searchQuery: "",
  adminVisible: false,
  lastAIResult: null,
  sourceLoaded: false
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function text(v) {
  return v == null ? "" : String(v);
}

function normalize(v) {
  return text(v).trim().toLowerCase();
}

function slugify(v) {
  return normalize(v)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function ensureObject(v, fallback = {}) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
}

function escapeHtml(str) {
  return text(str).replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c];
  });
}

function setStatus(msg, bad = false) {
  const el = $("#statsBox");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = bad ? "#ff9aa2" : "";
}

function setAIStatus(msg, bad = false) {
  const el = $("#aiStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = bad ? "#ff9aa2" : "#c7d8ff";
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function getBrandOverrideKey(brandId) {
  return `washer_brand_override_${brandId}`;
}

function saveBrandOverride(brandId, data) {
  localStorage.setItem(getBrandOverrideKey(brandId), JSON.stringify(data));
}

function loadBrandOverride(brandId) {
  const raw = localStorage.getItem(getBrandOverrideKey(brandId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearBrandOverride(brandId) {
  localStorage.removeItem(getBrandOverrideKey(brandId));
}

function getAllBrandDocs() {
  return store.brands
    .map((b) => store.datasets[b.id])
    .filter(Boolean);
}

function bindAuth() {
  const overlay = $("#loginOverlay");
  if (!overlay) return;

  const ok = sessionStorage.getItem("washer_auth_v25") === "ok";
  if (ok) overlay.classList.add("hidden");

  $("#loginBtn")?.addEventListener("click", () => {
    const u = $("#loginUser")?.value.trim();
    const p = $("#loginPass")?.value.trim();
    if (u === AUTH.user && p === AUTH.pass) {
      sessionStorage.setItem("washer_auth_v25", "ok");
      overlay.classList.add("hidden");
      if ($("#loginMsg")) $("#loginMsg").textContent = "";
    } else {
      if ($("#loginMsg")) $("#loginMsg").textContent = "Invalid username or password";
    }
  });

  $("#logoutBtn")?.addEventListener("click", () => {
    sessionStorage.removeItem("washer_auth_v25");
    overlay.classList.remove("hidden");
  });
}

async function loadBrandDoc(brandMeta) {
  const override = loadBrandOverride(brandMeta.id);
  if (override) return normalizeBrandDoc(override, brandMeta);

  const raw = await loadJSON(`data/${brandMeta.id}.json`);
  return normalizeBrandDoc(raw, brandMeta);
}

async function loadData() {
  setStatus("Loading data...");
  const brandsDoc = await loadJSON("data/brands.json");

  store.brands = safeArray(brandsDoc.brands).map((b) => ({
    id: text(b.id),
    name_en: text(b.name_en || b.name || b.id),
    name_ar: text(b.name_ar || ""),
    logo: text(b.logo || "")
  }));

  store.brandMap = {};
  store.datasets = {};

  for (const brand of store.brands) {
    store.brandMap[brand.id] = brand;
  }

  for (const brand of store.brands) {
    const doc = await loadBrandDoc(brand);
    store.datasets[brand.id] = doc;
  }

  const totalModels = getAllBrandDocs().reduce((sum, doc) => {
    return sum + safeArray(doc.models).length;
  }, 0);

  setStatus(`${store.brands.length} brands · ${totalModels} models loaded`);
  store.sourceLoaded = true;
}

function bindTopEvents() {
  $("#homeBtn")?.addEventListener("click", showHome);
  $("#smartAdminBtn")?.addEventListener("click", toggleAdminView);
  $("#reloadBtn")?.addEventListener("click", async () => {
    try {
      await hardReloadData();
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  $("#searchBtn")?.addEventListener("click", runSearch);
  $("#globalSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });

  $("#applyAiBtn")?.addEventListener("click", applyAIUpdate);
  $("#updateAllBtn")?.addEventListener("click", updateAllBrands);
  $("#normalizeBtn")?.addEventListener("click", normalizeCurrentBrand);
  $("#saveOverrideBtn")?.addEventListener("click", saveCurrentBrandOverride);
  $("#resetBrandBtn")?.addEventListener("click", resetCurrentBrandOverride);
  $("#exportBrandBtn")?.addEventListener("click", exportCurrentBrand);
  $("#exportAllBtn")?.addEventListener("click", exportAllBrands);
  $("#cloudLoadBtn")?.addEventListener("click", cloudLoadCurrentBrand);
  $("#cloudSaveBtn")?.addEventListener("click", cloudSaveCurrentBrand);
  $("#importJsonBtn")?.addEventListener("click", () => $("#importJsonFile")?.click());
  $("#importJsonFile")?.addEventListener("change", handleImportFile);

  $("#brandSelect")?.addEventListener("change", () => {
    const brandId = $("#brandSelect").value;
    if (!brandId) return;
    store.activeBrand = brandId;
    store.activeModel = null;
    renderBrands();
    showBrand(brandId);
    syncAdminPanel();
  });
}

async function boot() {
  bindAuth();
  bindTopEvents();
  await loadData();
  renderBrands();
  fillAdminBrandSelect();
  syncAdminPanel();
  showHome();
  store.appReady = true;
}

async function hardReloadData() {
  await loadData();
  renderBrands();
  fillAdminBrandSelect();
  syncAdminPanel();

  if (store.searchQuery) {
    runSearch();
    return;
  }

  if (store.activeBrand && store.activeModel) {
    showModel(store.activeBrand, store.activeModel);
    return;
  }

  if (store.activeBrand) {
    showBrand(store.activeBrand);
    return;
  }

  showHome();
}

function renderBrands() {
  const root = $("#brandList");
  if (!root) return;

  root.innerHTML = "";
  for (const brand of store.brands) {
    const btn = document.createElement("button");
    btn.className = "brand-btn" + (store.activeBrand === brand.id ? " active" : "");
    btn.innerHTML = `
      ${brand.logo ? `<img src="${brand.logo}" alt="${escapeHtml(brand.name_en)}">` : ""}
      <div class="brand-names">
        <div>${escapeHtml(brand.name_en)}</div>
        <small>${escapeHtml(brand.name_ar)}</small>
      </div>
    `;
    btn.onclick = () => {
      store.activeBrand = brand.id;
      store.activeModel = null;
      store.searchQuery = "";
      if ($("#globalSearch")) $("#globalSearch").value = "";
      renderBrands();
      showBrand(brand.id);
      syncAdminPanel();
    };
    root.appendChild(btn);
  }
}

function fillAdminBrandSelect() {
  const select = $("#brandSelect");
  if (!select) return;

  const prev = select.value;
  select.innerHTML = `
    <option value="">Select brand</option>
    ${store.brands
      .map(
        (b) =>
          `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name_en)} · ${escapeHtml(
            b.name_ar
          )}</option>`
      )
      .join("")}
  `;

  if (store.activeBrand) {
    select.value = store.activeBrand;
  } else if (prev) {
    select.value = prev;
  }

  if (!$("#aiInstruction")?.value.trim()) {
    $("#aiInstruction").value = DEFAULT_AI_INSTRUCTION;
  }
}

function syncAdminPanel() {
  const brandId = store.activeBrand || $("#brandSelect")?.value || "";
  const data = brandId ? store.datasets[brandId] : null;

  if ($("#brandSelect") && brandId) {
    $("#brandSelect").value = brandId;
  }

  if ($("#brandJson")) {
    $("#brandJson").value = data ? JSON.stringify(data, null, 2) : "";
  }
}

function toggleAdminView() {
  store.adminVisible = !store.adminVisible;
  const panel = $("#adminPanel");
  if (!panel) return;
  panel.classList.toggle("hidden", !store.adminVisible);

  if (store.adminVisible) {
    syncAdminPanel();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setCrumbs(parts = []) {
  const el = $("#crumbs");
  if (!el) return;
  el.textContent = parts.join(" / ") || "Home";
}

function showHome() {
  setCrumbs(["Home"]);
  const totalByBrand = store.brands
    .map((b) => {
      const doc = store.datasets[b.id];
      const count = safeArray(doc?.models).length;
      return `
        <div class="model-card">
          <div class="meta-badges"><span class="badge">${count} models</span></div>
          <h3>${escapeHtml(b.name_en)} · ${escapeHtml(b.name_ar)}</h3>
          <div class="dim">Tap to browse ordered models and full details.</div>
          <div class="action-row"><button onclick="openBrand('${escapeHtml(b.id)}')">Open Brand</button></div>
        </div>
      `;
    })
    .join("");

  $("#viewRoot").innerHTML = `
    <h2 class="section-title">Dashboard</h2>
    <div class="brand-header">
      <div class="dim">Search above, browse by brand, or use Smart Admin to update, clean, save, import, export, and sync your brand data.</div>
    </div>
    <div class="models-grid">${totalByBrand}</div>
  `;
}

window.openBrand = function openBrand(brandId) {
  store.activeBrand = brandId;
  store.activeModel = null;
  renderBrands();
  syncAdminPanel();
  showBrand(brandId);
};

function showBrand(brandId) {
  const brand = store.brandMap[brandId];
  const doc = store.datasets[brandId];
  if (!brand || !doc) return;

  const models = safeArray(doc.models).sort(compareModels);
  setCrumbs(["Home", brand.name_en]);

  $("#viewRoot").innerHTML = `
    <div class="brand-header">
      <div class="brand-title-wrap">
        ${brand.logo ? `<img src="${brand.logo}" alt="${escapeHtml(brand.name_en)}">` : ""}
        <div>
          <h2 class="section-title" style="margin-bottom:4px">${escapeHtml(brand.name_en)} · ${escapeHtml(
    brand.name_ar
  )}</h2>
          <div class="dim">${models.length} ordered models</div>
        </div>
      </div>
      <button class="ghost-btn" onclick="showHome()">Dashboard</button>
    </div>
    <div class="models-grid">
      ${models.map((m) => renderModelCard(m, brandId)).join("")}
    </div>
  `;
}

window.showHome = showHome;

function compareModels(a, b) {
  const aOrder = Number(a?.sort_order || 0);
  const bOrder = Number(b?.sort_order || 0);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return text(a?.model).localeCompare(text(b?.model), undefined, { numeric: true, sensitivity: "base" });
}

function renderModelCard(model, brandId) {
  const badges = [
    model.category || "Unknown",
    model.capacity_kg ? `${model.capacity_kg} kg` : "",
    model.generation || ""
  ].filter(Boolean);

  return `
    <div class="model-card">
      <div class="meta-badges">
        ${badges.map((v) => `<span class="badge">${escapeHtml(v)}</span>`).join("")}
      </div>
      <h3>${escapeHtml(model.display_name || model.model)}</h3>
      <div class="dim">${escapeHtml(model.model || "")}</div>
      <div class="dim">${safeArray(model.faults).length} faults · ${safeArray(model.boards).length} boards · ${safeArray(model.parts).length} parts</div>
      <div class="action-row">
        <button onclick="openModel('${escapeHtml(brandId)}','${escapeHtml(model.id)}')">Details</button>
      </div>
    </div>
  `;
}

window.openModel = function openModel(brandId, modelId) {
  store.activeBrand = brandId;
  store.activeModel = modelId;
  renderBrands();
  syncAdminPanel();
  showModel(brandId, modelId);
};

function showModel(brandId, modelId) {
  const brand = store.brandMap[brandId];
  const doc = store.datasets[brandId];
  const model = safeArray(doc?.models).find((m) => m.id === modelId);
  if (!brand || !model) return;

  setCrumbs(["Home", brand.name_en, model.model]);

  const makeList = (items, mode) => {
    if (!safeArray(items).length) {
      return `<div class="empty">No ${escapeHtml(mode)} added yet for this model.</div>`;
    }

    return `<ul>${items
      .map((item) => {
        if (mode === "faults") {
          return `
            <li>
              <strong>${escapeHtml(item.code)}</strong> — ${escapeHtml(item.title)}
              <br><span class="dim">${escapeHtml(item.description)}</span>
              ${item.cause ? `<br><span class="dim">Cause: ${escapeHtml(item.cause)}</span>` : ""}
              ${
                safeArray(item.checks).length
                  ? `<br><span class="dim">Checks: ${escapeHtml(item.checks.join(" · "))}</span>`
                  : ""
              }
            </li>
          `;
        }

        if (mode === "boards") {
          return `
            <li>
              <strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.serial || "-")}
              <br><span class="dim">${escapeHtml(item.notes || "")}</span>
              ${
                item.verify_by_sticker
                  ? `<br><span class="dim">Verify by sticker: Yes</span>`
                  : ""
              }
              ${
                item.image
                  ? `<br><a target="_blank" rel="noopener" href="${escapeHtml(item.image)}">Open image</a>`
                  : ""
              }
            </li>
          `;
        }

        if (mode === "parts") {
          return `
            <li>
              <strong>${escapeHtml(item.part_name)}</strong> — ${escapeHtml(item.part_number || "-")}
              <br><span class="dim">${escapeHtml(item.notes || "")}</span>
              ${
                item.verify_by_sticker
                  ? `<br><span class="dim">Verify by sticker: Yes</span>`
                  : ""
              }
            </li>
          `;
        }

        return `
          <li>
            <strong>${escapeHtml(item.title || item.name || "Link")}</strong>
            ${
              item.url
                ? ` — <a target="_blank" rel="noopener" href="${escapeHtml(item.url)}">Open</a>`
                : ""
            }
          </li>
        `;
      })
      .join("")}</ul>`;
  };

  $("#viewRoot").innerHTML = `
    <div class="brand-header">
      <div>
        <h2 class="section-title" style="margin-bottom:6px">${escapeHtml(model.display_name || model.model)}</h2>
        <div class="meta-badges">
          <span class="badge">${escapeHtml(brand.name_en)}</span>
          ${model.category ? `<span class="badge">${escapeHtml(model.category)}</span>` : ""}
          ${model.capacity_kg ? `<span class="badge">${escapeHtml(model.capacity_kg)} kg</span>` : ""}
          ${model.generation ? `<span class="badge">${escapeHtml(model.generation)}</span>` : ""}
        </div>
      </div>
      <div class="action-row" style="min-width:220px">
        <button onclick="showBrand('${escapeHtml(brandId)}')">Back to models</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-card">
        <h3>Model Information</h3>
        <div class="kv"><strong>Model</strong><div>${escapeHtml(model.model || "-")}</div></div>
        <div class="kv"><strong>Aliases</strong><div>${escapeHtml(safeArray(model.aliases).join(" · ") || "-")}</div></div>
        <div class="kv"><strong>Series</strong><div>${escapeHtml(model.series || "-")}</div></div>
        <div class="kv"><strong>Service Platform</strong><div>${escapeHtml(model.service_identity?.platform_family || "-")}</div></div>
        <div class="kv"><strong>Sticker Required</strong><div>${model.service_identity?.sticker_required ? "Yes" : "No"}</div></div>
        <div class="kv"><strong>Service Notes</strong><div>${escapeHtml(model.service_identity?.notes || model.service_notes || "-")}</div></div>
      </div>

      <div class="detail-card">
        <h3>Error Codes</h3>
        ${makeList(model.faults, "faults")}
      </div>

      <div class="detail-card">
        <h3>Boards / PCBs</h3>
        ${makeList(model.boards, "boards")}
      </div>

      <div class="detail-card">
        <h3>Parts</h3>
        ${makeList(model.parts, "parts")}
      </div>

      <div class="detail-card">
        <h3>Documents</h3>
        ${makeList(model.documents, "documents")}
      </div>

      <div class="detail-card">
        <h3>Images / Links</h3>
        ${makeList(model.images, "images")}
      </div>
    </div>
  `;
}

function collectSearchResults(query) {
  const q = normalize(query);
  if (!q) return [];

  const results = [];

  for (const brand of store.brands) {
    const doc = store.datasets[brand.id];
    const models = safeArray(doc?.models);

    for (const model of models) {
      const hits = [];
      const modelText = [
        model.model,
        model.display_name,
        model.category,
        model.series,
        ...(safeArray(model.aliases))
      ].join(" ");

      if (normalize(modelText).includes(q)) hits.push("model");

      if (
        safeArray(model.faults).some((f) =>
          normalize([f.code, f.title, f.description, f.cause, ...safeArray(f.checks)].join(" ")).includes(q)
        )
      ) {
        hits.push("fault");
      }

      if (
        safeArray(model.boards).some((b) =>
          normalize([b.name, b.serial, b.notes].join(" ")).includes(q)
        )
      ) {
        hits.push("board");
      }

      if (
        safeArray(model.parts).some((p) =>
          normalize([p.part_name, p.part_number, p.notes].join(" ")).includes(q)
        )
      ) {
        hits.push("part");
      }

      if (!hits.length) continue;

      results.push({
        brand,
        model,
        hits: [...new Set(hits)]
      });
    }
  }

  return results.sort((a, b) => compareModels(a.model, b.model));
}

function runSearch() {
  const query = $("#globalSearch")?.value.trim() || "";
  store.searchQuery = query;

  if (!query) {
    if (store.activeBrand) return showBrand(store.activeBrand);
    return showHome();
  }

  const results = collectSearchResults(query);
  setCrumbs(["Search", query]);

  if (!results.length) {
    $("#viewRoot").innerHTML = `<div class="empty">No results found for <strong>${escapeHtml(query)}</strong>.</div>`;
    return;
  }

  $("#viewRoot").innerHTML = `
    <h2 class="section-title">Search results</h2>
    <div class="search-results">
      ${results
        .map(
          (r) => `
        <div class="result-card">
          <div>
            <h3>${escapeHtml(r.model.display_name || r.model.model)}</h3>
            <div class="meta-badges">
              <span class="badge">${escapeHtml(r.brand.name_en)}</span>
              ${r.model.category ? `<span class="badge">${escapeHtml(r.model.category)}</span>` : ""}
              ${r.model.capacity_kg ? `<span class="badge">${escapeHtml(r.model.capacity_kg)} kg</span>` : ""}
              <span class="badge">matched: ${escapeHtml(r.hits.join(", "))}</span>
            </div>
            <div class="dim">${safeArray(r.model.faults).length} faults · ${safeArray(r.model.boards).length} boards · ${safeArray(r.model.parts).length} parts</div>
          </div>
          <div class="action-row" style="min-width:180px">
            <button onclick="openModel('${escapeHtml(r.brand.id)}','${escapeHtml(r.model.id)}')">Open details</button>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function normalizeBrandDoc(rawDoc, fallbackBrandMeta = null) {
  const doc = ensureObject(rawDoc, {});
  const fallbackBrand = ensureObject(fallbackBrandMeta, {});

  const brand = ensureObject(doc.brand, {});
  const brandId = text(brand.id || fallbackBrand.id || "");
  const brandNameEn = text(brand.name_en || fallbackBrand.name_en || brandId);
  const brandNameAr = text(brand.name_ar || fallbackBrand.name_ar || "");
  const brandLogo = text(brand.logo || fallbackBrand.logo || "");

  const models = safeArray(doc.models)
    .map((m, index) => normalizeModel(m, index))
    .filter((m) => m.id && m.model);

  const normalized = {
    brand: {
      id: brandId,
      name_en: brandNameEn,
      name_ar: brandNameAr,
      logo: brandLogo
    },
    models
  };

  return dedupeBrandDoc(normalized);
}

function normalizeModel(rawModel, index = 0) {
  const model = ensureObject(rawModel, {});
  const modelCode = text(model.model || model.display_name || model.id || "");
  const id = text(model.id || slugify(modelCode));
  const displayName = text(model.display_name || modelCode);

  return {
    id,
    model: modelCode,
    display_name: displayName,
    category: text(model.category || ""),
    capacity_kg: text(model.capacity_kg || ""),
    generation: text(model.generation || ""),
    series: text(model.series || ""),
    sort_order: Number(model.sort_order ?? index + 1),
    aliases: safeArray(model.aliases).map(text).filter(Boolean),
    service_notes: text(model.service_notes || ""),
    service_identity: {
      platform_family: text(model.service_identity?.platform_family || ""),
      sticker_required: Boolean(model.service_identity?.sticker_required),
      notes: text(model.service_identity?.notes || "")
    },
    faults: safeArray(model.faults).map((f) => ({
      code: text(f.code || ""),
      title: text(f.title || ""),
      description: text(f.description || ""),
      cause: text(f.cause || ""),
      checks: safeArray(f.checks).map(text).filter(Boolean)
    })),
    boards: safeArray(model.boards).map((b) => ({
      name: text(b.name || ""),
      serial: text(b.serial || ""),
      notes: text(b.notes || ""),
      verify_by_sticker: Boolean(b.verify_by_sticker),
      image: text(b.image || "")
    })),
    parts: safeArray(model.parts).map((p) => ({
      part_name: text(p.part_name || ""),
      part_number: text(p.part_number || ""),
      notes: text(p.notes || ""),
      verify_by_sticker: Boolean(p.verify_by_sticker)
    })),
    documents: safeArray(model.documents).map((d) => ({
      title: text(d.title || ""),
      url: text(d.url || "")
    })),
    images: safeArray(model.images).map((i) => ({
      title: text(i.title || ""),
      url: text(i.url || "")
    })),
    data_confidence: {
      faults: text(model.data_confidence?.faults || ""),
      boards: text(model.data_confidence?.boards || ""),
      parts: text(model.data_confidence?.parts || "")
    }
  };
}

function dedupeBrandDoc(doc) {
  const seen = new Map();

  for (const rawModel of safeArray(doc.models)) {
    const model = normalizeModel(rawModel);
    const key = normalize(model.model || model.display_name || model.id);
    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, model);
      continue;
    }

    const existing = seen.get(key);
    seen.set(key, mergeModel(existing, model));
  }

  return {
    brand: ensureObject(doc.brand, {}),
    models: Array.from(seen.values()).sort(compareModels)
  };
}

function mergeModel(a, b) {
  const merged = {
    ...a,
    ...b,
    id: a.id || b.id,
    model: a.model || b.model,
    display_name: a.display_name || b.display_name,
    category: a.category || b.category,
    capacity_kg: a.capacity_kg || b.capacity_kg,
    generation: a.generation || b.generation,
    series: a.series || b.series,
    sort_order: Math.min(Number(a.sort_order || 999999), Number(b.sort_order || 999999)),
    aliases: uniqueStrings([...safeArray(a.aliases), ...safeArray(b.aliases)]),
    service_notes: a.service_notes || b.service_notes,
    service_identity: {
      platform_family: a.service_identity?.platform_family || b.service_identity?.platform_family || "",
      sticker_required: Boolean(a.service_identity?.sticker_required || b.service_identity?.sticker_required),
      notes: a.service_identity?.notes || b.service_identity?.notes || ""
    },
    faults: dedupeObjects([...safeArray(a.faults), ...safeArray(b.faults)], (x) => normalize(`${x.code} ${x.title}`)),
    boards: dedupeObjects(
      [...safeArray(a.boards), ...safeArray(b.boards)],
      (x) => normalize(`${x.name} ${x.serial}`)
    ),
    parts: dedupeObjects(
      [...safeArray(a.parts), ...safeArray(b.parts)],
      (x) => normalize(`${x.part_name} ${x.part_number}`)
    ),
    documents: dedupeObjects(
      [...safeArray(a.documents), ...safeArray(b.documents)],
      (x) => normalize(`${x.title} ${x.url}`)
    ),
    images: dedupeObjects(
      [...safeArray(a.images), ...safeArray(b.images)],
      (x) => normalize(`${x.title} ${x.url}`)
    ),
    data_confidence: {
      faults: a.data_confidence?.faults || b.data_confidence?.faults || "",
      boards: a.data_confidence?.boards || b.data_confidence?.boards || "",
      parts: a.data_confidence?.parts || b.data_confidence?.parts || ""
    }
  };

  return normalizeModel(merged);
}

function uniqueStrings(arr) {
  const map = new Map();
  for (const item of arr) {
    const v = text(item).trim();
    if (!v) continue;
    const key = normalize(v);
    if (!map.has(key)) map.set(key, v);
  }
  return Array.from(map.values());
}

function dedupeObjects(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }
    map.set(key, { ...map.get(key), ...item });
  }
  return Array.from(map.values());
}

function normalizeCurrentBrand() {
  const brandId = store.activeBrand || $("#brandSelect")?.value;
  if (!brandId || !store.datasets[brandId]) {
    setAIStatus("Select a brand first.", true);
    return;
  }

  store.datasets[brandId] = dedupeBrandDoc(normalizeBrandDoc(store.datasets[brandId], store.brandMap[brandId]));
  syncAdminPanel();
  renderBrands();

  if (store.activeModel) {
    const exists = safeArray(store.datasets[brandId].models).some((m) => m.id === store.activeModel);
    if (exists) showModel(brandId, store.activeModel);
    else showBrand(brandId);
  } else {
    showBrand(brandId);
  }

  setAIStatus("Brand normalized and de-duplicated.");
  setStatus(`Normalized ${brandId}`);
}

function saveCurrentBrandOverride() {
  const brandId = store.activeBrand || $("#brandSelect")?.value;
  if (!brandId) {
    setAIStatus("Select a brand first.", true);
    return;
  }

  try {
    const raw = $("#brandJson")?.value || "";
    const parsed = JSON.parse(raw);
    const normalized = normalizeBrandDoc(parsed, store.brandMap[brandId]);
    store.datasets[brandId] = normalized;
    saveBrandOverride(brandId, normalized);
    syncAdminPanel();
    renderBrands();
    setAIStatus(`Saved override for ${brandId}.`);
  } catch (err) {
    setAIStatus(`Invalid JSON: ${err.message}`, true);
  }
}

async function resetCurrentBrandOverride() {
  const brandId = store.activeBrand || $("#brandSelect")?.value;
  if (!brandId) {
    setAIStatus("Select a brand first.", true);
    return;
  }

  try {
    clearBrandOverride(brandId);
    store.datasets[brandId] = await loadJSON(`data/${brandId}.json`).then((raw) =>
      normalizeBrandDoc(raw, store.brandMap[brandId])
    );
    syncAdminPanel();
    renderBrands();
    if (store.activeBrand === brandId) showBrand(brandId);
    setAIStatus(`Reset override for ${brandId}.`);
  } catch (err) {
    setAIStatus(err.message, true);
  }
}

function downloadFile(name, textContent, mime = "application/json") {
  const blob = new Blob([textContent], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCurrentBrand() {
  const brandId = store.activeBrand || $("#brandSelect")?.value;
  if (!brandId || !store.datasets[brandId]) {
    setAIStatus("Select a brand first.", true);
    return;
  }

  downloadFile(`${brandId}.json`, JSON.stringify(store.datasets[brandId], null, 2));
  setAIStatus(`Exported ${brandId}.json`);
}

function exportAllBrands() {
  const out = {
    brands: getAllBrandDocs()
  };
  downloadFile(`washer-all-brands.json`, JSON.stringify(out, null, 2));
  setAIStatus("Exported all brands JSON.");
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const textContent = await file.text();
    const parsed = JSON.parse(textContent);

    if (parsed.brands && Array.isArray(parsed.brands)) {
      for (const doc of parsed.brands) {
        const brandId = doc?.brand?.id;
        if (!brandId) continue;
        const fallback = store.brandMap[brandId] || doc.brand;
        const normalized = normalizeBrandDoc(doc, fallback);
        store.datasets[brandId] = normalized;
        saveBrandOverride(brandId, normalized);
      }
      setAIStatus("Imported multi-brand JSON.");
    } else if (parsed.brand?.id) {
      const brandId = parsed.brand.id;
      const fallback = store.brandMap[brandId] || parsed.brand;
      const normalized = normalizeBrandDoc(parsed, fallback);
      store.datasets[brandId] = normalized;
      store.activeBrand = brandId;
      saveBrandOverride(brandId, normalized);
      setAIStatus(`Imported ${brandId}.json`);
    } else {
      throw new Error("JSON format not recognized");
    }

    renderBrands();
    fillAdminBrandSelect();
    syncAdminPanel();

    if (store.activeBrand) showBrand(store.activeBrand);
  } catch (err) {
    setAIStatus(`Import failed: ${err.message}`, true);
  } finally {
    event.target.value = "";
  }
}

async function cloudSaveCurrentBrand() {
  const brandId = store.activeBrand || $("#brandSelect")?.value;
  if (!brandId || !store.datasets[brandId]) {
    setAIStatus("Select a brand first.", true);
    return;
  }

  try {
    setAIStatus(`Saving ${brandId} to cloud...`);
    const res = await fetch("/api/cloud-brand", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        brand: brandId,
        data: store.datasets[brandId]
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Cloud save failed");

    setAIStatus(`Saved ${brandId} to cloud.`);
  } catch (err) {
    setAIStatus(err.message, true);
  }
}

async function cloudLoadCurrentBrand() {
  const brandId = store.activeBrand || $("#brandSelect")?.value;
  if (!brandId) {
    setAIStatus("Select a brand first.", true);
    return;
  }

  try {
    setAIStatus(`Loading ${brandId} from cloud...`);
    const res = await fetch(`/api/cloud-brand?brand=${encodeURIComponent(brandId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Cloud load failed");
    if (!data?.data) throw new Error("No cloud data found for this brand");

    const normalized = normalizeBrandDoc(data.data, store.brandMap[brandId]);
    store.datasets[brandId] = normalized;
    saveBrandOverride(brandId, normalized);
    syncAdminPanel();
    renderBrands();
    if (store.activeBrand === brandId) showBrand(brandId);
    setAIStatus(`Loaded ${brandId} from cloud.`);
  } catch (err) {
    setAIStatus(err.message, true);
  }
}

async function applyAIUpdate() {
  const brandId = store.activeBrand || $("#brandSelect")?.value;
  if (!brandId) {
    setAIStatus("Select a brand first.", true);
    return;
  }

  const instruction = $("#aiInstruction")?.value.trim() || DEFAULT_AI_INSTRUCTION;

  try {
    setAIStatus(`Updating ${brandId} with AI...`);
    const currentData = store.datasets[brandId];
    const res = await fetch("/api/brand-update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        brand: brandId,
        instruction,
        currentData
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "AI update failed");

    const normalized = normalizeBrandDoc(data, store.brandMap[brandId]);
    store.datasets[brandId] = normalized;
    store.lastAIResult = normalized;
    syncAdminPanel();
    renderBrands();
    if (store.activeBrand === brandId) showBrand(brandId);
    setAIStatus(`AI updated ${brandId}. Review JSON, then Save Override.`);
  } catch (err) {
    setAIStatus(err.message, true);
  }
}

async function updateAllBrands() {
  try {
    setAIStatus("Updating all brands with AI... this may take time.");
    const brands = getAllBrandDocs();
    const instruction = $("#aiInstruction")?.value.trim() || DEFAULT_AI_INSTRUCTION;

    const res = await fetch("/api/brand-update-all", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        brands,
        instruction
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Update all brands failed");

    const returned = safeArray(data.brands);
    for (const doc of returned) {
      const brandId = doc?.brand?.id;
      if (!brandId) continue;
      const fallback = store.brandMap[brandId] || doc.brand;
      store.datasets[brandId] = normalizeBrandDoc(doc, fallback);
    }

    renderBrands();
    syncAdminPanel();

    if (store.activeBrand) {
      showBrand(store.activeBrand);
    } else {
      showHome();
    }

    setAIStatus("AI updated all brands. Review and Save Override or Cloud Save as needed.");
  } catch (err) {
    setAIStatus(err.message, true);
  }
}

boot().catch((err) => {
  console.error(err);
  setStatus(err.message, true);
  const root = $("#viewRoot");
  if (root) {
    root.innerHTML = `<div class="empty">Failed to load app data.<br><br>${escapeHtml(err.message)}</div>`;
  }
});
