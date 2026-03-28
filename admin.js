
const adminState = {
  brands: [],
  docs: {},
  activeBrand: ""
};
const $ = (s) => document.querySelector(s);
const safeArray = (v) => Array.isArray(v) ? v : [];
const text = (v) => v == null ? "" : String(v);
const normalize = (v) => text(v).trim().toLowerCase();
const slugify = (v) => normalize(v).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}
function setStatus(msg, bad=false) {
  const el = $("#adminStatus");
  el.textContent = msg;
  el.style.color = bad ? "#ff9ca3" : "#dce8ff";
}
function getLocalRegistry() {
  try { return JSON.parse(localStorage.getItem("washer_brand_registry_local") || "[]"); }
  catch { return []; }
}
function saveLocalRegistry(brands) {
  localStorage.setItem("washer_brand_registry_local", JSON.stringify(brands));
}
async function loadCloudRegistry() {
  try {
    const res = await fetch("/api/cloud-brand?brand=__brand_registry__");
    if (!res.ok) return [];
    const data = await res.json();
    return safeArray(data?.data?.brands);
  } catch { return []; }
}
function saveOverride(brandId, doc) {
  localStorage.setItem(`washer_doc_override_${brandId}`, JSON.stringify(doc));
}
function loadOverride(brandId) {
  try { return JSON.parse(localStorage.getItem(`washer_doc_override_${brandId}`) || "null"); }
  catch { return null; }
}
async function boot() {
  const base = await loadJSON("data/brands.json");
  const local = getLocalRegistry();
  const cloud = await loadCloudRegistry();
  const map = new Map();
  [...safeArray(base.brands), ...cloud, ...local].forEach(b => { if (b?.id) map.set(b.id, b); });
  adminState.brands = Array.from(map.values());
  for (const brand of adminState.brands) {
    const override = loadOverride(brand.id);
    if (override) { adminState.docs[brand.id] = override; continue; }
    try {
      adminState.docs[brand.id] = await loadJSON(brand.data_file || `data/brands/${brand.id}.json`);
    } catch {
      adminState.docs[brand.id] = { brand, models: [], source_registry: [] };
    }
  }
  fillBrandSelect();
  bindEvents();
  if (adminState.brands[0]) {
    adminState.activeBrand = adminState.brands[0].id;
    $("#brandSelect").value = adminState.activeBrand;
    renderEditor();
  }
}
function bindEvents() {
  $("#brandSelect")?.addEventListener("change", () => { adminState.activeBrand = $("#brandSelect").value; renderEditor(); });
  $("#homeBtn")?.addEventListener("click", () => window.location.href = "index.html");
  $("#saveOverrideBtn")?.addEventListener("click", saveCurrentOverride);
  $("#resetOverrideBtn")?.addEventListener("click", resetCurrentOverride);
  $("#exportBrandBtn")?.addEventListener("click", exportCurrentBrand);
  $("#cloudSaveBtn")?.addEventListener("click", cloudSaveCurrentBrand);
  $("#cloudLoadBtn")?.addEventListener("click", cloudLoadCurrentBrand);
  $("#applyAiBtn")?.addEventListener("click", applyAIUpdate);
  $("#updateAllBtn")?.addEventListener("click", updateAllBrands);
  $("#addBrandBtn")?.addEventListener("click", addBrand);
  $("#saveRegistryCloudBtn")?.addEventListener("click", saveRegistryToCloud);
}
function fillBrandSelect() {
  $("#brandSelect").innerHTML = adminState.brands.map(b => `<option value="${b.id}">${b.name_en} · ${b.name_ar || ''}</option>`).join("");
}
function renderEditor() {
  const bid = adminState.activeBrand;
  const doc = adminState.docs[bid];
  $("#brandJson").value = doc ? JSON.stringify(doc, null, 2) : "";
}
function saveCurrentOverride() {
  const bid = adminState.activeBrand;
  if (!bid) return setStatus("Select a brand first.", true);
  try {
    const parsed = JSON.parse($("#brandJson").value || "{}");
    adminState.docs[bid] = parsed;
    saveOverride(bid, parsed);
    setStatus(`Saved local override for ${bid}.`);
  } catch (err) { setStatus(`Invalid JSON: ${err.message}`, true); }
}
function resetCurrentOverride() {
  const bid = adminState.activeBrand;
  localStorage.removeItem(`washer_doc_override_${bid}`);
  setStatus(`Removed override for ${bid}. Reload page to restore base file.`);
}
function exportCurrentBrand() {
  const bid = adminState.activeBrand;
  const blob = new Blob([JSON.stringify(adminState.docs[bid], null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${bid}.json`; a.click();
}
async function cloudSaveCurrentBrand() {
  const bid = adminState.activeBrand;
  try {
    setStatus(`Saving ${bid} to cloud...`);
    const res = await fetch("/api/cloud-brand", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ brand: bid, data: adminState.docs[bid] }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Cloud save failed");
    setStatus(`Saved ${bid} to cloud.`);
  } catch(err) { setStatus(err.message, true); }
}
async function cloudLoadCurrentBrand() {
  const bid = adminState.activeBrand;
  try {
    setStatus(`Loading ${bid} from cloud...`);
    const res = await fetch(`/api/cloud-brand?brand=${encodeURIComponent(bid)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Cloud load failed");
    if (!data?.data) throw new Error("No cloud brand found");
    adminState.docs[bid] = data.data;
    saveOverride(bid, data.data);
    renderEditor();
    setStatus(`Loaded ${bid} from cloud.`);
  } catch(err) { setStatus(err.message, true); }
}
async function saveRegistryToCloud() {
  try {
    setStatus("Saving brand registry to cloud...");
    const res = await fetch("/api/cloud-brand", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ brand: "__brand_registry__", data: { brands: adminState.brands } }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to save registry");
    setStatus("Brand registry saved to cloud.");
  } catch (err) { setStatus(err.message, true); }
}
function addBrand() {
  const id = slugify($("#newBrandId").value || "");
  const name_en = text($("#newBrandNameEn").value || "").trim();
  const name_ar = text($("#newBrandNameAr").value || "").trim();
  const color = text($("#newBrandColor").value || "#3f7cff").trim();
  if (!id || !name_en) return setStatus("Brand id and English name are required.", true);
  if (adminState.brands.some(b => b.id === id)) return setStatus("Brand id already exists.", true);
  const logo = `assets/brands/${id}.svg`;
  const brand = { id, name_en, name_ar, logo, color, data_file: `data/brands/${id}.json` };
  adminState.brands.push(brand);
  adminState.docs[id] = {
    brand,
    updated_at: new Date().toISOString().slice(0,10),
    coverage_notes: "New brand created from admin page. Add verified models and sources.",
    models: [],
    source_registry: []
  };
  const local = getLocalRegistry().filter(b => b.id !== id);
  local.push(brand);
  saveLocalRegistry(local);
  saveOverride(id, adminState.docs[id]);
  fillBrandSelect();
  adminState.activeBrand = id;
  $("#brandSelect").value = id;
  renderEditor();
  setStatus(`Added brand ${id}. Upload or create matching SVG later if needed.`);
}
async function applyAIUpdate() {
  const bid = adminState.activeBrand;
  const instruction = $("#aiInstruction").value.trim() || "Expand the selected brand with more verified models, parts, boards, manuals, and remedy-rich faults while preserving JSON structure.";
  try {
    setStatus(`Applying AI update to ${bid}...`);
    const res = await fetch("/api/brand-update", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ brand: bid, instruction, currentData: adminState.docs[bid] }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "AI update failed");
    adminState.docs[bid] = data;
    renderEditor();
    setStatus(`AI updated ${bid}. Review then Save Override or Cloud Save.`);
  } catch(err) { setStatus(err.message, true); }
}
async function updateAllBrands() {
  try {
    setStatus("Updating all brands with AI...");
    const instruction = $("#aiInstruction").value.trim() || "Expand all brands while preserving verified structure and avoiding duplicates.";
    const payload = adminState.brands.map(b => adminState.docs[b.id]).filter(Boolean);
    const res = await fetch("/api/brand-update-all", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ brands: payload, instruction }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Update all failed");
    safeArray(data.brands).forEach(doc => { if (doc?.brand?.id) adminState.docs[doc.brand.id] = doc; });
    renderEditor();
    setStatus("AI updated all brands. Review each one before saving.");
  } catch(err) { setStatus(err.message, true); }
}
boot().catch(err => setStatus(err.message, true));
