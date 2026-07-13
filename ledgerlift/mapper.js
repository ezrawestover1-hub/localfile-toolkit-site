(() => {
  "use strict";

  const HISTORY_LIMITS = { free: 40, standard: 100, plus: 200 };
  const UNIQUE_ROLES = new Set([
    "transactionDate", "postedDate", "description", "memo", "amount", "debit", "credit", "balance",
    "reference", "checkNumber", "name", "vendor", "customer", "employee", "account", "category",
    "class", "customerJob", "transactionType", "clearedStatus", "taxCode"
  ]);
  const ROLE_DEFINITIONS = [
    { id: "unmapped", label: "Not mapped", group: "Workflow" },
    { id: "ignore", label: "Ignore this column", group: "Workflow" },
    { id: "transactionDate", label: "Transaction date", group: "Dates" },
    { id: "postedDate", label: "Posted date", group: "Dates" },
    { id: "description", label: "Description", group: "Details" },
    { id: "memo", label: "Memo", group: "Details" },
    { id: "amount", label: "Signed amount", group: "Amounts" },
    { id: "debit", label: "Debit / withdrawal", group: "Amounts" },
    { id: "credit", label: "Credit / deposit", group: "Amounts" },
    { id: "balance", label: "Balance", group: "Amounts" },
    { id: "reference", label: "Reference", group: "Details" },
    { id: "checkNumber", label: "Check number", group: "Details" },
    { id: "name", label: "Name", group: "People and accounts" },
    { id: "vendor", label: "Vendor", group: "People and accounts" },
    { id: "customer", label: "Customer", group: "People and accounts" },
    { id: "employee", label: "Employee", group: "People and accounts" },
    { id: "account", label: "Account", group: "People and accounts" },
    { id: "category", label: "Category", group: "People and accounts" },
    { id: "class", label: "Class", group: "Other fields" },
    { id: "customerJob", label: "Customer / job", group: "Other fields" },
    { id: "transactionType", label: "Transaction type", group: "Other fields" },
    { id: "clearedStatus", label: "Cleared status", group: "Other fields" },
    { id: "taxCode", label: "Tax code", group: "Other fields" }
  ];
  const ROLE_LABELS = Object.fromEntries(ROLE_DEFINITIONS.map((role) => [role.id, role.label]));
  const ROLE_ALIASES = {
    date: "transactionDate", transactionDate: "transactionDate", postedDate: "postedDate", postingDate: "postedDate",
    description: "description", memo: "memo", amount: "amount", debit: "debit", credit: "credit", balance: "balance",
    account: "account", category: "category", reference: "reference", checkNumber: "checkNumber", name: "name",
    vendor: "vendor", customer: "customer", employee: "employee", class: "class", customerJob: "customerJob",
    transactionType: "transactionType", clearedStatus: "clearedStatus", taxCode: "taxCode"
  };
  const AMOUNT_ROLES = new Set(["amount", "debit", "credit"]);

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const text = (value) => String(value ?? "");
  const normalized = (value) => text(value).toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const compact = (value) => normalized(value).replace(/[^a-z0-9]/g, "");
  const isBlank = (value) => normalized(value) === "";
  const isDate = (value) => /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})$/.test(text(value).trim());
  const isNumber = (value) => /^\(?\s*[-+]?[$£€¥]?\s*\d[\d,.\s]*\s*\)?$/.test(text(value).trim()) && /\d/.test(text(value));
  const confidenceLabel = (value) => {
    const source = text(value).toLocaleLowerCase();
    if (source === "high") return "High";
    if (source === "medium" || source === "likely") return "Likely";
    if (source === "low" || source === "possible") return "Possible";
    return "Not identified";
  };
  const confidenceRank = (value) => ({ high: 3, medium: 2, likely: 2, low: 1, possible: 1 }[text(value).toLocaleLowerCase()] || 0);

  function createColumns(headers = []) {
    return headers.map((header, index) => ({ id: `column-${index + 1}`, index, header: text(header) }));
  }

  function profileColumns(columns, entries) {
    const rows = entries || [];
    return columns.map((column) => {
      const values = rows.map((entry) => text(entry.values?.[column.header]));
      const nonBlank = values.filter((value) => !isBlank(value));
      const dates = nonBlank.filter(isDate).length;
      const numbers = nonBlank.filter(isNumber).length;
      const unique = new Set(nonBlank.map(normalized)).size;
      return {
        columnId: column.id, nonBlank: nonBlank.length, blank: values.length - nonBlank.length,
        blankPercent: values.length ? Math.round(((values.length - nonBlank.length) / values.length) * 100) : 0,
        datePercent: nonBlank.length ? Math.round((dates / nonBlank.length) * 100) : 0,
        numericPercent: nonBlank.length ? Math.round((numbers / nonBlank.length) * 100) : 0,
        uniqueCount: unique, samples: nonBlank.slice(0, 3)
      };
    });
  }

  function createMapper({ review, cleaner = null, tier = "free", suggestedRoles = {}, templates = null } = {}) {
    const limit = HISTORY_LIMITS[tier] || HISTORY_LIMITS.free;
    const columns = createColumns(review?.headers || []);
    const byId = new Map(columns.map((column) => [column.id, column]));
    const entries = () => review?.activeEntries?.() || [];
    const profiles = new Map();
    const suggestions = new Map();
    let mappings = new Map(columns.map((column) => [column.id, { role: "unmapped", origin: "none", confirmed: false }]));
    let initialSuggestions = new Map();
    let amountMode = "unresolved";
    let history = [];
    let future = [];
    let pendingConflict = null;
    const listeners = new Set();

    function columnForHeader(header) { return columns.find((column) => column.header === header); }
    function sourceSuggestions() {
      Object.entries(suggestedRoles || {}).forEach(([sourceRole, suggestion]) => {
        const role = ROLE_ALIASES[sourceRole];
        const column = suggestion?.column ? columnForHeader(suggestion.column) : null;
        if (!role || !column) return;
        const list = suggestions.get(column.id) || [];
        list.push({ role, confidence: confidenceLabel(suggestion.confidence), score: Number(suggestion.score) || 0, label: ROLE_LABELS[role] });
        suggestions.set(column.id, list);
      });
      suggestions.forEach((list, id) => list.sort((left, right) => (confidenceRank(right.confidence) - confidenceRank(left.confidence)) || right.score - left.score));
    }

    function profileSuggestions() {
      columns.forEach((column) => {
        const profile = profiles.get(column.id);
        const header = compact(column.header);
        const list = suggestions.get(column.id) || [];
        const add = (role, score, confidence) => { if (!list.some((item) => item.role === role)) list.push({ role, score, confidence, label: ROLE_LABELS[role] }); };
        if (/^(date|transactiondate|posteddate|postingdate|effectivedate)$/.test(header)) add(header.includes("posted") || header.includes("posting") ? "postedDate" : "transactionDate", 8, "High");
        if (profile?.datePercent >= 75) add("transactionDate", 5, "Likely");
        if (/description|details|merchant|payee|memo/.test(header)) add(header.includes("memo") ? "memo" : "description", 8, "High");
        if (/^amount$|signedamount/.test(header)) add("amount", 8, "High");
        if (/debit|withdrawal|charge/.test(header)) add("debit", 8, "High");
        if (/credit|deposit/.test(header)) add("credit", 8, "High");
        if (/balance/.test(header)) add("balance", 8, "High");
        if (/category/.test(header)) add("category", 8, "High");
        if (/account/.test(header)) add("account", 8, "High");
        if (/check/.test(header)) add("checkNumber", 8, "High");
        if (/reference|ref/.test(header)) add("reference", 8, "High");
        if (!list.length && profile?.numericPercent >= 75) add("amount", 2, "Possible");
        if (!list.length && profile?.datePercent >= 50) add("transactionDate", 2, "Possible");
        list.sort((left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence) || right.score - left.score);
        suggestions.set(column.id, list);
      });
    }

    function suggestedMapping() {
      const result = new Map(columns.map((column) => [column.id, { role: "unmapped", origin: "none", confirmed: false }]));
      const usedRoles = new Set();
      const preferred = [...columns].sort((left, right) => (suggestions.get(right.id)?.[0]?.score || 0) - (suggestions.get(left.id)?.[0]?.score || 0));
      preferred.forEach((column) => {
        const candidate = (suggestions.get(column.id) || []).find((item) => {
          if (usedRoles.has(item.role) || !["High", "Likely"].includes(item.confidence)) return false;
          const profile = profiles.get(column.id);
          if (["debit", "credit"].includes(item.role) && profile?.nonBlank === 0 && [...suggestions.values()].some((list) => list.some((suggestion) => suggestion.role === "amount" && suggestion.confidence === "High"))) return false;
          return true;
        });
        if (!candidate) return;
        result.set(column.id, { role: candidate.role, origin: "suggestion", confirmed: false });
        usedRoles.add(candidate.role);
      });
      return result;
    }

    function inferredAmountMode() {
      const roles = new Set([...mappings.values()].map((mapping) => mapping.role));
      const hasAmount = roles.has("amount"), hasDebit = roles.has("debit"), hasCredit = roles.has("credit");
      if (hasAmount && (hasDebit || hasCredit)) return "unresolved";
      if (hasAmount) return "amount";
      if (hasDebit && hasCredit) return "debit-credit";
      if (hasDebit) return "debit-only";
      if (hasCredit) return "credit-only";
      return "unresolved";
    }

    function capture() { return { mappings: [...mappings.entries()].map(([id, value]) => [id, { ...value }]), amountMode, pendingConflict: pendingConflict ? { ...pendingConflict } : null }; }
    function restore(snapshot) { mappings = new Map(snapshot.mappings.map(([id, value]) => [id, { ...value }])); amountMode = snapshot.amountMode; pendingConflict = snapshot.pendingConflict ? { ...snapshot.pendingConflict } : null; }
    function notify(type = "mapping") {
      const detail = { type, canUndo: history.length > 0, canRedo: future.length > 0, validation: getValidation() };
      listeners.forEach((listener) => listener(detail));
      if (typeof window !== "undefined" && window.dispatchEvent && typeof CustomEvent === "function") window.dispatchEvent(new CustomEvent("ledgerlift:mapping-changed", { detail }));
    }
    function transaction(label, action) {
      const before = capture();
      const changed = action();
      if (!changed) return false;
      history.push({ label, before, after: capture() });
      if (history.length > limit) history.shift();
      future = [];
      notify("history");
      return true;
    }

    function refresh() {
      profileColumns(columns, entries()).forEach((profile) => profiles.set(profile.columnId, profile));
      suggestions.clear();
      sourceSuggestions();
      profileSuggestions();
      if (!initialSuggestions.size) {
        initialSuggestions = suggestedMapping();
        mappings = new Map([...initialSuggestions.entries()].map(([id, value]) => [id, { ...value }]));
        amountMode = inferredAmountMode();
      }
      notify("refresh");
      return getState();
    }

    function mappingForRole(role) { return columns.find((column) => mappings.get(column.id)?.role === role); }
    function setRole(columnId, role) {
      if (!byId.has(columnId) || !ROLE_LABELS[role]) return { ok: false, reason: "Unknown column or role." };
      const existing = mappingForRole(role);
      if (UNIQUE_ROLES.has(role) && existing && existing.id !== columnId) {
        pendingConflict = { type: "unique", columnId, role, existingColumnId: existing.id };
        notify("conflict");
        return { ok: false, conflict: { ...pendingConflict } };
      }
      const changed = transaction(`Map ${byId.get(columnId).header} as ${ROLE_LABELS[role]}`, () => {
        const current = mappings.get(columnId);
        if (current.role === role && current.origin === "manual") return false;
        mappings.set(columnId, { role, origin: "manual", confirmed: true });
        pendingConflict = null;
        return true;
      });
      return { ok: changed, mapping: mappings.get(columnId) };
    }
    function resolveConflict(action) {
      const conflict = pendingConflict;
      if (!conflict || !byId.has(conflict.columnId) || !byId.has(conflict.existingColumnId)) return { ok: false, reason: "No mapping conflict is waiting for a choice." };
      const changed = transaction(action === "swap" ? "Swap column assignments" : "Replace column assignment", () => {
        const target = mappings.get(conflict.columnId), existing = mappings.get(conflict.existingColumnId);
        if (action === "swap" && target.role !== "unmapped" && target.role !== "ignore") mappings.set(conflict.existingColumnId, { role: target.role, origin: "manual", confirmed: true });
        else mappings.set(conflict.existingColumnId, { role: "unmapped", origin: "manual", confirmed: true });
        mappings.set(conflict.columnId, { role: conflict.role, origin: "manual", confirmed: true });
        pendingConflict = null;
        return existing.role !== conflict.role || target.role !== conflict.role;
      });
      return { ok: changed };
    }
    function setAmountMode(mode, { resolve = false } = {}) {
      if (!["amount", "debit-credit", "debit-only", "credit-only", "unresolved"].includes(mode)) return { ok: false, reason: "Unknown amount mode." };
      const conflicting = [...mappings.entries()].filter(([, mapping]) => mode === "amount" ? ["debit", "credit"].includes(mapping.role) : mode === "debit-credit" ? mapping.role === "amount" : false);
      if (conflicting.length && !resolve) return { ok: false, conflict: { type: "amount-structure", mode, columnIds: conflicting.map(([id]) => id) } };
      const changed = transaction(`Use ${mode === "amount" ? "signed amount" : mode === "debit-credit" ? "debit and credit" : mode}`, () => {
        if (resolve) conflicting.forEach(([id]) => mappings.set(id, { role: "unmapped", origin: "manual", confirmed: true }));
        if (amountMode === mode && !conflicting.length) return false;
        amountMode = mode;
        return true;
      });
      return { ok: changed, amountMode };
    }
    function clearColumn(columnId) { return transaction("Clear column mapping", () => { if (!mappings.has(columnId) || mappings.get(columnId).role === "unmapped") return false; mappings.set(columnId, { role: "unmapped", origin: "manual", confirmed: true }); return true; }); }
    function resetColumn(columnId) { return transaction("Reset column to suggestion", () => { const next = initialSuggestions.get(columnId) || { role: "unmapped", origin: "none", confirmed: false }; const current = mappings.get(columnId); if (current?.role === next.role && current?.origin === next.origin) return false; mappings.set(columnId, { ...next }); return true; }); }
    function resetAll() { return transaction("Reset mappings to suggestions", () => { const before = JSON.stringify([...mappings]); mappings = new Map([...initialSuggestions.entries()].map(([id, value]) => [id, { ...value }])); amountMode = inferredAmountMode(); return before !== JSON.stringify([...mappings]); }); }
    function clearAll() { return transaction("Clear all mappings", () => { const had = [...mappings.values()].some((mapping) => mapping.role !== "unmapped"); mappings = new Map(columns.map((column) => [column.id, { role: "unmapped", origin: "manual", confirmed: true }])); amountMode = "unresolved"; return had; }); }
    function applyHighConfidence() {
      return transaction("Apply high-confidence suggestions", () => {
        let changed = false;
        const used = new Set([...mappings.values()].map((mapping) => mapping.role).filter((role) => role !== "unmapped" && role !== "ignore"));
        columns.forEach((column) => {
          const current = mappings.get(column.id), candidate = (suggestions.get(column.id) || []).find((item) => item.confidence === "High" && !used.has(item.role));
          if (!candidate || (current.origin === "manual" && !["unmapped", "ignore"].includes(current.role))) return;
          used.add(candidate.role); mappings.set(column.id, { role: candidate.role, origin: "suggestion", confirmed: false }); changed = true;
        });
        amountMode = inferredAmountMode();
        return changed;
      });
    }
    function undo() { const action = history.pop(); if (!action) return false; future.push({ ...action, before: action.after, after: action.before }); restore(action.before); notify("undo"); return true; }
    function redo() { const action = future.pop(); if (!action) return false; history.push({ ...action, before: action.after, after: action.before }); restore(action.after); notify("redo"); return true; }

    function getValidation() {
      const issues = [], roles = new Map();
      mappings.forEach((mapping, columnId) => { if (["unmapped", "ignore"].includes(mapping.role)) return; const list = roles.get(mapping.role) || []; list.push(columnId); roles.set(mapping.role, list); });
      roles.forEach((ids, role) => { if (UNIQUE_ROLES.has(role) && ids.length > 1) issues.push({ severity: "blocking", code: "duplicate-role", role, columnIds: ids, message: `Choose only one ${ROLE_LABELS[role].toLocaleLowerCase()} column.` }); });
      const date = mappingForRole("transactionDate") || mappingForRole("postedDate");
      if (!date) issues.push({ severity: "blocking", code: "missing-date", message: "Map a transaction date or posted date column." });
      const description = mappingForRole("description") || mappingForRole("memo") || mappingForRole("vendor") || mappingForRole("name");
      if (!description) issues.push({ severity: "blocking", code: "missing-description", message: "Map a description, memo, vendor, or name column." });
      const mode = amountMode === "unresolved" ? inferredAmountMode() : amountMode;
      const amount = mappingForRole("amount"), debit = mappingForRole("debit"), credit = mappingForRole("credit");
      if (amount && (debit || credit)) issues.push({ severity: "blocking", code: "amount-structure-conflict", message: "Choose either Signed amount or Debit and credit; both structures cannot be used together." });
      else if (!amount && !debit && !credit) issues.push({ severity: "blocking", code: "missing-amount", message: "Map a signed amount or debit / credit columns." });
      else if ((mode === "debit-only" || mode === "credit-only") && !amount) issues.push({ severity: "warning", code: "one-sided-amount", message: "Only one side of the debit / credit structure is mapped. Confirm that blank values are intentional." });
      if (pendingConflict) issues.push({ severity: "blocking", code: "pending-conflict", message: `Resolve the ${ROLE_LABELS[pendingConflict.role].toLocaleLowerCase()} column conflict before continuing.` });
      const blocking = issues.filter((issue) => issue.severity === "blocking");
      return { canContinue: blocking.length === 0, issues, blocking, warnings: issues.filter((issue) => issue.severity === "warning"), mode, mappedCount: [...mappings.values()].filter((mapping) => !["unmapped", "ignore"].includes(mapping.role)).length, ignoredCount: [...mappings.values()].filter((mapping) => mapping.role === "ignore").length, pendingConflict: pendingConflict ? { ...pendingConflict } : null };
    }
    function getPreview(limit = 6) {
      const validation = getValidation();
      const sourceFor = (role) => mappingForRole(role)?.header || "";
      const valuesFor = (entry, role) => { const column = mappingForRole(role); return column ? text(entry.values[column.header]) : ""; };
      return entries().slice(0, Math.max(1, Math.min(20, limit))).map((entry) => {
        const debit = valuesFor(entry, "debit"), credit = valuesFor(entry, "credit");
        return { id: entry.id, source: Object.fromEntries(columns.map((column) => [column.header, text(entry.values[column.header])])), fields: {
          date: valuesFor(entry, "transactionDate") || valuesFor(entry, "postedDate"), description: valuesFor(entry, "description") || valuesFor(entry, "memo") || valuesFor(entry, "vendor") || valuesFor(entry, "name"), memo: valuesFor(entry, "memo"),
          amount: validation.mode === "debit-credit" ? "" : valuesFor(entry, "amount"), debit, credit, reference: valuesFor(entry, "reference") || valuesFor(entry, "checkNumber"), name: valuesFor(entry, "name") || valuesFor(entry, "vendor"), account: valuesFor(entry, "account"), category: valuesFor(entry, "category")
        }, sourceColumns: { date: sourceFor("transactionDate") || sourceFor("postedDate"), description: sourceFor("description") || sourceFor("memo"), amount: sourceFor("amount"), debit: sourceFor("debit"), credit: sourceFor("credit") } };
      });
    }
    function mappingPayload() {
      const byRole = {};
      mappings.forEach((mapping, columnId) => { if (!["unmapped", "ignore"].includes(mapping.role)) byRole[mapping.role] = byId.get(columnId)?.header || ""; });
      return { columns: columns.map((column) => ({ ...column, ...(mappings.get(column.id) || {}) })), byRole, amountMode: getValidation().mode, validation: getValidation() };
    }
    function getState() { return { columns: columns.map((column) => ({ ...column, ...(mappings.get(column.id) || {}), suggestions: [...(suggestions.get(column.id) || [])], profile: profiles.get(column.id) ? { ...profiles.get(column.id) } : null })), mappings: Object.fromEntries([...mappings.entries()].map(([id, value]) => [id, { ...value }])), amountMode: getValidation().mode, validation: getValidation(), preview: getPreview(), historyLimit: limit, canUndo: history.length > 0, canRedo: future.length > 0, pendingConflict: pendingConflict ? { ...pendingConflict } : null, tier }; }
    function applyTemplate(template) {
      const matched = columns.every((column, index) => template.columns?.[index] && normalized(template.columns[index].label) === normalized(column.header));
      if (!matched || template.columns?.length !== columns.length) return { ok: false, reason: "This template does not match the current column structure." };
      const changed = transaction(`Apply mapping template ${template.name}`, () => {
        const next = new Map(columns.map((column) => [column.id, { role: "unmapped", origin: "manual", confirmed: true }]));
        (template.assignments || []).forEach((assignment) => { const column = columns[assignment.position]; if (column && ROLE_LABELS[assignment.role]) next.set(column.id, { role: assignment.role, origin: "manual", confirmed: true }); });
        mappings = next; amountMode = template.amountMode || inferredAmountMode(); return true;
      });
      return { ok: changed };
    }

    sourceSuggestions();
    refresh();
    review?.subscribe?.(() => refresh());
    cleaner?.subscribe?.(() => refresh());
    return { columns: columns.map((column) => ({ ...column })), roles: ROLE_DEFINITIONS.map((role) => ({ ...role })), getState, getValidation, getPreview, getMapping: mappingPayload, getProfiles: () => [...profiles.values()].map((profile) => ({ ...profile })), getSuggestions: (columnId) => [...(suggestions.get(columnId) || [])], setRole, resolveConflict, setAmountMode, clearColumn, resetColumn, resetAll, clearAll, applyHighConfidence, applyTemplate, undo, redo, refresh, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, getTemplateStore: () => templates, mappingTemplateBlueprint: () => ({ columns: columns.map((column) => ({ position: column.index, label: column.header })), assignments: columns.map((column) => ({ position: column.index, role: mappings.get(column.id)?.role || "unmapped" })), amountMode: getValidation().mode }) };
  }

  window.LedgerLiftMapper = { HISTORY_LIMITS, ROLE_DEFINITIONS, ROLE_LABELS, create: createMapper, profileColumns, confidenceLabel };
})();
