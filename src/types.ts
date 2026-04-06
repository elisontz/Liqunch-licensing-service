export interface Env {
  DB: D1Database;
  LICENSE_KEY_PREFIX: string;
  PADDLE_SINGLE_PRICE_ID: string;
  PADDLE_SINGLE_TEST_PRICE_ID?: string;
  PADDLE_DOUBLE_PRICE_ID: string;
  PADDLE_WEBHOOK_SECRET: string;
  PADDLE_API_KEY?: string;
  SMTP2GO_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_REPLY_TO?: string;
  SUPPORT_EMAIL?: string;
}

export interface LicenseRow {
  id: string;
  email: string;
  license_key: string;
  plan_code: string;
  max_seats: number;
  status: "active" | "revoked";
  paddle_transaction_id: string | null;
  email_sent_at?: string | null;
}

export interface ActivationRow {
  id: string;
  license_id: string;
  device_id: string;
  device_name?: string | null;
  app_version?: string | null;
  os_version?: string | null;
}

export interface ActivationRequest {
  email: string;
  licenseKey: string;
  deviceID: string;
  deviceName?: string;
  appVersion?: string;
  osVersion?: string;
}

export interface ValidateRequest {
  email: string;
  licenseKey: string;
  deviceID: string;
  deviceName?: string;
  appVersion?: string;
  osVersion?: string;
}

export type LicenseResponseStatus = "active" | "invalid" | "revoked" | "exhausted" | "deactivated";

export interface LicenseResponse {
  status: LicenseResponseStatus;
  email?: string;
  licenseKey?: string;
  maxSeats?: number;
  usedSeats?: number;
  activationId?: string;
  message?: string;
}

export type PlanCode = "single" | "double";

export interface CreatedLicenseDetails {
  email: string;
  licenseKey: string;
  planCode: PlanCode;
  transactionID: string;
}

export interface LicenseEmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface EmailDeliveryResult {
  attempted: boolean;
  delivered: boolean;
  error?: string;
}
