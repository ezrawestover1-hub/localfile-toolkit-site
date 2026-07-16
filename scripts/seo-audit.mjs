import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteOrigin = "https://localfiletoolkit.com";
const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(/<loc>(https:\/\/localfiletoolkit\.com\/[^<]*)<\/loc>/g)].map((match) => match[1]);
const errors = [];

function read(file) {
  return readFileSync(join(root, file), "utf8");
}

function meta(content, attribute, value) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.match(new RegExp(`<meta[^>]+${attribute}=["']${escapedValue}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1]
    || content.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${escapedValue}["']`, "i"))?.[1]
    || "";
}

function canonical(content) {
  return content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    || content.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    || "";
}

function fileForUrl(url) {
  const pathname = new URL(url).pathname;
  return pathname === "/" ? "index.html" : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
}

function walkHtml(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return walkHtml(file);
    return entry.isFile() && entry.name.endsWith(".html") ? [relative(root, file)] : [];
  });
}

if (!urls.length) errors.push("sitemap.xml has no LocalFile Toolkit URLs");
if (new Set(urls).size !== urls.length) errors.push("sitemap.xml contains duplicate URLs");

for (const url of urls) {
  const file = fileForUrl(url);
  if (!existsSync(join(root, file))) {
    errors.push(`${file}: sitemap target is missing`);
    continue;
  }

  const content = read(file);
  const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "";
  const description = meta(content, "name", "description");
  const robots = meta(content, "name", "robots");
  const h1Count = (content.match(/<h1\b/gi) || []).length;

  if (!title) errors.push(`${file}: missing title`);
  if (!description) errors.push(`${file}: missing meta description`);
  if (canonical(content) !== url) errors.push(`${file}: canonical does not match sitemap URL`);
  if (robots !== "index,follow") errors.push(`${file}: expected robots index,follow`);
  if (h1Count !== 1) errors.push(`${file}: expected one H1, found ${h1Count}`);
  if (!meta(content, "property", "og:title")) errors.push(`${file}: missing Open Graph title`);
  if (!meta(content, "property", "og:description")) errors.push(`${file}: missing Open Graph description`);
  if (meta(content, "property", "og:url") !== url) errors.push(`${file}: Open Graph URL does not match sitemap URL`);
  if (!meta(content, "property", "og:type")) errors.push(`${file}: missing Open Graph type`);
  if (!meta(content, "name", "twitter:title")) errors.push(`${file}: missing Twitter title`);
  if (!meta(content, "name", "twitter:description")) errors.push(`${file}: missing Twitter description`);
  if (!meta(content, "name", "twitter:card")) errors.push(`${file}: missing Twitter card`);
  if (/<meta[^>]+name=["']keywords["']/i.test(content)) errors.push(`${file}: meta keywords is not allowed`);

  for (const script of content.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(script[1]); } catch { errors.push(`${file}: invalid JSON-LD`); }
  }
}

const utilityFiles = ["account", "checkout-portal", "license"].flatMap((directory) => walkHtml(join(root, directory)));
for (const file of utilityFiles) {
  const content = read(file);
  if (meta(content, "name", "robots") !== "noindex,nofollow") errors.push(`${file}: utility route must be noindex,nofollow`);
  if (urls.includes(`${siteOrigin}/${file}`)) errors.push(`${file}: utility route must not appear in sitemap.xml`);
}

const publicHtml = urls.map(fileForUrl);
for (const file of publicHtml) {
  if (/LocalFile Tools/.test(read(file))) errors.push(`${file}: legacy LocalFile Tools wording remains`);
}

if (errors.length) {
  console.error(`SEO audit failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`SEO audit passed: ${urls.length} indexable sitemap URLs and ${utilityFiles.length} private utility pages are correctly separated.`);
}
