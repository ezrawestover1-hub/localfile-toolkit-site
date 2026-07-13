(() => {
  "use strict";

  const LIMITS = { free: 0, standard: 250, plus: 1000 };
  const STORAGE_KEY = "ledgerlift.destination-library.v1";
  const TYPES = new Set(["account", "vendor", "customer", "employee", "other-name", "class", "customer-job", "transaction-type", "cleared-status", "tax-code"]);
  const text = (value) => String(value ?? "");
  const normalize = (value) => text(value).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function cleanDestination(input = {}) {
    const type = text(input.type), name = text(input.name).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
    if (!TYPES.has(type) || !name) return null;
    return { id: text(input.id), type, name, accountType: type === "account" ? text(input.accountType) : "", parentId: type === "account" ? text(input.parentId) : "", description: text(input.description).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200), created: true, persistent: true };
  }
  function create({ tier = "free", storage } = {}) {
    const limit = LIMITS[tier] ?? LIMITS.free;
    const backend = storage || (typeof window !== "undefined" ? window.localStorage : null);
    function read() {
      if (!backend) return [];
      try { const parsed = JSON.parse(backend.getItem(STORAGE_KEY) || "[]"); return Array.isArray(parsed) ? parsed.map(cleanDestination).filter(Boolean) : []; } catch { return []; }
    }
    function write(items) {
      if (!backend) return false;
      try { backend.setItem(STORAGE_KEY, JSON.stringify(items.map(cleanDestination).filter(Boolean))); return true; } catch { return false; }
    }
    function list() { return limit ? read().map(clone) : []; }
    function replace(destinations = []) {
      if (!limit) return { ok: false, reason: "Persistent destination libraries are available in Standard and Plus workspaces." };
      const next = []; const seen = new Set();
      destinations.forEach((input) => {
        const item = cleanDestination(input); if (!item) return;
        const key = `${item.type}:${normalize(item.name)}`; if (seen.has(key)) return;
        seen.add(key); next.push(item);
      });
      if (next.length > limit) return { ok: false, reason: `This ${tier === "plus" ? "Plus" : "Standard"} workspace supports up to ${limit} saved destinations.` };
      const validParents = new Set(next.filter((item) => item.type === "account").map((item) => item.id));
      next.forEach((item) => { if (!validParents.has(item.parentId)) item.parentId = ""; });
      return write(next) ? { ok: true, count: next.length } : { ok: false, reason: "LedgerLift could not save the destination library on this device." };
    }
    return { tier, limit, storageKey: STORAGE_KEY, list, replace, cleanDestination };
  }
  window.LedgerLiftDestinationLibrary = { LIMITS, STORAGE_KEY, create, cleanDestination, normalize };
})();
