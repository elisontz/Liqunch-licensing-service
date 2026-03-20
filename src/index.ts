interface Env {
  DB: D1Database;
  LICENSE_KEY_PREFIX: string;
  PADDLE_SINGLE_PRICE_ID: string;
  PADDLE_DOUBLE_PRICE_ID: string;
  PADDLE_WEBHOOK_SECRET: string;
  PADDLE_API_KEY?: string;
}

interface LicenseRow {
  id: string;
  email: string;
  license_key: string;
  plan_code: string;
  max_seats: number;
  status: "active" | "revoked";
  paddle_transaction_id: string | null;
}

interface ActivationRow {
  id: string;
  license_id: string;
  device_id: string;
}

interface ActivationRequest {
  email: string;
  licenseKey: string;
  deviceID: string;
  deviceName?: string;
  appVersion?: string;
}

interface ValidateRequest {
  email: string;
  licenseKey: string;
  deviceID: string;
}

type LicenseResponseStatus = "active" | "invalid" | "revoked" | "exhausted" | "deactivated";

interface LicenseResponse {
  status: LicenseResponseStatus;
  email?: string;
  licenseKey?: string;
  maxSeats?: number;
  usedSeats?: number;
  activationId?: string;
  message?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "active", message: "ok" });
    }

    if (request.method === "POST" && url.pathname === "/api/licenses/activate") {
      return handleActivate(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/licenses/validate") {
      return handleValidate(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/licenses/deactivate") {
      return handleDeactivate(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/paddle/webhooks") {
      return handlePaddleWebhook(request, env);
    }

    return json({ status: "invalid", message: "Not found" }, 404);
  }
};

async function handleActivate(request: Request, env: Env): Promise<Response> {
  const body = await readJson<ActivationRequest>(request);
  if (!body) {
    return json({ status: "invalid", message: "Invalid JSON payload." }, 400);
  }

  const email = normalizeEmail(body.email);
  const licenseKey = normalizeLicenseKey(body.licenseKey);
  const deviceID = body.deviceID.trim();
  const deviceName = body.deviceName?.trim() ?? null;
  const appVersion = body.appVersion?.trim() ?? null;

  if (!email || !licenseKey || !deviceID) {
    return json({ status: "invalid", message: "Email, license key, and device ID are required." }, 400);
  }

  const license = await findLicense(env.DB, email, licenseKey);
  if (!license) {
    return json({ status: "invalid", message: "License not found." }, 404);
  }

  if (license.status === "revoked") {
    return json(licenseSummary(license, 0, { status: "revoked", message: "This license has been revoked." }), 403);
  }

  const existingActivation = await findActivation(env.DB, license.id, deviceID);
  if (existingActivation) {
    await env.DB
      .prepare("UPDATE activations SET last_validated_at = ? WHERE id = ?")
      .bind(nowIso(), existingActivation.id)
      .run();
    const usedSeats = await countActivations(env.DB, license.id);
    return json(licenseSummary(license, usedSeats, {
      status: "active",
      activationId: existingActivation.id,
      message: "License activated."
    }));
  }

  const usedSeats = await countActivations(env.DB, license.id);
  if (usedSeats >= license.max_seats) {
    return json(licenseSummary(license, usedSeats, {
      status: "exhausted",
      message: "This license has reached its device limit."
    }), 409);
  }

  const activationId = crypto.randomUUID();
  await env.DB
    .prepare(`
      INSERT INTO activations (id, license_id, device_id, device_name, app_version, created_at, last_validated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(activationId, license.id, deviceID, deviceName, appVersion, nowIso(), nowIso())
    .run();

  return json(licenseSummary(license, usedSeats + 1, {
    status: "active",
    activationId,
    message: "License activated."
  }));
}

async function handleValidate(request: Request, env: Env): Promise<Response> {
  const body = await readJson<ValidateRequest>(request);
  if (!body) {
    return json({ status: "invalid", message: "Invalid JSON payload." }, 400);
  }

  const email = normalizeEmail(body.email);
  const licenseKey = normalizeLicenseKey(body.licenseKey);
  const deviceID = body.deviceID.trim();

  if (!email || !licenseKey || !deviceID) {
    return json({ status: "invalid", message: "Email, license key, and device ID are required." }, 400);
  }

  const license = await findLicense(env.DB, email, licenseKey);
  if (!license) {
    return json({ status: "invalid", message: "License not found." }, 404);
  }

  const usedSeats = await countActivations(env.DB, license.id);
  if (license.status === "revoked") {
    return json(licenseSummary(license, usedSeats, {
      status: "revoked",
      message: "This license has been revoked."
    }), 403);
  }

  const activation = await findActivation(env.DB, license.id, deviceID);
  if (!activation) {
    return json(licenseSummary(license, usedSeats, {
      status: "invalid",
      message: "This device is not activated for the provided license."
    }), 403);
  }

  await env.DB
    .prepare("UPDATE activations SET last_validated_at = ? WHERE id = ?")
    .bind(nowIso(), activation.id)
    .run();

  return json(licenseSummary(license, usedSeats, {
    status: "active",
    activationId: activation.id,
    message: "License is active."
  }));
}

async function handleDeactivate(request: Request, env: Env): Promise<Response> {
  const body = await readJson<ValidateRequest>(request);
  if (!body) {
    return json({ status: "invalid", message: "Invalid JSON payload." }, 400);
  }

  const email = normalizeEmail(body.email);
  const licenseKey = normalizeLicenseKey(body.licenseKey);
  const deviceID = body.deviceID.trim();

  const license = await findLicense(env.DB, email, licenseKey);
  if (!license) {
    return json({ status: "invalid", message: "License not found." }, 404);
  }

  await env.DB
    .prepare("DELETE FROM activations WHERE license_id = ? AND device_id = ?")
    .bind(license.id, deviceID)
    .run();

  const usedSeats = await countActivations(env.DB, license.id);
  return json(licenseSummary(license, usedSeats, {
    status: "deactivated",
    message: "License deactivated for this device."
  }));
}

async function handlePaddleWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  if (!rawBody) {
    return json({ status: "invalid", message: "Invalid JSON payload." }, 400);
  }

  if (!env.PADDLE_WEBHOOK_SECRET?.trim()) {
    return json({ status: "invalid", message: "Webhook secret is not configured." }, 500);
  }

  const signatureHeader = request.headers.get("Paddle-Signature");
  const signatureValid = await verifyPaddleSignature({
    rawBody,
    signatureHeader,
    secret: env.PADDLE_WEBHOOK_SECRET
  });
  if (!signatureValid.valid) {
    return json({ status: "invalid", message: signatureValid.message }, 401);
  }

  const payload = parseJson<Record<string, unknown>>(rawBody);
  if (!payload) {
    return json({ status: "invalid", message: "Invalid JSON payload." }, 400);
  }

  const eventId = readString(payload, ["event_id", "eventId", "id"]) ?? crypto.randomUUID();
  const eventType = readString(payload, ["event_type", "eventType", "type"]) ?? "unknown";

  const alreadyProcessed = await env.DB
    .prepare("SELECT id FROM webhook_events WHERE id = ?")
    .bind(eventId)
    .first<{ id: string }>();
  if (alreadyProcessed) {
    return json({ status: "active", message: "Event already processed." });
  }

  const action = classifyPaddleWebhookEvent(eventType);
  if (action === "create") {
    await createLicenseFromWebhook(env, payload);
  } else if (action === "revoke") {
    await revokeLicenseFromWebhook(env, payload);
  }

  await env.DB
    .prepare("INSERT INTO webhook_events (id, event_type, processed_at) VALUES (?, ?, ?)")
    .bind(eventId, eventType, nowIso())
    .run();

  return json({ status: "active", message: "Webhook processed." });
}

async function createLicenseFromWebhook(env: Env, payload: Record<string, unknown>): Promise<void> {
  const email = await resolveWebhookCustomerEmail(env, payload);
  const transactionID = readNestedString(payload, [
    ["data", "id"],
    ["data", "transaction_id"],
    ["transaction_id"]
  ]);
  const priceID = readNestedString(payload, [
    ["data", "items", "0", "price", "id"],
    ["data", "price_id"],
    ["price_id"]
  ]);

  if (!email || !transactionID || !priceID) {
    return;
  }

  const existing = await env.DB
    .prepare("SELECT id FROM licenses WHERE paddle_transaction_id = ?")
    .bind(transactionID)
    .first<{ id: string }>();
  if (existing) {
    return;
  }

  const plan = resolvePlan(env, priceID);
  if (!plan) {
    return;
  }

  await env.DB
    .prepare(`
      INSERT INTO licenses (id, email, license_key, plan_code, max_seats, status, paddle_transaction_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `)
    .bind(
      crypto.randomUUID(),
      email,
      generateLicenseKey(env.LICENSE_KEY_PREFIX),
      plan.planCode,
      plan.maxSeats,
      transactionID,
      nowIso(),
      nowIso()
    )
    .run();
}

export async function resolveWebhookCustomerEmail(
  env: Pick<Env, "PADDLE_API_KEY">,
  payload: Record<string, unknown>
): Promise<string | null> {
  const embeddedEmail = normalizeEmail(
    readNestedString(payload, [
      ["data", "customer", "email"],
      ["data", "email"],
      ["customer", "email"]
    ]) ?? ""
  );
  if (embeddedEmail) {
    return embeddedEmail;
  }

  const customerID = readNestedString(payload, [
    ["data", "customer_id"],
    ["customer_id"]
  ]);
  if (!customerID || !env.PADDLE_API_KEY?.trim()) {
    return null;
  }

  return fetchPaddleCustomerEmail(customerID, env.PADDLE_API_KEY);
}

async function fetchPaddleCustomerEmail(customerID: string, apiKey: string): Promise<string | null> {
  const response = await fetch(`${resolvePaddleApiBaseUrl(apiKey)}/customers/${customerID}`, {
    headers: new Headers({
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    })
  });
  if (!response.ok) {
    return null;
  }

  const payload = parseJson<Record<string, unknown>>(await response.text());
  if (!payload) {
    return null;
  }

  const email = normalizeEmail(
    readNestedString(payload, [
      ["data", "email"],
      ["email"]
    ]) ?? ""
  );

  return email || null;
}

function resolvePaddleApiBaseUrl(apiKey: string): string {
  return apiKey.includes("_sdbx_")
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

async function revokeLicenseFromWebhook(env: Env, payload: Record<string, unknown>): Promise<void> {
  const transactionID = readNestedString(payload, [
    ["data", "transaction_id"],
    ["data", "id"],
    ["transaction_id"]
  ]);
  if (!transactionID) {
    return;
  }

  await env.DB
    .prepare("UPDATE licenses SET status = 'revoked', updated_at = ? WHERE paddle_transaction_id = ?")
    .bind(nowIso(), transactionID)
    .run();
}

export function classifyPaddleWebhookEvent(eventType: string): "create" | "revoke" | "ignore" {
  if (eventType === "transaction.paid" || eventType === "transaction.completed") {
    return "create";
  }

  if (eventType === "adjustment.created" || eventType === "adjustment.updated") {
    return "revoke";
  }

  return "ignore";
}

function resolvePlan(env: Env, priceID: string): { planCode: string; maxSeats: number } | null {
  if (priceID === env.PADDLE_SINGLE_PRICE_ID) {
    return { planCode: "single", maxSeats: 1 };
  }
  if (priceID === env.PADDLE_DOUBLE_PRICE_ID) {
    return { planCode: "double", maxSeats: 2 };
  }
  return null;
}

async function findLicense(db: D1Database, email: string, licenseKey: string): Promise<LicenseRow | null> {
  return db
    .prepare(`
      SELECT id, email, license_key, plan_code, max_seats, status, paddle_transaction_id
      FROM licenses
      WHERE email = ? AND license_key = ?
      LIMIT 1
    `)
    .bind(email, licenseKey)
    .first<LicenseRow>();
}

async function findActivation(db: D1Database, licenseID: string, deviceID: string): Promise<ActivationRow | null> {
  return db
    .prepare(`
      SELECT id, license_id, device_id
      FROM activations
      WHERE license_id = ? AND device_id = ?
      LIMIT 1
    `)
    .bind(licenseID, deviceID)
    .first<ActivationRow>();
}

async function countActivations(db: D1Database, licenseID: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM activations WHERE license_id = ?")
    .bind(licenseID)
    .first<{ count: number | string }>();
  return Number(row?.count ?? 0);
}

function licenseSummary(
  license: LicenseRow,
  usedSeats: number,
  response: Pick<LicenseResponse, "status" | "message" | "activationId">
): LicenseResponse {
  return {
    status: response.status,
    message: response.message,
    activationId: response.activationId,
    email: license.email,
    licenseKey: license.license_key,
    maxSeats: license.max_seats,
    usedSeats
  };
}

function generateLicenseKey(prefix: string): string {
  const token = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  return `${prefix}-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}-${token.slice(12, 16)}`;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLicenseKey(value: string): string {
  return value.trim().toUpperCase();
}

function nowIso(): string {
  return new Date().toISOString();
}

function json(body: LicenseResponse | { status: string; message: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function readString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readNestedString(obj: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    let current: unknown = obj;
    for (const segment of path) {
      if (Array.isArray(current)) {
        const index = Number(segment);
        current = Number.isInteger(index) ? current[index] : undefined;
      } else if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[segment];
      } else {
        current = undefined;
      }
    }
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }
  return null;
}

async function verifyPaddleSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): Promise<{ valid: boolean; message: string }> {
  if (!input.signatureHeader) {
    return { valid: false, message: "Missing Paddle-Signature header." };
  }

  const parsed = parsePaddleSignatureHeader(input.signatureHeader);
  if (!parsed.timestamp || parsed.signatures.length === 0) {
    return { valid: false, message: "Malformed Paddle-Signature header." };
  }

  const timestampAgeSeconds = Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp);
  if (timestampAgeSeconds > 300) {
    return { valid: false, message: "Webhook signature timestamp is too old." };
  }

  const expectedSignature = await computePaddleSignature(
    `${parsed.timestamp}:${input.rawBody}`,
    input.secret
  );

  const hasMatch = parsed.signatures.some((signature) =>
    timingSafeEqual(signature, expectedSignature)
  );

  return hasMatch
    ? { valid: true, message: "Signature verified." }
    : { valid: false, message: "Invalid webhook signature." };
}

function parsePaddleSignatureHeader(header: string): {
  timestamp: number | null;
  signatures: string[];
} {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(";")) {
    const [rawKey, rawValue] = part.split("=", 2);
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key || !value) {
      continue;
    }

    if (key === "ts") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        timestamp = parsed;
      }
      continue;
    }

    if (key === "h1") {
      signatures.push(value.toLowerCase());
    }
  }

  return { timestamp, signatures };
}

async function computePaddleSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
