import { Env, ActivationRequest, LicenseRow, LicenseResponse } from "../types";
import { readJson, normalizeEmail, normalizeLicenseKey, readString, json, nowIso } from "../utils";
import { findLicense, findActivation, countActivations } from "../models/db";

export async function handleActivate(request: Request, env: Env): Promise<Response> {
  const body = (await readJson<Record<string, unknown>>(request)) ?? {};
  
  const email = normalizeEmail(readString(body, ["email"]) ?? "");
  const licenseKey = normalizeLicenseKey(readString(body, ["licenseKey", "license_key"]) ?? "");
  const deviceID = readString(body, ["deviceID", "device_id"]) ?? "";
  const deviceName = readString(body, ["deviceName", "device_name"]);
  const appVersion = readString(body, ["appVersion", "app_version"]);
  const osVersion = readString(body, ["osVersion", "os_version"]);

  if (!email || !licenseKey || !deviceID) {
    return json({ status: "invalid", message: "Email, license key, and device ID are required." }, 400);
  }

  const license = await findLicense(env.DB, email, licenseKey);
  if (!license) {
    return json({ status: "invalid", message: "License not found." }, 404);
  }

  if (license.status === "revoked") {
    // We can assume usedSeats = 0 since it's revoked and doesn't matter, but let's query it if needed.
    // To match original behavior we returned 0 for revoked early
    return json(licenseSummary(license, 0, { status: "revoked", message: "This license has been revoked." }));
  }

  // OPTIMIZATION: Concurrently find activation and count activations
  const [existingActivation, usedSeats] = await Promise.all([
    findActivation(env.DB, license.id, deviceID),
    countActivations(env.DB, license.id)
  ]);

  if (existingActivation) {
    await env.DB
      .prepare("UPDATE activations SET device_name = ?, app_version = ?, os_version = ?, last_validated_at = ? WHERE id = ?")
      .bind(deviceName, appVersion, osVersion, nowIso(), existingActivation.id)
      .run();
    return json(licenseSummary(license, usedSeats, {
      status: "active",
      activationId: existingActivation.id,
      message: "License activated."
    }));
  }

  if (usedSeats >= license.max_seats) {
    return json(licenseSummary(license, usedSeats, {
      status: "exhausted",
      message: "This license has reached its device limit."
    }));
  }

  const activationId = crypto.randomUUID();
  await env.DB
    .prepare(`
      INSERT INTO activations (id, license_id, device_id, device_name, app_version, os_version, created_at, last_validated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(activationId, license.id, deviceID, deviceName, appVersion, osVersion, nowIso(), nowIso())
    .run();

  return json(licenseSummary(license, usedSeats + 1, {
    status: "active",
    activationId,
    message: "License activated."
  }));
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
