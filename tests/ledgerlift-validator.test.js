import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sources = ["review.js", "mapper.js", "account-mapper.js", "validator.js"].map((file) => read(`ledgerlift/${file}`));

function createFixture(rows, headers = ["Date", "Description", "Amount"]) {
  const context = { window: {} };
  sources.forEach((source, index) => vm.runInNewContext(source, context, { filename: `ledgerlift/validator-${index}.js` }));
  const review = context.window.LedgerLiftReviewModel.create({ headers, rows });
  const suggestions = headers.includes("Debit") ? {
    date: { column: "Date", confidence: "high" }, description: { column: "Description", confidence: "high" }, debit: { column: "Debit", confidence: "high" }, credit: { column: "Credit", confidence: "high" }
  } : { date: { column: "Date", confidence: "high" }, description: { column: "Description", confidence: "high" }, amount: { column: "Amount", confidence: "high" } };
  const mapper = context.window.LedgerLiftMapper.create({ review, tier: "standard", suggestedRoles: suggestions });
  const accountMapper = context.window.LedgerLiftAccountMapper.create({ review, mapper, tier: "standard" });
  const validator = context.window.LedgerLiftValidator.create({ review, mapper, accountMapper, tier: "standard" });
  return { context, review, mapper, accountMapper, validator };
}

function setDefaultSourceAccount(accountMapper) {
  const created = accountMapper.createDestination({ type: "account", name: "Fictional Checking", accountType: "BANK" });
  assert.equal(created.ok, true);
  accountMapper.setDefaultSourceAccount(created.destination.id);
}

test("Validate passes required rows, preserves duplicates, and reports warnings without mutation", () => {
  const { validator, accountMapper, review } = createFixture([
    { Date: "07/01/2026", Description: "Coffee Shop", Amount: "-6.45" },
    { Date: "07/01/2026", Description: "Coffee Shop", Amount: "-6.45" },
    { Date: "07/02/2026", Description: "Client Payment", Amount: "725.00" }
  ]);
  setDefaultSourceAccount(accountMapper);
  const report = validator.validate();
  assert.equal(report.canContinue, true);
  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.ready, 3);
  assert.equal(report.summary.duplicateRows, 2);
  assert.equal(report.summary.categoryWarnings, 3);
  assert.equal(report.transactions[0].duplicate, false);
  assert.match(report.transactions[0].issues.find((issue) => issue.code === "possible-duplicate").message, /matches 1 other row/);
  assert.equal(review.getEntry("row-1").values.Description, "Coffee Shop");
});

test("Validate identifies missing dates, descriptions, amounts, and source accounts", () => {
  const { validator } = createFixture([{ Date: "not-a-date", Description: "", Amount: "not-money" }]);
  const report = validator.validate();
  assert.equal(report.canContinue, false);
  assert.equal(report.summary.review, 1);
  assert.equal(report.summary.dateErrors, 1);
  assert.equal(report.summary.amountErrors, 1);
  assert.equal(report.summary.descriptionErrors, 1);
  assert.equal(report.summary.accountErrors, 1);
  assert.equal(report.transactions[0].status, "Review required");
});

test("Validate handles debit-credit conflicts and inert formula-like text", () => {
  const { validator, accountMapper } = createFixture([
    { Date: "2026-07-01", Description: "=HYPERLINK(\"fictional\")", Debit: "10.00", Credit: "2.00" },
    { Date: "2026-07-02", Description: "Deposit", Debit: "=1+1", Credit: "" }
  ], ["Date", "Description", "Debit", "Credit"]);
  setDefaultSourceAccount(accountMapper);
  const report = validator.validate();
  assert.equal(report.canContinue, false);
  assert.ok(report.transactions[0].issues.some((issue) => issue.code === "both-debit-credit"));
  assert.ok(report.transactions[1].issues.some((issue) => issue.code === "invalid-debit"));
  assert.equal(report.transactions[0].memo, "=HYPERLINK(\"fictional\")");
});

test("Validate remains local and bounded for a large fictional dataset", () => {
  const rows = Array.from({ length: 2000 }, (_, index) => ({ Date: "2026-07-01", Description: `Fictional merchant ${index}`, Amount: index % 2 ? "-4.25" : "18.00" }));
  const { validator, accountMapper } = createFixture(rows);
  setDefaultSourceAccount(accountMapper);
  const started = performance.now();
  const report = validator.validate();
  const elapsed = performance.now() - started;
  assert.equal(report.summary.total, 2000);
  assert.equal(report.summary.review, 0);
  assert.ok(elapsed < 1500, `Validation took ${elapsed}ms`);
});
