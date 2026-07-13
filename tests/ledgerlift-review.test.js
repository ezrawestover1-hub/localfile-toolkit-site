import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "ledgerlift/review.js"), "utf8");

function createModel(options = {}) {
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: "ledgerlift/review.js" });
  return context.window.LedgerLiftReviewModel.create({
    headers: ["Date", "Description", "Amount"],
    rows: [
      { Date: "07/01/2026", Description: "Coffee Shop", Amount: "-6.45" },
      { Date: "07/02/2026", Description: "Client Payment", Amount: "725.00" },
      { Date: "07/03/2026", Description: "<img src=x onerror=alert(1)>", Amount: "-8.00" }
    ],
    ...options
  });
}

test("Review keeps stable IDs and separates original from working values", () => {
  const model = createModel({ rowWarnings: [{ rowIndex: 1, message: "Unexpected column count." }] });
  const state = model.getState();
  assert.equal(state.totalRows, 3);
  assert.equal(state.activeEntries[0].id, "row-1");
  assert.equal(JSON.stringify(model.getOriginalRows()[0]), JSON.stringify({ Date: "07/01/2026", Description: "Coffee Shop", Amount: "-6.45" }));
  model.editCell("row-1", "Description", "Coffee Shop (edited)");
  assert.equal(model.getEntry("row-1").values.Description, "Coffee Shop (edited)");
  assert.equal(model.getEntry("row-1").original.Description, "Coffee Shop");
  assert.equal(model.getState().changedRows, 1);
  assert.equal(model.getState().activeEntries[1].warningMessages[0], "Unexpected column count.");
});

test("Review edits, restores, additions, deletions, undo, and redo", () => {
  const model = createModel();
  model.editCell("row-1", "Amount", "-9.99");
  assert.equal(model.getState().editedCells, 1);
  model.restoreCell("row-1", "Amount");
  assert.equal(model.getEntry("row-1").values.Amount, "-6.45");
  model.editCell("row-1", "Description", "Updated");
  model.undo();
  assert.equal(model.getEntry("row-1").values.Description, "Coffee Shop");
  model.redo();
  assert.equal(model.getEntry("row-1").values.Description, "Updated");
  model.addRow();
  const added = model.getState().activeEntries.find((entry) => entry.created);
  assert.ok(added);
  assert.equal(model.getState().selectedIds.includes(added.id), true);
  model.deleteRows([added.id]);
  assert.equal(model.getState().totalRows, 3);
  assert.equal(model.getState().deletedRows, 1);
  model.restoreDeletedRows([added.id]);
  assert.equal(model.getState().totalRows, 4);
  model.deleteRows(["row-1", "row-2"]);
  assert.equal(model.getState().totalRows, 2);
  model.undo();
  assert.equal(model.getState().totalRows, 4);
  model.redo();
  assert.equal(model.getState().totalRows, 2);
});

test("Review search, filters, sorting, pagination, and selection apply to the working view", () => {
  const model = createModel({ rows: Array.from({ length: 60 }, (_, index) => ({ Date: `07/${String((index % 28) + 1).padStart(2, "0")}/2026`, Description: index % 2 ? "Expense" : "Deposit", Amount: String(index - 30) })) });
  model.setView({ query: "deposit" });
  assert.equal(model.getState().visibleCount, 30);
  model.setView({ query: "", filter: "changed" });
  model.editCell("row-1", "Description", "Changed deposit");
  assert.equal(model.getState().visibleCount, 1);
  model.setView({ filter: "all", sortColumn: "Amount", sortDirection: "desc", pageSize: 25 });
  assert.equal(model.getState().visibleEntries[0].values.Amount, "29");
  assert.equal(model.getState().view.pageCount, 3);
  model.setView({ page: 2 });
  const visibleIds = model.getState().visibleEntries.map((entry) => entry.id);
  model.selectAllVisible();
  assert.deepEqual(model.getState().selectedIds, visibleIds);
  model.clearSelection();
  assert.equal(model.getState().selectedCount, 0);
  model.setView({ sortColumn: "", sortDirection: "", page: 1 });
  assert.equal(model.getState().visibleEntries[0].id, "row-1");
});

test("Review restores selected rows and all manual edits without changing imported originals", () => {
  const model = createModel();
  model.editCell("row-1", "Description", "One");
  model.editCell("row-2", "Amount", "999");
  model.select("row-1");
  model.select("row-2");
  model.restoreRows(["row-1", "row-2"]);
  assert.equal(model.getState().editedCells, 0);
  model.editCell("row-1", "Description", "Two");
  model.addRow();
  model.restoreAllEdits();
  assert.equal(model.getEntry("row-1").values.Description, "Coffee Shop");
  assert.equal(model.getState().addedRows, 1);
  assert.equal(model.getOriginalRows()[0].Description, "Coffee Shop");
  assert.equal(model.getEntry("row-3").values.Description, "<img src=x onerror=alert(1)>");
});

test("Review paginates a larger supported dataset without rendering every row", () => {
  const rows = Array.from({ length: 2000 }, (_, index) => ({ Date: `07/${String((index % 28) + 1).padStart(2, "0")}/2026`, Description: `Fictional merchant ${index}`, Amount: String(index - 1000) }));
  const started = performance.now();
  const model = createModel({ rows });
  const state = model.getState();
  const elapsed = performance.now() - started;
  assert.equal(state.totalRows, 2000);
  assert.equal(state.visibleEntries.length, 25);
  assert.equal(state.view.pageCount, 80);
  assert.ok(elapsed < 1000, `Review model setup took ${elapsed}ms`);
});
