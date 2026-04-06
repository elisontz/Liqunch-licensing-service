import { Env, LicenseRow, LicenseResponse } from "../types";
import { readJson, normalizeEmail, normalizeLicenseKey, readString, json } from "../utils";
import { findLicense, countActivations } from "../models/db";

export async function handleDeactivate(request: Request, env: Env): Promise<Response> {
  const body = (await readJson<Record<string, unknown>>(request)) ?? {};

  const email = normalizeEmail(readString(body, ["email"]) ?? "");
  const licenseKey = normalizeLicenseKey(readString(body, ["licenseKey", "license_key"]) ?? "");
  const deviceID = readString(body, ["deviceID", "device_id"]) ?? "";

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
