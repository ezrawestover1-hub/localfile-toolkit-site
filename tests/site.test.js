import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requiredRoutes = ["index.html", "portfolio.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "contact.html", "refund-request.html", "robots.txt", "sitemap.xml", "ledgerlift/index.html", "pixelport/index.html", "contactcraft/index.html", "calendarflow/index.html", "captionshift/index.html", "checkout-portal/index.html", "checkout-portal/purchase-success.html", "license/activate.html", "license/restore.html", "license/manage.html"];
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
  assert.match(pricing, /account-access\.js/);
});

test("public product names are updated without changing internal product keys", () => {
  const pricingConfig = read("pricing-config.js");
  const iconConfig = read("assets/product-icons/config.js");
  const pricing = read("pricing.html");
  const checkout = read("checkout-portal/checkout.js");
  assert.match(pricingConfig, /name: "LedgerHarbor"/);
  assert.match(pricingConfig, /name: "PixelRefinery"/);
  assert.match(iconConfig, /ledgerlift: Object\.freeze\(\{ name: "LedgerHarbor"/);
  assert.match(iconConfig, /pixelport: Object\.freeze\(\{ name: "PixelRefinery"/);
  assert.match(pricing, /LedgerHarbor/);
  assert.match(pricing, /PixelRefinery/);
  assert.doesNotMatch(pricing, /LedgerLift|PixelPort/);
  assert.match(checkout, /ledgerlift:\{name:"LedgerHarbor"/);
  assert.match(checkout, /pixelport:\{name:"PixelRefinery"/);
  assert.match(checkout, /This purchase unlocks LedgerHarbor only/);
  assert.match(checkout, /This purchase unlocks PixelRefinery only/);
});

test("paid users receive access actions without exposing a second bundle purchase", () => {
  const access = read("account-access.js");
  assert.match(access, /api\/account\/me/);
  assert.match(access, /Access other products/);
  assert.match(access, /Full Plus access active/);
  assert.match(access, /Your complete private toolkit is ready/);
  assert.match(access, /My Account/);
  assert.match(access, /account\.entitlements/);
  assert.match(access, /planRank/);
  assert.match(read("checkout-portal/checkout.js"), /This purchase is already linked to your account/);
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => assert.match(read(`${product}/index.html`), /account-access\.js/));
});

test("paid account handoff is tier-aware and purchase-gated", () => {
  const access = read("account-access.js");
  const account = read("account/account.js");
  assert.match(access, /account-access\.css/);
  assert.match(access, /account-access-strip/);
  assert.match(access, /Open Plus/);
  assert.match(access, /Upgrade to Plus/);
  assert.match(access, /account-partial/);
  assert.match(read("account-access.css"), /account-access-strip/);
  assert.match(account, /Overview/);
  assert.match(account, /Products/);
  assert.match(account, /Billing/);
  assert.match(account, /Security/);
  assert.match(account, /Open \$\{meta\.name\} Plus/);
  assert.match(account, /Upgrade to Plus/);
  assert.doesNotMatch(account, /innerHTML/);
  assert.match(read("account/register.html"), /Purchase required/);
  assert.match(read("account/register.html"), /Start with a purchase/);
  assert.match(read("account/login.html"), /Start with a purchase/);
  assert.match(read("checkout-portal/index.html"), /create your account/);
  assert.match(read("checkout-portal/purchase-success.html"), /account\/register\.html/);
  assert.match(read("worker.js"), /purchase_required/);
  assert.match(read("worker.js"), /JOIN entitlements/);
});

test("Plus routes are separate, entitlement-gated workspaces with a post-checkout handoff", () => {
  const mode = read("plus-mode.js");
  const styles = read("plus-mode.css");
  assert.match(mode, /get\("mode"\) !== "plus"/);
  assert.match(mode, /restoreEntitlements/);
  assert.match(mode, /api\/account\/me/);
  assert.match(mode, /getCapabilities/);
  assert.match(mode, /plus-access-gate/);
  assert.match(mode, /plus-authorized/);
  assert.match(mode, /plus-locked/);
  assert.match(mode, /Retry Plus restore/);
  assert.match(mode, /setPaidAccess/);
  assert.match(mode, /waitForSuiteGate/);
  assert.match(mode, /plus-mode:ready/);
  assert.match(styles, /#pricing/);
  assert.match(styles, /#sampleBtn/);
  assert.match(styles, /plus-locked/);
  assert.match(styles, /plus-handoff/);
  assert.match(read("account-access.js"), /const plusHome/);
  assert.match(read("account-access.js"), /mode=plus/);
  assert.match(read("account/account.js"), /mode=plus/);
  assert.match(read("checkout-portal/checkout.js"), /plusHome/);
  assert.match(read("checkout-portal/checkout.js"), /successUrl/);
  assert.match(read("checkout-portal/success.js"), /mode=plus/);
  assert.match(read("checkout-portal/success.js"), /productLink\.href = paidPath/);
  assert.match(read("account/verify.js"), /lft_pending_next/);
  assert.match(read("account/login.js"), /safeNext/);
  assert.match(read("account/login.js"), /sessionIsActive/);
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => {
    const common = read(`${product}/common.js`);
    const page = read(`${product}/index.html`);
    assert.match(common, /\.\.\/plus-mode\.js/);
    assert.match(page, /Try sample data/);
    assert.match(page, /id="pricing"/);
    assert.match(read(`${product}/plus.js`), /canUsePlus/);
    assert.match(read(`${product}/plus.js`), /plus-mode:ready/);
    assert.match(read(`${product}/plus.js`), /modeAuthorized/);
  });
});

test("Standard routes are separate paid workspaces with core entitlement gating", () => {
  const mode = read("standard-mode.js");
  const styles = read("standard-mode.css");
  assert.match(mode, /get\("mode"\) !== "standard"/);
  assert.match(mode, /canUseCore/);
  assert.match(mode, /restoreEntitlements/);
  assert.match(mode, /standard-access-gate/);
  assert.match(mode, /standard-authorized/);
  assert.match(mode, /standard-locked/);
  assert.match(mode, /Retry Standard restore/);
  assert.match(mode, /setPaidAccess/);
  assert.match(mode, /waitForSuiteGate/);
  assert.match(styles, /#pricing/);
  assert.match(styles, /#sampleBtn/);
  assert.match(styles, /standard-locked/);
  assert.match(styles, /standard-handoff/);
  assert.match(read("account-access.js"), /standardHome/);
  assert.match(read("account/account.js"), /mode=standard/);
  assert.match(read("checkout-portal/checkout.js"), /standardHome/);
  assert.match(read("checkout-portal/success.js"), /mode=standard/);
  ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].forEach((product) => {
    assert.match(read(`${product}/common.js`), /\.\.\/standard-mode\.js/);
  });
});

test("LedgerLift ownership is product-specific and routes owned users into a quiet workspace", () => {
  const access = read("account-access.js");
  const license = read("license.js");
  const worker = read("worker.js");
  assert.match(access, /bundleActive/);
  assert.match(access, /highestLedgerLiftTier/);
  assert.match(access, /routeOwnedLedgerLift/);
  assert.match(access, /mode=\$\{serverTier\}/);
  assert.doesNotMatch(access, /Object\.keys\(products\)\.every/);
  assert.match(license, /planFor/);
  assert.match(license, /bundle/);
  assert.match(worker, /summarizeEntitlements/);
  assert.match(worker, /highestLedgerLiftTier/);
  assert.match(worker, /\["suite", "bundle"\]/);
  assert.match(read("plus-mode.js"), /hasBundle/);
  assert.match(read("standard-mode.js"), /hasBundle/);
  assert.match(read("LEDGERLIFT_PRODUCT_MATRIX.md"), /Free \/ unpaid/);
  assert.match(read("LEDGERLIFT_PRODUCT_MATRIX.md"), /LedgerHarbor Standard/);
  assert.match(read("LEDGERLIFT_PRODUCT_MATRIX.md"), /LedgerHarbor Plus/);
  assert.match(read("LEDGERLIFT_PRODUCT_MATRIX.md"), /not inferred from owning five individual products/);
  assert.match(read("checkout-portal/checkout.js"), /This purchase unlocks LedgerHarbor only/);
  assert.match(read("checkout-portal/success.js"), /handoffAuthenticatedBuyer/);
  assert.match(read("checkout-portal/purchase-success.html"), /connect-src 'self'/);
  assert.match(read("_headers"), /\/ledgerlift\/\*[\s\S]*connect-src 'self'/);
  assert.match(read("_headers"), /^\/\n  Content-Security-Policy:[^\n]*connect-src 'self'/m);
  assert.match(read("ledgerlift/_headers"), /connect-src 'self'/);
});

test("PixelPort ownership is product-specific and routes owned users into distinct workspaces", () => {
  const access = read("account-access.js");
  const common = read("pixelport/common.js");
  const app = read("pixelport/app.js");
  const plus = read("pixelport/plus.js");
  const checkout = read("checkout-portal/checkout.js");
  assert.match(access, /routeOwnedPixelPort/);
  assert.match(access, /account\?\.products\?\.pixelport/);
  assert.match(access, /suppressUnpurchasedPixelPortPromotion/);
  assert.match(common, /product-tier-status/);
  assert.match(common, /1 image per conversion/);
  assert.match(common, /20 MB maximum/);
  assert.match(common, /setTier/);
  assert.match(app, /file\.size > 20 \* 1024 \* 1024/);
  assert.match(app, /mayOpenRealDocument/);
  assert.match(plus, /canUsePlus\("pixelport"\)/);
  assert.match(plus, /Batch image queue/);
  assert.match(checkout, /This purchase unlocks PixelRefinery only/);
  assert.match(checkout, /PixelRefinery Standard only; other products remain separate/);
  assert.match(checkout, /Batch image queue and reusable presets \(PixelRefinery Plus\)/);
  assert.match(read("plus-mode.js"), /source: capabilities\.bundle/);
  assert.match(read("_headers"), /\/pixelport\/\*[\s\S]*connect-src 'self'/);
  assert.match(read("pixelport/_headers"), /connect-src 'self'/);
  assert.match(read("PIXELPORT_PRODUCT_MATRIX.md"), /Free \/ unpaid/);
  assert.match(read("PIXELPORT_PRODUCT_MATRIX.md"), /PixelRefinery Standard/);
  assert.match(read("PIXELPORT_PRODUCT_MATRIX.md"), /PixelRefinery Plus/);
  assert.match(read("PIXELPORT_PRODUCT_MATRIX.md"), /not inferred from owning five individual products/);
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

test("public pricing describes implemented Plus features", () => {
  const pricing = read("pricing.html");
  assert.match(pricing, /Plus features are included with each Plus license/);
  assert.doesNotMatch(pricing, /Plus-specific controls are planned|Future Plus controls|planned Plus tier|Not included in the current release/);
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

test("support hub gives customers clear help paths without requesting private files", () => {
  const support = read("support.html");
  ["contact.html", "account/", "refund-request.html", "pricing.html", "privacy.html", "terms.html"].forEach((href) => assert.match(support, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `support link ${href}`));
  ["LedgerHarbor", "PixelRefinery", "ContactCraft", "CalendarFlow", "CaptionShift"].forEach((name) => assert.match(support, new RegExp(name)));
  assert.match(support, /Paddle transaction ID|receipt ID/);
  assert.match(support, /Do not submit card numbers, passwords, government IDs, health information, confidential business files/);
  assert.doesNotMatch(support, /upload your file|attach your source file|send your confidential source file/i);
});

test("client-shareable portfolio and its live demo are published with working showcase links", () => {
  const portfolio = read("portfolio.html");
  assert.match(portfolio, /Westover Digital Development \| Ezra Westover/);
  assert.match(portfolio, /class="westover-wordmark" aria-label="Westover Digital Development"/);
  assert.match(portfolio, /class="westover-monogram" aria-hidden="true">W/);
  assert.match(portfolio, /Context MRI/);
  assert.equal(fs.existsSync(path.join(root, "assets/context-mri-icon.svg")), true);
  assert.match(portfolio, /assets\/context-mri-icon\.svg/);
  assert.match(portfolio, /context-mri\.ezra-westover1\.chatgpt\.site/);
  assert.match(portfolio, /github\.com\/ezrawestover1-hub\/context-mri/);
  assert.match(portfolio, /53 to 100/);
  assert.match(portfolio, /Original Context Guard blocked; repaired pack passed/);
  assert.match(portfolio, /href="client-site-starter\.html"/);
  assert.match(portfolio, /href="https:\/\/japan-therapist-finder-preview\.ezra-westover1\.workers\.dev\/"/);
  assert.match(portfolio, /Open the Japan Therapist Finder preview in a new tab/);
  ["ledgerlift/csv-to-iif-converter.html", "pixelport/private-image-converter.html", "contactcraft/vcf-to-csv-converter.html", "calendarflow/ics-to-csv-converter.html", "captionshift/subtitle-format-converter.html"].forEach((href) => assert.match(portfolio, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.match(portfolio, /mailto:ezra\.westover1@gmail\.com/);
  assert.match(portfolio, /\(509\) 792-7052/);
  assert.match(read("client-site-starter.html"), /<title>/i);
});

test("SEO foundations are present and sitemap excludes private routes", () => {
  const important = ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "contact.html", "refund-request.html", "checkout-portal/index.html", "ledgerlift/index.html", "pixelport/index.html", "contactcraft/index.html", "calendarflow/index.html", "captionshift/index.html"];
  const titles = new Set(); const descriptions = new Set();
  important.forEach((file) => { const content = read(file); const title = content.match(/<title[^>]*>([^<]+)</i)?.[1]; const description = content.match(/name="description" content="([^"]+)/i)?.[1] || content.match(/content="([^"]+)" name="description"/i)?.[1]; assert.ok(title && description, file); assert.match(content, /https:\/\/localfiletoolkit\.com\//); titles.add(title); descriptions.add(description); });
  assert.equal(titles.size, important.length); assert.equal(descriptions.size, important.length);
  const sitemap = read("sitemap.xml"); assert.doesNotMatch(sitemap, /\/api\/|checkout-portal|license|purchase-success|tests|migrations/); assert.match(read("robots.txt"), /Sitemap: https:\/\/localfiletoolkit\.com\/sitemap\.xml/);
});

test("every public product and format page has complete SEO metadata", () => {
  const sitemap = read("sitemap.xml");
  const sitemapUrls = [...sitemap.matchAll(/<loc>(https:\/\/localfiletoolkit\.com\/[^<]+)<\/loc>/g)].map((match) => match[1]);
  const pages = sitemapUrls.filter((url) => /https:\/\/localfiletoolkit\.com\/(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)\//.test(url) && !/https:\/\/localfiletoolkit\.com\/ledgerlift\/guides\//.test(url));
  const titles = new Set();
  const descriptions = new Set();
  const getMeta = (content, attribute, value) => content.match(new RegExp(`<meta[^>]+${attribute}=["']${value}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1]
    || content.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${value}["']`, "i"))?.[1] || "";
  pages.forEach((url) => {
    const pathname = new URL(url).pathname;
    const file = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const content = read(file);
    const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "";
    const description = getMeta(content, "name", "description");
    const canonical = content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
      || content.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] || "";
    assert.ok(title, `${file} title`);
    assert.ok(description, `${file} description`);
    assert.equal(canonical, url, `${file} canonical`);
    assert.equal(getMeta(content, "name", "robots"), "index,follow", `${file} robots`);
    ["og:title", "og:description", "og:url", "og:type"].forEach((property) => assert.ok(getMeta(content, "property", property), `${file} ${property}`));
    ["twitter:title", "twitter:description", "twitter:card"].forEach((name) => assert.ok(getMeta(content, "name", name), `${file} ${name}`));
    assert.equal((content.match(/<h1\b/gi) || []).length, 1, `${file} one primary H1`);
    assert.doesNotMatch(content, /<meta[^>]+name=["']keywords["']/i, `${file} has no keywords meta tag`);
    const jsonScripts = [...content.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
    assert.ok(jsonScripts.length, `${file} structured data`);
    const graph = jsonScripts.flatMap((match) => { const data = JSON.parse(match[1]); return data["@graph"] || [data]; });
    assert.ok(graph.some((item) => item["@type"] === "SoftwareApplication"), `${file} SoftwareApplication`);
    assert.ok(graph.some((item) => item["@type"] === "BreadcrumbList"), `${file} BreadcrumbList`);
    assert.ok(graph.some((item) => item["@type"] === "FAQPage"), `${file} FAQPage`);
    titles.add(title); descriptions.add(description);
  });
  const formatPages = pages.filter((url) => !url.endsWith("/"));
  assert.equal(new Set(formatPages.map((url) => {
    const pathname = new URL(url).pathname; const file = pathname.slice(1); const content = read(file); return content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  })).size, formatPages.length, "format landing titles are unique");
  assert.equal(new Set(formatPages.map((url) => {
    const content = read(new URL(url).pathname.slice(1)); return getMeta(content, "name", "description");
  })).size, formatPages.length, "format landing descriptions are unique");
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

test("dedicated product landing pages have bounded descriptions and product-specific share images", () => {
  const products = ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"];
  products.forEach((product) => {
    fs.readdirSync(path.join(root, product)).filter((name) => name.endsWith(".html") && !["index.html", "privacy.html", "security.html", "terms.html"].includes(name)).forEach((name) => {
      const file = `${product}/${name}`;
      const content = read(file);
      const description = content.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] || content.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i)?.[1];
      assert.ok(description && description.length >= 140 && description.length <= 160, `${file} description length`);
      assert.match(content, new RegExp(`property="og:image"[^>]+https://localfiletoolkit\\.com/assets/(?:product-icons/${product}/source-master|social/[^/]+/[^/]+-social-1200x630)\\.png`), `${file} OG image`);
      assert.match(content, new RegExp(`name="twitter:image"[^>]+https://localfiletoolkit\\.com/assets/(?:product-icons/${product}/source-master|social/[^/]+/[^/]+-social-1200x630)\\.png`), `${file} Twitter image`);
      assert.doesNotMatch(content, /Bank CSV → QuickBooks Desktop IIF with mapping and validation\./, `${file} restrained shared compatibility copy`);
    });
  });
});

test("LedgerLift SEO pages have unique metadata, structured data, headings, and working internal routes", () => {
  const pages = ["ledgerlift/index.html", "ledgerlift/csv-to-iif-converter.html", "ledgerlift/bank-csv-to-iif.html", "ledgerlift/debit-credit-csv-to-iif.html", "ledgerlift/create-iif-from-spreadsheet.html"];
  const titles = new Set(); const descriptions = new Set();
  pages.forEach((file) => {
    const content = read(file);
    const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const description = content.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] || content.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i)?.[1];
    assert.ok(title && description, `${file} metadata`);
    assert.equal((content.match(/<h1\b/gi) || []).length, 1, `${file} one H1`);
    assert.doesNotMatch(content, /name="robots"[^>]+content="[^"]*noindex/i, `${file} indexable`);
    assert.match(content, /<link[^>]+rel="canonical"[^>]+https:\/\/localfiletoolkit\.com\/ledgerlift\//i, `${file} canonical`);
    titles.add(title); descriptions.add(description);
    const jsonScripts = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    assert.ok(jsonScripts.length, `${file} JSON-LD`);
    jsonScripts.forEach((match) => { const data = JSON.parse(match[1]); const graph = data["@graph"] || [data]; assert.ok(graph.some((item) => item["@type"] === "SoftwareApplication"), `${file} SoftwareApplication`); assert.ok(graph.some((item) => item["@type"] === "BreadcrumbList"), `${file} BreadcrumbList`); assert.ok(graph.some((item) => item["@type"] === "FAQPage"), `${file} FAQPage`); });
  });
  assert.equal(titles.size, pages.length);
  assert.equal(descriptions.size, pages.length);
  const routes = ["csv-to-iif-converter.html", "bank-csv-to-iif.html", "debit-credit-csv-to-iif.html", "create-iif-from-spreadsheet.html"];
  routes.forEach((route) => assert.ok(fs.existsSync(path.join(root, "ledgerlift", route)), route));
  const index = read("ledgerlift/index.html");
  ["../index.html", "../pricing.html", "../account/", "privacy.html", "security.html", ...routes].forEach((href) => assert.match(index, new RegExp(`href="${href.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`), `LedgerLift link ${href}`));
  assert.match(read("sitemap.xml"), /ledgerlift\/(bank-csv-to-iif|debit-credit-csv-to-iif|create-iif-from-spreadsheet)\.html/);
});

test("LedgerHarbor high-intent guides have distinct depth and FAQ parity", () => {
  const guides = [
    ["ledgerlift/csv-to-iif-converter.html", "signed-amount CSV mapping"],
    ["ledgerlift/bank-csv-to-iif.html", "bank-export CSV preparation"],
    ["ledgerlift/debit-credit-csv-to-iif.html", "separate debit-and-credit mapping"],
    ["ledgerlift/create-iif-from-spreadsheet.html", "spreadsheet-to-IIF preparation"]
  ];
  const relatedPages = ["csv-to-iif-converter.html", "bank-csv-to-iif.html", "debit-credit-csv-to-iif.html", "create-iif-from-spreadsheet.html"];
  guides.forEach(([file, phrase]) => {
    const content = read(file);
    assert.match(content, new RegExp(phrase), `${file} distinct workflow phrase`);
    assert.match(content, /href="index\.html#converter"/, `${file} working converter link`);
    const relatedCount = relatedPages.filter((route) => route !== path.basename(file) && content.includes(`href="${route}"`)).length;
    assert.ok(relatedCount >= 2, `${file} related LedgerHarbor links`);
    assert.match(content, /<h2[^>]*>[^<]*(?:limitation|compatibility)[^<]*<\/h2>/i, `${file} visible limitations section`);

    const json = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
      .map((match) => JSON.parse(match[1])).flatMap((data) => data["@graph"] || [data]);
    const faq = json.find((item) => item["@type"] === "FAQPage");
    assert.ok(faq, `${file} FAQ structured data`);
    const structuredQuestions = faq.mainEntity.map((item) => item.name);
    const visibleQuestions = [...content.matchAll(/<summary>([^<]+)<\/summary>/gi)].map((match) => match[1].trim());
    assert.deepEqual(structuredQuestions, visibleQuestions, `${file} FAQ questions match visible summaries`);
  });
});

test("LedgerHarbor education cluster is indexable, linked, and honest", () => {
  const guides = [
    "csv-to-iif-column-mapping-guide.html",
    "signed-amount-vs-debit-credit.html",
    "prepare-bank-csv-for-iif.html",
    "common-csv-formatting-errors.html",
    "iif-export-review-checklist.html"
  ];
  const titles = new Set();
  const descriptions = new Set();
  const guideRoutes = new Set(guides);
  guides.forEach((name) => {
    const file = `ledgerlift/guides/${name}`;
    const content = read(file);
    const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const description = content.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1];
    assert.ok(title && description, `${file} metadata`);
    titles.add(title); descriptions.add(description);
    assert.match(content, new RegExp(`<link[^>]+rel="canonical"[^>]+https://localfiletoolkit\\.com/ledgerlift/guides/${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`), `${file} canonical`);
    assert.match(content, /name="robots" content="index,follow"/i, `${file} robots`);
    assert.equal((content.match(/<h1\b/gi) || []).length, 1, `${file} one H1`);
    assert.match(content, /property="og:title"/i, `${file} Open Graph title`);
    assert.match(content, /property="og:description"/i, `${file} Open Graph description`);
    assert.match(content, /property="og:url"/i, `${file} Open Graph URL`);
    assert.match(content, /name="twitter:title"/i, `${file} Twitter title`);
    assert.match(content, /name="twitter:description"/i, `${file} Twitter description`);
    assert.match(content, /name="twitter:card"/i, `${file} Twitter card`);
    assert.match(content, /"@type":"BreadcrumbList"/, `${file} BreadcrumbList`);
    assert.match(content, /href="\.\.\/index\.html#converter"|href="\.\.\/[^\"]+to-iif\.html"/, `${file} relevant workflow link`);
    const related = [...content.matchAll(/href="([^"]+\.html)"/g)].map((match) => match[1]).filter((href) => guideRoutes.has(href));
    assert.ok(new Set(related).size >= 2, `${file} related guide links`);
    assert.match(content, /<h2[^>]*>[^<]*(?:limitations?|review guidance)[^<]*<\/h2>/i, `${file} limitations or review guidance`);
    assert.doesNotMatch(content, /<meta[^>]+name="keywords"/i, `${file} no meta keywords`);
    assert.doesNotMatch(`${title} ${description}`, /universal compatibility|perfect preservation|guaranteed (?:results|imports?)|five-star|\brating\b|\btestimonial\b/i, `${file} no prohibited promotional claims`);
  });
  assert.equal(titles.size, guides.length);
  assert.equal(descriptions.size, guides.length);
  const sitemap = read("sitemap.xml");
  guides.forEach((name) => assert.match(sitemap, new RegExp(`https://localfiletoolkit\\.com/ledgerlift/guides/${name}`), `${name} sitemap`));
  assert.match(sitemap, /https:\/\/localfiletoolkit\.com\/ledgerlift\/guides\//, "guide area sitemap");
  ["account/", "checkout-portal/", "api/", "license/", "purchase-success"].forEach((route) => assert.doesNotMatch(sitemap, new RegExp(route.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `${route} excluded from sitemap`));
});

test("social assets and product share metadata are local, dimensioned, and product-specific", () => {
  const products = {
    ledgerlift: ["LedgerHarbor", "ledgerharbor", "csv-to-iif-converter.html"],
    pixelport: ["PixelRefinery", "pixelrefinery", "png-to-jpg-converter.html"],
    contactcraft: ["ContactCraft", "contactcraft", "vcf-to-csv-converter.html"],
    calendarflow: ["CalendarFlow", "calendarflow", "ics-to-csv-converter.html"],
    captionshift: ["CaptionShift", "captionshift", "srt-to-vtt-converter.html"]
  };
  const variants = [["social", 1200, 630], ["landscape", 1200, 628], ["square", 1200, 1200]];
  for (const [product, [name, social, primary]] of Object.entries(products)) {
    const assetPaths = variants.map(([variant, width, height]) => {
      const asset = `assets/social/${social}/${social}-${variant}-${width}x${height}.png`;
      assert.equal(fs.existsSync(path.join(root, asset)), true, asset);
      const buffer = fs.readFileSync(path.join(root, asset));
      assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${asset} PNG`);
      assert.equal(buffer.readUInt32BE(16), width, `${asset} width`);
      assert.equal(buffer.readUInt32BE(20), height, `${asset} height`);
      assert.ok(fs.statSync(path.join(root, asset)).size > 0, `${asset} nonempty`);
      return `https://localfiletoolkit.com/${asset}`;
    });
    const homepage = read(`${product}/index.html`);
    const formatPage = read(`${product}/${primary}`);
    for (const [content, file] of [[homepage, `${product}/index.html`], [formatPage, `${product}/${primary}`]]) {
      assert.match(content, /property="og:image"[^>]+https:\/\/localfiletoolkit\.com\/assets\/social\//i, `${file} OG image`);
      assert.match(content, /property="og:image:width"[^>]+content="1200"/i, `${file} OG width`);
      assert.match(content, /property="og:image:height"[^>]+content="630"/i, `${file} OG height`);
      assert.match(content, /property="og:image:alt"[^>]+content="[^"]+"/i, `${file} OG alt`);
      assert.match(content, /name="twitter:card"[^>]+content="summary_large_image"/i, `${file} Twitter card`);
      assert.match(content, /name="twitter:image"[^>]+https:\/\/localfiletoolkit\.com\/assets\/social\//i, `${file} Twitter image`);
    }
    const screenshot = `assets/screenshots/${product}-workflow-900x700.png`;
    assert.equal(fs.existsSync(path.join(root, screenshot)), true, screenshot);
    assert.match(formatPage, new RegExp(`class="workflow-screenshot"[\\s\\S]*src="\\.\\./${screenshot.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}"`), `${product} visible workflow screenshot`);
    assert.match(formatPage, /loading="lazy"[^>]+alt="[^"]+"/, `${product} screenshot alt and lazy loading`);
    assert.match(formatPage, /width="900" height="700"/, `${product} screenshot dimensions`);
    assert.ok(assetPaths[0].includes(`${social}-social-1200x630.png`), `${product} social asset mapping`);
  }
  const publicHtml = [
    ...fs.readdirSync(root).filter((file) => file.endsWith(".html")),
    ...Object.keys(products).flatMap((product) => fs.readdirSync(path.join(root, product)).filter((file) => file.endsWith(".html")).map((file) => `${product}/${file}`)),
    ...fs.readdirSync(path.join(root, "ledgerlift/guides")).filter((file) => file.endsWith(".html")).map((file) => `ledgerlift/guides/${file}`)
  ];
  publicHtml.forEach((file) => {
    const content = read(file);
    [...content.matchAll(/(?:property|name)="(?:og:image|twitter:image)"[^>]+content="(https?:\/\/[^"\s]+)"/gi)].forEach((match) => {
      assert.match(match[1], /^https:\/\/localfiletoolkit\.com\/assets\//, `${file} uses local image host`);
    });
  });
  assert.doesNotMatch(read("sitemap.xml"), /assets\/social\//, "sitemap contains routes, not assets");
  const changedText = Object.keys(products).map((product) => read(`${product}/index.html`).split("</head>", 1)[0]).join("\n");
  assert.doesNotMatch(changedText, /100% secure|guaranteed|perfect conversion|works with every file|lossless|universal compatibility|cloud backup|AI powered|\btestimonial\b|\brating\b/i, "product metadata avoids prohibited claims");
});

test("PixelPort SEO pages have unique metadata, format guidance, structured data, and sitemap coverage", () => {
  const pages = ["pixelport/index.html", "pixelport/png-to-jpg-converter.html", "pixelport/jpg-to-png-converter.html", "pixelport/webp-to-jpg-converter.html", "pixelport/webp-to-png-converter.html", "pixelport/png-to-webp-converter.html", "pixelport/avif-to-jpg-converter.html", "pixelport/avif-to-png-converter.html", "pixelport/private-image-converter.html"];
  const titles = new Set(); const descriptions = new Set();
  pages.forEach((file) => {
    const content = read(file);
    const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const description = content.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1];
    assert.ok(title && description, `${file} metadata`);
    assert.equal((content.match(/<h1\b/gi) || []).length, 1, `${file} one H1`);
    assert.doesNotMatch(content, /name="robots"[^>]+content="[^\"]*noindex/i, `${file} indexable`);
    assert.match(content, /<link[^>]+rel="canonical"[^>]+https:\/\/localfiletoolkit\.com\/pixelport\//i, `${file} canonical`);
    assert.match(content, /property="og:title"/i, `${file} Open Graph title`);
    assert.match(content, /name="twitter:title"/i, `${file} Twitter title`);
    assert.match(content, /class="[^"]*\bfaq\b/i, `${file} visible FAQ`);
    titles.add(title); descriptions.add(description);
    const jsonScripts = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    assert.ok(jsonScripts.length, `${file} JSON-LD`);
    jsonScripts.forEach((match) => { const data = JSON.parse(match[1]); const graph = data["@graph"] || [data]; assert.ok(graph.some((item) => item["@type"] === "SoftwareApplication"), `${file} SoftwareApplication`); assert.ok(graph.some((item) => item["@type"] === "BreadcrumbList"), `${file} BreadcrumbList`); assert.ok(graph.some((item) => item["@type"] === "FAQPage"), `${file} FAQPage`); });
  });
  assert.equal(titles.size, pages.length);
  assert.equal(descriptions.size, pages.length);
  assert.match(read("pixelport/index.html"), /<title>Private Image Converter for PNG, JPG, WebP and AVIF \| PixelRefinery<\/title>/);
  assert.match(read("pixelport/index.html"), /<h1>Convert Images Without Uploading Them<\/h1>/);
  const routes = pages.slice(1).map((file) => file.replace("pixelport/", ""));
  routes.forEach((route) => assert.ok(fs.existsSync(path.join(root, "pixelport", route)), route));
  const sitemap = read("sitemap.xml");
  pages.forEach((file) => { const url = file === "pixelport/index.html" ? "https://localfiletoolkit.com/pixelport/" : `https://localfiletoolkit.com/${file}`; assert.match(sitemap, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} sitemap`); });
  const index = read("pixelport/index.html");
  ["png-to-jpg-converter.html", "jpg-to-png-converter.html", "webp-to-png-converter.html", "png-to-webp-converter.html", "avif-to-jpg-converter.html", "avif-to-png-converter.html", "private-image-converter.html", "../index.html", "../pricing.html", "../account/", "privacy.html", "security.html"].forEach((href) => assert.match(index, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `PixelPort link ${href}`));
});

test("ContactCraft SEO pages have unique metadata, field guidance, structured data, and sitemap coverage", () => {
  const pages = ["contactcraft/index.html", "contactcraft/vcf-to-csv-converter.html", "contactcraft/csv-to-vcard-converter.html", "contactcraft/csv-to-vcf-converter.html", "contactcraft/open-vcf-in-excel.html", "contactcraft/export-contacts-to-csv.html", "contactcraft/private-contact-converter.html"];
  const titles = new Set(); const descriptions = new Set();
  pages.forEach((file) => {
    const content = read(file);
    const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const description = content.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] || content.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i)?.[1];
    assert.ok(title && description, `${file} metadata`);
    assert.equal((content.match(/<h1\b/gi) || []).length, 1, `${file} one H1`);
    assert.doesNotMatch(content, /name="robots"[^>]+content="[^"]*noindex/i, `${file} indexable`);
    assert.match(content, /<link[^>]+rel="canonical"[^>]+https:\/\/localfiletoolkit\.com\/contactcraft\//i, `${file} canonical`);
    assert.match(content, /property="og:title"/i, `${file} Open Graph title`);
    assert.match(content, /name="twitter:title"/i, `${file} Twitter title`);
    assert.match(content, /<h2>FAQ<\/h2>|class="[^\"]*\bfaq\b/i, `${file} visible FAQ`);
    titles.add(title); descriptions.add(description);
    const jsonScripts = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    assert.ok(jsonScripts.length, `${file} JSON-LD`);
    jsonScripts.forEach((match) => { const data = JSON.parse(match[1]); const graph = data["@graph"] || [data]; assert.ok(graph.some((item) => item["@type"] === "SoftwareApplication"), `${file} SoftwareApplication`); assert.ok(graph.some((item) => item["@type"] === "BreadcrumbList"), `${file} BreadcrumbList`); assert.ok(graph.some((item) => item["@type"] === "FAQPage"), `${file} FAQPage`); });
  });
  assert.equal(titles.size, pages.length);
  assert.equal(descriptions.size, pages.length);
  assert.match(read("contactcraft/index.html"), /<title>VCF, vCard and CSV Contact Converter \| ContactCraft<\/title>/);
  assert.match(read("contactcraft/index.html"), /<h1>Convert Contact Lists Between VCF, vCard and CSV<\/h1>/);
  const routes = pages.slice(1).map((file) => file.replace("contactcraft/", ""));
  routes.forEach((route) => assert.ok(fs.existsSync(path.join(root, "contactcraft", route)), route));
  const sitemap = read("sitemap.xml");
  pages.forEach((file) => { const url = file === "contactcraft/index.html" ? "https://localfiletoolkit.com/contactcraft/" : `https://localfiletoolkit.com/${file}`; assert.match(sitemap, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} sitemap`); });
  const index = read("contactcraft/index.html");
  ["vcf-to-csv-converter.html", "csv-to-vcard-converter.html", "csv-to-vcf-converter.html", "open-vcf-in-excel.html", "export-contacts-to-csv.html", "private-contact-converter.html", "../index.html", "../pricing.html", "../account/", "../privacy.html", "security.html"].forEach((href) => assert.match(index, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `ContactCraft link ${href}`));
  assert.match(index, /<caption>Basic ContactCraft field mapping/);
  assert.match(index, /What CSV structure should I prepare\?/);
});

test("CalendarFlow SEO pages have unique metadata, calendar guidance, structured data, and sitemap coverage", () => {
  const pages = ["calendarflow/index.html", "calendarflow/ics-to-csv-converter.html", "calendarflow/csv-to-ics-converter.html", "calendarflow/open-ics-in-excel.html", "calendarflow/create-ics-from-csv.html", "calendarflow/export-calendar-events-to-csv.html", "calendarflow/private-calendar-converter.html"];
  const titles = new Set(); const descriptions = new Set();
  pages.forEach((file) => {
    const content = read(file);
    const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const description = content.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] || content.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i)?.[1];
    assert.ok(title && description, `${file} metadata`);
    assert.equal((content.match(/<h1\b/gi) || []).length, 1, `${file} one H1`);
    assert.doesNotMatch(content, /name="robots"[^>]+content="[^"]*noindex/i, `${file} indexable`);
    assert.match(content, /<link[^>]+rel="canonical"[^>]+https:\/\/localfiletoolkit\.com\/calendarflow\//i, `${file} canonical`);
    assert.match(content, /property="og:title"/i, `${file} Open Graph title`);
    assert.match(content, /name="twitter:title"/i, `${file} Twitter title`);
    assert.match(content, /class="[^"]*\bfaq\b/i, `${file} visible FAQ`);
    titles.add(title); descriptions.add(description);
    const jsonScripts = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    assert.ok(jsonScripts.length, `${file} JSON-LD`);
    jsonScripts.forEach((match) => { const data = JSON.parse(match[1]); const graph = data["@graph"] || [data]; assert.ok(graph.some((item) => item["@type"] === "SoftwareApplication"), `${file} SoftwareApplication`); assert.ok(graph.some((item) => item["@type"] === "BreadcrumbList"), `${file} BreadcrumbList`); assert.ok(graph.some((item) => item["@type"] === "FAQPage"), `${file} FAQPage`); });
  });
  assert.equal(titles.size, pages.length);
  assert.equal(descriptions.size, pages.length);
  assert.match(read("calendarflow/index.html"), /<title>ICS and CSV Calendar Converter \| CalendarFlow<\/title>/);
  assert.match(read("calendarflow/index.html"), /<h1>Convert Calendar Events Between ICS and CSV<\/h1>/);
  assert.match(read("calendarflow/index.html"), /<caption>CalendarFlow CSV column mapping<\/caption>/);
  assert.match(read("calendarflow/index.html"), /Does CalendarFlow expand recurring events\?/);
  const routes = pages.slice(1).map((file) => file.replace("calendarflow/", ""));
  routes.forEach((route) => assert.ok(fs.existsSync(path.join(root, "calendarflow", route)), route));
  const sitemap = read("sitemap.xml");
  pages.forEach((file) => { const url = file === "calendarflow/index.html" ? "https://localfiletoolkit.com/calendarflow/" : `https://localfiletoolkit.com/${file}`; assert.match(sitemap, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} sitemap`); });
  const index = read("calendarflow/index.html");
  ["ics-to-csv-converter.html", "csv-to-ics-converter.html", "open-ics-in-excel.html", "create-ics-from-csv.html", "export-calendar-events-to-csv.html", "private-calendar-converter.html", "../index.html", "../pricing.html", "../account/", "privacy.html", "security.html"].forEach((href) => assert.match(index, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `CalendarFlow link ${href}`));
});

test("CaptionShift SEO pages have unique metadata, subtitle guidance, structured data, and sitemap coverage", () => {
  const pages = ["captionshift/index.html", "captionshift/srt-to-vtt-converter.html", "captionshift/vtt-to-srt-converter.html", "captionshift/sbv-to-srt-converter.html", "captionshift/ass-to-srt-converter.html", "captionshift/subtitle-format-converter.html", "captionshift/private-subtitle-converter.html"];
  const titles = new Set(); const descriptions = new Set();
  pages.forEach((file) => {
    const content = read(file);
    const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const description = content.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] || content.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i)?.[1];
    assert.ok(title && description, `${file} metadata`);
    assert.equal((content.match(/<h1\b/gi) || []).length, 1, `${file} one H1`);
    assert.doesNotMatch(content, /name="robots"[^>]+content="[^"]*noindex/i, `${file} indexable`);
    assert.match(content, /<link[^>]+rel="canonical"[^>]+https:\/\/localfiletoolkit\.com\/captionshift\//i, `${file} canonical`);
    assert.match(content, /property="og:title"/i, `${file} Open Graph title`);
    assert.match(content, /name="twitter:title"/i, `${file} Twitter title`);
    assert.match(content, /class="[^"]*\bfaq\b/i, `${file} visible FAQ`);
    titles.add(title); descriptions.add(description);
    const jsonScripts = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    assert.ok(jsonScripts.length, `${file} JSON-LD`);
    jsonScripts.forEach((match) => { const data = JSON.parse(match[1]); const graph = data["@graph"] || [data]; assert.ok(graph.some((item) => item["@type"] === "SoftwareApplication"), `${file} SoftwareApplication`); assert.ok(graph.some((item) => item["@type"] === "BreadcrumbList"), `${file} BreadcrumbList`); assert.ok(graph.some((item) => item["@type"] === "FAQPage"), `${file} FAQPage`); });
  });
  assert.equal(titles.size, pages.length);
  assert.equal(descriptions.size, pages.length);
  assert.match(read("captionshift/index.html"), /<title>Subtitle Converter for SRT, VTT, SBV and ASS \| CaptionShift<\/title>/);
  assert.match(read("captionshift/index.html"), /<h1>Convert Subtitle Files While Preserving Timing and Text<\/h1>/);
  assert.match(read("captionshift/index.html"), /CaptionShift format comparison/);
  assert.match(read("captionshift/index.html"), /Does CaptionShift translate or transcribe subtitles\?/);
  pages.slice(1).forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), file));
  const sitemap = read("sitemap.xml");
  pages.forEach((file) => { const url = file === "captionshift/index.html" ? "https://localfiletoolkit.com/captionshift/" : `https://localfiletoolkit.com/${file}`; assert.match(sitemap, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} sitemap`); });
  const index = read("captionshift/index.html");
  ["srt-to-vtt-converter.html", "vtt-to-srt-converter.html", "sbv-to-srt-converter.html", "ass-to-srt-converter.html", "subtitle-format-converter.html", "private-subtitle-converter.html", "../index.html", "../pricing.html", "../account/", "../privacy.html", "privacy.html", "security.html"].forEach((href) => assert.match(index, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `CaptionShift link ${href}`));
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
  products.forEach((product) => { assert.match(read("index.html"), new RegExp(`src="assets/product-icons/${product}/icon-128\\.png"`)); assert.match(read("pricing.html"), new RegExp(`/assets/product-icons/${product}/icon-128\\.png`)); });
  assert.doesNotMatch(read("index.html"), /src="\/assets\/product-icons\//, "suite homepage icons remain available when opened from the local portfolio file");
  const checkout = read("checkout-portal/checkout.js"); products.forEach((product) => assert.match(checkout, new RegExp(`PRODUCT_ICONS\\.${product}\\.icon`)));
  assert.match(checkout, /Object\.values\(window\.PRODUCT_ICONS\)/);
  assert.match(read("license/manage.js"), /window\.PRODUCT_ICONS/);
  ["terms.html", "privacy.html", "refunds.html", "contact.html", "refund-request.html"].forEach((file) => assert.doesNotMatch(read(file), /assets\/product-icons\/(ledgerlift|pixelport|contactcraft|calendarflow|captionshift)\/icon/));
  const publicFiles = ["index.html", "pricing.html", "terms.html", "privacy.html", "refunds.html", "support.html", "contact.html", "refund-request.html", "checkout-portal/index.html", "checkout-portal/purchase-success.html"];
  publicFiles.forEach((file) => assert.doesNotMatch(read(file), /file:\/\/|\/Users\//));
});

test("Paddle static fallback is sandbox-safe and production config is runtime-driven", () => {
  const config = read("checkout-portal/paddle-config.js");
  assert.match(config, /environment: "sandbox"/);
  assert.match(config, /checkoutEnabled: false/);
  assert.match(config, /clientToken: "test_[a-z\d]+"/);
  assert.match(config, /pri_[a-z\d]{26}/);
  assert.doesNotMatch(config, /live_/);
  const worker = read("worker.js");
  assert.match(worker, /paddleConfigResponse\(env\)/);
  assert.match(worker, /PADDLE_CHECKOUT_ENVIRONMENT/);
  assert.match(worker, /PADDLE_CLIENT_TOKEN/);
});

test("static HTML URL policy matches sitemap and canonical URLs", () => {
  const config = read("wrangler.jsonc");
  assert.match(config, /"html_handling":\s*"none"/);
  assert.match(read("sitemap.xml"), /\.html<\/loc>/);
});

test("checkout requests exactly one unit", () => {
  assert.match(read("checkout-portal/checkout.js"), /items:\[\{priceId,quantity:1\}\]/);
  assert.match(read("PAYMENTS_SETUP.md"), /minimum of `1` and a maximum of `1`/);
});

test("checkout portal has separate sandbox and production guards", () => {
  const checkout = read("checkout-portal/checkout.js");
  assert.match(checkout, /environment === "production"/);
  assert.match(checkout, /environment === "sandbox"/);
  assert.match(checkout, /\/\^live_\//);
  assert.match(checkout, /\/\^test_\//);
  assert.match(checkout, /Environment\.set\("sandbox"\)/);
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

test("ContactCraft has product-specific tier routing, free messaging, and promotion suppression", () => {
  const access = read("account-access.js");
  const common = read("contactcraft/common.js");
  assert.match(access, /routeOwnedContactCraft\(map, account\)/);
  assert.match(access, /account\.products\.contactcraft/);
  assert.match(access, /suppressUnpurchasedContactCraftPromotion/);
  assert.match(access, /setTier\?\.\(entitlement\?\.plan_key \|\| "free", entitlement\?\.source\)/);
  assert.match(common, /setTier/);
  assert.match(common, /INCLUDED WITH BUNDLE · ContactCraft Plus workspace/);
  assert.match(common, /FREE · 1 complete contact file per browser installation · 10 MB maximum/);
  assert.match(read("contactcraft/plus.js"), /canUsePlus\("contactcraft"\)/, "ContactCraft Plus remains license-gated");
  assert.match(read("CONTACTCRAFT_PRODUCT_MATRIX.md"), /highest active ContactCraft entitlement wins/);
  assert.match(read("contactcraft/_headers"), /connect-src 'self'/);
});

test("CalendarFlow has product-specific tier routing, free messaging, and promotion suppression", () => {
  const access = read("account-access.js");
  const common = read("calendarflow/common.js");
  assert.match(access, /routeOwnedCalendarFlow\(map, account\)/);
  assert.match(access, /account\.products\.calendarflow/);
  assert.match(access, /suppressUnpurchasedCalendarFlowPromotion/);
  assert.match(access, /setTier\?\.\(entitlement\?\.plan_key \|\| "free", entitlement\?\.source\)/);
  assert.match(common, /setTier/);
  assert.match(common, /INCLUDED WITH BUNDLE · CalendarFlow Plus workspace/);
  assert.match(common, /FREE · 1 complete calendar file per browser installation · 10 MB maximum/);
  assert.match(read("calendarflow/plus.js"), /canUsePlus\("calendarflow"\)/, "CalendarFlow Plus remains license-gated");
  assert.match(read("CALENDARFLOW_PRODUCT_MATRIX.md"), /highest active CalendarFlow entitlement wins/);
  assert.match(read("calendarflow/_headers"), /connect-src 'self'/);
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
  assert.match(read("checkout-portal/checkout.js"), /Merge calendars and remove duplicate events/);
  assert.match(read("checkout-portal/checkout.js"), /Saved filters and recurrence normalization/);
});

test("CaptionShift has product-specific tier routing, free messaging, and promotion suppression", () => {
  const access = read("account-access.js");
  const common = read("captionshift/common.js");
  assert.match(access, /routeOwnedCaptionShift\(map, account\)/);
  assert.match(access, /account\.products\.captionshift/);
  assert.match(access, /suppressUnpurchasedCaptionShiftPromotion/);
  assert.match(access, /setTier\?\.\(entitlement\?\.plan_key \|\| "free", entitlement\?\.source\)/);
  assert.match(common, /setTier/);
  assert.match(common, /INCLUDED WITH BUNDLE · CaptionShift Plus workspace/);
  assert.match(common, /FREE · 1 complete subtitle file per browser installation · 5 MB maximum/);
  assert.match(read("captionshift/plus.js"), /canUsePlus\("captionshift"\)/, "CaptionShift Plus remains license-gated");
  assert.match(read("CAPTIONSHIFT_PRODUCT_MATRIX.md"), /highest active CaptionShift entitlement wins/);
  assert.match(read("captionshift/_headers"), /connect-src 'self'/);
});

test("CaptionShift Plus promises are implemented and license-gated", () => {
  const plus = read("captionshift/plus.js");
  ["Batch subtitle files", "Save preset", "Apply timing offset", "Clean captions", "Download validation report", "getCapabilities"].forEach((value) => assert.match(plus, new RegExp(value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))));
  assert.match(plus, /canUsePlus\("captionshift"\)/);
  assert.match(read("captionshift/app.js"), /window\.CaptionShiftCore/);
  assert.match(read("captionshift/common.js"), /batch conversion, saved timing presets, cleanup, and validation reports/i);
  assert.match(read("checkout-portal/checkout.js"), /Batch subtitle conversion with timing offsets/);
  assert.match(read("checkout-portal/checkout.js"), /Saved timing presets and find-and-replace cleanup/);
});

test("LedgerLift trial survives refresh and only counts a real export", () => {
  const common = read("ledgerlift/common.js");
  const app = read("ledgerlift/app.js");
  assert.match(common, /localStorage\.getItem\(key\) === "used"/);
  assert.match(common, /localStorage\.setItem\(key, "used"\)/);
  assert.match(app, /if \(!sample && !window\.SuiteGate\.mayOpenRealDocument\(\)\)/);
  assert.match(app, /if \(!state\.source\) window\.SuiteGate\.markUsed\(\)/);
  assert.match(app, /if \(!state\.source && window\.SuiteGate\.used\(\)\)/);
  assert.match(common, /function mayOpenRealDocument\(\) \{ return paidAccess \|\| !used\(\); \}/);
  assert.match(common, /setPaidAccess/);
  assert.match(common, /Sample mode does not consume your free document/);
});

test("cross-device account surface is wired to durable entitlements", () => {
  assert.match(read("account/login.html"), /type="password"/);
  assert.match(read("account/register.html"), /confirm-password/);
  assert.match(read("account/verify.html"), /Verification code/);
  assert.match(read("account/verify.html"), /Resend code/);
  assert.match(read("account/reset.html"), /Re-enter password/);
  assert.match(read("account/index.html"), /Restore products on this device/);
  assert.match(read("account/account.js"), /restoreEntitlements/);
  assert.match(read("license.js"), /\/api\/account\/restore/);
  assert.match(read("worker.js"), /account_users/);
  assert.match(read("worker.js"), /portal-sessions/);
  assert.match(read("migrations/0002_accounts.sql"), /account_sessions/);
  assert.match(read("ACCOUNT_SETUP.md"), /PADDLE_API_KEY/);
  assert.match(read("worker.js"), /__Host-lft_account_session/);
  assert.match(read("worker.js"), /used_at IS NULL AND expires_at >/);
  assert.match(read("_headers"), /\/account\/\*/);
  assert.doesNotMatch(read("account/account.js"), /innerHTML/);
});

test("account setup stages passwords until email verification", () => {
  assert.match(read("worker.js"), /account_pending_passwords/);
  assert.match(read("worker.js"), /activateStagedPassword/);
  assert.match(read("worker.js"), /account_password_history/);
  assert.doesNotMatch(read("worker.js"), /That account already exists\. Sign in instead/);
  assert.match(read("migrations/0006_password_setup_history.sql"), /account_password_history/);
  assert.match(read("migrations/0007_auth_hardening.sql"), /attempt_count/);
  assert.match(read("migrations/0007_auth_hardening.sql"), /processing_token/);
  assert.match(read("worker.js"), /pbkdf2-sha256/);
  const pbkdf2Iterations = Number(read("worker.js").match(/const PASSWORD_PBKDF2_ITERATIONS = (\d+);/)?.[1]);
  assert.equal(pbkdf2Iterations, 100000, "password setup must stay within Cloudflare Workers' PBKDF2 limit");
  assert.match(read("worker.js"), /pending_user_id/);
  assert.match(read("worker.js"), /Request a new code and try again/);
  assert.match(read("worker.js"), /SELECT password_hash,password_salt,iterations,algorithm FROM account_pending_passwords/);
  assert.match(read("worker.js"), /latestVerificationCode\(env, user\.id, "reset"\)/);
  assert.match(read("worker.js"), /latestVerificationCode\(env, user\.id, "signup"\)/);
  assert.match(read("worker.js"), /processing_token/);
  assert.match(read("worker.js"), /ON CONFLICT\(user_id\) DO UPDATE SET password_hash/);
  assert.match(read("worker.js"), /password_reused/);
  assert.match(read("worker.js"), /reset_code_consume_failed/);
  assert.match(read("worker.js"), /Password reset successfully/);
  assert.doesNotMatch(read("account/reset.js"), /result\.diagnostic/);
  assert.match(read("worker.js"), /createAccountSessionJson/);
  assert.match(read("account/reset.js"), /result\.redirect/);
  assert.match(read("account/login.js"), /result\.redirect/);
  assert.match(read("worker.js"), /license_setup_incomplete/);
  assert.match(read("worker.js"), /LICENSE_SIGNING_SECRET/);
  assert.match(read("account/reset.js"), /replace\(\/\\D\/g/);
  assert.match(read("worker.js"), /SELECT id FROM customers WHERE normalized_email/);
});
