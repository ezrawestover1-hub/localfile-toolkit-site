import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewSource = fs.readFileSync(path.join(root, "ledgerlift/review.js"), "utf8");
const cleanerSource = fs.readFileSync(path.join(root, "ledgerlift/cleaner.js"), "utf8");

function createCleaner(tier = "standard", rows = null) {
  const context = { window: {} };
  vm.runInNewContext(reviewSource, context, { filename: "ledgerlift/review.js" });
  vm.runInNewContext(cleanerSource, context, { filename: "ledgerlift/cleaner.js" });
  const review = context.window.LedgerLiftReviewModel.create({
    headers: ["Date", "Description", "Amount", "Reference"],
    rows: rows || [
      { Date: "03/04/2026", Description: "  coffee  shop  ", Amount: "($1,250.00)", Reference: "A-1" },
      { Date: "2026-03-05", Description: "Client Payment", Amount: "$18.00", Reference: "A-2" },
      { Date: "not a date", Description: "Zero value", Amount: "0.00", Reference: "A-3" },
      { Date: "", Description: "", Amount: "", Reference: "" },
      { Date: "03/04/2026", Description: "  coffee  shop  ", Amount: "($1,250.00)", Reference: "A-1" }
    ]
  });
  const cleaner = context.window.LedgerLiftCleaner.create({
    review,
    tier,
    suggestedRoles: { date: { column: "Date" }, description: { column: "Description" }, amount: { column: "Amount" } }
  });
  return { review, cleaner, context };
}

test("Clean keeps Review edits as the pre-clean lineage and restores to them", () => {
  const { review, cleaner } = createCleaner();
  review.editCell("row-1", "Description", "Review edited merchant");
  cleaner.syncReviewData();
  const preview = cleaner.preview("whitespace", { collapse: true });
  assert.equal(preview.changes.some((change) => change.id === "row-1" && change.after === "Review edited merchant"), false);
  const amountPreview = cleaner.preview("numbers", { columns: ["Amount"] });
  assert.equal(amountPreview.changes.find((change) => change.id === "row-1").after, "-1250.00");
  cleaner.applyPreview();
  assert.equal(review.getEntry("row-1").original.Description, "  coffee  shop  ");
  assert.equal(review.getEntry("row-1").values.Description, "Review edited merchant");
  assert.equal(review.getEntry("row-1").values.Amount, "-1250.00");
  cleaner.restoreCell("row-1", "Amount");
  assert.equal(review.getEntry("row-1").values.Amount, "($1,250.00)");
  assert.equal(review.getEntry("row-1").values.Description, "Review edited merchant");
});

test("Clean detects and previews whitespace, blank values, invisible characters, and Unicode safely", () => {
  const { review, cleaner } = createCleaner("standard", [
    { Date: "2026-03-01", Description: "\u200B Café  ", Amount: "1", Reference: "  " },
    { Date: "2026-03-02", Description: "N/A", Amount: "0.00", Reference: "ref" }
  ]);
  const scan = cleaner.getState().scan;
  assert.ok(scan.whitespace.some((change) => change.column === "Description"));
  assert.ok(scan.blankValues.some((change) => change.column === "Reference"));
  assert.ok(scan.invisible.some((change) => change.column === "Description"));
  const whitespace = cleaner.preview("whitespace");
  assert.equal(review.getEntry("row-1").values.Description, "\u200B Café  ");
  assert.equal(whitespace.changes.find((change) => change.column === "Description").after, "\u200B Café");
  cleaner.applyPreview();
  const invisible = cleaner.preview("invisible");
  cleaner.applyPreview();
  assert.equal(review.getEntry("row-1").values.Description, " Café");
  assert.equal(invisible.count, 1);
  cleaner.preview("blank-values");
  cleaner.applyPreview();
  assert.equal(review.getEntry("row-1").values.Reference, "");
  assert.equal(review.getEntry("row-2").values.Description, "N/A");
  assert.equal(review.getEntry("row-2").values.Amount, "0.00");
});

test("Clean handles date formats without guessing ambiguous values", () => {
  const { review, cleaner } = createCleaner();
  const scan = cleaner.getState().scan;
  assert.ok(scan.dateAmbiguous.some((change) => change.id === "row-1"));
  assert.ok(scan.dates.some((change) => change.id === "row-3" && change.unrecognized));
  const unchanged = cleaner.preview("dates", { format: "YYYY-MM-DD", assumption: "leave" });
  assert.equal(unchanged.changes.some((change) => change.id === "row-1"), false);
  cleaner.preview("dates", { format: "YYYY-MM-DD", assumption: "mdy" });
  cleaner.applyPreview();
  assert.equal(review.getEntry("row-1").values.Date, "2026-03-04");
  assert.equal(review.getEntry("row-3").values.Date, "not a date");
});

test("Clean normalizes numeric currency safely and leaves ambiguous locales unchanged", () => {
  const { review, cleaner } = createCleaner("standard", [
    { Date: "2026-03-01", Description: "Expense", Amount: "$1,250.00", Reference: "one" },
    { Date: "2026-03-02", Description: "Expense", Amount: "(45.20)", Reference: "two" },
    { Date: "2026-03-03", Description: "Expense", Amount: "1.234,56", Reference: "three" }
  ]);
  const scan = cleaner.getState().scan;
  assert.equal(scan.numbers.find((change) => change.id === "row-1").after, "1250.00");
  assert.equal(scan.numbers.find((change) => change.id === "row-2").after, "-45.20");
  assert.ok(scan.numberAmbiguous.some((change) => change.id === "row-3"));
  cleaner.preview("numbers", { columns: ["Amount"] });
  cleaner.applyPreview();
  assert.equal(review.getEntry("row-1").values.Amount, "1250.00");
  assert.equal(review.getEntry("row-2").values.Amount, "-45.20");
  assert.equal(review.getEntry("row-3").values.Amount, "1.234,56");
});

test("Clean previews blank-row removal, keeps zero rows, and restores removed rows", () => {
  const { review, cleaner } = createCleaner();
  const preview = cleaner.preview("blank-rows");
  assert.equal(preview.count, 1);
  assert.equal(review.getState().totalRows, 5);
  cleaner.applyPreview();
  assert.equal(review.getState().totalRows, 4);
  assert.ok(review.getState().activeEntries.some((entry) => entry.values.Amount === "0.00"));
  cleaner.undo();
  assert.equal(review.getState().totalRows, 5);
  cleaner.redo();
  assert.equal(review.getState().totalRows, 4);
});

test("Clean groups exact duplicates without removing them automatically and supports explicit removal", () => {
  const { review, cleaner } = createCleaner("free");
  const preview = cleaner.preview("duplicates");
  assert.equal(preview.count, 1);
  assert.equal(preview.selectedCount, 0);
  cleaner.setPreviewSelection("row-5", true);
  cleaner.applyPreview();
  assert.equal(review.getState().totalRows, 4);
  assert.equal(review.getState().deletedEntries[0].removedBy, "clean");
  cleaner.undo();
  assert.equal(review.getState().totalRows, 5);
});

test("Clean tier gating exposes only honest tools", () => {
  const free = createCleaner("free").cleaner;
  const standard = createCleaner("standard").cleaner;
  const plus = createCleaner("plus").cleaner;
  assert.equal(free.isAvailable("whitespace"), true);
  assert.equal(free.isAvailable("dates"), false);
  assert.equal(standard.isAvailable("dates"), true);
  assert.equal(standard.isAvailable("near-duplicates"), false);
  assert.equal(plus.isAvailable("near-duplicates"), true);
  assert.equal(plus.isAvailable("summaries"), true);
});

test("Clean supports capitalization, conservative near-duplicates, and summary suggestions", () => {
  const rows = [
    { Date: "2026-03-01", Description: "Coffee Shop", Amount: "10.00", Reference: "1" },
    { Date: "2026-03-03", Description: "Coffee  Shop", Amount: "10.00", Reference: "2" },
    { Date: "2026-03-10", Description: "Ending Balance", Amount: "100.00", Reference: "3" }
  ];
  const { review, cleaner } = createCleaner("plus", rows);
  assert.ok(cleaner.getState().scan.nearDuplicates.length >= 1);
  assert.ok(cleaner.getState().scan.summaries.length >= 1);
  const capitalization = cleaner.preview("capitalization", { mode: "upper", columns: ["Description"] });
  assert.equal(capitalization.changes[0].after, "COFFEE SHOP");
  cleaner.applyPreview();
  assert.equal(review.getEntry("row-1").values.Description, "COFFEE SHOP");
});

test("Clean preview is non-mutating, operations are idempotent, and history restores all changes", () => {
  const { review, cleaner } = createCleaner();
  const first = cleaner.preview("whitespace", { collapse: true });
  assert.equal(review.getEntry("row-1").values.Description, "  coffee  shop  ");
  cleaner.applyPreview();
  const afterFirst = review.getEntry("row-1").values.Description;
  cleaner.preview("whitespace", { collapse: true });
  assert.equal(cleaner.getPreview().count, 0);
  cleaner.applyPreview();
  assert.equal(review.getEntry("row-1").values.Description, afterFirst);
  cleaner.restoreAll();
  assert.equal(review.getEntry("row-1").values.Description, "  coffee  shop  ");
  assert.equal(review.getEntry("row-1").values.Amount, "($1,250.00)");
  assert.ok(cleaner.getState().canUndo);
  assert.equal(first.count > 0, true);
});

test("Clean refreshes after a Review edit without overwriting the edit", () => {
  const { review, cleaner } = createCleaner();
  cleaner.preview("whitespace", { collapse: true });
  cleaner.applyPreview();
  review.editCell("row-1", "Description", "Manual Review value");
  const sync = cleaner.syncReviewData();
  assert.equal(sync.changed, true);
  assert.equal(review.getEntry("row-1").values.Description, "Manual Review value");
  assert.match(cleaner.getState().notice, /Review edits/);
});

test("Clean scans 2,000 fictional rows within a bounded local pass", () => {
  const rows = Array.from({ length: 2000 }, (_, index) => ({ Date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`, Description: `Fictional merchant ${index}`, Amount: String(index - 1000), Reference: String(index) }));
  const started = performance.now();
  const { cleaner } = createCleaner("plus", rows);
  const elapsed = performance.now() - started;
  assert.equal(cleaner.getState().summary.rowsScanned, 2000);
  assert.ok(elapsed < 1500, `Clean scan took ${elapsed}ms`);
});
