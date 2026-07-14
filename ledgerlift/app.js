(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { headers: [], rows: [], tx: [], review: null, cleaner: null, source: false, name: "transactions", amountMode: "signed", cleaned: false, cleanSummary: null, imported: false, importPreview: null, fileMeta: null, format: "", delimiter: "", worksheetName: "", worksheetIndex: 0, headerRow: 0, suggestions: null, importWarnings: [], importErrors: [] };
  const input = $("fileInput");
  const drop = $("dropZone");
  const status = $("fileStatus");
  const work = $("work");

  function options(id) {
    const select = $(id);
    if (!select) return;
    select.replaceChildren(...state.headers.map((header) => {
      const option = document.createElement("option"); option.value = option.textContent = header; return option;
    }));
  }

  function tier() {
    const mode = new URLSearchParams(location.search).get("mode");
    if (!window.SuiteGate?.paid()) return "free";
    return mode === "plus" ? "plus" : "standard";
  }

  function canReplaceFile() {
    if (!state.imported || !state.rows.length) return true;
    return window.confirm("Replacing this file will discard the current import and any edits. Continue?");
  }

  function displayName(file) { return file.name.replace(/\.[^.]+$/, ""); }

  function applySuggestions(preview) {
    const roles = preview.suggestions?.roles || {};
    [["date", roles.date], ["desc", roles.description || roles.memo], ["amount", roles.amount], ["debit", roles.debit], ["credit", roles.credit]].forEach(([id, suggestion]) => { const select = $(id); if (select && suggestion?.column && Array.from(select.options).some((option) => option.value === suggestion.column)) select.value = suggestion.column; });
  }

  async function load(file, sample = false) {
    if (!file) return;
    if (!sample && !window.SuiteGate.mayOpenRealDocument()) { window.SuiteGate.showUpgrade(); return; }
    if (!canReplaceFile()) { input.value = ""; return; }
    try {
      const preview = await window.LedgerLiftImporter.importFile(file, { tier: tier() });
      Object.assign(state, { source: sample, name: displayName(file), importPreview: preview, fileMeta: preview.fileMeta, format: preview.format, delimiter: preview.delimiter, worksheetName: preview.worksheetName || "", worksheetIndex: preview.worksheetIndex || 0, headerRow: preview.headerRow, suggestions: preview.suggestions, importWarnings: preview.warnings, importErrors: preview.blocking, imported: false, review: null, cleaner: null, headers: preview.headers, rows: preview.rows, tx: [], cleaned: false, cleanSummary: null });
      ["date", "desc", "amount", "debit", "credit"].forEach(options);
      status.textContent = `${file.name} · ${preview.format} · ${Math.max(1, Math.round(file.size / 1024))} KB`;
      work.classList.add("hidden"); $("results").classList.add("hidden");
      window.SuiteGate.update(sample);
      window.dispatchEvent(new CustomEvent("ledgerlift:import-preview-ready", { detail: { preview } }));
    } catch (problem) {
      window.dispatchEvent(new CustomEvent("ledgerlift:import-error", { detail: { message: problem.message, code: problem.code } }));
      window.SuiteGate.message(problem.message);
    }
  }

  function configureImport({ worksheetIndex = state.worksheetIndex, headerRow = state.headerRow } = {}) {
    const current = state.importPreview;
    if (!current) return null;
    const sheet = current.worksheets?.[worksheetIndex];
    const base = sheet ? { ...current, worksheetIndex, worksheetName: sheet.name, matrix: sheet.matrix, formulaWithoutCache: sheet.formulaWithoutCache, warnings: [] } : { ...current, matrix: current.matrix, warnings: [] };
    const preview = window.LedgerLiftImporter.buildPreview(base, { worksheetIndex, headerRow });
    state.importPreview = preview;
    state.headers = preview.headers;
    state.rows = preview.rows;
    state.worksheetIndex = preview.worksheetIndex || 0;
    state.worksheetName = preview.worksheetName || "";
    state.headerRow = preview.headerRow;
    state.suggestions = preview.suggestions;
    state.importWarnings = preview.warnings;
    state.importErrors = preview.blocking;
    window.dispatchEvent(new CustomEvent("ledgerlift:import-preview-ready", { detail: { preview } }));
    return preview;
  }

  function confirmImport() {
    const preview = state.importPreview;
    if (!preview) { window.SuiteGate.message("Choose a file before confirming the import."); return false; }
    if (preview.blocking.length) { window.SuiteGate.message(preview.blocking[0]); return false; }
    state.review = window.LedgerLiftReviewModel?.create({ headers: preview.headers, rows: preview.rows, rowWarnings: preview.rowWarnings, tier: tier() }) || null;
    state.cleaner = state.review && window.LedgerLiftCleaner?.create({ review: state.review, tier: tier(), suggestedRoles: preview.suggestions?.roles || {} });
    Object.assign(state, { imported: true, headers: preview.headers, rows: state.review?.getWorkingRows() || preview.rows, tx: [], cleaned: false, cleanSummary: null });
    ["date", "desc", "amount", "debit", "credit"].forEach(options);
    applySuggestions(preview);
    status.textContent = `${preview.fileMeta.name} · ${preview.format} · ${preview.rows.length} rows ready`;
    work.classList.remove("hidden"); $("results").classList.add("hidden");
    window.dispatchEvent(new CustomEvent("ledgerlift:data-loaded", { detail: { preview } }));
    return true;
  }

  function money(value) {
    const raw = String(value || "").trim(), negative = /^\(.*\)$/.test(raw);
    const number = Number(raw.replace(/[,$£€¥\s()]/g, ""));
    return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : NaN;
  }

  function date(value) {
    const raw = String(value || "").trim(); let year, month, day;
    let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) { year = +match[1]; month = +match[2]; day = +match[3]; }
    else { match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/); if (!match) return null; month = +match[1]; day = +match[2]; year = +match[3]; if (year < 100) year += year >= 70 ? 1900 : 2000; }
    const check = new Date(year, month - 1, day);
    return check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day ? `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}` : null;
  }

  function clean(value) { return String(value || "").replace(/[\t\r\n\x00-\x1f\x7f]/g, " ").trim().slice(0, 512); }

  function cleanRows() {
    const dateColumn = $("date")?.value, descColumn = $("desc")?.value, amountColumn = $("amount")?.value;
    if (!dateColumn || !descColumn || !amountColumn) throw Error("Load a file before cleaning rows.");
    const changes = [], warnings = [];
    let changedRows = 0, changedCells = 0;
    state.rows.forEach((row, index) => {
      const rowChanges = [];
      [[dateColumn, date(row[dateColumn]) || clean(row[dateColumn])], [descColumn, clean(row[descColumn])], [amountColumn, Number.isFinite(money(row[amountColumn])) ? money(row[amountColumn]).toFixed(2) : clean(row[amountColumn])]].forEach(([column, value]) => {
        const before = String(row[column] ?? ""), after = String(value ?? "");
        if (before !== after) { row[column] = after; changedCells += 1; rowChanges.push({ column, before, after }); }
      });
      if (rowChanges.length) { changedRows += 1; changes.push({ index, fields: rowChanges }); }
      const normalizedDate = date(row[dateColumn]);
      const normalizedAmount = money(row[amountColumn]);
      if (!normalizedDate || !Number.isFinite(normalizedAmount) || normalizedAmount === 0) warnings.push({ index, date: !normalizedDate, amount: !Number.isFinite(normalizedAmount) || normalizedAmount === 0 });
    });
    state.cleaned = true;
    state.cleanSummary = { changedRows, changedCells, changes: changes.slice(0, 25), warnings, totalRows: state.rows.length };
    state.tx = [];
    $("results").classList.add("hidden");
    status.textContent = `${state.name} · ${state.rows.length} rows · cleaned`;
    window.dispatchEvent(new CustomEvent("ledgerlift:cleaned", { detail: { summary: state.cleanSummary } }));
    return state.cleanSummary;
  }

  function analyze() {
    if (!state.cleaned) { window.SuiteGate.message("Clean your rows before validating the mapping."); return; }
    const mode = $("amountMode")?.value || "signed";
    state.amountMode = mode;
    state.tx = state.rows.map((row, index) => {
      const debit = money(row[$("debit")?.value]), credit = money(row[$("credit")?.value]);
      let amount = money(row[$("amount").value]);
      if (mode === "debit-credit" && (Number.isFinite(debit) || Number.isFinite(credit))) amount = (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0);
      return { index, d: date(row[$("date").value]), a: amount, debit, credit, memo: clean(row[$("desc").value]), category: "Uncategorized", duplicate: false, ok: !!date(row[$("date").value]) && Number.isFinite(amount) && amount !== 0 };
    });
    renderRows();
    const good = state.tx.filter((transaction) => transaction.ok).length;
    $("validation").textContent = `${good} of ${state.tx.length} rows are ready for export.`;
    $("results").classList.remove("hidden");
    window.dispatchEvent(new CustomEvent("ledgerlift:analyzed", { detail: { state } }));
  }

  function renderRows() {
    const body = $("rows");
    body.replaceChildren(...state.tx.slice(0, 200).map((transaction) => {
      const tr = document.createElement("tr");
      [transaction.d || "—", transaction.memo || "—", Number.isFinite(transaction.a) ? transaction.a.toFixed(2) : "—", transaction.ok ? "Ready" : "Review"].forEach((value) => { const td = document.createElement("td"); td.textContent = value; tr.append(td); });
      return tr;
    }));
  }

  function iif() {
    const bank = clean($("bank").value), expense = clean($("expense").value), income = clean($("income").value);
    if (!bank || !expense || !income) throw Error("Enter all account names.");
    const lines = ["!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO", "!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO", "!ENDTRNS"];
    state.tx.filter((transaction) => transaction.ok && !transaction.duplicate).forEach((transaction) => {
      const type = transaction.a < 0 ? "CHK" : "DEP", other = transaction.a < 0 ? (transaction.category || expense) : income;
      lines.push(`TRNS\t${type}\t${transaction.d}\t${bank}\t\t${transaction.a.toFixed(2)}\t${transaction.memo}`, `SPL\t${type}\t${transaction.d}\t${other}\t\t${(-transaction.a).toFixed(2)}\t${transaction.memo}`, "ENDTRNS");
    });
    return `${lines.join("\r\n")}\r\n`;
  }

  function resetImport() {
    input.value = "";
    Object.assign(state, { headers: [], rows: [], tx: [], review: null, cleaner: null, source: false, name: "transactions", cleaned: false, cleanSummary: null, imported: false, importPreview: null, fileMeta: null, format: "", delimiter: "", worksheetName: "", worksheetIndex: 0, headerRow: 0, suggestions: null, importWarnings: [], importErrors: [] });
    work.classList.add("hidden"); $("results").classList.add("hidden"); status.textContent = "No file selected";
    window.SuiteGate.setActive(false);
    window.dispatchEvent(new CustomEvent("ledgerlift:cleared"));
  }

  input.addEventListener("change", (event) => load(event.target.files[0]));
  drop.addEventListener("dragover", (event) => event.preventDefault());
  drop.addEventListener("drop", (event) => { event.preventDefault(); load(event.dataTransfer.files[0]); });
  drop.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); input.click(); } });
  $("sampleBtn").addEventListener("click", () => load(new File(["Date,Description,Amount\n07/01/2026,Coffee Shop,-6.45\n07/02/2026,Client Payment,725.00\n07/03/2026,Coffee Shop,-6.45"], "sample.csv", { type: "text/csv" }), true));
  $("clearBtn").addEventListener("click", () => { if (canReplaceFile()) resetImport(); });
  window.addEventListener("ledgerlift:import-config-changed", (event) => configureImport(event.detail || {}));
  window.addEventListener("ledgerlift:confirm-import", confirmImport);
  window.addEventListener("ledgerlift:clean-rows", () => { try { cleanRows(); } catch (error) { window.SuiteGate.message(error.message); } });
  window.addEventListener("ledgerlift:review-changed", (event) => {
    if (!state.review) return;
    state.cleaner?.syncReviewData();
    state.rows = state.review.getWorkingRows();
    if (["edit", "restore", "add", "delete", "restore-deleted", "undo", "redo"].includes(event.detail?.type)) {
      state.cleaned = false;
      state.cleanSummary = null;
      state.tx = [];
      $("results").classList.add("hidden");
    }
  });
  window.addEventListener("ledgerlift:clean-state-changed", (event) => {
    if (!state.cleaner) return;
    state.rows = state.review.getWorkingRows();
    state.cleanSummary = state.cleaner.getSummary();
    if (event.detail?.type !== "review-change") state.cleaned = true;
    state.tx = [];
    $("results").classList.add("hidden");
  });
  window.addEventListener("ledgerlift:review-edited", () => { state.cleaned = false; state.cleanSummary = null; state.tx = []; $("results").classList.add("hidden"); });
  $("analyze").addEventListener("click", analyze);
  $("download").addEventListener("click", () => { try { if (window.LedgerLiftWorkspace && !window.LedgerLiftWorkspace.canExport()) { window.SuiteGate.message("Review the preview and resolve every row marked Review before exporting."); return; } if (state.tx.some((transaction) => !transaction.ok)) { window.SuiteGate.message("Resolve every row marked Review before exporting."); return; } if (!state.source && window.SuiteGate.used()) { window.SuiteGate.showUpgrade(); return; } const blob = new Blob([iif()], { type: "text/plain" }), anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `${state.name}.iif`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); if (!state.source) window.SuiteGate.markUsed(); window.dispatchEvent(new Event("ledgerlift:exported")); } catch (error) { window.SuiteGate.message(error.message); } });
  window.LedgerLiftCore = { state, analyze, cleanRows, renderRows, exportIif: iif, getTier: tier, markCleanReady: () => { state.cleaned = true; }, syncReviewRows: () => { if (state.review) state.rows = state.review.getWorkingRows(); } };
  const importerScript = document.createElement("script");
  importerScript.src = "importer.js?v=8f5e2b1";
  importerScript.onload = () => {
    const reviewScript = document.createElement("script");
    reviewScript.src = "review.js?v=8f5e2b1";
    reviewScript.onload = () => {
      const cleanerScript = document.createElement("script");
      cleanerScript.src = "cleaner.js?v=8f5e2b1";
      cleanerScript.onload = () => { const workspaceScript = document.createElement("script"); workspaceScript.src = "workspace.js?v=8f5e2b1"; document.head.append(workspaceScript); };
      document.head.append(cleanerScript);
    };
    document.head.append(reviewScript);
  };
  document.head.append(importerScript);
  window.dispatchEvent(new Event("ledgerlift:ready"));
})();
