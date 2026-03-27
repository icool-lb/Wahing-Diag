
const AUTH = { user: "admin", pass: "iCool2026" };
const store = {
  brands: [],
  brandMap: {},
  datasets: {},
  activeBrand: null,
  activeModel: null,
  searchQuery: ""
};

const $ = (s) => document.querySelector(s);

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed: ${path}`);
  return res.json();
}

async function boot() {
  bindAuth();
  await loadData();
  renderBrands();
  showHome();
  bindGlobalEvents();
}

function bindAuth() {
  const overlay = $("#loginOverlay");
  const ok = sessionStorage.getItem("washer_auth_v24") === "ok";
  if (ok) overlay.classList.add("hidden");

  $("#loginBtn").addEventListener("click", () => {
    const u = $("#loginUser").value.trim();
    const p = $("#loginPass").value.trim();
    if (u === AUTH.user && p === AUTH.pass) {
      sessionStorage.setItem("washer_auth_v24", "ok");
      overlay.classList.add("hidden");
      $("#loginMsg").textContent = "";
    } else {
      $("#loginMsg").textContent = "Invalid username or password";
    }
  });

  $("#logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("washer_auth_v24");
    overlay.classList.remove("hidden");
  });
}

async function loadData() {
  const brandsDoc = await loadJSON("data/brands.json");
  store.brands = brandsDoc.brands || [];
  for (const brand of store.brands) {
    const data = await loadJSON(`data/${brand.id}.json`);
    store.datasets[brand.id] = data;
    store.brandMap[brand.id] = brand;
  }
  const totalModels = Object.values(store.datasets).reduce((sum, b) => sum + (b.models?.length || 0), 0);
  $("#statsBox").textContent = `${store.brands.length} brands · ${totalModels} models loaded`;
}

function bindGlobalEvents() {
  $("#searchBtn").addEventListener("click", runSearch);
  $("#globalSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });
}

function renderBrands() {
  const root = $("#brandList");
  root.innerHTML = "";
  for (const brand of store.brands) {
    const btn = document.createElement("button");
    btn.className = "brand-btn" + (store.activeBrand === brand.id ? " active" : "");
    btn.innerHTML = `
      <img src="${brand.logo}" alt="${brand.name_en}">
      <div class="brand-names">
        <div>${brand.name_en}</div>
        <small>${brand.name_ar}</small>
      </div>`;
    btn.onclick = () => {
      store.activeBrand = brand.id;
      store.activeModel = null;
      store.searchQuery = "";
      $("#globalSearch").value = "";
      renderBrands();
      showBrand(brand.id);
    };
    root.appendChild(btn);
  }
}

function setCrumbs(parts=[]) {
  $("#crumbs").textContent = parts.join(" / ") || "Home";
}

function showHome() {
  setCrumbs(["Home"]);
  const totalByBrand = store.brands.map(b => {
    const count = store.datasets[b.id]?.models?.length || 0;
    return `
      <div class="model-card">
        <div class="meta-badges"><span class="badge">${count} models</span></div>
        <h3>${b.name_en} · ${b.name_ar}</h3>
        <div class="dim">Tap to browse the full ordered model list.</div>
        <div class="action-row"><button onclick="openBrand('${b.id}')">Open Brand</button></div>
      </div>`;
  }).join("");
  $("#viewRoot").innerHTML = `
    <h2 class="section-title">Dashboard</h2>
    <div class="brand-header">
      <div class="dim">Search above, or open a brand to see models then detailed faults, boards, parts, and notes.</div>
    </div>
    <div class="models-grid">${totalByBrand}</div>`;
}

window.openBrand = function(brandId) {
  store.activeBrand = brandId;
  store.activeModel = null;
  renderBrands();
  showBrand(brandId);
};

function showBrand(brandId) {
  const data = store.datasets[brandId];
  const brand = store.brandMap[brandId];
  const models = [...(data.models || [])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0) || a.model.localeCompare(b.model));
  setCrumbs(["Home", brand.name_en]);
  $("#viewRoot").innerHTML = `
    <div class="brand-header">
      <div class="brand-title-wrap">
        <img src="${brand.logo}" alt="${brand.name_en}">
        <div>
          <h2 class="section-title" style="margin-bottom:4px">${brand.name_en} · ${brand.name_ar}</h2>
          <div class="dim">${models.length} ordered models</div>
        </div>
      </div>
      <button class="ghost-btn" onclick="showHome()">Dashboard</button>
    </div>
    <div class="models-grid">
      ${models.map(m => renderModelCard(m, brandId)).join("")}
    </div>`;
}

window.showHome = showHome;

function renderModelCard(model, brandId) {
  const counts = [
    `${model.faults?.length || 0} faults`,
    `${model.boards?.length || 0} boards`,
    `${model.parts?.length || 0} parts`
  ];
  return `
    <div class="model-card">
      <div class="meta-badges">
        <span class="badge">${model.category}</span>
        <span class="badge">${model.capacity_kg} kg</span>
        <span class="badge">${model.generation}</span>
      </div>
      <h3>${model.model}</h3>
      <div class="dim">${counts.join(" · ")}</div>
      <div class="action-row">
        <button onclick="openModel('${brandId}','${model.id}')">Details</button>
      </div>
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
  const data = store.datasets[brandId];
  const model = (data.models || []).find(m => m.id === modelId);
  if (!model) return;

  setCrumbs(["Home", brand.name_en, model.model]);

  const renderList = (items, kind) => {
    if (!items?.length) return `<div class="empty">No ${kind} added yet for this model.</div>`;
    return `<ul>${items.map(item => {
      if (kind === "faults") return `<li><strong>${item.code}</strong> — ${item.title}<br><span class="dim">${item.description || ""}</span></li>`;
      if (kind === "boards") return `<li><strong>${item.name}</strong> — ${item.serial || "-"}<br><span class="dim">${item.notes || ""}</span></li>`;
      if (kind === "parts") return `<li><strong>${item.part_name}</strong> — ${item.part_number || "-"}<br><span class="dim">${item.notes || ""}</span></li>`;
      return `<li><strong>${item.title}</strong>${item.url ? ` — <a target="_blank" href="${item.url}">Open</a>` : ""}<br><span class="dim">${item.notes || ""}</span></li>`;
    }).join("")}</ul>`;
  };

  $("#viewRoot").innerHTML = `
    <div class="brand-header">
      <div>
        <h2 class="section-title" style="margin-bottom:6px">${model.model}</h2>
        <div class="meta-badges">
          <span class="badge">${brand.name_en}</span>
          <span class="badge">${model.category}</span>
          <span class="badge">${model.capacity_kg} kg</span>
          <span class="badge">${model.generation}</span>
        </div>
      </div>
      <div class="action-row" style="min-width:220px">
        <button onclick="showBrand('${brandId}')">Back to models</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-card">
        <h3>Model Information</h3>
        <div class="kv"><strong>Series</strong><div>${model.series || "-"}</div></div>
        <div class="kv"><strong>Aliases</strong><div>${(model.aliases || []).join(" · ") || "-"}</div></div>
        <div class="kv"><strong>Service Notes</strong><div>${model.service_notes || "-"}</div></div>
      </div>

      <div class="detail-card">
        <h3>Error Codes</h3>
        ${renderList(model.faults, "faults")}
      </div>

      <div class="detail-card">
        <h3>Boards / PCBs</h3>
        ${renderList(model.boards, "boards")}
      </div>

      <div class="detail-card">
        <h3>Parts</h3>
        ${renderList(model.parts, "parts")}
      </div>

      <div class="detail-card">
        <h3>Documents</h3>
        ${renderList(model.documents, "documents")}
      </div>

      <div class="detail-card">
        <h3>Images / Links</h3>
        ${renderList(model.images, "documents")}
      </div>
    </div>`;
}

function normalize(s) {
  return (s || "").toString().toLowerCase();
}

function collectSearchResults(query) {
  const q = normalize(query.trim());
  const results = [];
  if (!q) return results;

  for (const brand of store.brands) {
    const models = store.datasets[brand.id]?.models || [];
    for (const model of models) {
      const hitReasons = [];
      if (normalize(model.model).includes(q) || normalize((model.aliases || []).join(" ")).includes(q)) hitReasons.push("model");
      if ((model.faults || []).some(f => normalize(`${f.code} ${f.title} ${f.description}`).includes(q))) hitReasons.push("fault");
      if ((model.boards || []).some(b => normalize(`${b.name} ${b.serial} ${b.notes}`).includes(q))) hitReasons.push("board");
      if ((model.parts || []).some(p => normalize(`${p.part_name} ${p.part_number} ${p.notes}`).includes(q))) hitReasons.push("part");
      if (hitReasons.length) {
        results.push({ brand, model, hitReasons: [...new Set(hitReasons)] });
      }
    }
  }
  return results.sort((a,b)=> a.model.model.localeCompare(b.model.model));
}

function runSearch() {
  const query = $("#globalSearch").value.trim();
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
      ${results.map(r => `
        <div class="result-card">
          <div>
            <h3>${r.model.model}</h3>
            <div class="meta-badges">
              <span class="badge">${r.brand.name_en}</span>
              <span class="badge">${r.model.category}</span>
              <span class="badge">${r.model.capacity_kg} kg</span>
              <span class="badge">matched: ${r.hitReasons.join(", ")}</span>
            </div>
            <div class="dim">${r.model.faults?.length || 0} faults · ${r.model.boards?.length || 0} boards · ${r.model.parts?.length || 0} parts</div>
          </div>
          <div class="action-row" style="min-width:180px">
            <button onclick="openModel('${r.brand.id}','${r.model.id}')">Open details</button>
          </div>
        </div>`).join("")}
    </div>`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

boot().catch(err => {
  $("#viewRoot").innerHTML = `<div class="empty">Failed to load app data.<br><br>${err.message}</div>`;
});
