const SUPPORTED_EVENTS = new Set(["transaction.completed"]);
const MAX_SIGNATURE_AGE_SECONDS = 300;
const PRODUCTS = ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"];
const SUPPORT_EMAIL = "localfiletools.support@gmail.com";
const rateBuckets = new Map();

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const nowIso = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const cleanText = (value, max) => String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const clientKey = (request) => request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

async function allowSubmission(request, env) {
  const key = clientKey(request);
  if (env.RATE_LIMITER?.limit) {
    try { if (!(await env.RATE_LIMITER.limit({ key })).success) return false; } catch { /* Optional binding failure must not expose details. */ }
  }
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > 10 * 60 * 1000) { rateBuckets.set(key, { startedAt: now, count: 1 }); return true; }
  bucket.count += 1;
  return bucket.count <= 8;
}

async function readJsonObject(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}

function hasOnlyKeys(body, allowed) {
  return Object.keys(body).every((key) => allowed.has(key));
}

async function sendSupportEmail(env, subject, fields) {
  const apiUrl = env.SUPPORT_EMAIL_API_URL;
  const apiKey = env.SUPPORT_EMAIL_API_KEY;
  const from = env.SUPPORT_EMAIL_FROM_ADDRESS;
  const recipient = env.SUPPORT_RECIPIENT_EMAIL || SUPPORT_EMAIL;
  if (!apiUrl || !apiKey || !from || !recipient) return { ok: false, setup: true };
  const text = Object.entries(fields).map(([key, value]) => `${key}: ${cleanText(value, 5000)}`).join("\n\n");
  try {
    const response = await fetch(apiUrl, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [recipient], subject, text }) });
    return { ok: response.ok, setup: false };
  } catch { return { ok: false, setup: false }; }
}

function deliveryResponse(result) {
  if (result.ok) return json({ ok: true, message: "Your message has been sent to LocalFile Toolkit support." }, 202);
  if (result.setup) return json({ ok: false, setup_mode: true, message: "Support email delivery is not configured yet.", fallback: `mailto:${SUPPORT_EMAIL}` }, 503);
  return json({ ok: false, message: "We could not send the request right now. Please try again or use the support email link." }, 502);
}

async function handleContact(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const allowed = new Set(["name", "email", "topic", "product", "subject", "message", "transaction_id", "consent", "honeypot"]);
  if (!body || !hasOnlyKeys(body, allowed)) return json({ ok: false, message: "Please check the form and try again." }, 400);
  if (body.honeypot) return new Response(null, { status: 204 });
  const fields = { name: cleanText(body.name, 120), email: normalizeEmail(body.email), topic: cleanText(body.topic, 80), product: cleanText(body.product, 80), subject: cleanText(body.subject, 180), message: cleanText(body.message, 5000), transaction_id: cleanText(body.transaction_id, 140) };
  const topics = new Set(["General question", "Technical support", "Purchase or billing", "License activation", "Privacy question", "Refund request", "Other"]);
  const products = new Set(["LocalFile Toolkit", "LedgerLift", "PixelPort", "ContactCraft", "CalendarFlow", "CaptionShift", "Five-product bundle"]);
  if (!fields.name || !validEmail(fields.email) || !topics.has(fields.topic) || !products.has(fields.product) || !fields.subject || !fields.message || body.consent !== true) return json({ ok: false, message: "Please check the form and try again." }, 400);
  const result = await sendSupportEmail(env, "[LocalFile Toolkit Contact] " + fields.subject, fields);
  return deliveryResponse(result);
}

async function handleRefundRequest(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const allowed = new Set(["name", "email", "transaction_id", "product", "plan", "purchase_date", "reason", "details", "accurate", "honeypot"]);
  if (!body || !hasOnlyKeys(body, allowed)) return json({ ok: false, message: "Please check the form and try again." }, 400);
  if (body.honeypot) return new Response(null, { status: 204 });
  const fields = { name: cleanText(body.name, 120), email: normalizeEmail(body.email), transaction_id: cleanText(body.transaction_id, 140), product: cleanText(body.product, 80), plan: cleanText(body.plan, 80), purchase_date: cleanText(body.purchase_date, 40), reason: cleanText(body.reason, 160), details: cleanText(body.details, 5000) };
  const products = new Set(["LedgerLift", "PixelPort", "ContactCraft", "CalendarFlow", "CaptionShift", "Five-product bundle"]);
  const plans = new Set(["Standard", "Plus", "Five-product bundle"]);
  if (!fields.name || !validEmail(fields.email) || !fields.transaction_id || !products.has(fields.product) || !plans.has(fields.plan) || !/^\d{4}-\d{2}-\d{2}$/.test(fields.purchase_date) || !fields.reason || !fields.details || body.accurate !== true) return json({ ok: false, message: "Please check the form and try again." }, 400);
  const result = await sendSupportEmail(env, "[LocalFile Toolkit Refund Request] " + fields.reason, fields);
  return deliveryResponse(result);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const utf8 = (value) => new TextEncoder().encode(value);
const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (value) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(value))));

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(value)));
}

async function verifyHmac(secret, value, expectedHex) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(expectedHex || "")) return false;
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(expectedHex.match(/.{2}/g).map((pair) => parseInt(pair, 16)));
  return crypto.subtle.verify("HMAC", key, signature, utf8(value));
}

function parsePaddleSignature(header) {
  const parts = Object.fromEntries(String(header || "").split(";").map((part) => part.split("=", 2)).filter(([key, value]) => key && value));
  return { timestamp: Number(parts.ts), hash: parts.h1 };
}

async function signEntitlement(secret, payload) {
  const body = bytesToBase64Url(utf8(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmac(secret, body));
  return `${body}.${signature}`;
}

async function verifyEntitlement(secret, token) {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra || !secret) return null;
  try {
    const expected = await hmac(secret, body);
    const actual = base64UrlToBytes(signature);
    if (actual.length !== expected.length || !(await crypto.subtle.verify("HMAC", await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]), actual, utf8(body)))) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
    if (payload.v !== 1 || !payload.token_id || !payload.product || !payload.plan || !payload.iat) return null;
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function priceMap(env) {
  return new Map([
    [env.PADDLE_PRICE_LEDGERLIFT_STANDARD, ["ledgerlift", "standard"]],
    [env.PADDLE_PRICE_LEDGERLIFT_PLUS, ["ledgerlift", "plus"]],
    [env.PADDLE_PRICE_PIXELPORT_STANDARD, ["pixelport", "standard"]],
    [env.PADDLE_PRICE_PIXELPORT_PLUS, ["pixelport", "plus"]],
    [env.PADDLE_PRICE_CONTACTCRAFT_STANDARD, ["contactcraft", "standard"]],
    [env.PADDLE_PRICE_CONTACTCRAFT_PLUS, ["contactcraft", "plus"]],
    [env.PADDLE_PRICE_CALENDARFLOW_STANDARD, ["calendarflow", "standard"]],
    [env.PADDLE_PRICE_CALENDARFLOW_PLUS, ["calendarflow", "plus"]],
    [env.PADDLE_PRICE_CAPTIONSHIFT_STANDARD, ["captionshift", "standard"]],
    [env.PADDLE_PRICE_CAPTIONSHIFT_PLUS, ["captionshift", "plus"]],
    [env.PADDLE_PRICE_SUITE_BUNDLE, ["suite", "bundle"]]
  ].filter(([price]) => price && !String(price).includes("replace")));
}

function lineItemPriceIds(data) {
  return [...new Set((Array.isArray(data?.items) ? data.items : []).map((item) => item?.price?.id || item?.price_id).filter(Boolean))];
}

function entitlementsForPrices(priceIds, env) {
  const map = priceMap(env);
  const products = [];
  for (const priceId of priceIds) {
    const mapped = map.get(priceId);
    if (!mapped) throw new Error("unknown_price");
    if (mapped[1] === "bundle") return PRODUCTS.map((product) => [product, "plus"]);
    products.push(mapped);
  }
  return products;
}

function activationCode() {
  const random = new Uint8Array(18);
  crypto.getRandomValues(random);
  return `LFT-${bytesToBase64Url(random).toUpperCase()}`;
}

async function handleWebhook(request, env) {
  const raw = await request.text();
  const { timestamp, hash } = parsePaddleSignature(request.headers.get("Paddle-Signature"));
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_SIGNATURE_AGE_SECONDS || !(await verifyHmac(env.PADDLE_WEBHOOK_SECRET, `${timestamp}:${raw}`, hash))) return json({ error: "invalid_signature" }, 400);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  if (!event.event_id || !SUPPORTED_EVENTS.has(event.event_type)) return json({ accepted: false }, 202);
  const priceIds = lineItemPriceIds(event.data);
  let grants;
  try { grants = entitlementsForPrices(priceIds, env); } catch { return json({ error: "unsupported_price" }, 422); }
  if (!event.data?.id || !event.data?.customer_id) return json({ error: "invalid_transaction" }, 422);
  const processedAt = nowIso();
  const payloadHash = await sha256(raw);
  const customerId = id("cus");
  const transactionId = String(event.data.id);
  const email = normalizeEmail(event.data?.customer?.email || event.data?.customer_email);
  try {
    await env.LICENSE_DB.prepare("INSERT INTO paddle_events (event_id,event_type,occurred_at,processed_at,transaction_id,payload_hash) VALUES (?,?,?,?,?,?)").bind(event.event_id, event.event_type, event.occurred_at || null, processedAt, transactionId, payloadHash).run();
  } catch {
    return json({ accepted: true, duplicate: true }, 200);
  }
  const customer = await env.LICENSE_DB.prepare("SELECT id FROM customers WHERE paddle_customer_id = ?").bind(String(event.data.customer_id)).first();
  const actualCustomerId = customer?.id || customerId;
  const statements = [];
  if (!customer) statements.push(env.LICENSE_DB.prepare("INSERT INTO customers (id,paddle_customer_id,normalized_email,created_at,updated_at) VALUES (?,?,?,?,?)").bind(actualCustomerId, String(event.data.customer_id), email || null, processedAt, processedAt));
  else statements.push(env.LICENSE_DB.prepare("UPDATE customers SET normalized_email = ?, updated_at = ? WHERE id = ?").bind(email || null, processedAt, actualCustomerId));
  const codes = [];
  for (const [product, plan] of grants) {
    const entitlementId = id("ent");
    const codeId = id("code");
    const code = activationCode();
    codes.push(code);
    statements.push(env.LICENSE_DB.prepare("INSERT INTO entitlements (id,customer_id,transaction_id,product_key,plan_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(entitlementId, actualCustomerId, transactionId, product, plan, "active", processedAt, processedAt));
    statements.push(env.LICENSE_DB.prepare("INSERT INTO activation_codes (id,entitlement_id,code_hash,expires_at,redeemed_at,created_at) VALUES (?,?,?,?,?,?)").bind(codeId, entitlementId, await sha256(code), null, null, processedAt));
  }
  await env.LICENSE_DB.batch(statements);
  const response = { accepted: true, fulfilled: grants.length };
  if (env.DEVELOPMENT === "true") response.development_activation_codes = codes;
  return json(response);
}

async function handleClaim(request, env) {
  const body = await request.json().catch(() => null);
  const code = String(body?.activation_code || "").trim();
  const installationId = String(body?.installation_id || "").trim();
  if (!code || installationId.length < 16 || installationId.length > 256) return json({ error: "invalid_request" }, 400);
  const codeHash = await sha256(code);
  const row = await env.LICENSE_DB.prepare("SELECT ac.id, ac.entitlement_id, e.product_key, e.plan_key, e.status FROM activation_codes ac JOIN entitlements e ON e.id = ac.entitlement_id WHERE ac.code_hash = ?").bind(codeHash).first();
  if (!row || row.status !== "active") return json({ error: "invalid_activation_code" }, 400);
  const createdAt = nowIso();
  const tokenId = id("tok");
  const installationHash = await sha256(installationId);
  const activationId = id("act");
  const existing = await env.LICENSE_DB.prepare("SELECT id,token_id FROM activations WHERE entitlement_id = ? AND installation_id_hash = ? AND revoked_at IS NULL").bind(row.entitlement_id, installationHash).first();
  if (existing) return json({ error: "already_activated" }, 409);
  let batchResult;
  try {
    batchResult = await env.LICENSE_DB.batch([
      env.LICENSE_DB.prepare("INSERT INTO activations (id,entitlement_id,installation_id_hash,token_id,created_at,last_seen_at,revoked_at) SELECT ?,?,?,?, ?,?,? WHERE EXISTS (SELECT 1 FROM activation_codes WHERE id = ? AND redeemed_at IS NULL)").bind(activationId, row.entitlement_id, installationHash, tokenId, createdAt, createdAt, null, row.id),
      env.LICENSE_DB.prepare("UPDATE activation_codes SET redeemed_at = ? WHERE id = ? AND redeemed_at IS NULL").bind(createdAt, row.id)
    ]);
  } catch {
    return json({ error: "activation_unavailable" }, 409);
  }
  if (!batchResult?.[0]?.meta?.changes) return json({ error: "invalid_activation_code" }, 400);
  const token = await signEntitlement(env.LICENSE_SIGNING_SECRET, { v: 1, token_id: tokenId, product: row.product_key, plan: row.plan_key, iat: Math.floor(Date.now() / 1000), exp: null });
  return json({ entitlement: token });
}

async function handleRestore(request, env) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ message: "If an account matches, restore instructions will be sent." });
  if (env.DEVELOPMENT === "true") {
    const count = await env.LICENSE_DB.prepare("SELECT COUNT(*) AS count FROM customers WHERE normalized_email = ?").bind(email).first();
    await env.LICENSE_DB.prepare("INSERT INTO restore_requests (id,normalized_email,matched_entitlements,delivery_status,created_at) VALUES (?,?,?,?,?)").bind(id("restore"), email, Number(count?.count || 0), "development_only_pending", nowIso()).run();
  }
  return json({ message: "If an account matches, restore instructions will be sent." });
}

async function handleVerify(request, env) {
  const body = await request.json().catch(() => null);
  const payload = await verifyEntitlement(env.LICENSE_SIGNING_SECRET, body?.entitlement);
  if (!payload) return json({ valid: false }, 401);
  const row = await env.LICENSE_DB.prepare("SELECT a.revoked_at, e.status, e.product_key, e.plan_key FROM activations a JOIN entitlements e ON e.id = a.entitlement_id WHERE a.token_id = ?").bind(payload.token_id).first();
  if (!row || row.revoked_at || row.status !== "active" || row.product_key !== payload.product || row.plan_key !== payload.plan) return json({ valid: false }, 401);
  await env.LICENSE_DB.prepare("UPDATE activations SET last_seen_at = ? WHERE token_id = ?").bind(nowIso(), payload.token_id).run();
  return json({ valid: true, product: row.product_key, plan: row.plan_key, capabilities: { core: true, plus: row.plan_key === "plus", bundle: row.product_key === "suite" } });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ status: "ok" });
  if (request.method === "POST" && url.pathname === "/api/paddle/webhook") return handleWebhook(request, env);
  if (request.method === "POST" && url.pathname === "/api/license/claim") return handleClaim(request, env);
  if (request.method === "POST" && url.pathname === "/api/license/restore/request") return handleRestore(request, env);
  if (request.method === "POST" && url.pathname === "/api/license/verify") return handleVerify(request, env);
  if (request.method === "POST" && url.pathname === "/api/contact") return handleContact(request, env);
  if (request.method === "POST" && url.pathname === "/api/refund-request") return handleRefundRequest(request, env);
  return env.ASSETS.fetch(request);
}

export default { fetch: handleRequest };
