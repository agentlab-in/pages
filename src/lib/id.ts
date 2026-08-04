import { randomBytes } from "node:crypto";

const ID_RE = /^[a-z0-9]{4,32}$/;

/** Short lowercase alphanumeric id (default 6 chars). */
export function generateId(length = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

export function assertValidId(id: string): string {
  const normalized = id.trim().toLowerCase();
  if (!isValidId(normalized)) {
    throw new Error(
      `Invalid page id "${id}". Use 4-32 lowercase letters or digits.`,
    );
  }
  return normalized;
}
