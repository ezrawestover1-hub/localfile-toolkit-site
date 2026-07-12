(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { headers: [], rows: [], tx: [], source: false, name: "transactions", amountMode: "signed" };
  const input = $("fileInput");
  const drop = $("dropZone");
  const status = $("fileStatus");
  const work = $("work");

  function parse(text) {
    const matrix = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i], next = text[i + 1];
      if (char === '"') {
        if (quoted && next === '"') { field += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(field.trim()); field = "";
        if (row.some(Boolean)) matrix.push(row);
        row = [];
      } else field += char;
    }
    row.push(field.trim());
    if (row.some(Boolean)) matrix.push(row);
    if (matrix.length < 2) throw Error("The CSV needs headers and at least one transaction.");
    const headers = matrix.shift();
    return { headers, rows: matrix.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))) };
  }

  function options(id) {
    const select = $(id);
    if (!select) return;
    select.replaceChildren(...state.headers.map((header) => {
      const option = document.createElement("option"); option.value = option.textContent = header; return option;
    }));
  }

  function guess(words) {
    return state.headers.find((header) => words.some((word) => header.toLowerCase().replace(/[^a-z]/g, "").includes(word))) || state.headers[0];
  }

  function load(file, sample = false) {
    if (!sample && !window.SuiteGate.mayOpenRealDocument()) { window.SuiteGate.showUpgrade(); return; }
    if (!file || file.size > 10 * 1024 * 1024) { window.SuiteGate.message("Choose a CSV smaller than 10 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Object.assign(state, parse(String(reader.result)), { source: sample, name: file.name.replace(/\.[^.]+$/, "") });
        ["date", "desc", "amount", "debit", "credit"].forEach(options);
        $("date").value = guess(["date"]);
        $("desc").value = guess(["description", "memo", "payee", "details"]);
        $("amount").value = guess(["amount", "value", "total"]);
        if ($("debit")) $("debit").value = guess(["debit", "withdrawal", "charge"]);
        if ($("credit")) $("credit").value = guess(["credit", "deposit"]);
        status.textContent = `${file.name} · ${state.rows.length} rows`;
        work.classList.remove("hidden"); $("results").classList.add("hidden");
        window.SuiteGate.update(sample);
        window.dispatchEvent(new CustomEvent("ledgerlift:data-loaded"));
      } catch (error) { window.SuiteGate.message(error.message); }
    };
    reader.readAsText(file);
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

  function analyze() {
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

  input.addEventListener("change", (event) => load(event.target.files[0]));
  drop.addEventListener("dragover", (event) => event.preventDefault());
  drop.addEventListener("drop", (event) => { event.preventDefault(); load(event.dataTransfer.files[0]); });
  $("sampleBtn").addEventListener("click", () => load(new File(["Date,Description,Amount\n07/01/2026,Coffee Shop,-6.45\n07/02/2026,Client Payment,725.00\n07/03/2026,Coffee Shop,-6.45"], "sample.csv", { type: "text/csv" }), true));
  $("clearBtn").addEventListener("click", () => { input.value = ""; state.rows = []; state.tx = []; work.classList.add("hidden"); status.textContent = "No file selected"; window.SuiteGate.setActive(false); window.dispatchEvent(new CustomEvent("ledgerlift:cleared")); });
  $("analyze").addEventListener("click", analyze);
  $("download").addEventListener("click", () => { try { if (!state.source && window.SuiteGate.used()) { window.SuiteGate.showUpgrade(); return; } const blob = new Blob([iif()], { type: "text/plain" }), anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `${state.name}.iif`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); if (!state.source) window.SuiteGate.markUsed(); } catch (error) { window.SuiteGate.message(error.message); } });
  window.LedgerLiftCore = { state, analyze, renderRows, exportIif: iif };
  window.dispatchEvent(new Event("ledgerlift:ready"));
})();
