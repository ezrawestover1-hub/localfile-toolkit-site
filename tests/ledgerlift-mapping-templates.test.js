import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "ledgerlift/mapping-templates.js"), "utf8");
function storage() { const data = new Map(); return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }; }
function create(tier) { const context = { window: {} }; vm.runInNewContext(source, context, { filename: "ledgerlift/mapping-templates.js" }); return context.window.LedgerLiftMappingTemplates.create({ tier, storage: storage() }); }
const blueprint = { columns: [{ position: 0, label: "Date" }, { position: 1, label: "Description" }, { position: 2, label: "Amount" }], assignments: [{ position: 0, role: "transactionDate" }, { position: 1, role: "description" }, { position: 2, role: "amount" }], amountMode: "amount" };

test("mapping templates save structure only and match exact headers", () => {
  const store = create("standard");
  const saved = store.save("Fictional bank", blueprint);
  assert.equal(saved.ok, true);
  assert.equal("rows" in saved.template, false);
  assert.equal("samples" in saved.template, false);
  assert.equal(store.list().length, 1);
  assert.equal(store.match(blueprint.columns)[0].compatible, true);
  assert.equal(store.match([{ position: 0, label: "Date" }, { position: 1, label: "Memo" }, { position: 2, label: "Amount" }]).length, 0);
});

test("mapping templates enforce tier limits and safe names", () => {
  const free = create("free");
  assert.equal(free.save("Nope", blueprint).ok, false);
  const standard = create("standard");
  assert.equal(standard.save("  <Fictional>  ", blueprint).template.name, "<Fictional>");
  assert.equal(standard.save("<Fictional>", blueprint).ok, false);
  assert.equal(standard.validTemplate({ name: "bad", columns: [], assignments: [], rows: [{ Amount: "1" }] }), false);
});

test("mapping templates expose only structure, positions, and roles", () => {
  const store = create("plus");
  const saved = store.save("Plus template", blueprint).template;
  assert.deepEqual(Object.keys(saved).sort(), ["amountMode", "assignments", "columns", "createdAt", "id", "name"].sort());
  assert.deepEqual(JSON.parse(JSON.stringify(saved.columns)), blueprint.columns);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.assignments)), blueprint.assignments);
});
