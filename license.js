const STORAGE_KEY = "localfile-toolkit-entitlements";

function readTokens() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((token) => typeof token === "string") : [];
  } catch { return []; }
}

function writeTokens(tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(tokens)]));
}

export function getStoredEntitlements() { return readTokens(); }

export function removeStoredEntitlement(token) {
  writeTokens(readTokens().filter((candidate) => candidate !== token));
}

export function addStoredEntitlement(token) {
  writeTokens([...readTokens(), token]);
}

export function getInstallationId() {
  const key = "localfile-toolkit-installation-id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export async function restoreEntitlements() {
  const response = await fetch("/api/account/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ installation_id: getInstallationId() }),
    credentials: "same-origin",
    cache: "no-store"
  }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  if (!response?.ok) return { ok: false, status: response?.status || 0, result };
  const tokens = Array.isArray(result?.entitlements) ? result.entitlements.filter((token) => typeof token === "string") : [];
  tokens.forEach(addStoredEntitlement);
  return { ok: true, status: response.status, result, tokens };
}

export async function verifyEntitlement(token) {
  const response = await fetch("/api/license/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entitlement: token })
  });
  if (!response.ok) return null;
  const result = await response.json();
  return result.valid ? result : null;
}

export async function getCapabilities() {
  const results = await Promise.all(readTokens().map(async (token) => ({ token, result: await verifyEntitlement(token).catch(() => null) })));
  const active = results.filter(({ result }) => result);
  const bundle = active.some(({ result }) => result.product === "suite" && result.plan === "bundle" && result.capabilities.bundle === true);
  const planFor = (product) => {
    if (bundle) return "plus";
    return active.some(({ result }) => result.product === product && result.plan === "plus") ? "plus" : active.some(({ result }) => result.product === product && ["standard", "plus"].includes(result.plan)) ? "standard" : "free";
  };
  return {
    active,
    bundle,
    planFor,
    ownsProduct(product) { return planFor(product) !== "free"; },
    canUseCore(product) { return planFor(product) !== "free"; },
    canUsePlus(product) { return planFor(product) === "plus"; },
    ownsBundle() { return bundle; }
  };
}
