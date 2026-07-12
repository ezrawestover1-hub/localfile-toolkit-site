import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requiredRoutes = ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "contact.html", "refund-request.html", "robots.txt", "sitemap.xml", "ledgerlift/index.html", "pixelport/index.html", "contactcraft/index.html", "calendarflow/index.html", "captionshift/index.html", "checkout-portal/index.html", "checkout-portal/purchase-success.html", "license/activate.html", "license/restore.html", "license/manage.html"];
const choices = [
  ["ledgerlift", "standard"], ["ledgerlift", "plus"], ["pixelport", "standard"], ["pixelport", "plus"],
  ["contactcraft", "standard"], ["contactcraft", "plus"], ["calendarflow", "standard"], ["calendarflow", "plus"],
  ["captionshift", "standard"], ["captionshift", "plus"], ["suite", "bundle"]
];

test("all required public route files exist", () => {
  requiredRoutes.forEach((route) => assert.equal(fs.existsSync(path.join(root, route)), true, route));
  assert.ok(fs.existsSync(path.join(root, "favicon.ico")));
});

test("pricing page sends every choice to the one shared portal", () => {
  const pricing = read("pricing.html");
  choices.forEach(([product, plan]) => assert.match(pricing, new RegExp(`checkout-portal/index\\.html\\?product=${product}&amp;plan=${plan}`)));
  assert.match(pricing, /\$26\.96/);
  assert.match(pricing, /Five-product Plus bundle/);
});

test("final pricing source of truth matches every displayed plan", () => {
  const config = read("pricing-config.js");
  ["standard: 1999", "plus: 2499", "standard: 299", "plus: 599", "standard: 999", "plus: 1299", "standard: 699", "plus: 999", "separatePlusTotal: 6695", "savings: 2696", "savingsPercent: 40"].forEach((value) => assert.match(config, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.match(read("pricing.html"), /\$66\.95 total/);
  assert.match(read("pricing.html"), /Approximately 40% off/);
  assert.match(read("pricing.html"), /Best Value/);
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => {
    const page = read(`${product}/index.html`);
    assert.match(page, /Most Popular/);
    assert.match(page, /Get every Plus tool for \$39\.99/);
    assert.match(read(`${product}/common.js`), /formatLocalFilePrice/);
  });
  assert.match(read("checkout-portal/checkout.js"), /pricing\.bundle\.plus/);
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
  assert.match(pricing, /Plus-specific controls are planned and are not included in the current release/);
  assert.doesNotMatch(pricing, /Reusable bank and account profiles|Batch image queue|Duplicate contact detection|Merge multiple calendars|Bulk text cleanup rules/);
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => assert.match(read(`${product}/common.js`), /sanitizePlusMessaging/));
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => { const page = read(`${product}/index.html`); assert.doesNotMatch(page, /<th>Reusable presets<\/th><td>—<\/td><td>Planned<\/td><td[^>]*>Yes/); assert.doesNotMatch(page, /<th>Advanced workflow tools<\/th><td>—<\/td><td>Planned<\/td><td[^>]*>Yes/); });
});

test("no committed secret material is present", () => {
  const files = ["worker.js", "checkout-portal/paddle-config.js", "wrangler.jsonc", ".dev.vars.example"];
  files.forEach((file) => assert.doesNotMatch(read(file), /sk_(live|test)|whsec_|BEGIN (RSA|OPENSSH|PRIVATE) KEY/));
});

test("support contact, form disclosures, and setup documentation are public-safe", () => {
  ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "contact.html", "refund-request.html", "checkout-portal/index.html", "checkout-portal/purchase-success.html", "license/activate.html", "license/restore.html", "license/manage.html"].forEach((file) => assert.match(read(file), /localfiletools\.support@gmail\.com/));
  assert.match(read("privacy.html"), /message content|request metadata|email-delivery provider/);
  assert.match(read("terms.html"), /supported commercial life|does not guarantee.*indefinitely/);
  assert.match(read("SUPPORT_EMAIL_SETUP.md"), /localfiletools\.support@gmail\.com/);
  assert.doesNotMatch(read("contact.js"), /API_KEY|SUPPORT_EMAIL_API/);
  assert.doesNotMatch(read("refund-request.js"), /API_KEY|SUPPORT_EMAIL_API/);
});

test("SEO foundations are present and sitemap excludes private routes", () => {
  const important = ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "contact.html", "refund-request.html", "checkout-portal/index.html", "ledgerlift/index.html", "pixelport/index.html", "contactcraft/index.html", "calendarflow/index.html", "captionshift/index.html"];
  const titles = new Set(); const descriptions = new Set();
  important.forEach((file) => { const content = read(file); const title = content.match(/<title[^>]*>([^<]+)</i)?.[1]; const description = content.match(/name="description" content="([^"]+)/i)?.[1] || content.match(/content="([^"]+)" name="description"/i)?.[1]; assert.ok(title && description, file); assert.match(content, /https:\/\/localfiletoolkit\.com\//); titles.add(title); descriptions.add(description); });
  assert.equal(titles.size, important.length); assert.equal(descriptions.size, important.length);
  const sitemap = read("sitemap.xml"); assert.doesNotMatch(sitemap, /\/api\/|checkout-portal|license|purchase-success|tests|migrations/); assert.match(read("robots.txt"), /Sitemap: https:\/\/localfiletoolkit\.com\/sitemap\.xml/);
});

test("product pages and legal subpages have SEO descriptions", () => {
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => {
    fs.readdirSync(path.join(root, product)).filter((name) => name.endsWith(".html")).forEach((name) => {
      const content = read(`${product}/${name}`);
      assert.match(content, /<title[^>]*>/i, `${product}/${name} title`);
      assert.match(content, /<meta(?: name="description" content="[^"]+"| content="[^"]+" name="description")/i, `${product}/${name} description`);
    });
  });
});

test("root favicon is linked by suite pages", () => {
  ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "contact.html", "refund-request.html"].forEach((file) => assert.match(read(file), /href="favicon\.ico"/));
  assert.ok(fs.statSync(path.join(root, "favicon.ico")).size > 0);
});

test("approved product icon assets and canonical mappings are complete", () => {
  const products = ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"];
  const required = ["source-master.png", "favicon-16.png", "favicon-32.png", "icon-48.png", "icon-64.png", "icon-128.png", "apple-touch-icon.png", "icon-192.png", "icon-256.png", "icon-512.png"];
  products.forEach((product) => { required.forEach((file) => assert.ok(fs.existsSync(path.join(root, "assets/product-icons", product, file)), `${product}/${file}`)); assert.ok(fs.statSync(path.join(root, "assets/product-icons", product, "source-master.png")).size > 0); });
  assert.ok(!fs.existsSync(path.join(root, "assets/product-icons/ledgerlift/icon-1024.png")));
  const config = read("assets/product-icons/config.js"); products.forEach((product) => assert.match(config, new RegExp(`assets/product-icons/${product}/icon-512\\.png`)));
  products.forEach((product) => { assert.match(read(`${product}/index.html`), new RegExp(`assets/product-icons/${product}/icon-64\\.png`)); assert.match(read(`${product}/common.js`), /item\.icon/); fs.readdirSync(path.join(root, product)).filter((name) => name.endsWith(".html")).forEach((name) => assert.match(read(`${product}/${name}`), new RegExp(`assets/product-icons/${product}/favicon-16\\.png`))); });
  products.forEach((product) => { assert.match(read("index.html"), new RegExp(`/assets/product-icons/${product}/icon-128\\.png`)); assert.match(read("pricing.html"), new RegExp(`/assets/product-icons/${product}/icon-128\\.png`)); });
  const checkout = read("checkout-portal/checkout.js"); products.forEach((product) => assert.match(checkout, new RegExp(`PRODUCT_ICONS\\.${product}\\.icon`)));
  assert.match(checkout, /Object\.values\(window\.PRODUCT_ICONS\)/);
  assert.match(read("license/manage.js"), /window\.PRODUCT_ICONS/);
  ["terms.html", "privacy.html", "refunds.html", "contact.html", "refund-request.html"].forEach((file) => assert.doesNotMatch(read(file), /assets\/product-icons\/(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)\/icon/));
  const publicFiles = ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "contact.html", "refund-request.html", "checkout-portal/index.html", "checkout-portal/purchase-success.html"];
  publicFiles.forEach((file) => assert.doesNotMatch(read(file), /file:\/\/|\/Users\//));
});

test("Paddle configuration remains sandbox-disabled", () => {
  const config = read("checkout-portal/paddle-config.js");
  assert.match(config, /environment: "sandbox"/);
  assert.match(config, /checkoutEnabled: false/);
  assert.match(config, /clientToken: ""/);
  assert.doesNotMatch(config, /pri_[a-z\d]{26}/);
  assert.doesNotMatch(config, /live_/);
});

test("checkout requests exactly one unit", () => {
  assert.match(read("checkout-portal/checkout.js"), /items:\[\{priceId,quantity:1\}\]/);
  assert.match(read("PAYMENTS_SETUP.md"), /minimum of `1` and a maximum of `1`/);
});

test("LedgerLift Plus promises are implemented and license-gated", () => {
  const plus = read("ledgerlift/plus.js");
  ["Save current", "Separate Debit and Credit columns", "Categorization rules", "Mark duplicates", "Download review report", "getCapabilities"].forEach((value) => assert.match(plus, new RegExp(value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))));
  assert.match(plus, /canUsePlus\("ledgerlift"\)/);
  assert.match(read("ledgerlift/app.js"), /window\.LedgerLiftCore/);
  assert.match(read("ledgerlift/common.js"), /reusable profiles, advanced mapping, categorization, duplicate review, and reports/);
  assert.match(read("checkout-portal/checkout.js"), /Saved mapping and account profiles/);
});

test("PixelPort Plus promises are implemented and license-gated", () => {
  const plus = read("pixelport/plus.js");
  ["Batch image queue", "Save preset", "Filename prefix", "Filename suffix", "Custom color", "Optimize for web", "getCapabilities"].forEach((value) => assert.match(plus, new RegExp(value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))));
  assert.match(plus, /canUsePlus\("pixelport"\)/);
  assert.match(read("pixelport/app.js"), /window\.PixelPortCore/);
  assert.match(read("pixelport/common.js"), /Batch conversion, reusable presets, controlled filenames/);
  assert.match(read("checkout-portal/checkout.js"), /Batch image queue and reusable presets/);
});

test("ContactCraft Plus promises are implemented and license-gated", () => {
  const plus = read("contactcraft/plus.js");
  ["Review duplicates", "Merge duplicates", "Clean fields", "Output field mapping", "Download validation report", "getCapabilities"].forEach((value) => assert.match(plus, new RegExp(value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))));
  assert.match(plus, /canUsePlus\("contactcraft"\)/);
  assert.match(read("contactcraft/app.js"), /window\.ContactCraftCore/);
  assert.match(read("contactcraft/common.js"), /Duplicate detection, merge review, field cleanup/);
  assert.match(read("checkout-portal/checkout.js"), /Duplicate detection and merge review/);
});

test("CalendarFlow Plus promises are implemented and license-gated", () => {
  const plus = read("calendarflow/plus.js");
  assert.match(plus, /Merge calendars/);
  assert.match(plus, /Filter events/);
  assert.match(plus, /Normalize recurrence/);
  assert.match(plus, /Download validation report/);
  assert.match(plus, /getCapabilities/);
  assert.match(plus, /canUsePlus\("calendarflow"\)/);
  assert.match(read("calendarflow/app.js"), /window\.CalendarFlowCore/);
  assert.match(read("calendarflow/common.js"), /calendar merging, filtering, recurrence normalization, saved presets, and validation reporting/i);
  assert.match(read("checkout-portal/checkout.js"), /Calendar merging, filtering, and duplicate removal/);
});

test("LedgerLift trial survives refresh and only counts a real export", () => {
  const common = read("ledgerlift/common.js");
  const app = read("ledgerlift/app.js");
  assert.match(common, /localStorage\.getItem\(key\) === "used"/);
  assert.match(common, /localStorage\.setItem\(key, "used"\)/);
  assert.match(app, /if \(!sample && !window\.SuiteGate\.mayOpenRealDocument\(\)\)/);
  assert.match(app, /if \(!state\.source\) window\.SuiteGate\.markUsed\(\)/);
  assert.match(app, /if \(!state\.source && window\.SuiteGate\.used\(\)\)/);
  assert.match(common, /function mayOpenRealDocument\(\) \{ return !used\(\); \}/);
  assert.match(common, /Sample mode does not consume your free document/);
});

test("cross-device account surface is wired to durable entitlements", () => {
  assert.match(read("account/login.html"), /secure email link/);
  assert.match(read("account/index.html"), /Restore products on this device/);
  assert.match(read("account/account.js"), /\/api\/account\/restore/);
  assert.match(read("worker.js"), /account_users/);
  assert.match(read("worker.js"), /portal-sessions/);
  assert.match(read("migrations/0002_accounts.sql"), /account_sessions/);
  assert.match(read("ACCOUNT_SETUP.md"), /PADDLE_API_KEY/);
  assert.match(read("worker.js"), /__Host-lft_account_session/);
  assert.match(read("worker.js"), /used_at IS NULL AND expires_at >/);
  assert.match(read("_headers"), /\/account\/\*/);
  assert.doesNotMatch(read("account/account.js"), /innerHTML/);
});
