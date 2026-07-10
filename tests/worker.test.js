import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import { handleRequest } from "../worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const secret = "paddle-test-secret";
const signingSecret = "license-test-secret";
const prices = { standard: "pri_ledger_standard", plus: "pri_ledger_plus", bundle: "pri_bundle" };
const envBase = () => ({ PADDLE_WEBHOOK_SECRET: secret, LICENSE_SIGNING_SECRET: signingSecret, PADDLE_PRICE_LEDGERLIFT_STANDARD: prices.standard, PADDLE_PRICE_LEDGERLIFT_PLUS: prices.plus, PADDLE_PRICE_SUITE_BUNDLE: prices.bundle, DEVELOPMENT: "true", ASSETS: { fetch: async (request) => new Response(`static:${new URL(request.url).pathname}`) } });

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return this.db.first(this.sql, this.args); }
  async run() { return this.db.run(this.sql, this.args); }
}

class FakeDb {
  constructor() { this.events = new Map(); this.customers = []; this.entitlements = []; this.codes = []; this.activations = []; this.restores = []; }
  prepare(sql) { return new FakeStatement(this, sql); }
  async first(sql, a) {
    if (sql.includes("SELECT id FROM customers")) return this.customers.find((row) => row.paddle_customer_id === a[0]) || null;
    if (sql.includes("SELECT ac.id, ac.entitlement_id")) { const code = this.codes.find((row) => row.code_hash === a[0]); const ent = code && this.entitlements.find((row) => row.id === code.entitlement_id); return code && ent ? { ...code, product_key: ent.product_key, plan_key: ent.plan_key, status: ent.status } : null; }
    if (sql.includes("SELECT id,token_id FROM activations")) return this.activations.find((row) => row.entitlement_id === a[0] && row.installation_id_hash === a[1] && !row.revoked_at) || null;
    if (sql.includes("SELECT a.revoked_at")) { const activation = this.activations.find((row) => row.token_id === a[0]); const ent = activation && this.entitlements.find((row) => row.id === activation.entitlement_id); return activation && ent ? { revoked_at: activation.revoked_at, status: ent.status, product_key: ent.product_key, plan_key: ent.plan_key } : null; }
    if (sql.includes("COUNT(*)")) return { count: this.customers.filter((row) => row.normalized_email === a[0]).length };
    return null;
  }
  async run(sql, a) {
    if (sql.startsWith("INSERT INTO paddle_events")) { if (this.events.has(a[0])) throw new Error("unique"); this.events.set(a[0], a); return { meta: { changes: 1 } }; }
    if (sql.startsWith("INSERT INTO customers")) { this.customers.push({ id: a[0], paddle_customer_id: a[1], normalized_email: a[2] }); return { meta: { changes: 1 } }; }
    if (sql.startsWith("UPDATE customers")) { const row = this.customers.find((item) => item.id === a[2]); row.normalized_email = a[0]; return { meta: { changes: 1 } }; }
    if (sql.startsWith("INSERT INTO restore_requests")) { this.restores.push(a); return { meta: { changes: 1 } }; }
    if (sql.startsWith("UPDATE activations")) { const row = this.activations.find((item) => item.token_id === a[1]); if (row) row.last_seen_at = a[0]; return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  }
  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      const sql = statement.sql; const a = statement.args;
      if (sql.startsWith("INSERT INTO entitlements")) { this.entitlements.push({ id: a[0], customer_id: a[1], transaction_id: a[2], product_key: a[3], plan_key: a[4], status: a[5] }); results.push({ meta: { changes: 1 } }); continue; }
      if (sql.startsWith("INSERT INTO activation_codes")) { this.codes.push({ id: a[0], entitlement_id: a[1], code_hash: a[2], redeemed_at: a[4] }); results.push({ meta: { changes: 1 } }); continue; }
      if (sql.startsWith("INSERT INTO activations")) { const code = this.codes.find((row) => row.id === a[7] && !row.redeemed_at); if (!code) { results.push({ meta: { changes: 0 } }); continue; } this.activations.push({ id: a[0], entitlement_id: a[1], installation_id_hash: a[2], token_id: a[3], revoked_at: null }); results.push({ meta: { changes: 1 } }); continue; }
      if (sql.startsWith("UPDATE activation_codes")) { const row = this.codes.find((item) => item.id === a[1] && !item.redeemed_at); if (row) row.redeemed_at = a[0]; results.push({ meta: { changes: row ? 1 : 0 } }); continue; }
    }
    return results;
  }
}

function dbEnv() { const env = envBase(); env.LICENSE_DB = new FakeDb(); return env; }
async function signedRequest(body, timestamp = Math.floor(Date.now() / 1000)) { const raw = JSON.stringify(body); const hash = createHmac("sha256", secret).update(`${timestamp}:${raw}`).digest("hex"); return new Request("https://example.test/api/paddle/webhook", { method: "POST", headers: { "Paddle-Signature": `ts=${timestamp};h1=${hash}` }, body: raw }); }
async function fulfill(env, priceId = prices.standard, eventId = "evt_1") { const response = await handleRequest(await signedRequest({ event_id: eventId, event_type: "transaction.completed", occurred_at: new Date().toISOString(), data: { id: `txn_${eventId}`, customer_id: "ctm_1", customer: { email: "Buyer@Example.com" }, items: [{ price: { id: priceId } }] } }), env); return response.json(); }

test("valid Paddle signature fulfills a standard entitlement", async () => { const env = dbEnv(); const result = await fulfill(env); assert.equal(result.fulfilled, 1); assert.deepEqual(env.LICENSE_DB.entitlements[0].product_key, "ledgerlift"); assert.equal(env.LICENSE_DB.entitlements[0].plan_key, "standard"); });
test("Plus price creates a Plus entitlement", async () => { const env = dbEnv(); const result = await fulfill(env, prices.plus, "evt_plus"); assert.equal(result.fulfilled, 1); assert.equal(env.LICENSE_DB.entitlements[0].plan_key, "plus"); });
test("invalid signature is rejected", async () => { const env = dbEnv(); const request = new Request("https://example.test/api/paddle/webhook", { method: "POST", headers: { "Paddle-Signature": "ts=1;h1=bad" }, body: "{}" }); const response = await handleRequest(request, env); assert.equal(response.status, 400); });
test("stale signature is rejected", async () => { const env = dbEnv(); const response = await handleRequest(await signedRequest({}, 1), env); assert.equal(response.status, 400); });
test("duplicate events do not fulfill twice", async () => { const env = dbEnv(); await fulfill(env); const result = await fulfill(env); assert.equal(result.duplicate, true); assert.equal(env.LICENSE_DB.entitlements.length, 1); });
test("unknown price IDs are rejected", async () => { const env = dbEnv(); const result = await fulfill(env, "pri_unknown"); assert.equal(result.error, "unsupported_price"); assert.equal(env.LICENSE_DB.entitlements.length, 0); });
test("bundle creates five Plus entitlements", async () => { const env = dbEnv(); const result = await fulfill(env, prices.bundle); assert.equal(result.fulfilled, 5); assert.equal(env.LICENSE_DB.entitlements.filter((row) => row.plan_key === "plus").length, 5); });
test("activation code is single-use and returns a signed entitlement", async () => { const env = dbEnv(); const result = await fulfill(env); const claim = await handleRequest(new Request("https://example.test/api/license/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activation_code: result.development_activation_codes[0], installation_id: "installation-123456789" }) }), env); assert.equal(claim.status, 200); const second = await handleRequest(new Request("https://example.test/api/license/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activation_code: result.development_activation_codes[0], installation_id: "installation-987654321" }) }), env); assert.equal(second.status, 400); });
test("invalid license signature is rejected", async () => { const env = dbEnv(); const response = await handleRequest(new Request("https://example.test/api/license/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entitlement: "bad.token" }) }), env); assert.equal(response.status, 401); });
test("revoked activation is rejected", async () => { const env = dbEnv(); const result = await fulfill(env); const claim = await handleRequest(new Request("https://example.test/api/license/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activation_code: result.development_activation_codes[0], installation_id: "installation-revoked" }) }), env); const token = (await claim.json()).entitlement; env.LICENSE_DB.activations[0].revoked_at = new Date().toISOString(); const verify = await handleRequest(new Request("https://example.test/api/license/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entitlement: token }) }), env); assert.equal(verify.status, 401); });
test("restore response is generic for valid and invalid email shapes", async () => { const env = dbEnv(); const request = (email) => new Request("https://example.test/api/license/restore/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }); const a = await (await handleRequest(request("nobody@example.com"), env)).json(); const b = await (await handleRequest(request("not-an-email"), env)).json(); assert.deepEqual(a, b); });
test("health is minimal and static routes still load", async () => { const env = dbEnv(); const health = await handleRequest(new Request("https://example.test/api/health"), env); assert.deepEqual(await health.json(), { status: "ok" }); const page = await handleRequest(new Request("https://example.test/ledgerlift/"), env); assert.equal(await page.text(), "static:/ledgerlift/"); });
