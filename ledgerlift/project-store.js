(() => {
  "use strict";

  const LIMITS = { free: 0, standard: 12, plus: 60 };
  const DB_NAME = "ledgerlift-local-projects-v1";
  const STORE_NAME = "projects";
  const text = (value) => String(value ?? "");
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const safeName = (value) => text(value).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  function metadata(project) { return { id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt, rowCount: Number(project.rowCount) || 0, format: project.format || "", worksheetName: project.worksheetName || "", currentStep: Number(project.currentStep) || 2 }; }
  function create({ tier = "free", indexedDb, adapter } = {}) {
    const limit = LIMITS[tier] ?? LIMITS.free;
    const memory = new Map();
    let dbPromise = null;
    function open() {
      const source = indexedDb || (typeof window !== "undefined" ? window.indexedDB : null);
      if (!source) return Promise.resolve(null);
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = source.open(DB_NAME, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" }); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("LedgerLift could not open local project storage."));
      });
      return dbPromise;
    }
    function request(db, mode, action) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode), store = transaction.objectStore(STORE_NAME); let result;
        try { result = action(store); } catch (error) { reject(error); return; }
        result.onsuccess = () => resolve(result.result); result.onerror = () => reject(result.error || new Error("LedgerLift local project storage failed."));
      });
    }
    async function list() {
      if (!limit) return [];
      if (adapter?.list) return (await adapter.list()).map(metadata);
      try {
        const db = await open(); if (!db) return [...memory.values()].map(metadata).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return (await request(db, "readonly", (store) => store.getAll())).map(metadata).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      } catch { return []; }
    }
    async function save(name, snapshot, id = "") {
      if (!limit) return { ok: false, reason: "Saved projects are available in Standard and Plus workspaces." };
      const cleanName = safeName(name); if (!cleanName) return { ok: false, reason: "Enter a name for this saved project." };
      const existing = id ? await load(id) : null; const current = existing || {}; const now = new Date().toISOString();
      const project = { ...clone(snapshot), id: current.id || `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: cleanName, createdAt: current.createdAt || now, updatedAt: now, rowCount: Number(snapshot?.rowCount) || 0, format: text(snapshot?.format), worksheetName: text(snapshot?.worksheetName), currentStep: Number(snapshot?.currentStep || snapshot?.workflow?.currentStep) || 2 };
      const currentProjects = await list(); if (!existing && currentProjects.length >= limit) return { ok: false, reason: `This ${tier === "plus" ? "Plus" : "Standard"} workspace has reached its ${limit}-project limit.` };
      if (adapter?.put) { await adapter.put(clone(project)); return { ok: true, project: metadata(project) }; }
      let db;
      try { db = await open(); } catch { return { ok: false, reason: "LedgerLift could not save this project on the device." }; }
      if (!db) { memory.set(project.id, clone(project)); return { ok: true, project: metadata(project), persistent: false }; }
      try { await request(db, "readwrite", (store) => store.put(project)); return { ok: true, project: metadata(project) }; } catch { return { ok: false, reason: "LedgerLift could not save this project on the device." }; }
    }
    async function load(id) {
      if (!limit) return null;
      if (adapter?.get) return clone(await adapter.get(id));
      try { const db = await open(); if (!db) return clone(memory.get(id) || null); return clone(await request(db, "readonly", (store) => store.get(id))); } catch { return null; }
    }
    async function remove(id) {
      if (!limit) return { ok: false, reason: "Saved projects are available in Standard and Plus workspaces." };
      if (adapter?.remove) { await adapter.remove(id); return { ok: true }; }
      try { const db = await open(); if (!db) return { ok: memory.delete(id) }; await request(db, "readwrite", (store) => store.delete(id)); return { ok: true }; } catch { return { ok: false, reason: "LedgerLift could not remove this project." }; }
    }
    return { tier, limit, dbName: DB_NAME, storeName: STORE_NAME, list, save, load, remove, metadata };
  }
  window.LedgerLiftProjectStore = { LIMITS, DB_NAME, STORE_NAME, create, safeName };
})();
