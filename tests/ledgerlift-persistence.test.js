import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const destinationSource = read("ledgerlift/destination-library.js");
const projectSource = read("ledgerlift/project-store.js");
const reviewSource = read("ledgerlift/review.js");
const mapperSource = read("ledgerlift/mapper.js");

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)) };
}

function createLibrary(tier, storage = memoryStorage()) {
  const context = { window: {} };
  vm.runInNewContext(destinationSource, context, { filename: "ledgerlift/destination-library.js" });
  return context.window.LedgerLiftDestinationLibrary.create({ tier, storage });
}

test("destination libraries are tier-aware, local, deduplicated, and sanitized", () => {
  const storage = memoryStorage();
  const free = createLibrary("free", storage);
  assert.equal(free.replace([{ id: "x", type: "account", name: "Checking" }]).ok, false);

  const standard = createLibrary("standard", storage);
  const result = standard.replace([
    { id: "account-1", type: "account", name: "  Fictional Checking  ", accountType: "BANK", description: "local only", amount: "do not store" },
    { id: "account-1", type: "account", name: "fictional   checking", accountType: "BANK" },
    { id: "vendor-1", type: "vendor", name: "Northwind Coffee", description: "Fictional vendor" }
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(standard.list().map(({ type, name }) => ({ type, name })))), [
    { type: "account", name: "Fictional Checking" },
    { type: "vendor", name: "Northwind Coffee" }
  ]);
  assert.equal(JSON.stringify(standard.list()).includes("amount"), false);
  assert.equal(createLibrary("standard", storage).list().length, 2);
});

test("saved projects use the eligible tier and expose metadata without rows in listings", async () => {
  const records = new Map();
  const adapter = {
    list: async () => [...records.values()],
    put: async (project) => records.set(project.id, project),
    get: async (id) => records.get(id) || null,
    remove: async (id) => records.delete(id)
  };
  const context = { window: {} };
  vm.runInNewContext(projectSource, context, { filename: "ledgerlift/project-store.js" });
  const standard = context.window.LedgerLiftProjectStore.create({ tier: "standard", adapter });
  const snapshot = { headers: ["Date", "Description", "Amount"], rowCount: 2, format: "CSV", workflow: { currentStep: 3 }, review: { activeEntries: [{ id: "row-1", values: { Date: "2026-07-01", Description: "Fictional Coffee", Amount: "-4.00" } }] } };
  const saved = await standard.save("  Fictional July  ", snapshot);
  assert.equal(saved.ok, true);
  assert.equal(saved.project.name, "Fictional July");
  assert.equal(saved.project.currentStep, 3);
  const listed = await standard.list();
  assert.equal(listed.length, 1);
  assert.equal("review" in listed[0], false);
  assert.equal((await standard.load(saved.project.id)).review.activeEntries[0].values.Amount, "-4.00");
  assert.equal((await context.window.LedgerLiftProjectStore.create({ tier: "free", adapter }).save("Free", snapshot)).ok, false);
  await standard.remove(saved.project.id);
  assert.equal((await standard.list()).length, 0);
});

test("Plus receives the larger local project and destination-library limits", () => {
  const context = { window: {} };
  vm.runInNewContext(projectSource, context, { filename: "ledgerlift/project-store.js" });
  vm.runInNewContext(destinationSource, context, { filename: "ledgerlift/destination-library.js" });
  assert.equal(context.window.LedgerLiftProjectStore.LIMITS.plus, 60);
  assert.equal(context.window.LedgerLiftDestinationLibrary.LIMITS.plus, 1000);
});

test("Review and Map Columns can hydrate stable working state from a saved project", () => {
  const context = { window: {} };
  vm.runInNewContext(reviewSource, context, { filename: "ledgerlift/review.js" });
  vm.runInNewContext(mapperSource, context, { filename: "ledgerlift/mapper.js" });
  const review = context.window.LedgerLiftReviewModel.create({ headers: ["Date", "Description", "Amount"], rows: [{ Date: "2026-07-01", Description: "Coffee", Amount: "-4.00" }, { Date: "2026-07-02", Description: "Payment", Amount: "12.00" }] });
  review.editCell("row-1", "Description", "Fictional Coffee");
  review.deleteRows(["row-2"]);
  const savedReview = review.getState();
  const restoredReview = context.window.LedgerLiftReviewModel.create({ headers: savedReview.headers, savedState: savedReview });
  assert.equal(restoredReview.getEntry("row-1").original.Description, "Coffee");
  assert.equal(restoredReview.getEntry("row-1").values.Description, "Fictional Coffee");
  assert.deepEqual(JSON.parse(JSON.stringify(restoredReview.getState().deletedEntries.map((entry) => entry.id))), ["row-2"]);

  const mapper = context.window.LedgerLiftMapper.create({ review: restoredReview, suggestedRoles: { date: { column: "Date" }, description: { column: "Description" }, amount: { column: "Amount" } } });
  const savedMapping = mapper.getState();
  const restoredMapper = context.window.LedgerLiftMapper.create({ review: restoredReview, savedState: { mappings: savedMapping.mappings, amountMode: "amount" } });
  assert.equal(restoredMapper.getState().amountMode, "amount");
  assert.deepEqual(restoredMapper.getState().mappings, savedMapping.mappings);
});
