(() => {
  "use strict";
  const PROFILE_KEY = "ledgerlift-plus-profiles-v1";
  const $ = (id) => document.getElementById(id);
  let enabled = false;

  const css = `.ledgerlift-plus{margin-top:22px;padding:22px;border:1px solid #cbded9;border-radius:18px;background:linear-gradient(145deg,#f4fbf9,#fff)}.ledgerlift-plus h3{margin:0 0 5px;color:#123b34}.ledgerlift-plus p{margin:5px 0;color:#62717a}.plus-lock{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:13px 15px;border-radius:12px;background:#edf6f3;color:#123b34}.plus-lock a{white-space:nowrap}.plus-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:16px 0}.plus-toolbar label{min-width:170px}.plus-toolbar .button{padding:10px 13px}.plus-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}.plus-stat{padding:14px;border:1px solid #dce3e5;border-radius:13px;background:#fff}.plus-stat strong{display:block;font-size:1.35rem;color:#123b34}.plus-stat span{font-size:.82rem;color:#62717a}.plus-rules{width:100%;min-height:74px}.plus-table table{min-width:680px}.plus-table input{padding:7px 8px;min-width:120px}.plus-status{font-size:.88rem;color:#123b34;min-height:1.4em}.plus-muted{opacity:.55;pointer-events:none}@media(max-width:680px){.plus-lock{align-items:flex-start;flex-direction:column}.plus-grid{grid-template-columns:1fr}}`;
  function profiles() { try { const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } }
  function saveProfiles(value) { localStorage.setItem(PROFILE_KEY, JSON.stringify(value)); }
  function profileData() { return { date: $("date")?.value, desc: $("desc")?.value, amount: $("amount")?.value, debit: $("debit")?.value, credit: $("credit")?.value, amountMode: $("amountMode")?.value, bank: $("bank")?.value, expense: $("expense")?.value, income: $("income")?.value }; }
  function refreshProfiles() {
    const select = $("ledgerliftProfile"); if (!select) return;
    select.replaceChildren(new Option("Choose a saved profile", ""));
    Object.keys(profiles()).sort().forEach((name) => select.append(new Option(name, name)));
  }
  function setEnabled(value) {
    enabled = value;
    const panel = $("ledgerliftPlus"); if (!panel) return;
    panel.querySelector(".plus-lock").hidden = enabled;
    panel.querySelector(".plus-body").classList.toggle("plus-muted", !enabled);
    panel.querySelectorAll(".plus-body button,.plus-body select,.plus-body textarea,input").forEach((control) => { control.disabled = !enabled; });
    panel.querySelector(".plus-status").textContent = enabled ? "Plus is active on this browser. Your profiles stay local to this browser." : "Activate LedgerLift Plus to unlock these controls.";
  }
  function duplicateRows() {
    const state = window.LedgerLiftCore.state, seen = new Map();
    state.tx.forEach((transaction) => { const key = `${transaction.d}|${transaction.memo.toLowerCase()}|${transaction.a}`; transaction.duplicate = seen.has(key); if (!seen.has(key)) seen.set(key, transaction.index); });
  }
  function renderPlusRows() {
    const body = $("plusRows"), state = window.LedgerLiftCore.state;
    if (!body) return;
    body.replaceChildren(...state.tx.slice(0, 200).map((transaction) => {
      const row = document.createElement("tr");
      [transaction.d || "—", transaction.memo || "—", Number.isFinite(transaction.a) ? transaction.a.toFixed(2) : "—"].forEach((value) => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); });
      const category = document.createElement("input"); category.value = transaction.category || "Uncategorized"; category.setAttribute("aria-label", `Category for ${transaction.memo}`); category.addEventListener("input", () => { transaction.category = category.value.trim() || "Uncategorized"; });
      const categoryCell = document.createElement("td"); categoryCell.append(category); row.append(categoryCell);
      const duplicate = document.createElement("td"); duplicate.textContent = transaction.duplicate ? "Duplicate" : "Keep"; duplicate.className = transaction.duplicate ? "duplicate" : "keep"; row.append(duplicate);
      return row;
    }));
  }
  function report() {
    const transactions = window.LedgerLiftCore.state.tx.filter((transaction) => transaction.ok && !transaction.duplicate);
    const income = transactions.filter((transaction) => transaction.a > 0).reduce((sum, transaction) => sum + transaction.a, 0);
    const expenses = transactions.filter((transaction) => transaction.a < 0).reduce((sum, transaction) => sum + Math.abs(transaction.a), 0);
    const categories = transactions.reduce((map, transaction) => { const key = transaction.category || "Uncategorized"; map[key] = (map[key] || 0) + transaction.a; return map; }, {});
    $("reportIncome").textContent = income.toFixed(2); $("reportExpenses").textContent = expenses.toFixed(2); $("reportNet").textContent = (income - expenses).toFixed(2); $("reportRows").textContent = String(transactions.length);
    $("categoryReport").replaceChildren(...Object.entries(categories).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([name, value]) => { const row = document.createElement("li"); row.textContent = `${name}: ${value.toFixed(2)}`; return row; }));
  }
  function applyRules() {
    if (!enabled) return;
    const rules = $("categoryRules").value.split("\n").map((line) => line.split("=")).filter(([needle, category]) => needle?.trim() && category?.trim());
    window.LedgerLiftCore.state.tx.forEach((transaction) => { const match = rules.find(([needle]) => transaction.memo.toLowerCase().includes(needle.trim().toLowerCase())); if (match) transaction.category = match[1].trim(); });
    renderPlusRows(); report(); $("plusStatus").textContent = `Applied ${rules.length} categorization rule${rules.length === 1 ? "" : "s"}.`;
  }
  function downloadReport() {
    if (!enabled) return;
    const rows = [["Date", "Description", "Amount", "Category", "Duplicate"], ...window.LedgerLiftCore.state.tx.map((transaction) => [transaction.d, transaction.memo, transaction.a.toFixed(2), transaction.category, transaction.duplicate ? "Yes" : "No"])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); anchor.download = "ledgerlift-report.csv"; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }
  function createPanel() {
    if ($("ledgerliftPlus")) return;
    const style = document.createElement("style"); style.textContent = css; document.head.append(style);
    const panel = document.createElement("section"); panel.id = "ledgerliftPlus"; panel.className = "ledgerlift-plus"; panel.innerHTML = `<h3>LedgerLift Plus workspace</h3><p>Save reusable mappings, categorize transactions, detect duplicates, and export a review report before creating your IIF.</p><div class="plus-lock"><span>Plus controls are ready but require a LedgerLift Plus activation.</span><a href="../license/activate.html">Activate Plus</a></div><div class="plus-body"><div class="plus-toolbar"><label>Saved profile<select id="ledgerliftProfile"></select></label><button class="button secondary" id="loadProfile" type="button">Load</button><button class="button secondary" id="saveProfile" type="button">Save current</button><button class="button quiet" id="deleteProfile" type="button">Delete</button><label>Amount input<select id="amountMode"><option value="signed">One signed Amount column</option><option value="debit-credit">Separate Debit and Credit columns</option></select></label><label>Debit column<select id="debit"></select></label><label>Credit column<select id="credit"></select></label></div><div class="plus-toolbar"><label class="plus-rules">Categorization rules<textarea id="categoryRules" class="plus-rules" placeholder="coffee=Meals\nacme=Client income"></textarea></label><button class="button" id="applyRules" type="button">Apply rules</button><button class="button secondary" id="dedupe" type="button">Mark duplicates</button></div><p class="plus-status" id="plusStatus" role="status" aria-live="polite"></p><div class="plus-grid"><div class="plus-stat"><strong id="reportIncome">0.00</strong><span>Income</span></div><div class="plus-stat"><strong id="reportExpenses">0.00</strong><span>Expenses</span></div><div class="plus-stat"><strong id="reportNet">0.00</strong><span>Net</span></div><div class="plus-stat"><strong id="reportRows">0</strong><span>Rows included</span></div></div><div class="actions"><button class="button secondary" id="downloadReport" type="button">Download review report</button></div><ul id="categoryReport"></ul><div class="table-wrap plus-table"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category / account</th><th>Duplicate check</th></tr></thead><tbody id="plusRows"></tbody></table></div></div>`;
    work()?.append(panel);
    refreshProfiles(); setEnabled(false);
    $("saveProfile").addEventListener("click", () => { if (!enabled) return; const name = window.prompt("Name this LedgerLift profile"); if (!name?.trim()) return; const all = profiles(); all[name.trim()] = profileData(); saveProfiles(all); refreshProfiles(); $("ledgerliftProfile").value = name.trim(); $("plusStatus").textContent = `Saved profile “${name.trim()}”.`; });
    $("loadProfile").addEventListener("click", () => { if (!enabled) return; const data = profiles()[$("ledgerliftProfile").value]; if (!data) return; Object.entries(data).forEach(([id, value]) => { const control = $(id); if (control && value !== undefined) control.value = value; }); $("plusStatus").textContent = "Profile loaded. Analyze again to apply the mapping."; });
    $("deleteProfile").addEventListener("click", () => { if (!enabled) return; const select = $("ledgerliftProfile"), all = profiles(); if (!select.value) return; delete all[select.value]; saveProfiles(all); refreshProfiles(); $("plusStatus").textContent = "Profile deleted."; });
    $("applyRules").addEventListener("click", applyRules);
    $("dedupe").addEventListener("click", () => { if (!enabled) return; duplicateRows(); renderPlusRows(); report(); $("plusStatus").textContent = "Matching date, description, and amount rows are marked as duplicates and excluded from IIF/report totals."; });
    $("downloadReport").addEventListener("click", downloadReport);
    window.addEventListener("ledgerlift:analyzed", () => { duplicateRows(); renderPlusRows(); report(); });
  }
  function work() { return $("work"); }
  const modeAuthorized = () => document.body.dataset.plusAccessState === "authorized" || window.SuiteGate?.paid?.() === true;
  window.addEventListener("ledgerlift:ready", async () => { createPanel(); try { const module = await import("../license.js"); const capabilities = await module.getCapabilities(); setEnabled(capabilities.canUsePlus("ledgerlift") || modeAuthorized()); } catch { setEnabled(modeAuthorized()); } });
  window.addEventListener("plus-mode:ready", (event) => { if (event.detail?.product === "ledgerlift") { createPanel(); setEnabled(true); } });
  window.addEventListener("ledgerlift:data-loaded", () => { if ($("ledgerliftPlus")) { refreshProfiles(); } });
  if (window.LedgerLiftCore) setTimeout(() => window.dispatchEvent(new Event("ledgerlift:ready")), 0);
  if (modeAuthorized()) setTimeout(() => { createPanel(); setEnabled(true); }, 0);
})();
