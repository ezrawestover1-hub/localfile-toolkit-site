import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { handleRequest } from "../worker.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const products = ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"];
const primaryLandingPages = [
  "ledgerlift/csv-to-iif-converter.html", "ledgerlift/bank-csv-to-iif.html", "ledgerlift/debit-credit-csv-to-iif.html", "ledgerlift/create-iif-from-spreadsheet.html",
  "pixelport/png-to-jpg-converter.html", "pixelport/jpg-to-png-converter.html", "pixelport/webp-to-png-converter.html", "pixelport/private-image-converter.html",
  "contactcraft/vcf-to-csv-converter.html", "contactcraft/csv-to-vcard-converter.html", "contactcraft/open-vcf-in-excel.html",
  "calendarflow/ics-to-csv-converter.html", "calendarflow/csv-to-ics.html", "calendarflow/open-ics-in-excel.html",
  "captionshift/srt-to-vtt-converter.html", "captionshift/vtt-to-srt-converter.html", "captionshift/ass-to-srt.html"
].filter((file) => fs.existsSync(path.join(root, file)));
const utilityRoutes = [
  "account/index.html", "account/login.html", "account/register.html", "account/verify.html", "account/reset.html",
  "license/activate.html", "license/restore.html", "license/manage.html", "checkout-portal/index.html", "checkout-portal/purchase-success.html"
];
const sitemapRoutes = [...read("sitemap.xml").matchAll(/<loc>https:\/\/localfiletoolkit\.com\/([^<]*)<\/loc>/g)].map((match) => match[1]);
const publicRoutes = sitemapRoutes.map((route) => !route || route.endsWith("/") ? `${route}index.html` : route);
const adRoutes = [
  "ledgerlift/csv-to-iif-converter.html", "ledgerlift/bank-csv-to-iif.html", "ledgerlift/debit-credit-csv-to-iif.html", "ledgerlift/create-iif-from-spreadsheet.html",
  "pixelport/png-to-jpg-converter.html", "pixelport/jpg-to-png-converter.html", "pixelport/webp-to-png-converter.html", "pixelport/private-image-converter.html",
  "contactcraft/vcf-to-csv-converter.html", "contactcraft/csv-to-vcard-converter.html", "contactcraft/open-vcf-in-excel.html",
  "calendarflow/ics-to-csv-converter.html", "calendarflow/csv-to-ics-converter.html", "calendarflow/open-ics-in-excel.html",
  "captionshift/srt-to-vtt-converter.html", "captionshift/vtt-to-srt-converter.html", "captionshift/ass-to-srt-converter.html"
].filter((file) => fs.existsSync(path.join(root, file)));

function assetForRoute(route) {
  const clean = decodeURIComponent(route.replace(/^\//, "").split(/[?#]/, 1)[0]);
  return clean.endsWith("/") ? path.join(root, clean, "index.html") : path.join(root, clean);
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const file = assetForRoute(request.url || "/");
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html" : "text/plain" }).end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

test("launch public route inventory returns HTTP 200 locally", async () => {
  const { server, port } = await startStaticServer();
  try {
    for (const route of [...new Set([...publicRoutes, ...utilityRoutes, "robots.txt", "sitemap.xml", "favicon.ico"])]) {
      const response = await fetch(`http://127.0.0.1:${port}/${route}`);
      assert.equal(response.status, 200, route);
    }
  } finally { server.close(); }
});

test("advertising destinations are public and point to working converters", () => {
  adRoutes.forEach((file) => {
    const content = read(file);
    assert.match(content, /href="(?:index\.html)?#converter/, `${file} working converter CTA`);
  });
});

test("product homepages expose pricing, privacy, security, and support", () => {
  products.forEach((product) => {
    const content = read(`${product}/index.html`);
    assert.match(content, /href="(?:\.\.\/)?pricing\.html/, `${product} pricing`);
    assert.match(content, /href="privacy\.html|href="\.\.\/privacy\.html/, `${product} privacy`);
    assert.match(content, /href="security\.html/, `${product} security`);
    assert.match(content, /href="\.\.\/support\.html/, `${product} support`);
  });
});

test("launch SEO controls keep public and utility routes separated", () => {
  const robots = read("robots.txt");
  const sitemap = read("sitemap.xml");
  assert.match(robots, /Sitemap: https:\/\/localfiletoolkit\.com\/sitemap\.xml/);
  assert.doesNotMatch(sitemap, /https:\/\/[^ ]*(?:workers\.dev|pages\.dev|localhost|127\.0\.0\.1)/i);
  ["api/", "account/", "license/", "checkout-portal/", "purchase-success", "reset", "verify"].forEach((term) => assert.doesNotMatch(sitemap, new RegExp(term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), term));
  [...new Set([...publicRoutes, ...primaryLandingPages])].forEach((file) => {
    const content = read(file);
    assert.match(content, /https:\/\/localfiletoolkit\.com\//, `${file} production metadata`);
    assert.doesNotMatch(content, /https?:\/\/(?:[^"']*\.)?(?:workers\.dev|pages\.dev)|https?:\/\/localhost|https?:\/\/127\.0\.0\.1/i, `${file} staging metadata`);
  });
  utilityRoutes.forEach((file) => assert.match(read(file), /name="robots" content="noindex,nofollow"/i, `${file} utility noindex`));
});

test("pricing and one-time product claims match the configured source of truth", () => {
  const config = read("pricing-config.js");
  const pricing = read("pricing.html");
  assert.match(config, /bundle:[\s\S]*plus: 3999/);
  ["19\\.99", "24\\.99", "2\\.99", "5\\.99", "9\\.99", "12\\.99", "6\\.99", "39\\.99", "66\\.95", "26\\.96"].forEach((price) => assert.match(pricing, new RegExp(`\\$${price}`), price));
  assert.match(pricing, /Approximately 40% off/);
  assert.doesNotMatch(`${config}\n${pricing}`, /monthly|yearly|annual/i);
});

test("public claims stay conservative and converter pages stay tracker-free", () => {
  const files = ["index.html", "pricing.html", ...publicRoutes.filter((file) => file.endsWith(".html"))];
  const forbidden = /guaranteed conversion|100% secure|cloud backup|unlimited batch size|★★★★★|\b\d[\d,.]*\s*(?:users|customers|reviews|ratings)\b/i;
  files.forEach((file) => {
    const content = read(file);
    assert.doesNotMatch(content, forbidden, file);
    assert.doesNotMatch(content, /(?<!not )(?:guarantees?|promises?|claims?)\s+(?:a\s+)?(?:perfect preservation|universal compatibility)/i, `${file} preservation/compatibility claim`);
  });
  files.forEach((file) => assert.doesNotMatch(read(file), /(?:googletagmanager|google-analytics|doubleclick|facebook\.net|connect\.facebook|hotjar|segment\.com)/i, `${file} tracking`));
  products.forEach((product) => assert.match(read(`${product}/index.html`), /LOCAL PROCESSING|locally|browser/i, `${product} local-processing claim`));
});

test("checkout wiring remains server-backed, one-unit, and disabled in the checked-in fallback", () => {
  const config = read("checkout-portal/paddle-config.js");
  const checkout = read("checkout-portal/checkout.js");
  const success = read("checkout-portal/success.js");
  assert.match(config, /checkoutEnabled: false/);
  assert.match(checkout, /items:\[\{priceId,quantity:1\}\]/);
  assert.match(checkout, /checkoutEnabled===true/);
  assert.match(success, /verified Paddle transaction|handoffAuthenticatedBuyer|mode=plus/i);
  assert.doesNotMatch(success, /grant|entitlement.*query|payment.*verified.*URL/i);
});

test("readiness endpoint exposes only safe status fields and distinguishes incomplete config", async () => {
  const response = await handleRequest(new Request("https://localfiletoolkit.com/api/readiness"), {});
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ready, false);
  assert.deepEqual(Object.keys(body).sort(), ["checks", "ready"]);
  assert.deepEqual(Object.keys(body.checks).sort(), ["authenticationEmail", "database", "durableRateLimiter", "licenseSigningSecret", "paddleProduction", "supportEmail"]);
  assert.ok(Object.values(body.checks).every((value) => typeof value === "boolean"));
  assert.doesNotMatch(JSON.stringify(body), /api[_-]?key|credential|stack|database_id/i);
});
