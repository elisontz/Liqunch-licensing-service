import { Env, LicenseRow, LicenseResponse } from "../types";
import { readJson, normalizeEmail, normalizeLicenseKey, readString, json, nowIso } from "../utils";
import { findLicense, findActivation, countActivations } from "../models/db";

export async function handleValidate(request: Request, env: Env): Promise<Response> {
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

  // OPTIMIZATION: Concurrently find activation and count activations
  const [activation, usedSeats] = await Promise.all([
    findActivation(env.DB, license.id, deviceID),
    countActivations(env.DB, license.id)
  ]);

  if (license.status === "revoked") {
    return json(licenseSummary(license, usedSeats, {
      status: "revoked",
      message: "This license has been revoked."
    }));
  }

  if (!activation) {
    return json(licenseSummary(license, usedSeats, {
      status: "invalid",
      message: "This device is not activated for the provided license."
    }));
  }

  await env.DB
    .prepare("UPDATE activations SET device_name = ?, app_version = ?, os_version = ?, last_validated_at = ? WHERE id = ?")
    .bind(deviceName, appVersion, osVersion, nowIso(), activation.id)
    .run();

  return json(licenseSummary(license, usedSeats, {
    status: "active",
    activationId: activation.id,
    message: "License is active."
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
