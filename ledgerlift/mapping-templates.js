(() => {
  "use strict";

  const LIMITS = { free: 0, standard: 12, plus: 100 };
  const STORAGE_KEY = "ledgerlift.mapping-templates.v1";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const normalize = (value) => String(value ?? "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const safeName = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);

  function structure(columns = []) {
    return columns.map((column, position) => ({ position, label: String(column.label ?? column.header ?? "") }));
  }

  function validTemplate(template) {
    if (!template || typeof template !== "object" || !safeName(template.name) || !Array.isArray(template.columns) || !Array.isArray(template.assignments)) return false;
    if (template.columns.some((column) => !Number.isInteger(column.position) || typeof column.label !== "string")) return false;
    if (template.assignments.some((assignment) => !Number.isInteger(assignment.position) || typeof assignment.role !== "string")) return false;
    if ("rows" in template || "samples" in template || "values" in template || "source" in template) return false;
    return true;
  }

  function createTemplateStore({ tier = "free", storage } = {}) {
    const limit = LIMITS[tier] ?? LIMITS.free;
    const memory = [];
    const backend = storage || (typeof window !== "undefined" ? window.localStorage : null);
    function read() {
      if (!backend) return memory.map(clone);
      try { const parsed = JSON.parse(backend.getItem(STORAGE_KEY) || "[]"); return Array.isArray(parsed) ? parsed.filter(validTemplate).map(clone) : []; } catch { return []; }
    }
    function write(items) {
      if (!backend) { memory.splice(0, memory.length, ...items.map(clone)); return true; }
      try { backend.setItem(STORAGE_KEY, JSON.stringify(items)); return true; } catch { return false; }
    }
    function list() { return read(); }
    function save(name, blueprint = {}) {
      if (!limit) return { ok: false, reason: "Mapping templates are available in Standard and Plus workspaces. They store structure only, never transaction values." };
      const cleanName = safeName(name);
      if (!cleanName) return { ok: false, reason: "Enter a name for this mapping template." };
      const columns = structure(blueprint.columns || []);
      const assignments = (blueprint.assignments || []).map((assignment) => ({ position: Number(assignment.position), role: String(assignment.role || "unmapped") }));
      const template = { id: `mapping-template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, createdAt: new Date().toISOString(), columns, assignments, amountMode: String(blueprint.amountMode || "unresolved") };
      if (!validTemplate(template)) return { ok: false, reason: "This mapping could not be saved because its structure is incomplete." };
      const items = read();
      if (items.some((item) => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return { ok: false, reason: "A mapping template with that name already exists." };
      if (items.length >= limit) return { ok: false, reason: `This ${tier === "plus" ? "Plus" : "Standard"} workspace has reached its ${limit}-template limit.` };
      items.unshift(template);
      if (!write(items)) return { ok: false, reason: "LedgerHarbor could not save this template on the device." };
      return { ok: true, template: clone(template) };
    }
    function remove(id) {
      const items = read(), next = items.filter((item) => item.id !== id);
      if (next.length === items.length) return false;
      return write(next);
    }
    function match(columns) {
      const current = structure(columns);
      return read().map((template) => {
        const exact = template.columns.length === current.length && template.columns.every((column, index) => normalize(column.label) === normalize(current[index].label));
        const sameLabels = template.columns.filter((column) => current.some((item) => normalize(item.label) === normalize(column.label))).length;
        return { template: clone(template), compatible: exact, score: template.columns.length ? sameLabels / template.columns.length : 0, reason: exact ? "Header order and names match." : "The current headers do not exactly match this template." };
      }).filter((item) => item.compatible || item.score >= 0.75).sort((left, right) => Number(right.compatible) - Number(left.compatible) || right.score - left.score);
    }
    return { tier, limit, structure, validTemplate, list, save, remove, match, storageKey: STORAGE_KEY };
  }

  window.LedgerLiftMappingTemplates = { LIMITS, STORAGE_KEY, structure, validTemplate, create: createTemplateStore };
})();
