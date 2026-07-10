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
  return {
    active,
    canUseCore(product) { return active.some(({ result }) => result.product === product || result.product === "suite"); },
    canUsePlus(product) { return active.some(({ result }) => result.product === product || result.product === "suite") && active.some(({ result }) => result.product === product && result.capabilities.plus || result.product === "suite"); },
    ownsBundle() { return active.some(({ result }) => result.product === "suite" && result.capabilities.bundle); }
  };
}
