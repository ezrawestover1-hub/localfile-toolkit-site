import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the standalone SEO audit passes against the public sitemap and utility routes", () => {
  const result = spawnSync(process.execPath, ["scripts/seo-audit.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /48 indexable sitemap URLs/);
  assert.match(result.stdout, /10 private utility pages/);
});

test("the SEO baseline records the operating rules without overclaiming search results", () => {
  const baseline = read("SEO_SEARCH_BASELINE.md");
  assert.match(baseline, /npm run seo:audit/);
  assert.match(baseline, /Search Console accepts/);
  assert.match(baseline, /Performance and Core Web Vitals data are still too new/);
  assert.match(baseline, /Do not add a `meta keywords` tag/);
  assert.match(baseline, /Account, license, and checkout routes/);
  assert.doesNotMatch(baseline, /guaranteed rankings|first-page ranking|SEO success/i);
});

test("public suite pages use the LocalFile Toolkit name while internal route keys remain stable", () => {
  ["index.html", "pricing.html", "support.html", "contact.html", "ledgerlift/index.html", "pixelport/index.html"].forEach((file) => {
    const content = read(file);
    assert.match(content, /LocalFile Toolkit/);
    assert.doesNotMatch(content, /LocalFile Tools/);
  });
  assert.match(read("pricing-config.js"), /ledgerlift/);
  assert.match(read("pricing-config.js"), /pixelport/);
});

test("the suite homepage supplies conservative WebSite structured data", () => {
  const home = read("index.html");
  const structuredData = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((match) => JSON.parse(match[1]));
  assert.ok(structuredData.some((item) => item["@type"] === "WebSite" && item.name === "LocalFile Toolkit" && item.url === "https://localfiletoolkit.com/"));
  assert.doesNotMatch(home, /aggregateRating|reviewCount|ratingValue|SearchAction/i);
});
