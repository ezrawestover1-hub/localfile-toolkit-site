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
const ACCOUNT_COOKIE = "lft_account_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function randomToken(prefix) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}_${bytesToBase64Url(bytes)}`;
}

function cookieValue(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  return cookies.split(";").map((part) => part.trim().split("=", 2)).find(([key]) => key === name)?.[1] || "";
}

function setAccountCookie(response, token, maxAge = SESSION_MAX_AGE) {
  response.headers.set("Set-Cookie", `${ACCOUNT_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return response;
}

async function accountUser(request, env) {
  const raw = cookieValue(request, ACCOUNT_COOKIE);
  if (!raw || !env.LICENSE_DB) return null;
  const sessionHash = await sha256(raw);
  const row = await env.LICENSE_DB.prepare("SELECT s.id AS session_id, s.user_id, s.expires_at, u.normalized_email FROM account_sessions s JOIN account_users u ON u.id = s.user_id WHERE s.session_hash = ?").bind(sessionHash).first();
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
  await env.LICENSE_DB.prepare("UPDATE account_sessions SET last_seen_at = ? WHERE id = ?").bind(nowIso(), row.session_id).run();
  return row;
}

async function sendLoginEmail(env, email, link) {
  const apiUrl = env.AUTH_EMAIL_API_URL;
  const apiKey = env.AUTH_EMAIL_API_KEY;
  const from = env.AUTH_EMAIL_FROM_ADDRESS;
  if (!apiUrl || !apiKey || !from) return { ok: false, setup: true };
  try {
    const response = await fetch(apiUrl, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [email], subject: "Your LocalFile Toolkit sign-in link", text: `Use this secure link to sign in to LocalFile Toolkit:\n\n${link}\n\nThis link expires in 15 minutes. If you did not request it, you can ignore this email.` }) });
    return { ok: response.ok, setup: false };
  } catch { return { ok: false, setup: false }; }
}

async function handleLoginRequest(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return json({ ok: false, message: "Enter a valid email address." }, 400);
  const createdAt = nowIso();
  const userId = id("user");
  await env.LICENSE_DB.prepare("INSERT INTO account_users (id,normalized_email,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(normalized_email) DO UPDATE SET updated_at = excluded.updated_at").bind(userId, email, createdAt, createdAt).run();
  const user = await env.LICENSE_DB.prepare("SELECT id FROM account_users WHERE normalized_email = ?").bind(email).first();
  const rawToken = randomToken("login");
  await env.LICENSE_DB.prepare("INSERT INTO account_login_tokens (id,user_id,token_hash,expires_at,used_at,created_at) VALUES (?,?,?,?,?,?)").bind(id("login"), user.id, await sha256(rawToken), new Date(Date.now() + 15 * 60 * 1000).toISOString(), null, createdAt).run();
  const origin = new URL(request.url).origin;
  const delivery = await sendLoginEmail(env, email, `${origin}/api/account/verify?token=${encodeURIComponent(rawToken)}`);
  const response = { ok: true, message: "If that address can receive mail, a sign-in link is on its way." };
  if (env.DEVELOPMENT === "true" && delivery.setup) response.development_login_url = `${origin}/api/account/verify?token=${encodeURIComponent(rawToken)}`;
  if (!delivery.ok && !delivery.setup) return json({ ok: false, message: "We could not send the sign-in email right now." }, 502);
  return json(response, 202);
}

async function handleLoginVerify(request, env) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token || !env.LICENSE_DB) return Response.redirect(`${new URL(request.url).origin}/account/login.html?error=invalid`, 303);
  const row = await env.LICENSE_DB.prepare("SELECT id,user_id,expires_at,used_at FROM account_login_tokens WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) return Response.redirect(`${new URL(request.url).origin}/account/login.html?error=expired`, 303);
  const now = nowIso();
  await env.LICENSE_DB.prepare("UPDATE account_login_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, row.id).run();
  const rawSession = randomToken("session");
  await env.LICENSE_DB.prepare("INSERT INTO account_sessions (id,user_id,session_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)").bind(id("session"), row.user_id, await sha256(rawSession), new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(), now, now).run();
  return setAccountCookie(Response.redirect(`${new URL(request.url).origin}/account/`, 303), rawSession);
}

async function handleAccountMe(request, env) {
  const user = await accountUser(request, env);
  if (!user) return json({ authenticated: false }, 401);
  const customer = await env.LICENSE_DB.prepare("SELECT id,paddle_customer_id,normalized_email,created_at FROM customers WHERE normalized_email = ?").bind(user.normalized_email).first();
  const entitlements = customer ? await env.LICENSE_DB.prepare("SELECT product_key,plan_key,status,transaction_id,created_at FROM entitlements WHERE customer_id = ? AND status = 'active' ORDER BY created_at DESC").bind(customer.id).all() : { results: [] };
  return json({ authenticated: true, email: user.normalized_email, customer: customer ? { paddle_customer_id: customer.paddle_customer_id, created_at: customer.created_at } : null, entitlements: entitlements.results || [] });
}

async function handleAccountRestore(request, env) {
  const user = await accountUser(request, env);
  if (!user) return json({ error: "not_authenticated" }, 401);
  const body = await readJsonObject(request);
  const installationId = String(body?.installation_id || "").trim();
  if (installationId.length < 16 || installationId.length > 256) return json({ error: "invalid_installation" }, 400);
  const customer = await env.LICENSE_DB.prepare("SELECT id FROM customers WHERE normalized_email = ?").bind(user.normalized_email).first();
  if (!customer) return json({ entitlements: [] });
  const rows = await env.LICENSE_DB.prepare("SELECT e.id,e.product_key,e.plan_key,a.token_id FROM entitlements e LEFT JOIN activations a ON a.entitlement_id = e.id AND a.installation_id_hash = ? AND a.revoked_at IS NULL WHERE e.customer_id = ? AND e.status = 'active'").bind(await sha256(installationId), customer.id).all();
  const tokens = [];
  const createdAt = nowIso();
  for (const row of rows.results || []) {
    let tokenId = row.token_id;
    if (!tokenId) {
      const candidate = id("tok");
      await env.LICENSE_DB.prepare("INSERT INTO activations (id,entitlement_id,installation_id_hash,token_id,created_at,last_seen_at,revoked_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(entitlement_id,installation_id_hash) DO NOTHING").bind(id("act"), row.id, await sha256(installationId), candidate, createdAt, createdAt, null).run();
      const activation = await env.LICENSE_DB.prepare("SELECT token_id FROM activations WHERE entitlement_id = ? AND installation_id_hash = ? AND revoked_at IS NULL").bind(row.id, await sha256(installationId)).first();
      tokenId = activation?.token_id;
    }
    if (tokenId) tokens.push(await signEntitlement(env.LICENSE_SIGNING_SECRET, { v: 1, token_id: tokenId, product: row.product_key, plan: row.plan_key, iat: Math.floor(Date.now() / 1000), exp: null }));
  }
  return json({ entitlements: tokens });
}

async function handleLogout(request, env) {
  const raw = cookieValue(request, ACCOUNT_COOKIE);
  if (raw && env.LICENSE_DB) await env.LICENSE_DB.prepare("DELETE FROM account_sessions WHERE session_hash = ?").bind(await sha256(raw)).run();
  return setAccountCookie(Response.redirect(`${new URL(request.url).origin}/account/login.html`, 303), "", 0);
}

async function handlePortalSession(request, env) {
  const user = await accountUser(request, env);
  if (!user) return json({ error: "not_authenticated" }, 401);
  const customer = await env.LICENSE_DB.prepare("SELECT paddle_customer_id FROM customers WHERE normalized_email = ?").bind(user.normalized_email).first();
  if (!customer?.paddle_customer_id) return json({ error: "no_paddle_customer", message: "Complete a purchase with this email before opening billing management." }, 404);
  if (!env.PADDLE_API_KEY || !env.PADDLE_API_BASE_URL) return json({ error: "billing_setup_incomplete", message: "Paddle account management is not configured yet." }, 503);
  const response = await fetch(`${env.PADDLE_API_BASE_URL.replace(/\/$/, "")}/customers/${encodeURIComponent(customer.paddle_customer_id)}/portal-sessions`, { method: "POST", headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({}) });
  if (!response.ok) return json({ error: "billing_unavailable" }, 502);
  const result = await response.json();
  const url = result?.data?.urls?.general?.overview;
  return url ? json({ url }) : json({ error: "billing_unavailable" }, 502);
}

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
  if (request.method === "POST" && url.pathname === "/api/account/login") return handleLoginRequest(request, env);
  if (request.method === "GET" && url.pathname === "/api/account/verify") return handleLoginVerify(request, env);
  if (request.method === "GET" && url.pathname === "/api/account/me") return handleAccountMe(request, env);
  if (request.method === "POST" && url.pathname === "/api/account/restore") return handleAccountRestore(request, env);
  if (request.method === "POST" && url.pathname === "/api/account/portal") return handlePortalSession(request, env);
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/account/logout") return handleLogout(request, env);
  if (request.method === "POST" && url.pathname === "/api/paddle/webhook") return handleWebhook(request, env);
  if (request.method === "POST" && url.pathname === "/api/license/claim") return handleClaim(request, env);
  if (request.method === "POST" && url.pathname === "/api/license/restore/request") return handleRestore(request, env);
  if (request.method === "POST" && url.pathname === "/api/license/verify") return handleVerify(request, env);
  if (request.method === "POST" && url.pathname === "/api/contact") return handleContact(request, env);
  if (request.method === "POST" && url.pathname === "/api/refund-request") return handleRefundRequest(request, env);
  return env.ASSETS.fetch(request);
}

export default { fetch: handleRequest };
