const SUPPORTED_EVENTS = new Set(["transaction.completed"]);
const MAX_SIGNATURE_AGE_SECONDS = 300;
const WEBHOOK_PROCESSING_LEASE_SECONDS = 60;
const PRODUCTS = ["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"];
const SUPPORT_EMAIL = "localfiletools.support@gmail.com";
const rateBuckets = new Map();
const MAX_RATE_BUCKETS = 10000;

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
const ACCOUNT_COOKIE = "__Host-lft_account_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const PASSWORD_ITERATIONS = 2000;
const PASSWORD_MIN_LENGTH = 8;

export function summarizeEntitlements(items) {
  const active = Array.isArray(items) ? items.filter((item) => item?.status === undefined || item.status === "active") : [];
  const bundle = active.some((item) => item.product_key === "suite" && item.plan_key === "bundle");
  const products = Object.fromEntries(PRODUCTS.map((product) => {
    const owned = active.filter((item) => item.product_key === product && ["standard", "plus"].includes(item.plan_key));
    const highest = owned.some((item) => item.plan_key === "plus") ? "plus" : owned.length ? "standard" : "free";
    return [product, bundle ? "plus" : highest];
  }));
  return { active, bundle, products, highestLedgerLiftTier: products.ledgerlift, hasPurchase: bundle || active.some((item) => PRODUCTS.includes(item.product_key) && ["standard", "plus"].includes(item.plan_key)) };
}

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
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function accountRedirect(url) {
  const response = Response.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

async function accountUser(request, env) {
  const raw = cookieValue(request, ACCOUNT_COOKIE);
  if (!raw || !env.LICENSE_DB) return null;
  const sessionHash = await sha256(raw);
  const row = await env.LICENSE_DB.prepare("SELECT s.id AS session_id, s.user_id, s.expires_at, s.last_seen_at, u.normalized_email FROM account_sessions s JOIN account_users u ON u.id = s.user_id WHERE s.session_hash = ?").bind(sessionHash).first();
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    await env.LICENSE_DB.prepare("UPDATE account_sessions SET last_seen_at = ? WHERE id = ?").bind(nowIso(), row.session_id).run();
  }
  return row;
}

async function sendEmail(env, { to, subject, text }) {
  const apiUrl = env.AUTH_EMAIL_API_URL;
  const apiKey = env.AUTH_EMAIL_API_KEY;
  const from = env.AUTH_EMAIL_FROM_ADDRESS;
  if (!apiUrl || !apiKey || !from) return { ok: false, setup: true };
  try {
    const response = await fetch(apiUrl, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, text }) });
    return { ok: response.ok, setup: false };
  } catch { return { ok: false, setup: false }; }
}

function randomVerificationCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = ((bytes[0] * 0x1000000) + (bytes[1] * 0x10000) + (bytes[2] * 0x100) + bytes[3]) % 1000000;
  return String(value).padStart(6, "0");
}

async function passwordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", salt.buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  let state = utf8(password);
  for (let index = 0; index < iterations; index += 1) state = new Uint8Array(await crypto.subtle.sign("HMAC", key, state));
  return state;
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function createAccountSession(env, userId, request) {
  const rawSession = randomToken("session");
  const now = nowIso();
  await env.LICENSE_DB.prepare("INSERT INTO account_sessions (id,user_id,session_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)").bind(id("session"), userId, await sha256(rawSession), new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(), now, now).run();
  return setAccountCookie(accountRedirect(`${new URL(request.url).origin}/account/`), rawSession);
}

async function createAccountSessionJson(env, userId, message = "Password reset successfully.") {
  const rawSession = randomToken("session");
  const now = nowIso();
  await env.LICENSE_DB.prepare("INSERT INTO account_sessions (id,user_id,session_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)").bind(id("session"), userId, await sha256(rawSession), new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(), now, now).run();
  return setAccountCookie(json({ ok: true, message, redirect: "/account/" }), rawSession);
}

async function sendVerificationCode(env, email, code) {
  return sendEmail(env, { to: email, subject: "Your LocalFile Toolkit verification code", text: `Your LocalFile Toolkit verification code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.` });
}

async function issueVerificationCode(env, userId, email, purpose) {
  const code = randomVerificationCode();
  await env.LICENSE_DB.prepare("INSERT INTO account_verification_codes (id,user_id,code_hash,purpose,expires_at,used_at,created_at) VALUES (?,?,?,?,?,?,?)").bind(id("verify"), userId, await sha256(code), purpose, new Date(Date.now() + 15 * 60 * 1000).toISOString(), null, nowIso()).run();
  return sendVerificationCode(env, email, code);
}

async function stagePassword(env, userId, password, createdAt) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = bytesToBase64Url(await passwordHash(password, salt));
  await env.LICENSE_DB.prepare("INSERT INTO account_pending_passwords (user_id,password_hash,password_salt,iterations,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, iterations = excluded.iterations, created_at = excluded.created_at").bind(userId, hash, bytesToBase64Url(salt), PASSWORD_ITERATIONS, createdAt).run();
  await env.LICENSE_DB.prepare("INSERT INTO account_passwords (user_id,password_hash,password_salt,iterations,verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING").bind(userId, hash, bytesToBase64Url(salt), PASSWORD_ITERATIONS, null, createdAt, createdAt).run();
}

async function activateStagedPassword(env, userId, now) {
  const pending = await env.LICENSE_DB.prepare("SELECT password_hash,password_salt,iterations FROM account_pending_passwords WHERE user_id = ?").bind(userId).first();
  if (!pending) throw new Error("pending_password_missing");
  const current = await env.LICENSE_DB.prepare("SELECT password_hash,password_salt,iterations FROM account_passwords WHERE user_id = ?").bind(userId).first();
  if (current?.password_hash) {
    try {
      await env.LICENSE_DB.prepare("INSERT INTO account_password_history (id,user_id,password_hash,password_salt,iterations,created_at) VALUES (?,?,?,?,?,?)").bind(id("pwdhist"), userId, current.password_hash, current.password_salt, current.iterations, now).run();
    } catch { console.error("password_history_write_failed"); }
  }
  await env.LICENSE_DB.prepare("INSERT INTO account_passwords (user_id,password_hash,password_salt,iterations,verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, iterations = excluded.iterations, verified_at = excluded.verified_at, updated_at = excluded.updated_at").bind(userId, pending.password_hash, pending.password_salt, pending.iterations, now, now, now).run();
  await env.LICENSE_DB.prepare("DELETE FROM account_pending_passwords WHERE user_id = ?").bind(userId).run();
}

async function purchaseEligibility(env, email) {
  try {
    return await env.LICENSE_DB.prepare("SELECT c.id FROM customers c JOIN entitlements e ON e.customer_id = c.id WHERE c.normalized_email = ? AND e.status = 'active' LIMIT 1").bind(email).first();
  } catch {
    throw new Error("purchase_eligibility_read");
  }
}

async function handleAccountRegister(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");
  if (!validEmail(email) || password.length < PASSWORD_MIN_LENGTH || password.length > 256) return json({ ok: false, message: `Use a valid email and a password of at least ${PASSWORD_MIN_LENGTH} characters.` }, 400);
  const purchase = await purchaseEligibility(env, email);
  if (!purchase?.id) return json({ ok: false, error: "purchase_required", message: "Complete a LocalFile Toolkit purchase before creating an account.", purchase_url: "/pricing.html" }, 402);
  const createdAt = nowIso();
  const userId = id("user");
  try { await env.LICENSE_DB.prepare("INSERT INTO account_users (id,normalized_email,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(normalized_email) DO UPDATE SET updated_at = excluded.updated_at").bind(userId, email, createdAt, createdAt).run(); } catch { throw new Error("account_user_write"); }
  let user;
  try { user = await env.LICENSE_DB.prepare("SELECT id FROM account_users WHERE normalized_email = ?").bind(email).first(); } catch { throw new Error("account_user_read"); }
  if (!user?.id) return json({ ok: false, message: "We could not create the account right now." }, 503);
  let existing;
  try { existing = await env.LICENSE_DB.prepare("SELECT verified_at FROM account_passwords WHERE user_id = ?").bind(user.id).first(); } catch { throw new Error("account_password_read"); }
  try { await stagePassword(env, user.id, password, createdAt); } catch { throw new Error("account_password_write"); }
  let delivery;
  try { delivery = await issueVerificationCode(env, user.id, email, "signup"); } catch { throw new Error("verification_code_write"); }
  if (!delivery.ok) return json({ ok: false, message: delivery.setup ? "Email delivery is not configured yet." : "We could not send the verification email right now." }, delivery.setup ? 503 : 502);
  return json({ ok: true, message: "Check your email for the six-digit verification code." }, 202);
}

async function handleResendCode(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return json({ ok: false, message: "Enter a valid email address." }, 400);
  const user = await env.LICENSE_DB.prepare("SELECT u.id,p.verified_at,pp.user_id AS pending_user_id FROM account_users u LEFT JOIN account_passwords p ON p.user_id = u.id LEFT JOIN account_pending_passwords pp ON pp.user_id = u.id WHERE u.normalized_email = ?").bind(email).first();
  if (!user?.id || (!user.pending_user_id && user.verified_at)) return json({ ok: true, message: "If the account can receive mail, a new code has been sent." }, 202);
  const delivery = await issueVerificationCode(env, user.id, email, "signup");
  if (!delivery.ok) return json({ ok: false, message: delivery.setup ? "Email delivery is not configured yet." : "We could not send a new code right now." }, delivery.setup ? 503 : 502);
  return json({ ok: true, message: "A new verification code has been sent." }, 202);
}

async function handlePasswordResetRequest(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return json({ ok: false, message: "Enter a valid email address." }, 400);
  let user = await env.LICENSE_DB.prepare("SELECT id FROM account_users WHERE normalized_email = ?").bind(email).first();
  if (!user?.id) {
    const customer = await env.LICENSE_DB.prepare("SELECT id FROM customers WHERE normalized_email = ?").bind(email).first();
    if (customer?.id) {
      const createdAt = nowIso();
      await env.LICENSE_DB.prepare("INSERT INTO account_users (id,normalized_email,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(normalized_email) DO NOTHING").bind(id("user"), email, createdAt, createdAt).run();
      user = await env.LICENSE_DB.prepare("SELECT id FROM account_users WHERE normalized_email = ?").bind(email).first();
    }
  }
  if (user?.id) {
    const delivery = await issueVerificationCode(env, user.id, email, "reset");
    if (!delivery.ok) return json({ ok: false, message: delivery.setup ? "Email delivery is not configured yet." : "We could not send a reset code right now." }, delivery.setup ? 503 : 502);
  }
  return json({ ok: true, message: "If an account matches, a password reset code has been sent." }, 202);
}

async function handlePasswordResetComplete(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code || "").trim();
  const password = String(body?.password || "");
  if (!validEmail(email) || !/^\d{6}$/.test(code) || password.length < PASSWORD_MIN_LENGTH || password.length > 256) return json({ ok: false, message: `Enter the code and a password of at least ${PASSWORD_MIN_LENGTH} characters.` }, 400);
  const user = await env.LICENSE_DB.prepare("SELECT u.id,p.verified_at FROM account_users u LEFT JOIN account_passwords p ON p.user_id = u.id WHERE u.normalized_email = ?").bind(email).first();
  const row = user?.id ? await env.LICENSE_DB.prepare("SELECT id,user_id,expires_at,used_at FROM account_verification_codes WHERE user_id = ? AND purpose IN ('reset','signup') AND code_hash = ? ORDER BY created_at DESC LIMIT 1").bind(user.id, await sha256(code)).first() : null;
  if (row?.used_at && user?.verified_at) return createAccountSessionJson(env, row.user_id);
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) return json({ ok: false, message: "That code is invalid or expired." }, 400);
  try {
    const now = nowIso();
    const salt = new Uint8Array(16);
    try { crypto.getRandomValues(salt); } catch { throw new Error("reset_randomness_failed"); }
    let hash;
    try { hash = bytesToBase64Url(await passwordHash(password, salt)); } catch { throw new Error("reset_hash_failed"); }
    let current;
    try { current = await env.LICENSE_DB.prepare("SELECT password_hash,password_salt,iterations FROM account_passwords WHERE user_id = ?").bind(row.user_id).first(); } catch { throw new Error("reset_current_password_read_failed"); }
    if (current?.password_hash) {
      try {
        await env.LICENSE_DB.prepare("INSERT INTO account_password_history (id,user_id,password_hash,password_salt,iterations,created_at) VALUES (?,?,?,?,?,?)").bind(id("pwdhist"), row.user_id, current.password_hash, current.password_salt, current.iterations, now).run();
      } catch { console.error("password_history_write_failed"); }
    }
    try { await env.LICENSE_DB.prepare("INSERT INTO account_passwords (user_id,password_hash,password_salt,iterations,verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, iterations = excluded.iterations, verified_at = excluded.verified_at, updated_at = excluded.updated_at").bind(row.user_id, hash, bytesToBase64Url(salt), PASSWORD_ITERATIONS, now, now, now).run(); } catch { throw new Error("reset_password_write_failed"); }
    let consumed;
    try { consumed = await env.LICENSE_DB.prepare("UPDATE account_verification_codes SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?").bind(now, row.id, now).run(); } catch { throw new Error("reset_code_consume_failed"); }
    try {
      if (!consumed?.meta?.changes) return createAccountSession(env, row.user_id, request);
      return createAccountSession(env, row.user_id, request);
    } catch {
      return json({ ok: true, message: "Password reset successfully. Please sign in with your new password." }, 200);
    }
  } catch (error) {
    const knownReasons = new Set(["reset_randomness_failed", "reset_hash_failed", "reset_current_password_read_failed", "reset_password_write_failed", "reset_code_consume_failed"]);
    const reason = knownReasons.has(error?.message) ? error.message : "password_reset_completion_failed";
    console.error("account_password_reset_failed", reason);
    const message = reason === "reset_password_write_failed"
      ? "We could not save the new password. Your verification code remains available; please try again."
      : reason === "reset_code_consume_failed"
        ? "Your password was not fully confirmed. Your verification code remains available; please try again."
      : "We could not finish the password reset. Your verification code remains available; please try again.";
    return json({ ok: false, message, diagnostic: reason }, 503);
  }
}

async function handleAccountLogin(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");
  const record = validEmail(email) ? await env.LICENSE_DB.prepare("SELECT u.id,p.password_hash,p.password_salt,p.iterations,p.verified_at FROM account_users u JOIN account_passwords p ON p.user_id = u.id WHERE u.normalized_email = ?").bind(email).first() : null;
  let valid = false;
  if (record?.password_hash && record.password_salt && record.verified_at) valid = constantTimeEqual(await passwordHash(password, base64UrlToBytes(record.password_salt), Number(record.iterations)), base64UrlToBytes(record.password_hash));
  if (!valid) return json({ ok: false, message: "Incorrect email or password." }, 401);
  return createAccountSessionJson(env, record.id, "Signed in successfully.");
}

async function handleAccountVerifyCode(request, env) {
  if (!(await allowSubmission(request, env))) return json({ ok: false, message: "Too many requests. Please try again later." }, 429);
  const body = await readJsonObject(request);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code || "").trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return json({ ok: false, message: "Enter the six-digit code from your email." }, 400);
  const user = await env.LICENSE_DB.prepare("SELECT u.id,p.verified_at FROM account_users u LEFT JOIN account_passwords p ON p.user_id = u.id WHERE u.normalized_email = ?").bind(email).first();
  const row = user?.id ? await env.LICENSE_DB.prepare("SELECT id,user_id,expires_at,used_at FROM account_verification_codes WHERE user_id = ? AND purpose IN ('signup','reset') AND code_hash = ? ORDER BY created_at DESC LIMIT 1").bind(user.id, await sha256(code)).first() : null;
  if (row?.used_at && user?.verified_at) return createAccountSession(env, row.user_id, request);
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) return json({ ok: false, message: "That code is invalid or expired." }, 400);
  try {
    const now = nowIso();
    const pending = await env.LICENSE_DB.prepare("SELECT user_id FROM account_pending_passwords WHERE user_id = ?").bind(row.user_id).first();
    if (pending) await activateStagedPassword(env, row.user_id, now);
    const consumed = await env.LICENSE_DB.prepare("UPDATE account_verification_codes SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?").bind(now, row.id, now).run();
    if (!consumed?.meta?.changes) return createAccountSessionJson(env, row.user_id);
    return createAccountSessionJson(env, row.user_id);
  } catch (error) {
    console.error("account_verify_failed", error?.message === "pending_password_missing" ? "pending_password_missing" : "verification_completion_failed");
    return json({ ok: false, message: "We could not complete verification. Request a new code and try again." }, 503);
  }
}

async function handleAccountMe(request, env) {
  const user = await accountUser(request, env);
  if (!user) return json({ authenticated: false }, 401);
  const customer = await env.LICENSE_DB.prepare("SELECT id,normalized_email,created_at FROM customers WHERE normalized_email = ?").bind(user.normalized_email).first();
  const entitlements = customer ? await env.LICENSE_DB.prepare("SELECT product_key,plan_key,status,transaction_id,created_at FROM entitlements WHERE customer_id = ? AND status = 'active' ORDER BY created_at DESC").bind(customer.id).all() : { results: [] };
  const summary = summarizeEntitlements(entitlements.results || []);
  return json({ authenticated: true, email: user.normalized_email, customer: customer ? { created_at: customer.created_at } : null, entitlements: summary.active, bundle: summary.bundle, products: summary.products, highestLedgerLiftTier: summary.highestLedgerLiftTier });
}

async function handleAccountRestore(request, env) {
  const user = await accountUser(request, env);
  if (!user) return json({ error: "not_authenticated" }, 401);
  if (!env.LICENSE_SIGNING_SECRET) return json({ error: "license_setup_incomplete", message: "License restoration is not configured yet. Add the Worker secret LICENSE_SIGNING_SECRET." }, 503);
  const body = await readJsonObject(request);
  const installationId = String(body?.installation_id || "").trim();
  if (installationId.length < 16 || installationId.length > 256) return json({ error: "invalid_installation" }, 400);
  const customer = await env.LICENSE_DB.prepare("SELECT id FROM customers WHERE normalized_email = ?").bind(user.normalized_email).first();
  if (!customer) return json({ entitlements: [] });
  const rows = await env.LICENSE_DB.prepare("SELECT e.id,e.product_key,e.plan_key,a.token_id FROM entitlements e LEFT JOIN activations a ON a.entitlement_id = e.id AND a.installation_id_hash = ? AND a.revoked_at IS NULL WHERE e.customer_id = ? AND e.status = 'active'").bind(await sha256(installationId), customer.id).all();
  const tokens = [];
  const createdAt = nowIso();
  try {
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
  } catch (error) {
    console.error("account_restore_failed", error?.message === "" ? "license_token_failed" : "license_restore_unavailable");
    return json({ error: "license_restore_unavailable", message: "License restoration is temporarily unavailable. Please try again after licensing is configured." }, 503);
  }
  return json({ entitlements: tokens });
}

async function handleLogout(request, env) {
  const raw = cookieValue(request, ACCOUNT_COOKIE);
  if (raw && env.LICENSE_DB) await env.LICENSE_DB.prepare("DELETE FROM account_sessions WHERE session_hash = ?").bind(await sha256(raw)).run();
  return setAccountCookie(accountRedirect(`${new URL(request.url).origin}/account/login.html`), "", 0);
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
  const requiresDurableRateLimiter = env.REQUIRE_DURABLE_RATE_LIMITER === "true";
  if (requiresDurableRateLimiter && !env.RATE_LIMITER?.limit) return false;
  if (env.RATE_LIMITER?.limit) {
    try {
      if (!(await env.RATE_LIMITER.limit({ key })).success) return false;
    } catch {
      if (requiresDurableRateLimiter) return false;
      // Local development may use the bounded in-memory fallback until the
      // Cloudflare Rate Limiting binding is configured.
    }
  }
  const now = Date.now();
  if (rateBuckets.size >= MAX_RATE_BUCKETS) {
    for (const [bucketKey, value] of rateBuckets) {
      if (now - value.startedAt > 10 * 60 * 1000) rateBuckets.delete(bucketKey);
      if (rateBuckets.size < MAX_RATE_BUCKETS) break;
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > 10 * 60 * 1000) { rateBuckets.set(key, { startedAt: now, count: 1 }); return true; }
  bucket.count += 1;
  return bucket.count <= 8;
}

function readinessChecks(env) {
  const paddlePriceKeys = [
    "PADDLE_PRICE_LEDGERLIFT_STANDARD", "PADDLE_PRICE_LEDGERLIFT_PLUS",
    "PADDLE_PRICE_PIXELPORT_STANDARD", "PADDLE_PRICE_PIXELPORT_PLUS",
    "PADDLE_PRICE_CONTACTCRAFT_STANDARD", "PADDLE_PRICE_CONTACTCRAFT_PLUS",
    "PADDLE_PRICE_CALENDARFLOW_STANDARD", "PADDLE_PRICE_CALENDARFLOW_PLUS",
    "PADDLE_PRICE_CAPTIONSHIFT_STANDARD", "PADDLE_PRICE_CAPTIONSHIFT_PLUS",
    "PADDLE_PRICE_SUITE_BUNDLE"
  ];
  const paddleProduction = Boolean(
    env.PADDLE_API_KEY &&
    env.PADDLE_WEBHOOK_SECRET &&
    env.PADDLE_API_BASE_URL &&
    !String(env.PADDLE_API_BASE_URL).includes("sandbox") &&
    paddlePriceKeys.every((key) => /^pri_[a-z0-9]+$/i.test(String(env[key] || "")))
  );
  return {
    database: Boolean(env.LICENSE_DB),
    licenseSigningSecret: Boolean(env.LICENSE_SIGNING_SECRET),
    paddleProduction: paddleProduction,
    authenticationEmail: Boolean(env.AUTH_EMAIL_API_URL && env.AUTH_EMAIL_API_KEY && env.AUTH_EMAIL_FROM_ADDRESS),
    supportEmail: Boolean(env.SUPPORT_EMAIL_API_URL && env.SUPPORT_EMAIL_API_KEY && env.SUPPORT_EMAIL_FROM_ADDRESS && (env.SUPPORT_RECIPIENT_EMAIL || SUPPORT_EMAIL)),
    durableRateLimiter: Boolean(env.RATE_LIMITER?.limit && env.REQUIRE_DURABLE_RATE_LIMITER === "true")
  };
}

function handleReadiness(env) {
  const checks = readinessChecks(env);
  const ready = Object.values(checks).every(Boolean);
  return json({ ready, checks }, ready ? 200 : 503);
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
    if (mapped[1] === "bundle") return [["suite", "bundle"], ...PRODUCTS.map((product) => [product, "plus"])]
      .filter((grant, index, grants) => grants.findIndex((candidate) => candidate[0] === grant[0] && candidate[1] === grant[1]) === index);
    products.push(mapped);
  }
  return products.filter((grant, index, grants) => grants.findIndex((candidate) => candidate[0] === grant[0] && candidate[1] === grant[1]) === index);
}

function activationCode() {
  const random = new Uint8Array(18);
  crypto.getRandomValues(random);
  return `LFT-${bytesToBase64Url(random).toUpperCase()}`;
}

class WebhookFailure extends Error {
  constructor(code, status = 503, retryable = true) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

async function paddleCustomerEmail(customerId, env) {
  if (!env.PADDLE_API_KEY || !env.PADDLE_API_BASE_URL) throw new WebhookFailure("customer_lookup_unavailable");
  const url = `${env.PADDLE_API_BASE_URL.replace(/\/$/, "")}/customers/${encodeURIComponent(customerId)}`;
  let response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}`, "content-type": "application/json" } });
  } catch {
    throw new WebhookFailure("customer_lookup_failed");
  }
  if (!response.ok) throw new WebhookFailure("customer_lookup_failed");
  let result;
  try { result = await response.json(); } catch { throw new WebhookFailure("customer_lookup_failed"); }
  const email = normalizeEmail(result?.data?.email);
  if (!validEmail(email)) throw new WebhookFailure("invalid_customer_email", 422, false);
  return email;
}

function webhookErrorResponse(error) {
  return json({ error: error.code }, error.status);
}

async function registerWebhookEvent(env, event, transactionId, payloadHash, processingToken, startedAt) {
  let inserted = false;
  try {
    const result = await env.LICENSE_DB.prepare("INSERT INTO paddle_events (event_id,event_type,occurred_at,processed_at,transaction_id,payload_hash,status,processing_token,processing_started_at,last_error) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING").bind(event.event_id, event.event_type, event.occurred_at || null, startedAt, transactionId, payloadHash, "processing", processingToken, startedAt, null).run();
    inserted = Boolean(result?.meta?.changes);
  } catch {
    throw new WebhookFailure("event_registration_failed");
  }
  let existing;
  try {
    existing = await env.LICENSE_DB.prepare("SELECT status,processing_token,processing_started_at FROM paddle_events WHERE event_id = ?").bind(event.event_id).first();
  } catch {
    throw new WebhookFailure("event_lookup_failed");
  }
  if (!existing) throw new WebhookFailure("event_lookup_failed");
  if (existing.status === "fulfilled") return { duplicate: true };
  if (!inserted) {
    const activeProcessing = existing.status === "processing" && existing.processing_token && existing.processing_started_at && Date.now() - new Date(existing.processing_started_at).getTime() < WEBHOOK_PROCESSING_LEASE_SECONDS * 1000;
    if (activeProcessing && existing.processing_token !== processingToken) return { busy: true };
    try {
      const claimed = await env.LICENSE_DB.prepare("UPDATE paddle_events SET status = 'processing', processing_token = ?, processing_started_at = ?, last_error = NULL WHERE event_id = ? AND (status = 'failed' OR (status = 'processing' AND (processing_token IS NULL OR processing_started_at IS NULL OR processing_started_at < ?)))").bind(processingToken, startedAt, event.event_id, new Date(Date.now() - WEBHOOK_PROCESSING_LEASE_SECONDS * 1000).toISOString()).run();
      if (!claimed?.meta?.changes) return { busy: true };
    } catch {
      throw new WebhookFailure("event_claim_failed");
    }
  }
  return { duplicate: false, busy: false };
}

async function markWebhookFailed(env, eventId, processingToken, errorCode) {
  try {
    await env.LICENSE_DB.prepare("UPDATE paddle_events SET status = 'failed', processing_token = NULL, processing_started_at = NULL, last_error = ?, processed_at = ? WHERE event_id = ? AND processing_token = ?").bind(errorCode, nowIso(), eventId, processingToken).run();
  } catch {
    // The original failure remains retriable even if recording failed state is unavailable.
  }
}

async function fulfillWebhook(env, event, grants, email, transactionId, processedAt) {
  let customer;
  try {
    customer = await env.LICENSE_DB.prepare("SELECT id FROM customers WHERE paddle_customer_id = ?").bind(String(event.data.customer_id)).first();
  } catch {
    throw new WebhookFailure("customer_lookup_db_failed");
  }
  const customerId = customer?.id || id("cus");
  const statements = [];
  if (!customer) statements.push(env.LICENSE_DB.prepare("INSERT OR IGNORE INTO customers (id,paddle_customer_id,normalized_email,created_at,updated_at) VALUES (?,?,?,?,?)").bind(customerId, String(event.data.customer_id), email, processedAt, processedAt));
  else statements.push(env.LICENSE_DB.prepare("UPDATE customers SET normalized_email = ?, updated_at = ? WHERE id = ?").bind(email, processedAt, customerId));
  try {
    await env.LICENSE_DB.batch(statements);
  } catch {
    throw new WebhookFailure("customer_write_failed");
  }
  const actualCustomer = await env.LICENSE_DB.prepare("SELECT id FROM customers WHERE paddle_customer_id = ?").bind(String(event.data.customer_id)).first();
  if (!actualCustomer?.id) throw new WebhookFailure("customer_write_failed");
  const entitlementRows = [];
  for (const [product, plan] of grants) {
    const existing = await env.LICENSE_DB.prepare("SELECT id FROM entitlements WHERE transaction_id = ? AND product_key = ? AND plan_key = ?").bind(transactionId, product, plan).first();
    if (existing?.id) entitlementRows.push({ id: existing.id, product, plan, newCode: false });
    else entitlementRows.push({ id: id("ent"), product, plan, newCode: true });
  }
  const entitlementWrites = entitlementRows.filter((row) => row.newCode).map((row) => env.LICENSE_DB.prepare("INSERT OR IGNORE INTO entitlements (id,customer_id,transaction_id,product_key,plan_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(row.id, actualCustomer.id, transactionId, row.product, row.plan, "active", processedAt, processedAt));
  try {
    if (entitlementWrites.length) await env.LICENSE_DB.batch(entitlementWrites);
  } catch {
    throw new WebhookFailure("entitlement_write_failed");
  }
  const codes = [];
  for (const row of entitlementRows) {
    const entitlement = await env.LICENSE_DB.prepare("SELECT id FROM entitlements WHERE transaction_id = ? AND product_key = ? AND plan_key = ?").bind(transactionId, row.product, row.plan).first();
    if (!entitlement?.id) throw new WebhookFailure("entitlement_write_failed");
    const existingCode = await env.LICENSE_DB.prepare("SELECT id FROM activation_codes WHERE entitlement_id = ?").bind(entitlement.id).first();
    if (existingCode) continue;
    const code = activationCode();
    const codeId = id("code");
    try {
      await env.LICENSE_DB.prepare("INSERT OR IGNORE INTO activation_codes (id,entitlement_id,code_hash,expires_at,redeemed_at,created_at) VALUES (?,?,?,?,?,?)").bind(codeId, entitlement.id, await sha256(code), null, null, processedAt).run();
    } catch {
      throw new WebhookFailure("activation_code_write_failed");
    }
    const confirmed = await env.LICENSE_DB.prepare("SELECT id FROM activation_codes WHERE entitlement_id = ?").bind(entitlement.id).first();
    if (confirmed?.id === codeId) codes.push(code);
  }
  return { fulfilled: grants.length, codes };
}

async function handleWebhook(request, env) {
  const raw = await request.text();
  const { timestamp, hash } = parsePaddleSignature(request.headers.get("Paddle-Signature"));
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_SIGNATURE_AGE_SECONDS || !(await verifyHmac(env.PADDLE_WEBHOOK_SECRET, `${timestamp}:${raw}`, hash))) return json({ error: "invalid_signature" }, 400);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  if (!event.event_id || !SUPPORTED_EVENTS.has(event.event_type)) return json({ accepted: false }, 202);
  const priceIds = lineItemPriceIds(event.data);
  if (!priceIds.length) return json({ error: "unsupported_price" }, 422);
  let grants;
  try { grants = entitlementsForPrices(priceIds, env); } catch { return json({ error: "unsupported_price" }, 422); }
  if (!grants.length) return json({ error: "unsupported_price" }, 422);
  if (!event.data?.id || !event.data?.customer_id) return json({ error: "invalid_transaction" }, 422);
  const processedAt = nowIso();
  const payloadHash = await sha256(raw);
  const transactionId = String(event.data.id);
  const processingToken = id("proc");
  let registration;
  try {
    registration = await registerWebhookEvent(env, event, transactionId, payloadHash, processingToken, processedAt);
  } catch (error) {
    return webhookErrorResponse(error);
  }
  if (registration.duplicate) return json({ accepted: true, duplicate: true });
  if (registration.busy) return json({ error: "fulfillment_in_progress" }, 409);
  let email = normalizeEmail(event.data?.customer?.email || event.data?.customer_email);
  if (!validEmail(email)) {
    try { email = await paddleCustomerEmail(String(event.data.customer_id), env); } catch (error) {
      const failure = error instanceof WebhookFailure ? error : new WebhookFailure("customer_lookup_failed");
      await markWebhookFailed(env, event.event_id, processingToken, failure.code);
      return webhookErrorResponse(failure);
    }
  }
  try {
    const result = await fulfillWebhook(env, event, grants, email, transactionId, processedAt);
    const finalized = await env.LICENSE_DB.prepare("UPDATE paddle_events SET status = 'fulfilled', processing_token = NULL, processing_started_at = NULL, last_error = NULL, processed_at = ? WHERE event_id = ? AND processing_token = ?").bind(nowIso(), event.event_id, processingToken).run();
    if (!finalized?.meta?.changes) throw new WebhookFailure("event_finalize_failed");
    const response = { accepted: true, fulfilled: result.fulfilled };
    if (env.DEVELOPMENT === "true") response.development_activation_codes = result.codes;
    return json(response);
  } catch (error) {
    const failure = error instanceof WebhookFailure ? error : new WebhookFailure("fulfillment_failed");
    await markWebhookFailed(env, event.event_id, processingToken, failure.code);
    return webhookErrorResponse(failure);
  }
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
  const isBundle = row.product_key === "suite" && row.plan_key === "bundle";
  return json({ valid: true, product: row.product_key, plan: row.plan_key, capabilities: { core: true, plus: row.plan_key === "plus" || isBundle, bundle: isBundle } });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ status: "ok" });
  if (request.method === "GET" && url.pathname === "/api/readiness") return handleReadiness(env);
  if (request.method === "POST" && url.pathname === "/api/account/register") return handleAccountRegister(request, env).catch((error) => { const reason = new Set(["purchase_eligibility_read", "account_user_write", "account_user_read", "account_password_read", "password_hash", "account_password_write", "verification_code_write"]).has(error?.message) ? error.message : "account_register_failed"; console.error("account_register_failed", reason); return json({ ok: false, message: "Account setup is temporarily unavailable. Please try again." }, 503); });
  if (request.method === "POST" && url.pathname === "/api/account/resend-code") return handleResendCode(request, env);
  if (request.method === "POST" && url.pathname === "/api/account/password-reset/request") return handlePasswordResetRequest(request, env);
  if (request.method === "POST" && url.pathname === "/api/account/password-reset/complete") return handlePasswordResetComplete(request, env).catch((error) => { console.error("account_password_reset_route_failed", error?.message || "unknown"); return json({ ok: false, message: "We could not complete the reset. Request a new code and try again." }, 503); });
  if (request.method === "POST" && url.pathname === "/api/account/login") return handleAccountLogin(request, env);
  if (request.method === "POST" && url.pathname === "/api/account/verify-code") return handleAccountVerifyCode(request, env);
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
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/") {
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  }
  return env.ASSETS.fetch(request);
}

export default { fetch: handleRequest };
