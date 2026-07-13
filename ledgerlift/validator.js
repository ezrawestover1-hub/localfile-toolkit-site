(() => {
  "use strict";

  const HISTORY_LIMITS = { free: 25, standard: 50, plus: 100 };
  const text = (value) => String(value ?? "");
  const clean = (value) => text(value).replace(/[\t\r\n\x00-\x1f\x7f]/g, " ").trim().slice(0, 512);
  const normalized = (value) => clean(value).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
  const money = (value) => {
    const raw = text(value).trim();
    if (!raw) return NaN;
    const negative = /^\(.*\)$/.test(raw);
    const number = Number(raw.replace(/[,$£€¥\s()]/g, ""));
    return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : NaN;
  };
  const date = (value) => {
    const raw = text(value).trim(); let year; let month; let day;
    let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) { year = Number(match[1]); month = Number(match[2]); day = Number(match[3]); }
    else {
      match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
      if (!match) return null;
      month = Number(match[1]); day = Number(match[2]); year = Number(match[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
    }
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}` : null;
  };

  function createValidator({ review, mapper, accountMapper, tier = "free" } = {}) {
    const historyLimit = HISTORY_LIMITS[tier] || HISTORY_LIMITS.free;
    let lastReport = null;

    function columns() { return mapper?.getState?.().columns || []; }
    function columnFor(...roles) { return columns().find((column) => roles.includes(column.role) && !["unmapped", "ignore"].includes(column.role)); }
    function valueFor(entry, ...roles) { const column = columnFor(...roles); return { column, value: column ? text(entry.values[column.header]) : "" }; }
    function addIssue(issues, severity, code, message, column = "") { issues.push({ severity, code, message, column }); }
    function duplicateKey(transaction) { return `${transaction.d || ""}|${Number.isFinite(transaction.a) ? transaction.a.toFixed(2) : ""}|${normalized(transaction.memo)}`; }

    function validate() {
      const mapperValidation = mapper?.getValidation?.() || { mode: "signed", canContinue: false, blocking: [] };
      const mode = mapperValidation.mode || "signed";
      const assignments = accountMapper?.rowAssignments?.() || {};
      const entries = review?.activeEntries?.() || [];
      const transactions = [];
      const issueCounts = { dateErrors: 0, amountErrors: 0, descriptionErrors: 0, accountErrors: 0, categoryWarnings: 0, duplicateRows: 0, importWarnings: 0 };
      const duplicateGroups = new Map();

      entries.forEach((entry, index) => {
        const issues = [];
        const dateField = valueFor(entry, "transactionDate", "postedDate");
        const descriptionField = valueFor(entry, "description", "memo", "vendor", "name");
        const amountField = valueFor(entry, "amount");
        const debitField = valueFor(entry, "debit");
        const creditField = valueFor(entry, "credit");
        const assignment = assignments[entry.id] || {};
        const d = date(dateField.value);
        let debit = money(debitField.value); let credit = money(creditField.value); let amount = money(amountField.value);
        if (mode === "debit-credit") {
          if (debitField.value.trim() && creditField.value.trim()) addIssue(issues, "blocking", "both-debit-credit", "Debit and credit are both filled. Keep only the side that represents this transaction.", debitField.column?.header || creditField.column?.header || "");
          if (!debitField.value.trim() && !creditField.value.trim()) addIssue(issues, "blocking", "missing-debit-credit", "Enter a debit or credit value for this row.", debitField.column?.header || creditField.column?.header || "");
          if (debitField.value.trim() && !Number.isFinite(debit)) addIssue(issues, "blocking", "invalid-debit", "The debit value is not a readable number.", debitField.column?.header || "");
          if (creditField.value.trim() && !Number.isFinite(credit)) addIssue(issues, "blocking", "invalid-credit", "The credit value is not a readable number.", creditField.column?.header || "");
          if (Number.isFinite(debit) || Number.isFinite(credit)) amount = (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0);
        } else {
          if (!amountField.value.trim()) addIssue(issues, "blocking", "missing-amount", "Enter an amount for this row.", amountField.column?.header || "");
          else if (!Number.isFinite(amount)) addIssue(issues, "blocking", "invalid-amount", "The amount is not a readable number.", amountField.column?.header || "");
        }
        if (!dateField.value.trim()) addIssue(issues, "blocking", "missing-date", "Enter a transaction date for this row.", dateField.column?.header || "");
        else if (!d) addIssue(issues, "blocking", "invalid-date", "The transaction date is not recognized.", dateField.column?.header || "");
        if (!descriptionField.value.trim()) addIssue(issues, "blocking", "missing-description", "Add a description, memo, vendor, or name so this row can be identified.", descriptionField.column?.header || "");
        if (!assignment.sourceAccount && !assignment.account) addIssue(issues, "blocking", "missing-source-account", "Choose a source account for this row in Map Accounts.");
        if (!assignment.category && (amount < 0 || amount > 0)) { addIssue(issues, "warning", "missing-category", "No category account is assigned; the export fallback account will be used."); issueCounts.categoryWarnings += 1; }
        (entry.warningMessages || []).forEach((message) => { addIssue(issues, "warning", "import-warning", message); issueCounts.importWarnings += 1; });
        if (Number.isFinite(amount) && amount === 0) addIssue(issues, "warning", "zero-amount", "This row has a zero amount. Confirm that it should be exported.", amountField.column?.header || debitField.column?.header || creditField.column?.header || "");
        const transaction = { index, rowId: entry.id, rowNumber: index + 1, d, a: amount, debit, credit, memo: clean(descriptionField.value), category: assignment.category || "Uncategorized", name: assignment.name || "", className: assignment.className || "", customerJob: assignment.customerJob || "", sourceAccount: assignment.sourceAccount || assignment.account || "", duplicate: false, ok: !issues.some((issue) => issue.severity === "blocking"), issues, status: "" };
        transactions.push(transaction);
        if (transaction.ok && transaction.d && Number.isFinite(transaction.a)) { const key = duplicateKey(transaction); const group = duplicateGroups.get(key) || []; group.push(transaction); duplicateGroups.set(key, group); }
      });

      duplicateGroups.forEach((group) => {
        if (group.length < 2) return;
        issueCounts.duplicateRows += group.length;
        group.forEach((transaction) => addIssue(transaction.issues, "warning", "possible-duplicate", `This row matches ${group.length - 1} other row${group.length === 2 ? "" : "s"} by date, amount, and description. Confirm whether it should remain.`));
      });
      transactions.forEach((transaction) => { transaction.status = transaction.ok ? (transaction.issues.some((issue) => issue.severity === "warning") ? "Ready with warnings" : "Ready") : "Review required"; });
      const blocking = transactions.reduce((sum, transaction) => sum + transaction.issues.filter((issue) => issue.severity === "blocking").length, 0);
      const warnings = transactions.reduce((sum, transaction) => sum + transaction.issues.filter((issue) => issue.severity === "warning").length, 0);
      const ready = transactions.filter((transaction) => transaction.ok).length;
      const report = { tier, historyLimit, mode, transactions, summary: { total: transactions.length, ready, review: transactions.length - ready, blockingErrors: blocking, warnings, dateErrors: issueCounts.dateErrors, amountErrors: issueCounts.amountErrors, descriptionErrors: issueCounts.descriptionErrors, accountErrors: issueCounts.accountErrors, categoryWarnings: issueCounts.categoryWarnings, duplicateRows: issueCounts.duplicateRows, importWarnings: issueCounts.importWarnings, canContinue: transactions.length > 0 && blocking === 0 }, canContinue: transactions.length > 0 && blocking === 0, notice: blocking ? "Some rows need attention before you can continue." : warnings ? "All required fields are readable. Review the warnings before previewing." : "Every transaction row passed the required checks." };
      report.summary.dateErrors = transactions.reduce((sum, transaction) => sum + transaction.issues.filter((issue) => ["missing-date", "invalid-date"].includes(issue.code)).length, 0);
      report.summary.amountErrors = transactions.reduce((sum, transaction) => sum + transaction.issues.filter((issue) => ["missing-amount", "invalid-amount", "missing-debit-credit", "invalid-debit", "invalid-credit", "both-debit-credit"].includes(issue.code)).length, 0);
      report.summary.descriptionErrors = transactions.reduce((sum, transaction) => sum + transaction.issues.filter((issue) => issue.code === "missing-description").length, 0);
      report.summary.accountErrors = transactions.reduce((sum, transaction) => sum + transaction.issues.filter((issue) => issue.code === "missing-source-account").length, 0);
      lastReport = report;
      return report;
    }

    function getReport() { return lastReport || validate(); }
    return { HISTORY_LIMITS, validate, getReport, getState: getReport };
  }

  window.LedgerLiftValidator = { HISTORY_LIMITS, create: createValidator, money, date };
})();
