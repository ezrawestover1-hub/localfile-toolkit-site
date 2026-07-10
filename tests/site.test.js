import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requiredRoutes = ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "ledgerlift/index.html", "pixelport/index.html", "contactcraft/index.html", "calendarflow/index.html", "captionshift/index.html", "checkout-portal/index.html", "checkout-portal/purchase-success.html", "license/activate.html", "license/restore.html", "license/manage.html"];
const choices = [
  ["ledgerlift", "standard"], ["ledgerlift", "plus"], ["pixelport", "standard"], ["pixelport", "plus"],
  ["contactcraft", "standard"], ["contactcraft", "plus"], ["calendarflow", "standard"], ["calendarflow", "plus"],
  ["captionshift", "standard"], ["captionshift", "plus"], ["suite", "bundle"]
];

test("all required public route files exist", () => {
  requiredRoutes.forEach((route) => assert.equal(fs.existsSync(path.join(root, route)), true, route));
});

test("pricing page sends every choice to the one shared portal", () => {
  const pricing = read("pricing.html");
  choices.forEach(([product, plan]) => assert.match(pricing, new RegExp(`checkout-portal/index\\.html\\?product=${product}&amp;plan=${plan}`)));
  assert.match(pricing, /\$19\.96/);
  assert.match(pricing, /Five-product Plus bundle/);
});

test("product checkout configs use explicit shared portal parameters", () => {
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => {
    const config = read(`${product}/checkout-config.js`);
    assert.match(config, new RegExp(`product=${product}&plan=standard`));
    assert.match(config, new RegExp(`product=${product}&plan=plus`));
    assert.match(config, /product=suite&plan=bundle/);
  });
});

test("Paddle is loaded only by the shared checkout portal", () => {
  const converterFiles = ["index.html", ...["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].flatMap((product) => fs.readdirSync(path.join(root, product)).filter((name) => name.endsWith(".html") || name.endsWith(".js")).map((name) => `${product}/${name}`))];
  converterFiles.forEach((file) => {
    const content = read(file);
    assert.doesNotMatch(content, /cdn\.paddle\.com|Paddle\.Initialize|Paddle\.Checkout/);
  });
  assert.match(read("checkout-portal/index.html"), /cdn\.paddle\.com/);
  assert.match(read("checkout-portal/paddle-config.js"), /checkoutEnabled: false/);
});

test("portal safely handles invalid query values", () => {
  assert.match(read("checkout-portal/checkout.js"), /location\.replace\("\.\.\/pricing\.html"\)/);
  assert.match(read("checkout-portal/checkout.js"), /You are purchasing/);
});

test("public legal and support pages contain required navigation", () => {
  ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "checkout-portal/index.html", "checkout-portal/purchase-success.html", "license/activate.html", "license/restore.html", "license/manage.html"].forEach((file) => {
    const content = read(file);
    ["Pricing", "Terms", "Privacy", "Refunds", "Support"].forEach((label) => assert.match(content, new RegExp(label)));
  });
});

test("public pricing does not present unfinished Plus features as current", () => {
  const pricing = read("pricing.html");
  assert.match(pricing, /Planned — not included in the current release/);
  assert.doesNotMatch(pricing, /Reusable bank and account profiles|Batch image queue|Duplicate contact detection|Merge multiple calendars|Bulk text cleanup rules/);
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => assert.match(read(`${product}/common.js`), /sanitizePlusMessaging/));
});

test("no committed secret material is present", () => {
  const files = ["worker.js", "checkout-portal/paddle-config.js", "wrangler.jsonc", ".dev.vars.example"];
  files.forEach((file) => assert.doesNotMatch(read(file), /sk_(live|test)|whsec_|BEGIN (RSA|OPENSSH|PRIVATE) KEY/));
});
