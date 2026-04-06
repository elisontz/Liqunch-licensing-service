import { Env } from "../types";
import { normalizeEmail, readNestedString } from "../utils";

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

  const payload = await response.json() as Record<string, unknown>;
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

export function classifyPaddleWebhookEvent(eventType: string): "create" | "revoke" | "ignore" {
  if (eventType === "transaction.paid" || eventType === "transaction.completed") {
    return "create";
  }

  if (eventType === "adjustment.created" || eventType === "adjustment.updated") {
    return "revoke";
  }

  return "ignore";
}

export async function verifyPaddleSignature(input: {
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
