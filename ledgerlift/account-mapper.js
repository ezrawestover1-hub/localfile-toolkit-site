(() => {
  "use strict";

  const HISTORY_LIMITS = { free: 40, standard: 100, plus: 200 };
  const REQUIRED_ROLES = new Set(["account", "category"]);
  const ELIGIBLE_ROLES = new Set(["account", "category", "name", "vendor", "customer", "employee", "class", "customerJob", "transactionType", "clearedStatus", "taxCode"]);
  const OPTIONAL_ROLES = new Set(["name", "vendor", "customer", "employee", "class", "customerJob", "transactionType", "clearedStatus", "taxCode"]);
  const DESTINATION_TYPES = [
    { id: "account", label: "Account" }, { id: "vendor", label: "Vendor" }, { id: "customer", label: "Customer" }, { id: "employee", label: "Employee" }, { id: "other-name", label: "Other name" },
    { id: "class", label: "Class" }, { id: "customer-job", label: "Customer / job" }, { id: "transaction-type", label: "Transaction type" }, { id: "cleared-status", label: "Cleared status" }, { id: "tax-code", label: "Tax code" }
  ];
  const ACCOUNT_TYPES = [
    { id: "BANK", label: "Bank" }, { id: "CCARD", label: "Credit Card" }, { id: "AR", label: "Accounts Receivable" }, { id: "AP", label: "Accounts Payable" }, { id: "INCOME", label: "Income" }, { id: "EXPENSE", label: "Expense" }, { id: "COGS", label: "Cost of Goods Sold" }, { id: "OCA", label: "Other Current Asset" }, { id: "FIXED_ASSET", label: "Fixed Asset" }, { id: "OTHER_ASSET", label: "Other Asset" }, { id: "OCL", label: "Other Current Liability" }, { id: "LTLIAB", label: "Long-Term Liability" }, { id: "EQUITY", label: "Equity" }, { id: "OINCOME", label: "Other Income" }, { id: "OEXPENSE", label: "Other Expense" }, { id: "UNDEPOSITED", label: "Undeposited Funds" }, { id: "CASH", label: "Cash" }
  ];
  const ROLE_LABELS = { account: "Account", category: "Category", name: "Name", vendor: "Vendor", customer: "Customer", employee: "Employee", class: "Class", customerJob: "Customer / job", transactionType: "Transaction type", clearedStatus: "Cleared status", taxCode: "Tax code" };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const text = (value) => String(value ?? "");
  const normalize = (value) => text(value).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const punctuationNormalized = (value) => normalize(value).replace(/[\p{P}\p{S}]+/gu, "").replace(/\s+/g, "");
  const hash = (value) => { let result = 2166136261; for (const character of text(value)) { result ^= character.codePointAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(36); };
  const destinationTypeForRole = (role) => role === "account" || role === "category" ? ["account"] : role === "name" ? ["vendor", "customer", "employee", "other-name"] : role === "vendor" ? ["vendor"] : role === "customer" ? ["customer"] : role === "employee" ? ["employee"] : role === "class" ? ["class"] : role === "customerJob" ? ["customer-job"] : role === "transactionType" ? ["transaction-type"] : role === "clearedStatus" ? ["cleared-status"] : role === "taxCode" ? ["tax-code"] : [];
  const typeLabel = (type) => DESTINATION_TYPES.find((item) => item.id === type)?.label || type;

  function createAccountMapper({ review, mapper, tier = "free", templates = null, initialDestinations = [], savedState = null } = {}) {
    const historyLimit = HISTORY_LIMITS[tier] || HISTORY_LIMITS.free;
    let destinations = new Map((initialDestinations || []).filter((destination) => destination?.id && destination?.name).map((destination) => [destination.id, { ...destination, created: true, persistent: true }]));
    let records = new Map();
    let sourceAccount = { destinationId: "", accountType: "BANK" };
    let history = [];
    let future = [];
    let sequence = destinations.size + 1;
    let defaults = {};
    let sourceColumns = [];
    let notice = "";
    let pendingDuplicate = null;
    const listeners = new Set();

    function entries() { return review?.activeEntries?.() || []; }
    function signature() { return sourceColumns.map((column) => ({ columnId: column.id, role: column.role })); }
    function compatible(role, destination) { return Boolean(destination && destinationTypeForRole(role).includes(destination.type)); }
    function usedDestination(id) { return [...records.values()].some((record) => record.active && record.destinationId === id) || sourceAccount.destinationId === id; }
    function destinationName(id) { return destinations.get(id)?.name || ""; }
    function capture() { return { destinations: [...destinations.entries()].map(([id, value]) => [id, { ...value }]), records: [...records.entries()].map(([id, value]) => [id, { ...value, rowIds: [...value.rowIds], suggestion: value.suggestion ? { ...value.suggestion } : null }]), sourceAccount: { ...sourceAccount }, defaults: { ...defaults }, sequence, notice }; }
    function restore(snapshot) { destinations = new Map(snapshot.destinations.map(([id, value]) => [id, { ...value }])); records = new Map(snapshot.records.map(([id, value]) => [id, { ...value, rowIds: [...value.rowIds], suggestion: value.suggestion ? { ...value.suggestion } : null }])); sourceAccount = { ...snapshot.sourceAccount }; defaults = { ...(snapshot.defaults || {}) }; sequence = snapshot.sequence; notice = snapshot.notice || ""; }
    function validation() {
      const active = [...records.values()].filter((record) => record.active);
      const eligibleAccount = sourceColumns.some((column) => column.role === "account");
      const blocking = [], warnings = [], requiredUnmapped = active.filter((record) => REQUIRED_ROLES.has(record.sourceRole) && !record.destinationId && !record.ignored);
      if (!eligibleAccount && !sourceAccount.destinationId) blocking.push({ code: "missing-source-account", message: "Choose the bank, credit-card, or cash account represented by this file." });
      if (requiredUnmapped.length) blocking.push({ code: "required-values-unmapped", message: `${requiredUnmapped.length} required account or category value${requiredUnmapped.length === 1 ? " remains" : "s remain"} unmapped.` });
      active.filter((record) => record.destinationId && !compatible(record.sourceRole, destinations.get(record.destinationId))).forEach((record) => blocking.push({ code: "invalid-destination", recordId: record.id, message: `${record.sourceValue} has an incompatible destination type.` }));
      const optionalUnmapped = active.filter((record) => OPTIONAL_ROLES.has(record.sourceRole) && !record.destinationId && !record.ignored);
      if (optionalUnmapped.length) warnings.push({ code: "optional-values-unmapped", message: `${optionalUnmapped.length} optional value${optionalUnmapped.length === 1 ? " remains" : "s remain"} unmapped.` });
      const conflicts = active.filter((record) => record.suggestion?.confidence === "Possible");
      if (conflicts.length) warnings.push({ code: "possible-matches", message: `${conflicts.length} possible match${conflicts.length === 1 ? " is" : "es are"} waiting for review.` });
      const transfers = active.filter((record) => /\btransfer\b/i.test(record.sourceValue) || (record.sourceRole === "transactionType" && /transfer/i.test(record.sourceValue)));
      if (transfers.length) warnings.push({ code: "possible-transfer", message: "Possible transfer values are present. LedgerHarbor will check them during validation." });
      const destinationsUsed = new Map(); active.forEach((record) => { if (record.destinationId) destinationsUsed.set(record.destinationId, (destinationsUsed.get(record.destinationId) || 0) + 1); });
      destinationsUsed.forEach((count, id) => { if (count > 25) warnings.push({ code: "high-destination-use", destinationId: id, message: `${destinationName(id)} receives ${count} source values. Review the assignments.` }); });
      return { canContinue: blocking.length === 0, blocking, warnings, activeRows: entries().length, uniqueValues: active.length, mappedValues: active.filter((record) => record.destinationId).length, unmappedValues: active.filter((record) => !record.destinationId && !record.ignored).length, ignoredValues: active.filter((record) => record.ignored).length, rowsAffected: new Set(active.filter((record) => !record.destinationId && !record.ignored).flatMap((record) => record.rowIds)).size, blankRows: sourceColumns.reduce((sum, column) => sum + entries().filter((entry) => !text(entry.values[column.header]).trim()).length, 0), hasSourceAccountColumn: eligibleAccount };
    }
    function notify(type = "mapping") {
      const detail = { type, notice, canUndo: history.length > 0, canRedo: future.length > 0, validation: validation() };
      listeners.forEach((listener) => listener(detail));
      if (typeof window !== "undefined" && window.dispatchEvent && typeof CustomEvent === "function") window.dispatchEvent(new CustomEvent("ledgerlift:account-mapping-changed", { detail }));
    }
    function transaction(label, action) {
      const before = capture(), changed = action();
      if (!changed) return false;
      history.push({ label, before, after: capture() }); if (history.length > historyLimit) history.shift(); future = []; notify("history"); return true;
    }
    function suggest(record) {
      const candidates = [...destinations.values()].filter((destination) => compatible(record.sourceRole, destination)).map((destination) => {
        if (text(destination.name) === record.sourceValue) return { destinationId: destination.id, confidence: "Exact match", reason: "Same name and capitalization." };
        if (normalize(destination.name) === record.normalizedValue) return { destinationId: destination.id, confidence: "Strong normalized match", reason: "Same name after capitalization or extra spaces were removed." };
        if (punctuationNormalized(destination.name) === punctuationNormalized(record.sourceValue)) return { destinationId: destination.id, confidence: "Possible match", reason: "Same name after harmless punctuation differences were removed." };
        return null;
      }).filter(Boolean);
      const best = candidates.sort((left, right) => ({ "Exact match": 3, "Strong normalized match": 2, "Possible match": 1 }[right.confidence] - ({ "Exact match": 3, "Strong normalized match": 2, "Possible match": 1 }[left.confidence])));
      return best.length ? { ...best[0], alternatives: best.slice(1).map((item) => item.destinationId) } : null;
    }
    function discover() {
      const mappedColumns = mapper?.getState?.().columns || [];
      const nextColumns = mappedColumns.filter((column) => ELIGIBLE_ROLES.has(column.role));
      const previous = records;
      const next = new Map();
      nextColumns.forEach((column) => {
        const groups = new Map();
        entries().forEach((entry) => {
          const value = text(entry.values[column.header]);
          if (!value.trim()) return;
          const id = `source-value-${column.id}-${hash(value)}`;
          const group = groups.get(id) || { id, sourceColumnId: column.id, sourceRole: column.role, columnHeader: column.header, sourceValue: value, normalizedValue: normalize(value), count: 0, rowIds: [], active: true, destinationId: "", origin: "none", confirmed: false, ignored: false, defaultMapping: false, suggestion: null, warning: "" };
          group.count += 1; group.rowIds.push(entry.id); groups.set(id, group);
        });
        groups.forEach((group) => {
          const old = previous.get(group.id);
          if (old && old.sourceRole === group.sourceRole) Object.assign(group, { destinationId: old.destinationId, origin: old.origin, confirmed: old.confirmed, ignored: old.ignored, defaultMapping: old.defaultMapping, previousDestinationId: old.previousDestinationId, suggestion: old.suggestion, warning: old.warning });
          else if (old) group.warning = "The source column role changed; confirm this value again.";
          group.suggestion = suggest(group);
          if (group.suggestion && group.suggestion.confidence === "Possible") group.warning = "More than one spelling could refer to this destination. Confirm it manually.";
          next.set(group.id, group);
        });
      });
      previous.forEach((record, id) => { if (!next.has(id)) next.set(id, { ...record, active: false, rowIds: [] }); });
      sourceColumns = nextColumns.map((column) => ({ id: column.id, role: column.role, header: column.header }));
      records = next;
      return records;
    }
    function createDestination(input = {}, options = {}) {
      const type = String(input.type || "account"), name = text(input.name).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
      if (!DESTINATION_TYPES.some((item) => item.id === type)) return { ok: false, reason: "Choose a supported destination type." };
      if (!name) return { ok: false, reason: "Enter a destination name." };
      if (type === "account" && !ACCOUNT_TYPES.some((item) => item.id === input.accountType)) return { ok: false, reason: "Choose an account type." };
      const duplicate = [...destinations.values()].find((destination) => destination.type === type && normalize(destination.name) === normalize(name));
      if (duplicate && !options.allowDuplicate) { pendingDuplicate = { existingId: duplicate.id, name }; return { ok: false, duplicate: { ...duplicate }, reason: "A destination with the same name already exists. Select it or confirm a deliberately separate value." }; }
      const parentId = type === "account" ? String(input.parentId || "") : "";
      if (parentId && (!destinations.has(parentId) || destinations.get(parentId).type !== "account")) return { ok: false, reason: "Choose an existing account as the parent." };
      const destination = { id: `destination-${Date.now()}-${sequence++}`, type, name, accountType: type === "account" ? String(input.accountType) : "", parentId, description: text(input.description).trim().slice(0, 200), created: true, persistent: true };
      const changed = transaction(`Create ${typeLabel(type)} ${name}`, () => { destinations.set(destination.id, destination); pendingDuplicate = null; return true; });
      return { ok: changed, destination: { ...destination } };
    }
    function editDestination(id, changes = {}) {
      if (!destinations.has(id) || !destinations.get(id).created) return { ok: false, reason: "Only destinations created in this session can be edited." };
      const current = destinations.get(id), name = text(changes.name ?? current.name).trim().slice(0, 100);
      if (!name) return { ok: false, reason: "Enter a destination name." };
      const parentId = current.type === "account" ? String(changes.parentId ?? current.parentId ?? "") : "";
      if (parentId === id) return { ok: false, reason: "An account cannot be its own parent." };
      let cursor = parentId; const seen = new Set([id]); while (cursor) { if (seen.has(cursor)) return { ok: false, reason: "That parent would create an account cycle." }; seen.add(cursor); cursor = destinations.get(cursor)?.parentId || ""; }
      return { ok: transaction(`Edit ${typeLabel(current.type)} ${current.name}`, () => { Object.assign(current, { name, parentId, description: text(changes.description ?? current.description).trim().slice(0, 200) }); return true; }), destination: { ...current } };
    }
    function removeDestination(id) { if (!destinations.has(id)) return { ok: false, reason: "Destination was not found." }; if (usedDestination(id)) return { ok: false, reason: "This destination is still used by a mapping. Clear those mappings first." }; if ([...destinations.values()].some((destination) => destination.parentId === id)) return { ok: false, reason: "This parent account still has a child account. Reassign or remove the child first." }; return { ok: transaction(`Remove ${destinations.get(id).name}`, () => { destinations.delete(id); return true; }) }; }
    function setDefaultSourceAccount(id) {
      if (id && (!destinations.has(id) || destinations.get(id).type !== "account")) return { ok: false, reason: "Choose an account destination." };
      return { ok: transaction("Set default source account", () => { if (sourceAccount.destinationId === id) return false; sourceAccount = { destinationId: id || "", accountType: id ? destinations.get(id).accountType : "BANK" }; return true; }) };
    }
    function setMapping(id, destinationId) {
      const record = records.get(id), destination = destinationId ? destinations.get(destinationId) : null;
      if (!record || !record.active) return { ok: false, reason: "This source value is no longer active." };
      if (destinationId && !compatible(record.sourceRole, destination)) return { ok: false, reason: `${typeLabel(destination?.type)} cannot be used for ${ROLE_LABELS[record.sourceRole] || record.sourceRole}.` };
      return { ok: transaction(`Map ${record.sourceValue}`, () => { record.previousDestinationId = record.destinationId; record.destinationId = destinationId || ""; record.origin = destinationId ? "manual" : "none"; record.confirmed = Boolean(destinationId); record.ignored = false; record.defaultMapping = false; return true; }) };
    }
    function ignore(id) { const record = records.get(id); if (!record || !record.active) return { ok: false, reason: "This source value is no longer active." }; if (REQUIRED_ROLES.has(record.sourceRole)) return { ok: false, reason: "Required account and category values cannot be ignored." }; return { ok: transaction(`Ignore ${record.sourceValue}`, () => { record.destinationId = ""; record.ignored = true; record.origin = "manual"; record.confirmed = true; return true; }) }; }
    function restoreIgnored(id) { const record = records.get(id); return { ok: Boolean(record && record.ignored && transaction(`Restore ${record.sourceValue}`, () => { record.ignored = false; record.origin = "none"; record.confirmed = false; return true; })) }; }
    function bulkAssign(ids, destinationId) { const selected = [...new Set(ids)].map((id) => records.get(id)).filter((record) => record?.active); const destination = destinations.get(destinationId); if (!selected.length) return { ok: false, reason: "Select at least one source value." }; if (selected.some((record) => !compatible(record.sourceRole, destination))) return { ok: false, reason: "The selected source values need compatible destination types." }; return { ok: transaction(`Bulk map ${selected.length} values`, () => { selected.forEach((record) => { record.destinationId = destinationId; record.origin = "manual"; record.confirmed = true; record.ignored = false; }); return true; }) }; }
    function bulkClear(ids) { return { ok: transaction(`Clear ${ids.length} mappings`, () => { let changed = false; ids.map((id) => records.get(id)).filter((record) => record?.active).forEach((record) => { if (record.destinationId || record.ignored) { record.destinationId = ""; record.ignored = false; record.origin = "none"; record.confirmed = false; changed = true; } }); return changed; }) }; }
    function bulkIgnore(ids) { const selected = ids.map((id) => records.get(id)).filter((record) => record?.active); if (selected.some((record) => REQUIRED_ROLES.has(record.sourceRole))) return { ok: false, reason: "Required account and category values cannot be ignored." }; return { ok: transaction(`Ignore ${selected.length} values`, () => { selected.forEach((record) => { record.destinationId = ""; record.ignored = true; record.origin = "manual"; record.confirmed = true; }); return selected.length > 0; }) }; }
    function resetRecord(id) { const record = records.get(id); if (!record) return false; return transaction(`Reset ${record.sourceValue}`, () => { const changed = Boolean(record.destinationId || record.ignored); record.destinationId = ""; record.ignored = false; record.origin = "none"; record.confirmed = false; return changed; }); }
    function resetColumn(columnId) { return transaction("Reset source column mappings", () => { let changed = false; records.forEach((record) => { if (record.active && record.sourceColumnId === columnId && (record.destinationId || record.ignored)) { record.destinationId = ""; record.ignored = false; record.origin = "none"; record.confirmed = false; changed = true; } }); return changed; }); }
    function clearAll() { return transaction("Clear account mappings", () => { let changed = Boolean(sourceAccount.destinationId || Object.keys(defaults).length); records.forEach((record) => { if (record.active && (record.destinationId || record.ignored)) { record.destinationId = ""; record.ignored = false; record.origin = "none"; record.confirmed = false; changed = true; } }); sourceAccount = { destinationId: "", accountType: "BANK" }; defaults = {}; return changed; }); }
    function setDefault(role, destinationId) { const destination = destinationId ? destinations.get(destinationId) : null; if (!ELIGIBLE_ROLES.has(role)) return { ok: false, reason: "This field cannot receive a default mapping." }; if (destinationId && [...records.values()].some((record) => record.sourceRole === role && !compatible(role, destination))) return { ok: false, reason: `${typeLabel(destination?.type)} cannot be used for ${ROLE_LABELS[role] || role}.` }; return { ok: transaction(`Set default ${ROLE_LABELS[role] || role}`, () => { if (defaults[role] === (destinationId || "")) return false; defaults[role] = destinationId || ""; return true; }) }; }
    function applyExactSuggestions() { return transaction("Apply exact account suggestions", () => { let changed = false; records.forEach((record) => { if (record.active && record.suggestion?.confidence === "Exact match" && !record.destinationId && !record.ignored) { record.destinationId = record.suggestion.destinationId; record.origin = "suggestion"; record.confirmed = false; changed = true; } }); return changed; }); }
    function previewTemplate(template) { return templates?.preview?.(template, [...records.values()], signature()) || { compatible: false, reason: "Saved value-mapping templates are unavailable." }; }
    function applyTemplate(template, selectedIds = []) { const preview = previewTemplate(template); if (!preview.compatible) return { ok: false, reason: preview.reason, preview }; const selected = selectedIds.length ? new Set(selectedIds) : new Set(preview.matches.map((match) => match.recordId)); const unavailable = []; const changed = transaction(`Apply value-mapping template ${template.name}`, () => { let didChange = false; preview.matches.forEach((match) => { if (!selected.has(match.recordId)) return; const destination = [...destinations.values()].find((item) => item.type === match.mapping.destinationType && normalize(item.name) === normalize(match.mapping.destinationName)); if (!destination) { unavailable.push(match); return; } const record = records.get(match.recordId); record.destinationId = destination.id; record.origin = "template"; record.confirmed = false; record.ignored = Boolean(match.mapping.ignored); didChange = true; }); return didChange; }); return { ok: changed, preview, unavailable }; }
    function rowAssignments() {
      const output = {};
      entries().forEach((entry) => {
        const row = { sourceAccount: sourceAccount.destinationId ? destinationName(sourceAccount.destinationId) : "" };
        sourceColumns.forEach((column) => {
          const value = text(entry.values[column.header]); if (!value.trim()) { const defaultDestination = defaults[column.role] ? destinations.get(defaults[column.role]) : null; if (defaultDestination) row[column.role] = defaultDestination.name; return; }
          const id = `source-value-${column.id}-${hash(value)}`, record = records.get(id), destination = record?.destinationId ? destinations.get(record.destinationId) : null;
          if (!destination) return;
          if (column.role === "account") row.account = destination.name;
          else if (column.role === "category") row.category = destination.name;
          else if (["name", "vendor", "customer", "employee"].includes(column.role)) row.name = destination.name;
          else if (column.role === "class") row.className = destination.name;
          else if (column.role === "customerJob") row.customerJob = destination.name;
          else row[column.role] = destination.name;
        });
        output[entry.id] = row;
      });
      return output;
    }
    function getPreview(limit = 6) {
      const assignments = rowAssignments();
      return entries().slice(0, Math.max(1, Math.min(20, limit))).map((entry) => { const mapped = assignments[entry.id] || {}; const columns = mapper?.getState?.().columns || []; const value = (role) => { const column = columns.find((item) => item.role === role); return column ? text(entry.values[column.header]) : ""; }; return { id: entry.id, date: value("transactionDate") || value("postedDate"), description: value("description") || value("memo"), amount: value("amount"), debit: value("debit"), credit: value("credit"), sourceAccount: mapped.sourceAccount || mapped.account || "Unresolved", destination: mapped.category || "Unresolved", name: mapped.name || "", className: mapped.className || "", customerJob: mapped.customerJob || "", status: Object.keys(mapped).length > 1 ? "Mapped where assigned" : "Needs review", source: Object.fromEntries(columns.map((column) => [column.header, text(entry.values[column.header])])) }; });
    }
    function getState() { const active = [...records.values()].filter((record) => record.active); const blankByColumn = sourceColumns.map((column) => ({ ...column, count: entries().filter((entry) => !text(entry.values[column.header]).trim()).length })); return { records: active.map((record) => ({ ...record, rowIds: [...record.rowIds], suggestion: record.suggestion ? { ...record.suggestion } : null })), inactiveRecords: [...records.values()].filter((record) => !record.active).map((record) => ({ ...record, rowIds: [] })), sourceColumns: sourceColumns.map((column) => ({ ...column })), blankByColumn, destinations: [...destinations.values()].map((destination) => ({ ...destination })), defaults: { ...defaults }, sourceAccount: { ...sourceAccount, name: destinationName(sourceAccount.destinationId) }, validation: validation(), preview: getPreview(), notice, historyLimit, canUndo: history.length > 0, canRedo: future.length > 0, pendingDuplicate: pendingDuplicate ? { ...pendingDuplicate } : null, tier }; }
    function undo() { const action = history.pop(); if (!action) return false; future.push(action); restore(action.before); notify("undo"); return true; }
    function redo() { const action = future.pop(); if (!action) return false; history.push(action); restore(action.after); notify("redo"); return true; }
    function sync() { discover(); notify("sync"); return getState(); }

    function restoreSavedState(snapshot) {
      if (!snapshot) return false;
      (snapshot.destinations || []).forEach((destination) => { if (destination?.id && destination.name && !destinations.has(destination.id)) destinations.set(destination.id, { ...destination, created: true, persistent: true }); });
      sequence = Math.max(sequence, destinations.size + 1);
      if (snapshot.sourceAccount?.destinationId && destinations.has(snapshot.sourceAccount.destinationId)) sourceAccount = { destinationId: snapshot.sourceAccount.destinationId, accountType: snapshot.sourceAccount.accountType || destinations.get(snapshot.sourceAccount.destinationId).accountType || "BANK" };
      defaults = Object.fromEntries(Object.entries(snapshot.defaults || {}).filter(([, id]) => destinations.has(id)));
      (snapshot.records || []).forEach((saved) => { const record = records.get(saved.id); if (!record || !record.active) return; if (saved.destinationId && destinations.has(saved.destinationId)) record.destinationId = saved.destinationId; record.origin = saved.origin || record.origin; record.confirmed = Boolean(saved.confirmed); record.ignored = Boolean(saved.ignored); record.defaultMapping = Boolean(saved.defaultMapping); });
      return true;
    }

    discover();
    restoreSavedState(savedState);
    return { HISTORY_LIMITS, DESTINATION_TYPES, ACCOUNT_TYPES, REQUIRED_ROLES, ELIGIBLE_ROLES, getState, getValidation: validation, getPreview, rowAssignments, getDestination: (id) => destinations.get(id), createDestination, editDestination, removeDestination, setDefaultSourceAccount, setDefault, setMapping, ignore, restoreIgnored, bulkAssign, bulkClear, bulkIgnore, resetRecord, resetColumn, clearAll, applyExactSuggestions, previewTemplate, applyTemplate, sync, restoreState: restoreSavedState, undo, redo, getTemplateStore: () => templates, mappingTemplateBlueprint: () => ({ signature: signature(), entries: [...records.values()].filter((record) => record.active && (record.destinationId || record.ignored)).map((record) => { const destination = record.destinationId ? destinations.get(record.destinationId) : null; return { sourceRole: record.sourceRole, normalizedValue: record.normalizedValue, destinationType: destination?.type || "", destinationName: destination?.name || "", accountType: destination?.accountType || "", parentName: destination?.parentId ? destinationName(destination.parentId) : "", ignored: record.ignored, defaultMapping: record.defaultMapping }; }), defaults: { sourceAccountName: sourceAccount.destinationId ? destinationName(sourceAccount.destinationId) : "", sourceAccountType: sourceAccount.accountType, roles: Object.fromEntries(Object.entries(defaults).map(([role, id]) => [role, destinationName(id)])) } }), subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
  }

  window.LedgerLiftAccountMapper = { HISTORY_LIMITS, DESTINATION_TYPES, ACCOUNT_TYPES, REQUIRED_ROLES, ELIGIBLE_ROLES, create: createAccountMapper, normalize, punctuationNormalized };
})();
