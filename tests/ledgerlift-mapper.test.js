import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewSource = fs.readFileSync(path.join(root, "ledgerlift/review.js"), "utf8");
const mapperSource = fs.readFileSync(path.join(root, "ledgerlift/mapper.js"), "utf8");

function createMapper(tier = "standard", rows = null, suggestions = null) {
  const context = { window: {} };
  vm.runInNewContext(reviewSource, context, { filename: "ledgerlift/review.js" });
  vm.runInNewContext(mapperSource, context, { filename: "ledgerlift/mapper.js" });
  const review = context.window.LedgerLiftReviewModel.create({
    headers: ["Posted", "Description", "Amount", "Debit", "Credit", "Category"],
    rows: rows || [
      { Posted: "2026-03-01", Description: "Coffee Shop", Amount: "-6.45", Debit: "", Credit: "", Category: "Meals" },
      { Posted: "2026-03-02", Description: "Client Payment", Amount: "725.00", Debit: "", Credit: "", Category: "Income" }
    ]
  });
  const mapper = context.window.LedgerLiftMapper.create({ review, tier, suggestedRoles: suggestions || {
    date: { column: "Posted", confidence: "high", score: 13 },
    description: { column: "Description", confidence: "high", score: 13 },
    amount: { column: "Amount", confidence: "high", score: 13 },
    category: { column: "Category", confidence: "high", score: 13 }
  } });
  return { mapper, review, context };
}

test("Map Columns uses stable positional column IDs and carries importer suggestions", () => {
  const { mapper } = createMapper();
  const state = mapper.getState();
  assert.deepEqual(JSON.parse(JSON.stringify(state.columns.slice(0, 3).map((column) => column.id))), ["column-1", "column-2", "column-3"]);
  assert.equal(state.columns[0].role, "transactionDate");
  assert.equal(state.columns[0].suggestions[0].confidence, "High");
  assert.equal(state.columns[2].role, "amount");
  assert.equal(state.columns[0].profile.datePercent, 100);
  assert.ok(state.columns[0].profile.samples.includes("2026-03-01"));
});

test("Map Columns validates required fields, explicit role conflicts, and amount structures", () => {
  const { mapper } = createMapper();
  assert.equal(mapper.getValidation().canContinue, true);
  const conflict = mapper.setRole("column-4", "description");
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict.existingColumnId, "column-2");
  assert.equal(mapper.getValidation().canContinue, false);
  mapper.resolveConflict("replace");
  assert.equal(mapper.getState().columns.find((column) => column.id === "column-4").role, "description");
  assert.equal(mapper.getState().columns.find((column) => column.id === "column-2").role, "unmapped");
  const amountConflict = mapper.setRole("column-5", "credit");
  assert.equal(amountConflict.ok, true);
  assert.equal(mapper.getValidation().blocking.some((issue) => issue.code === "amount-structure-conflict"), true);
  assert.equal(mapper.setAmountMode("debit-credit").ok, false);
  mapper.setAmountMode("debit-credit", { resolve: true });
  assert.equal(mapper.getState().columns.find((column) => column.id === "column-3").role, "unmapped");
  assert.equal(mapper.getValidation().blocking.some((issue) => issue.code === "amount-structure-conflict"), false);
});

test("Map Columns preserves manual assignments while applying high-confidence suggestions", () => {
  const { mapper } = createMapper("standard", null, { date: { column: "Posted", confidence: "high", score: 13 }, description: { column: "Description", confidence: "high", score: 13 }, amount: { column: "Amount", confidence: "high", score: 13 } });
  mapper.clearAll();
  mapper.setRole("column-6", "category");
  mapper.applyHighConfidence();
  assert.equal(mapper.getState().columns.find((column) => column.id === "column-6").role, "category");
  assert.equal(mapper.getState().columns.find((column) => column.id === "column-1").role, "transactionDate");
  mapper.resetColumn("column-6");
  assert.equal(mapper.getState().columns.find((column) => column.id === "column-6").role, "category");
});

test("Map Columns preview is limited, current-data based, and non-mutating", () => {
  const { mapper, review } = createMapper();
  const before = review.getEntry("row-1").values.Description;
  review.editCell("row-1", "Description", "Edited Fictional Merchant");
  const preview = mapper.getPreview(1);
  assert.equal(preview.length, 1);
  assert.equal(preview[0].fields.description, "Edited Fictional Merchant");
  assert.equal(preview[0].source.Description, "Edited Fictional Merchant");
  assert.notEqual(review.getEntry("row-1").values.Description, before);
  assert.equal(preview[0].source.Amount, "-6.45");
});

test("Map Columns history, reset, clear, and review changes remain local", () => {
  const { mapper, review } = createMapper("free");
  mapper.setRole("column-6", "ignore");
  assert.equal(mapper.getState().canUndo, true);
  mapper.undo();
  assert.equal(mapper.getState().columns.find((column) => column.id === "column-6").role, "category");
  mapper.setRole("column-6", "category");
  mapper.clearAll();
  mapper.undo();
  assert.equal(mapper.getState().columns.find((column) => column.id === "column-6").role, "category");
  review.editCell("row-1", "Amount", "-7.00");
  mapper.refresh();
  assert.equal(mapper.getPreview(1)[0].source.Amount, "-7.00");
  assert.equal(mapper.getState().historyLimit, 40);
});

test("Map Columns remains bounded for a large local dataset", () => {
  const rows = Array.from({ length: 2000 }, (_, index) => ({ Posted: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`, Description: `Fictional merchant ${index}`, Amount: String(index - 1000), Debit: "", Credit: "", Category: "General" }));
  const started = performance.now();
  const { mapper } = createMapper("plus", rows);
  const elapsed = performance.now() - started;
  assert.equal(mapper.getState().columns[0].profile.nonBlank, 2000);
  assert.ok(elapsed < 1500, `Map scan took ${elapsed}ms`);
});
