import { LicenseRow, ActivationRow } from "../types";

export async function findLicense(db: D1Database, email: string, licenseKey: string): Promise<LicenseRow | null> {
  return db
    .prepare(`
      SELECT id, email, license_key, plan_code, max_seats, status, paddle_transaction_id, email_sent_at
      FROM licenses
      WHERE email = ? AND license_key = ?
      LIMIT 1
    `)
    .bind(email, licenseKey)
    .first<LicenseRow>();
}

export async function findActivation(db: D1Database, licenseID: string, deviceID: string): Promise<ActivationRow | null> {
  return db
    .prepare(`
      SELECT id, license_id, device_id, device_name, app_version, os_version
      FROM activations
      WHERE license_id = ? AND device_id = ?
      LIMIT 1
    `)
    .bind(licenseID, deviceID)
    .first<ActivationRow>();
}

export async function countActivations(db: D1Database, licenseID: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM activations WHERE license_id = ?")
    .bind(licenseID)
    .first<{ count: number | string }>();
  return Number(row?.count ?? 0);
}
