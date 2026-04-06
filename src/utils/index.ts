import { LicenseResponse } from "../types";

export function generateLicenseKey(prefix: string): string {
  const token = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  return `${prefix}-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}-${token.slice(12, 16)}`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeLicenseKey(value: string): string {
  return value.trim().toUpperCase();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function json(body: LicenseResponse | { status: string; message: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

export function readString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function readNestedString(obj: Record<string, unknown>, paths: string[][]): string | null {
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
