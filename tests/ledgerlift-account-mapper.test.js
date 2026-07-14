import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const reviewSource = read("ledgerlift/review.js");
const mapperSource = read("ledgerlift/mapper.js");
const accountSource = read("ledgerlift/account-mapper.js");
const templateSource = read("ledgerlift/account-mapping-templates.js");

function memoryStorage() { const data = new Map(); return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }; }
function createAccountMapper(tier = "standard", rows = null, mapped = true) {
  const context = { window: {} };
  [reviewSource, mapperSource, templateSource, accountSource].forEach((source, index) => vm.runInNewContext(source, context, { filename: `ledgerlift/account-${index}.js` }));
  const headers = mapped ? ["Date", "Description", "Amount", "Account", "Category", "Vendor", "Class", "CustomerJob"] : ["Date", "Description", "Amount"];
  const sourceRows = rows || [
    { Date: "2026-03-01", Description: "Coffee", Amount: "-6.45", Account: "Checking", Category: "Office Supplies", Vendor: "Acme", Class: "Retail", CustomerJob: "Job A" },
    { Date: "2026-03-02", Description: "Coffee", Amount: "-2.00", Account: "CHECKING", Category: "Office  Supplies", Vendor: "Acme", Class: "Retail", CustomerJob: "Job A" },
    { Date: "2026-03-03", Description: "Payment", Amount: "725.00", Account: "Checking", Category: "", Vendor: "New Vendor", Class: "", CustomerJob: "" }
  ];
  const review = context.window.LedgerLiftReviewModel.create({ headers, rows: sourceRows });
  const suggestions = mapped ? { date: { column: "Date", confidence: "high" }, description: { column: "Description", confidence: "high" }, amount: { column: "Amount", confidence: "high" }, account: { column: "Account", confidence: "high" }, category: { column: "Category", confidence: "high" }, vendor: { column: "Vendor", confidence: "high" }, class: { column: "Class", confidence: "high" }, customerJob: { column: "CustomerJob", confidence: "high" } } : { date: { column: "Date", confidence: "high" }, description: { column: "Description", confidence: "high" }, amount: { column: "Amount", confidence: "high" } };
  const mapper = context.window.LedgerLiftMapper.create({ review, tier, suggestedRoles: suggestions });
  const templates = context.window.LedgerLiftAccountMappingTemplates.create({ tier, storage: memoryStorage() });
  const accountMapper = context.window.LedgerLiftAccountMapper.create({ review, mapper, tier, templates });
  return { context, review, mapper, accountMapper, templates };
}

function createDestination(model, input) { const result = model.createDestination(input); assert.equal(result.ok, true, result.reason); return result.destination; }

test("Map Accounts discovers stable unique values without changing source data", () => {
  const { accountMapper, review } = createAccountMapper();
  const state = accountMapper.getState();
  assert.equal(state.records.length, 8);
  assert.equal(state.records.filter((record) => record.sourceRole === "account").length, 2);
  assert.equal(state.records.find((record) => record.sourceValue === "Checking").count, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(state.records.find((record) => record.sourceValue === "Checking").rowIds)), ["row-1", "row-3"]);
  assert.equal(review.getEntry("row-1").values.Category, "Office Supplies");
  assert.equal(state.records.some((record) => record.sourceValue === ""), false);
  assert.equal(state.blankByColumn.find((column) => column.header === "Category").count, 1);
});

test("Map Accounts requires a default source account when no Account column is mapped", () => {
  const { accountMapper } = createAccountMapper("free", null, false);
  assert.equal(accountMapper.getValidation().canContinue, false);
  assert.equal(accountMapper.getValidation().blocking[0].code, "missing-source-account");
  const account = createDestination(accountMapper, { type: "account", name: "Fictional Checking", accountType: "BANK" });
  accountMapper.setDefaultSourceAccount(account.id);
  assert.equal(accountMapper.getValidation().canContinue, true);
});

test("Map Accounts accepts exact and normalized destination suggestions only after confirmation", () => {
  const { accountMapper } = createAccountMapper();
  const checking = createDestination(accountMapper, { type: "account", name: "Checking", accountType: "BANK" });
  const office = createDestination(accountMapper, { type: "account", name: "Office Supplies", accountType: "EXPENSE" });
  const vendor = createDestination(accountMapper, { type: "vendor", name: "Acme", accountType: "" });
  accountMapper.sync();
  const checkingRecord = accountMapper.getState().records.find((record) => record.sourceValue === "Checking");
  const officeRecord = accountMapper.getState().records.find((record) => record.sourceValue === "Office Supplies");
  assert.equal(checkingRecord.suggestion.confidence, "Exact match");
  assert.equal(officeRecord.suggestion.confidence, "Exact match");
  assert.equal(checkingRecord.destinationId, "");
  accountMapper.applyExactSuggestions();
  assert.equal(accountMapper.getState().records.find((record) => record.id === checkingRecord.id).destinationId, checking.id);
  assert.equal(accountMapper.getState().records.find((record) => record.id === officeRecord.id).destinationId, office.id);
  const acme = accountMapper.getState().records.find((record) => record.sourceValue === "Acme");
  assert.equal(acme.suggestion.destinationId, vendor.id);
});

test("Map Accounts supports conservative punctuation matches and incompatible destination rejection", () => {
  const { accountMapper } = createAccountMapper();
  createDestination(accountMapper, { type: "account", name: "Office-Supplies", accountType: "EXPENSE" });
  const destination = createDestination(accountMapper, { type: "vendor", name: "Office-Supplies" });
  accountMapper.sync();
  const record = accountMapper.getState().records.find((item) => item.sourceValue === "Office Supplies");
  assert.equal(record.suggestion.confidence, "Possible match");
  const vendorResult = accountMapper.setMapping(record.id, destination.id);
  assert.equal(vendorResult.ok, false);
  assert.match(vendorResult.reason, /cannot be used/i);
});

test("Map Accounts creates accounts, supports parents, and prevents unsafe duplicates and cycles", () => {
  const { accountMapper } = createAccountMapper();
  const parent = createDestination(accountMapper, { type: "account", name: "Automobile", accountType: "EXPENSE" });
  const child = createDestination(accountMapper, { type: "account", name: "Fuel", accountType: "EXPENSE", parentId: parent.id });
  assert.equal(child.parentId, parent.id);
  const duplicate = accountMapper.createDestination({ type: "account", name: " automobile ", accountType: "EXPENSE" });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.duplicate);
  assert.equal(accountMapper.editDestination(parent.id, { parentId: child.id }).ok, false);
  assert.equal(accountMapper.removeDestination(parent.id).ok, false);
  accountMapper.editDestination(child.id, { name: "Fuel and Maintenance" });
  assert.equal(accountMapper.getState().destinations.find((item) => item.id === child.id).name, "Fuel and Maintenance");
});

test("Map Accounts distinguishes optional ignored values from required values", () => {
  const { accountMapper } = createAccountMapper();
  const category = accountMapper.getState().records.find((record) => record.sourceRole === "category");
  const vendor = accountMapper.getState().records.find((record) => record.sourceRole === "vendor");
  assert.equal(accountMapper.ignore(category.id).ok, false);
  assert.equal(accountMapper.ignore(vendor.id).ok, true);
  assert.equal(accountMapper.getState().records.find((record) => record.id === vendor.id).ignored, true);
  accountMapper.restoreIgnored(vendor.id);
  assert.equal(accountMapper.getState().records.find((record) => record.id === vendor.id).ignored, false);
});

test("Map Accounts supports bulk mapping, defaults, undo, redo, and row assignments", () => {
  const { accountMapper } = createAccountMapper();
  const office = createDestination(accountMapper, { type: "account", name: "Office Supplies", accountType: "EXPENSE" });
  const vendor = createDestination(accountMapper, { type: "vendor", name: "Acme" });
  const categoryIds = accountMapper.getState().records.filter((record) => record.sourceRole === "category").map((record) => record.id);
  accountMapper.bulkAssign(categoryIds, office.id);
  const vendorId = accountMapper.getState().records.find((record) => record.sourceValue === "Acme").id;
  accountMapper.setMapping(vendorId, vendor.id);
  accountMapper.bulkClear(categoryIds);
  accountMapper.undo();
  assert.equal(accountMapper.getState().records.find((record) => record.id === categoryIds[0]).destinationId, office.id);
  accountMapper.redo();
  assert.equal(accountMapper.getState().records.find((record) => record.id === categoryIds[0]).destinationId, "");
  accountMapper.setDefault("category", office.id);
  assert.equal(accountMapper.rowAssignments()["row-3"].category, office.name);
});

test("Map Accounts template storage is structure-safe and tier-aware", () => {
  const free = createAccountMapper("free");
  assert.equal(free.templates.save("No persistence", { signature: [], entries: [] }).ok, false);
  const { accountMapper, templates } = createAccountMapper("standard");
  const destination = createDestination(accountMapper, { type: "account", name: "Checking", accountType: "BANK" });
  accountMapper.sync(); accountMapper.applyExactSuggestions();
  const saved = templates.save("Fictional bank mappings", accountMapper.mappingTemplateBlueprint());
  assert.equal(saved.ok, true);
  assert.equal("rows" in saved.template, false);
  assert.equal("amounts" in saved.template, false);
  assert.equal(templates.preview(saved.template, accountMapper.getState().records, saved.template.signature).compatible, true);
  assert.equal(destination.type, "account");
});

test("Map Accounts refreshes values after Review edits and marks old values inactive", () => {
  const { accountMapper, review } = createAccountMapper();
  const original = accountMapper.getState().records.find((record) => record.sourceValue === "Checking");
  review.editCell("row-1", "Account", "Savings");
  accountMapper.sync();
  assert.equal(accountMapper.getState().records.find((record) => record.id === original.id).active, true);
  assert.ok(accountMapper.getState().records.some((record) => record.sourceValue === "Savings" && record.active));
  assert.equal(accountMapper.getState().inactiveRecords.some((record) => record.id === original.id), false);
});

test("Map Accounts handles transfer warnings, formula-like text, and 2,000 repeated rows locally", () => {
  const rows = Array.from({ length: 2000 }, (_, index) => ({ Date: "2026-03-01", Description: "=HYPERLINK(\"x\")", Amount: "1.00", Account: "Checking", Category: "Office Supplies", Vendor: `Vendor ${index % 20}`, Class: "Retail", CustomerJob: "" }));
  const started = performance.now();
  const { accountMapper } = createAccountMapper("plus", rows);
  const elapsed = performance.now() - started;
  assert.ok(accountMapper.getState().records.length < 100);
  assert.ok(elapsed < 1500, `Map Accounts discovery took ${elapsed}ms`);
  assert.equal(accountMapper.getState().records.find((record) => record.sourceRole === "vendor").sourceValue, "Vendor 0");
});
