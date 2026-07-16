import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, webcrypto } from "node:crypto";
import { handleRequest } from "../worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const email = "ezra@example.com";
const userId = "user_1";
const pbkdf2Iterations = 100000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function legacyPasswordRecord(password = "OriginalPass!1") {
  const salt = Buffer.from("0123456789abcdef");
  let state = Buffer.from(password);
  for (let index = 0; index < 2000; index += 1) state = createHmac("sha256", salt).update(state).digest();
  return { password_hash: base64Url(state), password_salt: base64Url(salt), iterations: 2000, algorithm: "hmac-sha256", verified_at: new Date().toISOString() };
}

class AuthStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  first() { return this.db.first(this.sql, this.args); }
  all() { return this.db.all(this.sql, this.args); }
  run() { return this.db.run(this.sql, this.args); }
}

class AuthDb {
  constructor() {
    this.users = [{ id: userId, normalized_email: email }];
    this.passwords = new Map();
    this.pending = new Map();
    this.history = [];
    this.codes = [];
    this.sessions = [];
  }

  prepare(sql) { return new AuthStatement(this, sql); }

  first(sql, args) {
    if (sql.includes("SELECT c.id FROM customers c JOIN entitlements")) return { id: "customer_1" };
    if (sql.includes("SELECT id FROM account_users WHERE normalized_email")) return this.users.find((row) => row.normalized_email === args[0]) || null;
    if (sql.includes("SELECT u.id,p.password_hash")) {
      const user = this.users.find((row) => row.normalized_email === args[0]);
      const password = user && this.passwords.get(user.id);
      return user && password ? { id: user.id, ...password } : null;
    }
    if (sql.includes("SELECT password_hash,password_salt,iterations,algorithm FROM account_passwords")) return this.passwords.get(args[0]) || null;
    if (sql.includes("SELECT password_hash,password_salt,iterations,algorithm FROM account_pending_passwords")) return this.pending.get(args[0]) || null;
    if (sql.includes("SELECT id,user_id,code_hash,expires_at,used_at,attempt_count,processing_token,processing_started_at")) {
      return this.codes.filter((row) => row.user_id === args[0] && row.purpose === args[1]).sort((left, right) => right.created_at.localeCompare(left.created_at))[0] || null;
    }
    return null;
  }

  all(sql, args) {
    if (sql.includes("account_password_history")) return { results: this.history.filter((row) => row.user_id === args[0]).sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, Number(args[1]) || 5) };
    return { results: [] };
  }

  run(sql, args) {
    const placeholderCount = (sql.match(/\?/g) || []).length;
    if (placeholderCount !== args.length) throw new Error(`SQL placeholder mismatch: expected ${placeholderCount}, received ${args.length}`);
    if (sql.startsWith("UPDATE account_verification_codes SET attempt_count")) {
      const row = this.codes.find((item) => item.id === args[2]);
      if (!row || row.used_at || row.processing_token || new Date(row.expires_at).getTime() <= Date.now()) return { meta: { changes: 0 } };
      row.attempt_count += 1;
      if (row.attempt_count >= args[0]) row.used_at = args[1];
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE account_verification_codes SET processing_token")) {
      const row = this.codes.find((item) => item.id === args[2]);
      const leaseExpired = row && (!row.processing_token || !row.processing_started_at || row.processing_started_at < args[5]);
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now() || row.attempt_count >= args[4] || !leaseExpired) return { meta: { changes: 0 } };
      row.processing_token = args[0];
      row.processing_started_at = args[1];
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE account_verification_codes SET used_at")) {
      const row = this.codes.find((item) => item.id === args[1]);
      if (!row || row.processing_token !== args[2] || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) return { meta: { changes: 0 } };
      row.used_at = args[0];
      row.processing_token = null;
      row.processing_started_at = null;
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE account_verification_codes SET processing_token = NULL")) {
      const row = this.codes.find((item) => item.id === args[0]);
      if (!row || row.processing_token !== args[1] || row.used_at) return { meta: { changes: 0 } };
      row.processing_token = null;
      row.processing_started_at = null;
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("INSERT INTO account_password_history")) {
      this.history.push({ id: args[0], user_id: args[1], password_hash: args[2], password_salt: args[3], iterations: args[4], algorithm: args[5], created_at: args[6] });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("INSERT INTO account_passwords")) {
      const existing = this.passwords.get(args[0]);
      const next = { password_hash: args[1], password_salt: args[2], iterations: args[3], algorithm: args[4], verified_at: args[5], created_at: args[6], updated_at: args[7] };
      if (!existing || !sql.includes("DO NOTHING")) this.passwords.set(args[0], next);
      return { meta: { changes: existing && sql.includes("DO NOTHING") ? 0 : 1 } };
    }
    if (sql.startsWith("UPDATE account_passwords SET password_hash")) {
      const row = this.passwords.get(args[5]);
      if (!row || row.password_hash !== args[6]) return { meta: { changes: 0 } };
      this.passwords.set(args[5], { ...row, password_hash: args[0], password_salt: args[1], iterations: args[2], algorithm: args[3], updated_at: args[4] });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("INSERT INTO account_pending_passwords")) {
      this.pending.set(args[0], { user_id: args[0], password_hash: args[1], password_salt: args[2], iterations: args[3], algorithm: args[4], created_at: args[5] });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("DELETE FROM account_pending_passwords")) {
      const deleted = this.pending.delete(args[0]);
      return { meta: { changes: deleted ? 1 : 0 } };
    }
    if (sql.startsWith("INSERT INTO account_sessions")) {
      this.sessions.push({ id: args[0], user_id: args[1], session_hash: args[2] });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(this.run(statement.sql, statement.args));
    return results;
  }
}

function envWithCode({ purpose = "reset", code = "123456", currentPassword = "OriginalPass!1" } = {}) {
  const db = new AuthDb();
  db.passwords.set(userId, legacyPasswordRecord(currentPassword));
  db.codes.push({ id: "code_1", user_id: userId, code_hash: sha256(code), purpose, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), used_at: null, attempt_count: 0, processing_token: null, processing_started_at: null, created_at: new Date().toISOString() });
  return { LICENSE_DB: db, ASSETS: { fetch: async () => new Response("static") } };
}

let requestNumber = 0;
function authRequest(path, body) {
  requestNumber += 1;
  return new Request(`https://example.test${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${(requestNumber % 250) + 1}` }, body: JSON.stringify(body) });
}

test("logout clears the session cookie with a mutable no-store redirect", async () => {
  const env = envWithCode();
  const request = new Request("https://example.test/api/account/logout", { headers: { "x-forwarded-for": "203.0.113.250" } });
  const response = await handleRequest(request, env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://example.test/account/login.html");
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("reset codes are single-use and cannot create a second session when replayed", async () => {
  const env = envWithCode();
  const body = { email, code: "123456", password: "NewSecurePass!2" };
  const first = await handleRequest(authRequest("/api/account/password-reset/complete", body), env);
  assert.equal(first.status, 200);
  assert.equal(env.LICENSE_DB.sessions.length, 1);
  assert.equal(env.LICENSE_DB.codes[0].used_at !== null, true);
  assert.equal(env.LICENSE_DB.passwords.get(userId).algorithm, "pbkdf2-sha256");
  const replay = await handleRequest(authRequest("/api/account/password-reset/complete", body), env);
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, "invalid_code");
  assert.equal(env.LICENSE_DB.sessions.length, 1);
});

test("signup verification codes are single-use and cannot be replayed", async () => {
  const env = envWithCode({ purpose: "signup" });
  env.LICENSE_DB.pending.set(userId, { user_id: userId, password_hash: base64Url(Buffer.alloc(32, 7)), password_salt: base64Url(Buffer.alloc(16, 3)), iterations: pbkdf2Iterations, algorithm: "pbkdf2-sha256", created_at: new Date().toISOString() });
  const body = { email, code: "123456" };
  const first = await handleRequest(authRequest("/api/account/verify-code", body), env);
  assert.equal(first.status, 200);
  const replay = await handleRequest(authRequest("/api/account/verify-code", body), env);
  assert.equal(replay.status, 400);
  assert.equal(env.LICENSE_DB.sessions.length, 1);
});

test("account registration stages a password within Cloudflare Workers' supported PBKDF2 limit", async () => {
  const db = new AuthDb();
  const env = { LICENSE_DB: db, ASSETS: { fetch: async () => new Response("static") } };
  const response = await handleRequest(authRequest("/api/account/register", { email, password: "NewSecurePass!2" }), env);
  // Email is intentionally unconfigured in this isolated test. Password setup
  // must still complete before the delivery layer reports that configuration.
  assert.equal(response.status, 503);
  assert.equal(db.pending.get(userId)?.algorithm, "pbkdf2-sha256");
  assert.equal(db.pending.get(userId)?.iterations, pbkdf2Iterations);
});

test("verification codes stop accepting guesses after five failed attempts", async () => {
  const env = envWithCode();
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await handleRequest(authRequest("/api/account/password-reset/complete", { email, code: "000000", password: "NewSecurePass!2" }), env);
    assert.equal(response.status, 400, `attempt ${attempt}`);
  }
  const locked = await handleRequest(authRequest("/api/account/password-reset/complete", { email, code: "000000", password: "NewSecurePass!2" }), env);
  assert.equal(locked.status, 429);
  const correctAfterLock = await handleRequest(authRequest("/api/account/password-reset/complete", { email, code: "123456", password: "NewSecurePass!2" }), env);
  assert.equal(correctAfterLock.status, 400);
  assert.equal(env.LICENSE_DB.sessions.length, 0);
});

test("password policy rejects common passwords and prevents recent password reuse", async () => {
  const env = envWithCode();
  const weak = await handleRequest(authRequest("/api/account/password-reset/complete", { email, code: "123456", password: "password" }), env);
  assert.equal(weak.status, 400);
  assert.equal(env.LICENSE_DB.codes[0].used_at, null);
  const reused = await handleRequest(authRequest("/api/account/password-reset/complete", { email, code: "123456", password: "OriginalPass!1" }), env);
  assert.equal(reused.status, 400);
  assert.equal((await reused.json()).error, "password_reused");
  assert.equal(env.LICENSE_DB.codes[0].used_at, null);
});

test("successful legacy-password login transparently upgrades the stored hash", async () => {
  const env = envWithCode();
  const response = await handleRequest(authRequest("/api/account/login", { email, password: "OriginalPass!1" }), env);
  assert.equal(response.status, 200);
  assert.equal(env.LICENSE_DB.passwords.get(userId).algorithm, "pbkdf2-sha256");
  assert.equal(env.LICENSE_DB.passwords.get(userId).iterations, pbkdf2Iterations);
});
