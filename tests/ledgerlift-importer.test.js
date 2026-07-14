import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const loadImporter = () => {
  const sandbox = { window: {}, TextDecoder, Uint8Array, Map, Set, Error, Math, Number, String, Object, Array, RegExp };
  vm.runInNewContext(read("ledgerlift/importer.js"), sandbox);
  return sandbox.window.LedgerLiftImporter;
};

test("LedgerHarbor parses quoted CSV, BOM text, metadata rows, and column suggestions", () => {
  const importer = loadImporter();
  const parsed = importer.parseDelimited("\ufeffStatement for Fictional Bank\r\nTransaction Date,Description,Amount\r\n07/01/2026,\"Coffee, Shop\",(6.45)\r\n07/02/2026,Client Payment,725.00\r\n");
  const preview = importer.buildPreview({ matrix: parsed.matrix, format: "CSV", delimiter: ",", worksheets: [] });
  assert.equal(parsed.delimiter, ",");
  assert.equal(preview.headerRow, 1);
  assert.equal(preview.rows[0].Description, "Coffee, Shop");
  assert.equal(preview.suggestions.roles.date.column, "Transaction Date");
  assert.equal(preview.suggestions.roles.amount.column, "Amount");
  assert.equal(preview.estimatedTransactionRows, 2);
});

test("LedgerHarbor parses TSV, blank rows, uneven rows, and debit-credit suggestions", () => {
  const importer = loadImporter();
  const parsed = importer.parseDelimited("Date\tDescription\tDebit\tCredit\tBalance\n07/01/2026\tCoffee\t6.45\t\t100.00\n\n\n\n07/02/2026\tClient Payment\t\t725.00\t825.00\n07/03/2026\tTrailing\t1.00\n", "\t");
  const preview = importer.buildPreview({ matrix: parsed.matrix, format: "TSV", delimiter: "\t", worksheets: [] });
  assert.equal(parsed.delimiter, "\t");
  assert.equal(preview.rows.length, 3);
  assert.equal(preview.suggestions.roles.debit.column, "Debit");
  assert.equal(preview.suggestions.roles.credit.column, "Credit");
  assert.ok(preview.warnings.some((warning) => /unexpected number of values/i.test(warning.message)));
  assert.ok(preview.warnings.some((warning) => /blank rows/i.test(warning.message)));
});

test("LedgerHarbor rejects empty, unsupported, tier-ineligible, and mismatched files", () => {
  const importer = loadImporter();
  assert.throws(() => importer.validateFile({ name: "empty.csv", size: 0, type: "text/csv" }, "free"), /appears to be empty/i);
  assert.throws(() => importer.validateFile({ name: "data.xls", size: 12, type: "application/octet-stream" }, "plus"), /not supported yet/i);
  assert.throws(() => importer.validateFile({ name: "data.xlsx", size: 12, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, "free"), /XLSX import is available/i);
  assert.throws(() => importer.validateFile({ name: "data.csv", size: 12, type: "application/pdf" }, "free"), /extension does not match/i);
  assert.equal(importer.validateFile({ name: "data.xlsx", size: 12, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, "standard").extension, "xlsx");
});

test("LedgerHarbor keeps XLSX parsing local and formula-safe", () => {
  const source = read("ledgerlift/importer.js");
  assert.match(source, /parseXlsxBuffer/);
  assert.match(source, /DecompressionStream\("deflate-raw"\)/);
  assert.match(source, /formula && !valueNode/);
  assert.match(source, /Some formula cells had no saved display value/);
  assert.match(source, /worksheets/);
  assert.doesNotMatch(source, /eval\(|Function\(/);
});
