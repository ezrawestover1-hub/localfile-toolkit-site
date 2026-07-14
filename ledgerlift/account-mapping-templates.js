(() => {
  "use strict";

  const LIMITS = { free: 0, standard: 12, plus: 60 };
  const STORAGE_KEY = "ledgerlift.account-mapping-templates.v1";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const normalize = (value) => String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const safeName = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  const valid = (template) => Boolean(template && typeof template === "object" && safeName(template.name) && Array.isArray(template.entries) && Array.isArray(template.signature) && !["rows", "amounts", "dates", "values", "file"].some((key) => key in template));

  function create({ tier = "free", storage } = {}) {
    const limit = LIMITS[tier] ?? LIMITS.free;
    const memory = [];
    const backend = storage || (typeof window !== "undefined" ? window.localStorage : null);
    function read() {
      if (!backend) return memory.map(clone);
      try { const parsed = JSON.parse(backend.getItem(STORAGE_KEY) || "[]"); return Array.isArray(parsed) ? parsed.filter(valid).map(clone) : []; } catch { return []; }
    }
    function write(items) {
      if (!backend) { memory.splice(0, memory.length, ...items.map(clone)); return true; }
      try { backend.setItem(STORAGE_KEY, JSON.stringify(items)); return true; } catch { return false; }
    }
    function save(name, blueprint = {}) {
      if (!limit) return { ok: false, reason: "Value-mapping templates are available in Standard and Plus workspaces." };
      const cleanName = safeName(name);
      if (!cleanName) return { ok: false, reason: "Enter a name for this value-mapping template." };
      const template = {
        id: `account-mapping-template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        createdAt: new Date().toISOString(),
        signature: (blueprint.signature || []).map((item) => ({ columnId: String(item.columnId || ""), role: String(item.role || "") })),
        entries: (blueprint.entries || []).map((item) => ({ sourceRole: String(item.sourceRole || ""), normalizedValue: normalize(item.normalizedValue), destinationType: String(item.destinationType || ""), destinationName: safeName(item.destinationName), accountType: safeName(item.accountType), parentName: safeName(item.parentName), ignored: Boolean(item.ignored), defaultMapping: Boolean(item.defaultMapping) })),
        defaults: { sourceAccountName: safeName(blueprint.defaults?.sourceAccountName), sourceAccountType: safeName(blueprint.defaults?.sourceAccountType) }
      };
      if (!valid(template) || template.entries.some((item) => !item.sourceRole || !item.normalizedValue || !item.destinationType)) return { ok: false, reason: "This template needs a source role and destination for each saved mapping. It stores mapping keys, not transaction rows." };
      const items = read();
      if (items.some((item) => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return { ok: false, reason: "A value-mapping template with that name already exists." };
      if (items.length >= limit) return { ok: false, reason: `This ${tier === "plus" ? "Plus" : "Standard"} workspace has reached its ${limit}-template limit.` };
      items.unshift(template);
      return write(items) ? { ok: true, template: clone(template) } : { ok: false, reason: "LedgerHarbor could not save this template on the device." };
    }
    function rename(id, name) {
      const cleanName = safeName(name), items = read(), item = items.find((candidate) => candidate.id === id);
      if (!item || !cleanName) return { ok: false, reason: "Enter a valid template name." };
      if (items.some((candidate) => candidate.id !== id && candidate.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return { ok: false, reason: "A value-mapping template with that name already exists." };
      item.name = cleanName;
      return write(items) ? { ok: true, template: clone(item) } : { ok: false, reason: "LedgerHarbor could not rename this template." };
    }
    function remove(id) { const items = read(), next = items.filter((item) => item.id !== id); return next.length !== items.length && write(next); }
    function preview(template, records = [], signature = []) {
      if (!valid(template)) return { compatible: false, reason: "This saved template is not valid." };
      const signatureMatch = template.signature.length === signature.length && template.signature.every((item, index) => item.role === signature[index]?.role);
      const matches = [], unmatched = [];
      records.filter((record) => record.active).forEach((record) => {
        const match = template.entries.find((item) => item.sourceRole === record.sourceRole && item.normalizedValue === normalize(record.normalizedValue));
        if (match) matches.push({ recordId: record.id, mapping: clone(match) }); else unmatched.push(record.id);
      });
      return { compatible: signatureMatch, reason: signatureMatch ? "Mapped source-role structure matches." : "The mapped source-role structure does not match exactly.", matches, unmatched, missingDestinations: matches.filter((item) => !item.mapping.destinationName).map((item) => item.recordId) };
    }
    return { tier, limit, storageKey: STORAGE_KEY, list: () => read(), save, rename, remove, preview, valid };
  }

  window.LedgerLiftAccountMappingTemplates = { LIMITS, STORAGE_KEY, normalize, valid, create };
})();
