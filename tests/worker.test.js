import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import { handleRequest, summarizeEntitlements } from "../worker.js";

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
  constructor() { this.events = new Map(); this.customers = []; this.entitlements = []; this.codes = []; this.activations = []; this.restores = []; this.failNext = null; }
  prepare(sql) { return new FakeStatement(this, sql); }
  async first(sql, a) {
    if (sql.includes("SELECT status,processing_token,processing_started_at")) return this.events.get(a[0]) || null;
    if (sql.includes("SELECT id FROM customers")) return this.customers.find((row) => row.paddle_customer_id === a[0]) || null;
    if (sql.includes("SELECT id FROM entitlements WHERE transaction_id")) return this.entitlements.find((row) => row.transaction_id === a[0] && row.product_key === a[1] && row.plan_key === a[2]) || null;
    if (sql.includes("SELECT id FROM activation_codes WHERE entitlement_id")) return this.codes.find((row) => row.entitlement_id === a[0]) || null;
    if (sql.includes("SELECT ac.id, ac.entitlement_id")) { const code = this.codes.find((row) => row.code_hash === a[0]); const ent = code && this.entitlements.find((row) => row.id === code.entitlement_id); return code && ent ? { ...code, product_key: ent.product_key, plan_key: ent.plan_key, status: ent.status } : null; }
    if (sql.includes("SELECT id,token_id FROM activations")) return this.activations.find((row) => row.entitlement_id === a[0] && row.installation_id_hash === a[1] && !row.revoked_at) || null;
    if (sql.includes("SELECT a.revoked_at")) { const activation = this.activations.find((row) => row.token_id === a[0]); const ent = activation && this.entitlements.find((row) => row.id === activation.entitlement_id); return activation && ent ? { revoked_at: activation.revoked_at, status: ent.status, product_key: ent.product_key, plan_key: ent.plan_key } : null; }
    if (sql.includes("COUNT(*)")) return { count: this.customers.filter((row) => row.normalized_email === a[0]).length };
    return null;
  }
  async run(sql, a) {
    if (this.failNext === "event_insert" && sql.startsWith("INSERT INTO paddle_events")) { this.failNext = null; throw new Error("database unavailable"); }
    if (sql.startsWith("INSERT INTO paddle_events")) { if (this.events.has(a[0])) return { meta: { changes: 0 } }; this.events.set(a[0], { status: a[6], processing_token: a[7], processing_started_at: a[8] }); return { meta: { changes: 1 } }; }
    if (sql.startsWith("UPDATE paddle_events SET status = 'processing'")) { const row = this.events.get(a[2]); const canClaim = row && (row.status === "failed" || (row.status === "processing" && (!row.processing_token || !row.processing_started_at || row.processing_started_at < a[3]))); if (!canClaim) return { meta: { changes: 0 } }; row.status = "processing"; row.processing_token = a[0]; row.processing_started_at = a[1]; return { meta: { changes: 1 } }; }
    if (sql.startsWith("UPDATE paddle_events SET status = 'failed'")) { const row = this.events.get(a[2]); if (row?.processing_token === a[3]) { row.status = "failed"; row.processing_token = null; row.processing_started_at = null; } return { meta: { changes: row ? 1 : 0 } }; }
    if (sql.startsWith("UPDATE paddle_events SET status = 'fulfilled'")) { const row = this.events.get(a[1]); if (row?.processing_token === a[2]) { row.status = "fulfilled"; row.processing_token = null; row.processing_started_at = null; return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; }
    if (sql.startsWith("INSERT OR IGNORE INTO customers")) { const existing = this.customers.find((row) => row.paddle_customer_id === a[1]); if (!existing) this.customers.push({ id: a[0], paddle_customer_id: a[1], normalized_email: a[2] }); return { meta: { changes: existing ? 0 : 1 } }; }
    if (sql.startsWith("INSERT OR IGNORE INTO activation_codes")) { const existing = this.codes.find((row) => row.entitlement_id === a[1]); if (!existing) this.codes.push({ id: a[0], entitlement_id: a[1], code_hash: a[2], redeemed_at: a[4] }); return { meta: { changes: existing ? 0 : 1 } }; }
    if (sql.startsWith("INSERT INTO customers")) { this.customers.push({ id: a[0], paddle_customer_id: a[1], normalized_email: a[2] }); return { meta: { changes: 1 } }; }
    if (sql.startsWith("UPDATE customers")) { const row = this.customers.find((item) => item.id === a[2]); row.normalized_email = a[0]; return { meta: { changes: 1 } }; }
    if (sql.startsWith("INSERT INTO restore_requests")) { this.restores.push(a); return { meta: { changes: 1 } }; }
    if (sql.startsWith("UPDATE activations")) { const row = this.activations.find((item) => item.token_id === a[1]); if (row) row.last_seen_at = a[0]; return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  }
  async batch(statements) {
    if (this.failNext === "entitlement_batch") { this.failNext = null; throw new Error("database unavailable"); }
    const results = [];
    for (const statement of statements) {
      const sql = statement.sql; const a = statement.args;
      if (sql.startsWith("INSERT OR IGNORE INTO customers")) { const existing = this.customers.find((row) => row.paddle_customer_id === a[1]); if (!existing) this.customers.push({ id: a[0], paddle_customer_id: a[1], normalized_email: a[2] }); results.push({ meta: { changes: existing ? 0 : 1 } }); continue; }
      if (sql.startsWith("UPDATE customers")) { const row = this.customers.find((item) => item.id === a[2]); if (row) row.normalized_email = a[0]; results.push({ meta: { changes: row ? 1 : 0 } }); continue; }
      if (sql.startsWith("INSERT OR IGNORE INTO entitlements")) { const existing = this.entitlements.find((row) => row.transaction_id === a[2] && row.product_key === a[3] && row.plan_key === a[4]); if (!existing) this.entitlements.push({ id: a[0], customer_id: a[1], transaction_id: a[2], product_key: a[3], plan_key: a[4], status: a[5] }); results.push({ meta: { changes: existing ? 0 : 1 } }); continue; }
      if (sql.startsWith("INSERT INTO entitlements")) { this.entitlements.push({ id: a[0], customer_id: a[1], transaction_id: a[2], product_key: a[3], plan_key: a[4], status: a[5] }); results.push({ meta: { changes: 1 } }); continue; }
      if (sql.startsWith("INSERT OR IGNORE INTO activation_codes")) { const existing = this.codes.find((row) => row.entitlement_id === a[1]); if (!existing) this.codes.push({ id: a[0], entitlement_id: a[1], code_hash: a[2], redeemed_at: a[4] }); results.push({ meta: { changes: existing ? 0 : 1 } }); continue; }
      if (sql.startsWith("INSERT INTO activation_codes")) { this.codes.push({ id: a[0], entitlement_id: a[1], code_hash: a[2], redeemed_at: a[4] }); results.push({ meta: { changes: 1 } }); continue; }
      if (sql.startsWith("INSERT INTO activations")) { const code = this.codes.find((row) => row.id === a[7] && !row.redeemed_at); if (!code) { results.push({ meta: { changes: 0 } }); continue; } this.activations.push({ id: a[0], entitlement_id: a[1], installation_id_hash: a[2], token_id: a[3], revoked_at: null }); results.push({ meta: { changes: 1 } }); continue; }
      if (sql.startsWith("UPDATE activation_codes")) { const row = this.codes.find((item) => item.id === a[1] && !item.redeemed_at); if (row) row.redeemed_at = a[0]; results.push({ meta: { changes: row ? 1 : 0 } }); continue; }
    }
    return results;
  }
}

function dbEnv() { const env = envBase(); env.LICENSE_DB = new FakeDb(); return env; }
async function signedRequest(body, timestamp = Math.floor(Date.now() / 1000)) { const raw = JSON.stringify(body); const hash = createHmac("sha256", secret).update(`${timestamp}:${raw}`).digest("hex"); return new Request("https://example.test/api/paddle/webhook", { method: "POST", headers: { "Paddle-Signature": `ts=${timestamp};h1=${hash}` }, body: raw }); }
function eventFor(priceId = prices.standard, eventId = "evt_1", overrides = {}) { return { event_id: eventId, event_type: "transaction.completed", occurred_at: new Date().toISOString(), data: { id: `txn_${eventId}`, customer_id: "ctm_1", customer: { email: "Buyer@Example.com" }, items: [{ price: { id: priceId } }], ...overrides } }; }
async function fulfill(env, priceId = prices.standard, eventId = "evt_1", overrides = {}) { const response = await handleRequest(await signedRequest(eventFor(priceId, eventId, overrides)), env); return response.json(); }

test("valid Paddle signature fulfills a standard entitlement", async () => { const env = dbEnv(); const result = await fulfill(env); assert.equal(result.fulfilled, 1); assert.deepEqual(env.LICENSE_DB.entitlements[0].product_key, "ledgerlift"); assert.equal(env.LICENSE_DB.entitlements[0].plan_key, "standard"); });
test("Plus price creates a Plus entitlement", async () => { const env = dbEnv(); const result = await fulfill(env, prices.plus, "evt_plus"); assert.equal(result.fulfilled, 1); assert.equal(env.LICENSE_DB.entitlements[0].plan_key, "plus"); });
test("invalid signature is rejected", async () => { const env = dbEnv(); const request = new Request("https://example.test/api/paddle/webhook", { method: "POST", headers: { "Paddle-Signature": "ts=1;h1=bad" }, body: "{}" }); const response = await handleRequest(request, env); assert.equal(response.status, 400); });
test("stale signature is rejected", async () => { const env = dbEnv(); const response = await handleRequest(await signedRequest({}, 1), env); assert.equal(response.status, 400); });
test("duplicate events do not fulfill twice", async () => { const env = dbEnv(); await fulfill(env); const result = await fulfill(env); assert.equal(result.duplicate, true); assert.equal(env.LICENSE_DB.entitlements.length, 1); });
test("failed fulfillment remains retryable and later succeeds", async () => { const env = dbEnv(); env.LICENSE_DB.failNext = "entitlement_batch"; const first = await handleRequest(await signedRequest(eventFor()), env); assert.equal(first.status, 503); assert.equal(env.LICENSE_DB.events.get("evt_1").status, "failed"); assert.equal(env.LICENSE_DB.entitlements.length, 0); const second = await fulfill(env); assert.equal(second.fulfilled, 1); assert.equal(env.LICENSE_DB.events.get("evt_1").status, "fulfilled"); });
test("generic event registration failure is retriable, not a duplicate", async () => { const env = dbEnv(); env.LICENSE_DB.failNext = "event_insert"; const response = await handleRequest(await signedRequest(eventFor()), env); assert.equal(response.status, 503); assert.notEqual((await response.json()).duplicate, true); });
test("missing webhook email uses Paddle customer lookup", async () => { const env = dbEnv(); env.PADDLE_API_KEY = "server-only-test-key"; env.PADDLE_API_BASE_URL = "https://sandbox-api.paddle.com"; const originalFetch = globalThis.fetch; let calledUrl = ""; globalThis.fetch = async (url, options) => { calledUrl = String(url); assert.match(options.headers.Authorization, /^Bearer /); return new Response(JSON.stringify({ data: { email: "Lookup@Example.com" } }), { status: 200, headers: { "content-type": "application/json" } }); }; try { const result = await fulfill(env, prices.standard, "evt_lookup", { customer: {} }); assert.equal(result.fulfilled, 1); assert.equal(env.LICENSE_DB.customers[0].normalized_email, "lookup@example.com"); assert.match(calledUrl, /\/customers\/ctm_1$/); } finally { globalThis.fetch = originalFetch; } });
test("Paddle customer lookup failure is retriable", async () => { const env = dbEnv(); env.PADDLE_API_KEY = "server-only-test-key"; env.PADDLE_API_BASE_URL = "https://sandbox-api.paddle.com"; const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("network unavailable"); }; try { const response = await handleRequest(await signedRequest(eventFor(prices.standard, "evt_lookup_failed", { customer: {} })), env); assert.equal(response.status, 503); assert.equal((await response.json()).error, "customer_lookup_failed"); assert.equal(env.LICENSE_DB.events.get("evt_lookup_failed").status, "failed"); } finally { globalThis.fetch = originalFetch; } });
test("invalid customer email prevents fulfillment", async () => { const env = dbEnv(); env.PADDLE_API_KEY = "server-only-test-key"; env.PADDLE_API_BASE_URL = "https://sandbox-api.paddle.com"; const originalFetch = globalThis.fetch; globalThis.fetch = async () => new Response(JSON.stringify({ data: { email: "not-an-email" } }), { status: 200 }); try { const response = await handleRequest(await signedRequest(eventFor(prices.standard, "evt_invalid_email", { customer: {} })), env); assert.equal(response.status, 422); assert.equal((await response.json()).error, "invalid_customer_email"); assert.equal(env.LICENSE_DB.entitlements.length, 0); } finally { globalThis.fetch = originalFetch; } });
test("empty item list is rejected without recording fulfillment", async () => { const env = dbEnv(); const response = await handleRequest(await signedRequest(eventFor(prices.standard, "evt_empty", { items: [] })), env); assert.equal(response.status, 422); assert.equal((await response.json()).error, "unsupported_price"); assert.equal(env.LICENSE_DB.events.size, 0); });
test("unknown price IDs are rejected", async () => { const env = dbEnv(); const result = await fulfill(env, "pri_unknown"); assert.equal(result.error, "unsupported_price"); assert.equal(env.LICENSE_DB.entitlements.length, 0); });
test("bundle creates an explicit bundle entitlement plus five product Plus entitlements", async () => { const env = dbEnv(); const result = await fulfill(env, prices.bundle); assert.equal(result.fulfilled, 6); assert.equal(env.LICENSE_DB.entitlements.filter((row) => row.plan_key === "plus").length, 5); assert.deepEqual(env.LICENSE_DB.entitlements.find((row) => row.product_key === "suite"), { id: env.LICENSE_DB.entitlements.find((row) => row.product_key === "suite").id, customer_id: env.LICENSE_DB.entitlements[0].customer_id, transaction_id: "txn_evt_1", product_key: "suite", plan_key: "bundle", status: "active" }); });

test("product entitlement summary keeps LedgerLift ownership independent", () => {
  const free = summarizeEntitlements([]);
  assert.equal(free.highestLedgerLiftTier, "free");
  assert.equal(free.products.pixelport, "free");
  const ledgerStandard = summarizeEntitlements([{ product_key: "ledgerlift", plan_key: "standard", status: "active" }]);
  assert.equal(ledgerStandard.highestLedgerLiftTier, "standard");
  assert.equal(ledgerStandard.products.pixelport, "free");
  const pixelPlus = summarizeEntitlements([{ product_key: "pixelport", plan_key: "plus", status: "active" }]);
  assert.equal(pixelPlus.highestLedgerLiftTier, "free");
  const pixelStandard = summarizeEntitlements([{ product_key: "pixelport", plan_key: "standard", status: "active" }]);
  assert.equal(pixelStandard.products.pixelport, "standard");
  assert.equal(pixelStandard.products.ledgerlift, "free");
  const multiple = summarizeEntitlements([{ product_key: "ledgerlift", plan_key: "standard", status: "active" }, { product_key: "ledgerlift", plan_key: "plus", status: "active" }, { product_key: "calendarflow", plan_key: "standard", status: "active" }]);
  assert.equal(multiple.highestLedgerLiftTier, "plus");
  assert.equal(multiple.products.calendarflow, "standard");
  const revoked = summarizeEntitlements([{ product_key: "ledgerlift", plan_key: "plus", status: "revoked" }]);
  assert.equal(revoked.highestLedgerLiftTier, "free");
  const bundle = summarizeEntitlements([{ product_key: "suite", plan_key: "bundle", status: "active" }]);
  assert.equal(bundle.bundle, true);
  assert.equal(bundle.highestLedgerLiftTier, "plus");
  assert.equal(bundle.products.pixelport, "plus");
  const allIndividualPlus = summarizeEntitlements(["ledgerlift", "pixelport", "contactcraft", "calendarflow", "captionshift"].map((product_key) => ({ product_key, plan_key: "plus", status: "active" })));
  assert.equal(allIndividualPlus.bundle, false);
  assert.equal(allIndividualPlus.highestLedgerLiftTier, "plus");
});

test("product entitlement summary keeps ContactCraft ownership independent", () => {
  const contactStandard = summarizeEntitlements([{ product_key: "contactcraft", plan_key: "standard", status: "active" }]);
  assert.equal(contactStandard.products.contactcraft, "standard");
  assert.equal(contactStandard.products.ledgerlift, "free");
  assert.equal(contactStandard.products.pixelport, "free");
  const contactPlus = summarizeEntitlements([{ product_key: "contactcraft", plan_key: "standard", status: "active" }, { product_key: "contactcraft", plan_key: "plus", status: "active" }]);
  assert.equal(contactPlus.products.contactcraft, "plus");
  const otherProduct = summarizeEntitlements([{ product_key: "ledgerlift", plan_key: "plus", status: "active" }]);
  assert.equal(otherProduct.products.contactcraft, "free");
  const revoked = summarizeEntitlements([{ product_key: "contactcraft", plan_key: "plus", status: "revoked" }]);
  assert.equal(revoked.products.contactcraft, "free");
  const bundle = summarizeEntitlements([{ product_key: "suite", plan_key: "bundle", status: "active" }]);
  assert.equal(bundle.products.contactcraft, "plus");
});
test("concurrent delivery allows one owner and makes the other retry", async () => { const env = dbEnv(); const responses = await Promise.all([handleRequest(await signedRequest(eventFor(prices.plus, "evt_concurrent")), env), handleRequest(await signedRequest(eventFor(prices.plus, "evt_concurrent")), env)]); const statuses = responses.map((response) => response.status).sort(); assert.deepEqual(statuses, [200, 409]); assert.equal(env.LICENSE_DB.entitlements.length, 1); const retry = await fulfill(env, prices.plus, "evt_concurrent"); assert.equal(retry.duplicate, true); assert.equal(env.LICENSE_DB.codes.length, 1); });
test("replayed fulfillment does not create another activation code", async () => { const env = dbEnv(); await fulfill(env); await fulfill(env); assert.equal(env.LICENSE_DB.entitlements.length, 1); assert.equal(env.LICENSE_DB.codes.length, 1); });
test("activation code is single-use and returns a signed entitlement", async () => { const env = dbEnv(); const result = await fulfill(env); const claim = await handleRequest(new Request("https://example.test/api/license/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activation_code: result.development_activation_codes[0], installation_id: "installation-123456789" }) }), env); assert.equal(claim.status, 200); const second = await handleRequest(new Request("https://example.test/api/license/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activation_code: result.development_activation_codes[0], installation_id: "installation-987654321" }) }), env); assert.equal(second.status, 400); });
test("invalid license signature is rejected", async () => { const env = dbEnv(); const response = await handleRequest(new Request("https://example.test/api/license/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entitlement: "bad.token" }) }), env); assert.equal(response.status, 401); });
test("revoked activation is rejected", async () => { const env = dbEnv(); const result = await fulfill(env); const claim = await handleRequest(new Request("https://example.test/api/license/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activation_code: result.development_activation_codes[0], installation_id: "installation-revoked" }) }), env); const token = (await claim.json()).entitlement; env.LICENSE_DB.activations[0].revoked_at = new Date().toISOString(); const verify = await handleRequest(new Request("https://example.test/api/license/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entitlement: token }) }), env); assert.equal(verify.status, 401); });
test("restore response is generic for valid and invalid email shapes", async () => { const env = dbEnv(); const request = (email) => new Request("https://example.test/api/license/restore/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }); const a = await (await handleRequest(request("nobody@example.com"), env)).json(); const b = await (await handleRequest(request("not-an-email"), env)).json(); assert.deepEqual(a, b); });
test("health is minimal and static routes still load", async () => { const env = dbEnv(); const health = await handleRequest(new Request("https://example.test/api/health"), env); assert.deepEqual(await health.json(), { status: "ok" }); const page = await handleRequest(new Request("https://example.test/ledgerlift/"), env); assert.equal(await page.text(), "static:/ledgerlift/"); });
test("contact endpoint rejects non-JSON and invalid input", async () => { const env = dbEnv(); const badType = await handleRequest(new Request("https://example.test/api/contact", { method: "POST", body: "x" }), env); assert.equal(badType.status, 400); const badEmail = await handleRequest(new Request("https://example.test/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "A", email: "bad", topic: "Other", product: "LocalFile Toolkit", subject: "Hi", message: "Hello", consent: true }) }), env); assert.equal(badEmail.status, 400); });
test("contact honeypot is silently discarded and setup mode is explicit", async () => { const env = dbEnv(); const hidden = await handleRequest(new Request("https://example.test/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ honeypot: "bot" }) }), env); assert.equal(hidden.status, 204); const response = await handleRequest(new Request("https://example.test/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "A", email: "buyer@example.com", topic: "General question", product: "LocalFile Toolkit", subject: "Hello", message: "A question", consent: true }) }), env); assert.equal(response.status, 503); assert.equal((await response.json()).setup_mode, true); });
test("refund endpoint rejects invalid input and supports setup mode", async () => { const env = dbEnv(); const invalid = await handleRequest(new Request("https://example.test/api/refund-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }), env); assert.equal(invalid.status, 400); const response = await handleRequest(new Request("https://example.test/api/refund-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "A", email: "buyer@example.com", transaction_id: "txn_1", product: "LedgerLift", plan: "Standard", purchase_date: "2026-07-10", reason: "Technical problem", details: "Details", accurate: true }) }), env); assert.equal(response.status, 503); assert.equal((await response.json()).setup_mode, true); });
