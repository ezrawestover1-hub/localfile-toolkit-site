import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignored = new Set([".git", "node_modules"]);

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else files.push(file);
  }
  return files;
}

function localReference(value, htmlFile) {
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean || clean.startsWith("#") || /^(?:data|blob|mailto|javascript):/i.test(clean) || /^https?:\/\//i.test(clean)) return null;
  let decoded;
  try { decoded = decodeURIComponent(clean); } catch { return null; }
  return decoded.startsWith("/") ? resolve(root, `.${decoded}`) : resolve(htmlFile, "..", decoded);
}

const files = walk(root);
const javascriptFiles = files.filter((file) => /\.(?:js|mjs)$/i.test(file));
const htmlFiles = files.filter((file) => /\.html$/i.test(file));
const failures = [];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${relative(root, file)}\n${(result.stderr || result.stdout).trim()}`);
}

const attributePattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(attributePattern)) {
    const target = localReference(match[1], file);
    if (target && !statSafe(target)) failures.push(`${relative(root, file)} references missing local asset ${match[1]}`);
  }
}

function statSafe(file) {
  try { return statSync(file).isFile(); } catch { return false; }
}

if (failures.length) {
  console.error(`Build failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  console.error(failures.join("\n\n"));
  process.exitCode = 1;
} else {
  console.log(`Build passed: syntax-checked ${javascriptFiles.length} JavaScript files and verified local references in ${htmlFiles.length} HTML files.`);
}
