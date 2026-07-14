(() => {
  "use strict";

  const HISTORY_LIMITS = { free: 25, standard: 75, plus: 150 };
  const CONTROL_RE = `[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]`;
  const INVISIBLE_RE = new RegExp(`${CONTROL_RE}|[\\u200B-\\u200D\\uFEFF]`, "g");
  const SUMMARY_RE = /\b(beginning|opening|ending|closing|statement|daily)\s+(balance|total)|\btotal\s+(deposits|withdrawals|payments|transactions)\b/i;
  const DATE_HEADER_RE = /\b(date|posted|posting|effective|transaction)\b/i;
  const NUMBER_HEADER_RE = /\b(amount|debit|credit|withdrawal|deposit|balance|total|charge|payment)\b/i;
  const TEXT_EXCLUDE_RE = /\b(date|amount|debit|credit|withdrawal|deposit|balance|account|number|reference|ref|check|id)\b/i;

  const clone = (value) => Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, String(item ?? "")]));
  const keyFor = (id, column) => `${id}::${column}`;
  const normalizeSpace = (value, collapse = false) => String(value ?? "").replace(/\u00a0/g, " ").trim().replace(collapse ? /\s{2,}/g : /$^/g, " ");
  const cleanInvisible = (value) => String(value ?? "").replace(INVISIBLE_RE, "");
  const isBlank = (value) => String(value ?? "").trim() === "";
  const textColumns = (headers) => headers.filter((header) => !TEXT_EXCLUDE_RE.test(header));
  const chooseColumn = (headers, patterns) => headers.find((header) => patterns.some((pattern) => pattern.test(header))) || "";
  const titleCase = (value) => String(value ?? "").toLocaleLowerCase().replace(/(^|[\s'/-])([\p{L}\p{N}])/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`);

  function parseDate(value, assumption = "leave") {
    const raw = String(value ?? "").trim();
    const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/);
    if (iso) return { recognized: validDate(+iso[1], +iso[2], +iso[3]), year: +iso[1], month: +iso[2], day: +iso[3], suffix: iso[4] || "", ambiguous: false };
    const common = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(.*)$/);
    if (!common) return { recognized: false, ambiguous: false };
    const first = +common[1], second = +common[2], year = +common[3] < 100 ? 2000 + +common[3] : +common[3];
    let month = first, day = second, ambiguous = false;
    if (first > 12 && second <= 12) { month = second; day = first; }
    else if (second > 12 && first <= 12) { month = first; day = second; }
    else if (first <= 12 && second <= 12) {
      ambiguous = assumption === "leave";
      if (assumption === "dmy") { month = second; day = first; }
      else { month = first; day = second; }
    }
    return { recognized: validDate(year, month, day), year, month, day, suffix: common[4] || "", ambiguous };
  }

  function validDate(year, month, day) {
    const value = new Date(year, month - 1, day);
    return Boolean(year && month && day && value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === day);
  }

  function formatDate(parsed, format) {
    if (!parsed?.recognized || parsed.ambiguous) return "";
    const year = String(parsed.year).padStart(4, "0"), month = String(parsed.month).padStart(2, "0"), day = String(parsed.day).padStart(2, "0");
    if (format === "YYYY-MM-DD") return `${year}-${month}-${day}${parsed.suffix}`;
    if (format === "DD/MM/YYYY") return `${day}/${month}/${year}${parsed.suffix}`;
    return `${month}/${day}/${year}${parsed.suffix}`;
  }

  function parseNumber(value) {
    const original = String(value ?? "").trim();
    if (!original || !/[0-9]/.test(original)) return { recognized: false, ambiguous: false };
    const raw = original.replace(/\u00a0/g, " ").replace(/[£€¥$]/g, "").replace(/\s/g, "");
    const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
    const unsigned = raw.replace(/[()]/g, "").replace(/^-/, "");
    const commas = (unsigned.match(/,/g) || []).length, dots = (unsigned.match(/\./g) || []).length;
    let normalized = unsigned, ambiguous = false;
    if (commas && dots) {
      const comma = unsigned.lastIndexOf(","), dot = unsigned.lastIndexOf(".");
      if (comma > dot) { ambiguous = true; }
      else normalized = unsigned.replace(/,/g, "");
    } else if (commas) {
      const tail = unsigned.split(",").pop();
      if (tail.length === 3 && unsigned.split(",").length > 2) normalized = unsigned.replace(/,/g, "");
      else if (tail.length === 3 && unsigned.indexOf(",") > -1 && unsigned.split(",")[0].length <= 3) normalized = unsigned.replace(/,/g, "");
      else ambiguous = true;
    }
    if (ambiguous) return { recognized: false, ambiguous: true };
    const number = Number(normalized);
    if (!Number.isFinite(number)) return { recognized: false, ambiguous: false };
    const decimals = (normalized.split(".")[1] || "").length;
    const plain = `${negative ? "-" : ""}${Math.abs(number).toFixed(Math.min(6, Math.max(0, decimals)))}`;
    return { recognized: true, ambiguous: false, value: plain };
  }

  function scanRows({ headers = [], entries = [], suggestedRoles = {} } = {}) {
    const dateColumn = suggestedRoles.date?.column || chooseColumn(headers, [DATE_HEADER_RE]);
    const descriptionColumn = suggestedRoles.description?.column || suggestedRoles.memo?.column || chooseColumn(headers, [/description|details|merchant|payee|memo|name/i]);
    const amountColumn = suggestedRoles.amount?.column || chooseColumn(headers, [NUMBER_HEADER_RE]);
    const numericColumns = headers.filter((header) => NUMBER_HEADER_RE.test(header) || header === amountColumn);
    const textFields = textColumns(headers);
    const whitespace = [], blankValues = [], capitalization = [], dates = [], numbers = [], invisible = [], blankRows = [], summaries = [];
    const dateAmbiguous = [], numberAmbiguous = [];
    entries.forEach((entry, rowIndex) => {
      const values = entry.values;
      if (headers.every((header) => isBlank(values[header]))) blankRows.push({ id: entry.id, rowIndex, reason: "All usable cells are blank. Zero values are kept." });
      if (descriptionColumn && SUMMARY_RE.test(String(values[descriptionColumn] || ""))) summaries.push({ id: entry.id, rowIndex, reason: `Description resembles a statement summary: ${String(values[descriptionColumn])}` });
      headers.forEach((column) => {
        const raw = String(values[column] ?? "");
        const spaced = raw.replace(/\u00a0/g, " ").trim();
        const collapsed = spaced.replace(/\s{2,}/g, " ");
        if (raw !== spaced || /\u00a0/.test(raw) || (raw && isBlank(raw))) whitespace.push({ id: entry.id, column, before: raw, after: spaced, reason: "Leading, trailing, non-breaking, or whitespace-only formatting." });
        if (raw && isBlank(raw)) blankValues.push({ id: entry.id, column, before: raw, after: "", reason: "The value contains only whitespace." });
        if (spaced !== collapsed && spaced) whitespace.push({ id: entry.id, column, before: raw, after: collapsed, kind: "collapse", reason: "Repeated internal spaces make matching less consistent." });
        const withoutInvisible = cleanInvisible(raw);
        if (withoutInvisible !== raw) invisible.push({ id: entry.id, column, before: raw, after: withoutInvisible, reason: "Control or zero-width characters were found." });
        if (textFields.includes(column) && raw && titleCase(raw) !== raw) capitalization.push({ id: entry.id, column, before: raw, after: titleCase(raw), reason: "Title case is offered as an optional text-only suggestion." });
      });
      if (dateColumn && !isBlank(values[dateColumn])) {
        const parsed = parseDate(values[dateColumn]);
        if (parsed.ambiguous) dateAmbiguous.push({ id: entry.id, column: dateColumn, before: String(values[dateColumn]), reason: "Both day/month and month/day interpretations are possible." });
        else if (!parsed.recognized) dates.push({ id: entry.id, column: dateColumn, before: String(values[dateColumn]), after: String(values[dateColumn]), reason: "The value did not match a recognized date pattern.", unrecognized: true });
      }
      numericColumns.forEach((column) => {
        const raw = String(values[column] ?? "");
        if (!raw) return;
        const parsed = parseNumber(raw);
        if (parsed.ambiguous) numberAmbiguous.push({ id: entry.id, column, before: raw, reason: "The decimal and thousands separators are ambiguous." });
        else if (parsed.recognized && parsed.value !== raw) numbers.push({ id: entry.id, column, before: raw, after: parsed.value, reason: "Currency symbols, separators, or accounting parentheses can be normalized." });
      });
    });
    const duplicateColumns = [dateColumn, descriptionColumn, amountColumn].filter(Boolean);
    const duplicateMap = new Map();
    entries.forEach((entry) => {
      const values = duplicateColumns.length ? duplicateColumns.map((column) => String(entry.values[column] ?? "").trim().toLocaleLowerCase()) : headers.map((column) => String(entry.values[column] ?? "").trim().toLocaleLowerCase());
      if (values.every((value) => value === "")) return;
      const key = values.join("\u001f");
      const group = duplicateMap.get(key) || [];
      group.push(entry);
      duplicateMap.set(key, group);
    });
    const duplicates = [...duplicateMap.values()].filter((group) => group.length > 1).map((group) => ({ ids: group.map((entry) => entry.id), reason: duplicateColumns.length ? "Same date, description, and amount." : "All active values match." }));
    const nearDuplicates = [];
    if (entries.length < 5000 && amountColumn) {
      const amountBuckets = new Map();
      entries.forEach((entry) => {
        const amount = parseNumber(entry.values[amountColumn]);
        if (!amount.recognized) return;
        const bucket = amountBuckets.get(amount.value) || [];
        bucket.push(entry);
        amountBuckets.set(amount.value, bucket);
      });
      amountBuckets.forEach((bucket) => {
        for (let leftIndex = 0; leftIndex < bucket.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < bucket.length; rightIndex += 1) {
          const left = bucket[leftIndex], right = bucket[rightIndex];
          const leftDate = dateColumn ? parseDate(left.values[dateColumn], "mdy") : null, rightDate = dateColumn ? parseDate(right.values[dateColumn], "mdy") : null;
          const sameDate = leftDate?.recognized && rightDate?.recognized && Math.abs(new Date(leftDate.year, leftDate.month - 1, leftDate.day) - new Date(rightDate.year, rightDate.month - 1, rightDate.day)) <= 3 * 86400000;
          const leftDescription = descriptionColumn ? normalizeSpace(left.values[descriptionColumn]).toLocaleLowerCase() : "";
          const rightDescription = descriptionColumn ? normalizeSpace(right.values[descriptionColumn]).toLocaleLowerCase() : "";
          if ((sameDate && leftDescription !== rightDescription) || (leftDescription === rightDescription && !sameDate)) nearDuplicates.push({ ids: [left.id, right.id], reason: sameDate ? "Same amount within three days with a different description." : "Same amount and description with a different date." });
        }
      });
    }
    return { headers: [...headers], dateColumn, descriptionColumn, amountColumn, textColumns: textFields, whitespace, blankValues, capitalization, dates, numbers, invisible, blankRows, duplicates, nearDuplicates, summaries, dateAmbiguous, numberAmbiguous, rowsScanned: entries.length, issueRows: new Set([...whitespace, ...blankValues, ...capitalization, ...dates, ...numbers, ...invisible, ...blankRows, ...summaries, ...dateAmbiguous, ...numberAmbiguous].map((item) => item.id)).size, suggestedChanges: whitespace.length + blankValues.length + capitalization.length + numbers.length + invisible.length + dates.filter((item) => !item.unrecognized).length };
  }

  const TOOL_DEFINITIONS = [
    { id: "whitespace", label: "Trim whitespace", description: "Remove leading, trailing, and non-breaking spaces. Repeated internal spaces are optional.", tier: "free" },
    { id: "blank-values", label: "Normalize blank values", description: "Turn whitespace-only cells into empty values without changing 0, 0.00, -, or N/A.", tier: "free" },
    { id: "capitalization", label: "Normalize capitalization", description: "Optionally title-case, uppercase, or lowercase selected text columns only.", tier: "standard" },
    { id: "dates", label: "Standardize dates", description: "Format recognized dates while leaving ambiguous or unrecognized values unchanged until confirmed.", tier: "standard" },
    { id: "numbers", label: "Normalize numeric values", description: "Remove recognized currency symbols, separators, and accounting parentheses without changing numeric meaning.", tier: "standard" },
    { id: "blank-rows", label: "Remove blank rows", description: "Preview and remove rows whose usable cells are empty. Rows containing zero remain.", tier: "free" },
    { id: "duplicates", label: "Review exact duplicates", description: "Group exact matches and let you choose which rows to remove. Nothing is removed automatically.", tier: "free" },
    { id: "near-duplicates", label: "Review possible near-duplicates", description: "Conservative matches based on date, amount, and description similarity. Treat these only as review suggestions.", tier: "plus" },
    { id: "invisible", label: "Remove invisible characters", description: "Optionally remove control and zero-width characters while preserving normal Unicode and punctuation.", tier: "standard" },
    { id: "summaries", label: "Review statement-summary rows", description: "Mark possible balances and totals so you can keep or remove them deliberately.", tier: "plus" }
  ];

  function createCleaner({ review, tier = "free", suggestedRoles = {} } = {}) {
    const limit = HISTORY_LIMITS[tier] || HISTORY_LIMITS.free;
    let scanResult = null;
    let lastSeen = new Map();
    let cleanBase = new Map();
    let operations = [];
    let redo = [];
    let activePreview = null;
    let notice = "";
    let applying = false;
    const listeners = new Set();

    function entries() { return review?.activeEntries?.() || []; }
    function setInitialLineage() { entries().forEach((entry) => review.headers.forEach((column) => { const key = keyFor(entry.id, column); const value = String(entry.values[column] ?? ""); if (!cleanBase.has(key)) cleanBase.set(key, value); lastSeen.set(key, value); })); }
    setInitialLineage();
    function notify(type = "state") {
      const detail = { type, notice, historyLimit: limit, operations: operations.length, canUndo: operations.length > 0, canRedo: redo.length > 0 };
      listeners.forEach((listener) => listener(detail));
      if (typeof window !== "undefined" && window.dispatchEvent && typeof CustomEvent === "function") window.dispatchEvent(new CustomEvent("ledgerlift:clean-state-changed", { detail }));
    }
    function syncReviewData() {
      let changed = false, conflicts = 0;
      entries().forEach((entry) => review.headers.forEach((column) => {
        const key = keyFor(entry.id, column), current = String(entry.values[column] ?? ""), previous = lastSeen.get(key);
        if (previous === undefined) { cleanBase.set(key, current); lastSeen.set(key, current); return; }
        if (current !== previous && !applying) { cleanBase.set(key, current); lastSeen.set(key, current); changed = true; conflicts += operations.some((operation) => operation.changes.some((change) => change.id === entry.id && change.column === column && change.after === previous)) ? 1 : 0; }
      }));
      if (changed) { notice = conflicts ? "Review edits changed values used by earlier cleaning operations. The affected suggestions were refreshed safely." : "Review edits detected. Cleaning suggestions were refreshed without overwriting them."; scan(); notify("review-change"); }
      return { changed, conflicts };
    }
    function scan() { scanResult = scanRows({ headers: review.headers, entries: entries(), suggestedRoles }); return scanResult; }
    function valueFor(id, column) { return String(review.getEntry(id)?.values?.[column] ?? ""); }
    function getAllChanges(toolId, options = {}) {
      const scanData = scanResult || scan();
      if (toolId === "whitespace") return scanData.whitespace.filter((change) => options.collapse || change.kind !== "collapse").map((change) => ({ ...change, after: options.collapse ? normalizeSpace(change.before, true) : normalizeSpace(change.before, false) }));
      if (toolId === "blank-values") return scanData.blankValues;
      if (toolId === "capitalization") {
        const mode = options.mode || "title", columns = options.columns?.length ? options.columns : scanData.textColumns;
        const changes = [];
        entries().forEach((entry) => columns.forEach((column) => {
          const before = String(entry.values[column] ?? "");
          if (!before) return;
          const after = mode === "upper" ? before.toLocaleUpperCase() : mode === "lower" ? before.toLocaleLowerCase() : titleCase(before);
          if (after !== before) changes.push({ id: entry.id, column, before, after, reason: `Optional ${mode} case change in a text column.` });
        }));
        return changes;
      }
      if (toolId === "dates") {
        const format = options.format || "MM/DD/YYYY", assumption = options.assumption || "leave";
        const changes = [];
        entries().forEach((entry) => {
          const column = scanData.dateColumn;
          if (!column || isBlank(entry.values[column])) return;
          const parsed = parseDate(entry.values[column], assumption);
          if (parsed.recognized && !parsed.ambiguous) { const after = formatDate(parsed, format); if (after !== String(entry.values[column])) changes.push({ id: entry.id, column, before: String(entry.values[column]), after, reason: `Recognized date formatted as ${format}.` }); }
        });
        return changes;
      }
      if (toolId === "numbers") return scanData.numbers.filter((change) => !options.columns?.length || options.columns.includes(change.column));
      if (toolId === "invisible") return scanData.invisible;
      if (toolId === "blank-rows") return scanData.blankRows.map((row) => ({ key: row.id, id: row.id, row: true, before: "Blank row", after: "Removed", reason: row.reason }));
      if (toolId === "duplicates") return scanData.duplicates.flatMap((group) => group.ids.slice(1).map((id) => ({ key: id, id, row: true, before: "Exact duplicate", after: "Removed", reason: group.reason, defaultSelected: false })));
      if (toolId === "near-duplicates") return scanData.nearDuplicates.flatMap((group) => group.ids.slice(1).map((id) => ({ key: id, id, row: true, before: "Possible near-duplicate", after: "Removed", reason: group.reason, defaultSelected: false })));
      if (toolId === "summaries") return scanData.summaries.map((row) => ({ key: row.id, id: row.id, row: true, before: "Possible summary row", after: "Removed", reason: row.reason, defaultSelected: false }));
      return [];
    }
    function preview(toolId, options = {}) {
      const definition = TOOL_DEFINITIONS.find((tool) => tool.id === toolId);
      if (!definition || !isAvailable(definition)) return null;
      const changes = getAllChanges(toolId, options);
      const selected = new Set(changes.filter((change) => change.defaultSelected !== false).map((change) => change.key || keyFor(change.id, change.column)));
      activePreview = { toolId, options: { ...options }, changes, selected };
      notify("preview");
      return getPreview();
    }
    function getPreview() { return activePreview ? { toolId: activePreview.toolId, options: { ...activePreview.options }, changes: activePreview.changes.map((change) => ({ ...change, selected: activePreview.selected.has(change.key || keyFor(change.id, change.column)) })), count: activePreview.changes.length, selectedCount: activePreview.selected.size } : null; }
    function setPreviewSelection(key, selected) { if (!activePreview) return; if (selected) activePreview.selected.add(key); else activePreview.selected.delete(key); notify("preview"); }
    function closePreview() { activePreview = null; notify("preview-closed"); }
    function performOperation(toolId, changes, label) {
      const appliedChanges = [], removedRows = [];
      applying = true;
      changes.forEach((change) => {
        if (change.row) { const removed = review.removeExternalRows([change.id]); if (removed.length) removedRows.push(change.id); return; }
        if (valueFor(change.id, change.column) !== String(change.before ?? "")) return;
        if (review.setExternalCell(change.id, change.column, change.after)) appliedChanges.push({ id: change.id, column: change.column, before: String(change.before ?? ""), after: String(change.after ?? ""), reason: change.reason });
      });
      applying = false;
      if (!appliedChanges.length && !removedRows.length) return false;
      const operation = { id: `clean-${Date.now()}-${operations.length + 1}`, toolId, label, changes: appliedChanges, removedRows };
      operations.push(operation); if (operations.length > limit) operations.shift(); redo = [];
      setInitialLineage();
      scan();
      notice = `${label} applied to ${appliedChanges.length + removedRows.length} item${appliedChanges.length + removedRows.length === 1 ? "" : "s"}.`;
      notify("apply");
      return true;
    }
    function applyPreview() {
      if (!activePreview) return false;
      const selected = activePreview.changes.filter((change) => activePreview.selected.has(change.key || keyFor(change.id, change.column)));
      const result = performOperation(activePreview.toolId, selected, TOOL_DEFINITIONS.find((tool) => tool.id === activePreview.toolId)?.label || "Cleaning operation");
      activePreview = null;
      return result;
    }
    function reverseOperation(operation, direction) {
      const changes = direction === "undo" ? [...operation.changes].reverse() : operation.changes;
      applying = true;
      changes.forEach((change) => {
        const expected = direction === "undo" ? change.after : change.before, next = direction === "undo" ? change.before : change.after;
        if (valueFor(change.id, change.column) === expected) review.setExternalCell(change.id, change.column, next);
      });
      if (direction === "undo") review.restoreExternalRows(operation.removedRows);
      else review.removeExternalRows(operation.removedRows);
      applying = false;
      setInitialLineage(); scan();
    }
    function undo() { const operation = operations.pop(); if (!operation) return false; reverseOperation(operation, "undo"); redo.push(operation); notice = `Undid ${operation.label.toLocaleLowerCase()}.`; notify("undo"); return true; }
    function redoOperation() { const operation = redo.pop(); if (!operation) return false; reverseOperation(operation, "redo"); operations.push(operation); notice = `Redid ${operation.label.toLocaleLowerCase()}.`; notify("redo"); return true; }
    function restoreCell(id, column) {
      const base = cleanBase.get(keyFor(id, column));
      const current = valueFor(id, column);
      if (base === undefined || current === base) return false;
      return performOperation("restore", [{ id, column, before: current, after: base, reason: "Restore the value from before Clean changes." }], "Restore cleaned cell");
    }
    function restoreRow(id) {
      const entry = review.getEntry(id);
      if (!entry) return false;
      const changes = [];
      review.headers.forEach((column) => {
        const base = cleanBase.get(keyFor(id, column)), current = String(entry.values[column] ?? "");
        if (base !== undefined && current !== base) changes.push({ id, column, before: current, after: base, reason: "Restore the row to its pre-clean working values." });
      });
      return performOperation("restore-row", changes, "Restore cleaned row");
    }
    function restoreAll() {
      const changes = [];
      entries().forEach((entry) => review.headers.forEach((column) => { const base = cleanBase.get(keyFor(entry.id, column)), current = String(entry.values[column] ?? ""); if (base !== undefined && current !== base) changes.push({ id: entry.id, column, before: current, after: base, reason: "Restore the pre-clean working value." }); }));
      return performOperation("restore-all", changes, "Restore all Clean changes");
    }
    function restoreLatestTool(toolId) {
      const index = [...operations].reverse().findIndex((operation) => operation.toolId === toolId);
      if (index < 0 || index !== 0) return false;
      const operation = operations.pop();
      reverseOperation(operation, "undo");
      redo.push(operation);
      notice = `Restored the latest ${toolId} operation.`;
      notify("restore");
      return true;
    }
    function isAvailable(tool) { return tier === "plus" || (tier === "standard" && tool.tier !== "plus") || (tier === "free" && tool.tier === "free"); }
    function getTools() { return TOOL_DEFINITIONS.map((tool) => ({ ...tool, available: isAvailable(tool), applied: operations.filter((operation) => operation.toolId === tool.id).length })); }
    function getSummary() {
      const data = scanResult || scan();
      const currentCellsChanged = entries().reduce((sum, entry) => sum + review.headers.filter((column) => cleanBase.get(keyFor(entry.id, column)) !== undefined && String(entry.values[column] ?? "") !== cleanBase.get(keyFor(entry.id, column))).length, 0);
      const currentRowsRemoved = review.deletedEntries().filter((entry) => entry.removedBy === "clean").length;
      return { rowsScanned: data.rowsScanned, issueRows: data.issueRows, suggestedChanges: data.suggestedChanges, cellsChanged: currentCellsChanged, rowsRemoved: currentRowsRemoved, exactDuplicates: data.duplicates.reduce((sum, group) => sum + Math.max(0, group.ids.length - 1), 0), possibleDuplicates: data.nearDuplicates.length, ambiguousDates: data.dateAmbiguous.length, unrecognizedNumbers: data.numberAmbiguous.length, unrecognizedDates: data.dates.filter((change) => change.unrecognized).length, summaries: data.summaries.length, operationsApplied: operations.length };
    }
    function getState() { return { scan: scanResult || scan(), preview: getPreview(), summary: getSummary(), notice, operations: operations.map((operation) => ({ id: operation.id, toolId: operation.toolId, label: operation.label, changes: operation.changes.length, rowsRemoved: operation.removedRows.length })), canUndo: operations.length > 0, canRedo: redo.length > 0, historyLimit: limit, tier }; }
    function getOperations() { return operations.map((operation) => ({ id: operation.id, toolId: operation.toolId, label: operation.label, changes: operation.changes.map((change) => ({ ...change })), removedRows: [...operation.removedRows] })); }
    function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    return { scan, syncReviewData, preview, getPreview, setPreviewSelection, closePreview, applyPreview, undo, redo: redoOperation, restoreCell, restoreRow, restoreAll, restoreLatestTool, getTools, getSummary, getState, getOperations, subscribe, isAvailable: (toolId) => isAvailable(TOOL_DEFINITIONS.find((tool) => tool.id === toolId) || { tier: "plus" }) };
  }

  window.LedgerLiftCleaner = { HISTORY_LIMITS, TOOL_DEFINITIONS, parseDate, parseNumber, scanRows, create: createCleaner };
})();
