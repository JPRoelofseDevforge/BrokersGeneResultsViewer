import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { normalizeEmail } from "@/lib/access/email";

const TOKEN_VERSION = "v1";
const TOKEN_AAD = Buffer.from("sam-profile:v1", "utf8");
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CLOCK_SKEW_SECONDS = 300;
const MAX_TOKEN_LENGTH = 4096;
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;
const STANDARD_BASE64_KEY = /^[A-Za-z0-9+/]+={0,2}$/;

export class InvalidBrokerDayTokenError extends Error {
  constructor() {
    super("Invalid Broker Day token");
    this.name = "InvalidBrokerDayTokenError";
  }
}

export class BrokerDayTokenConfigurationError extends Error {
  constructor() {
    super("QR_TOKEN_KEY must be a base64-encoded 32-byte key");
    this.name = "BrokerDayTokenConfigurationError";
  }
}

export interface BrokerDayTokenPayload {
  email: string;
  iat: number;
  exp: number;
}

export function decodeBrokerDayKey(encodedKey: string | undefined): Buffer {
  const value = encodedKey?.trim() ?? "";
  if (!value || !STANDARD_BASE64_KEY.test(value)) {
    throw new BrokerDayTokenConfigurationError();
  }

  const unpaddedLength = value.replace(/=+$/, "").length;
  if (unpaddedLength % 4 === 1) {
    throw new BrokerDayTokenConfigurationError();
  }

  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const key = Buffer.from(padded, "base64");
  if (key.length !== 32) throw new BrokerDayTokenConfigurationError();

  return key;
}

function decodeSegment(segment: string): Buffer {
  if (!segment || !BASE64URL_SEGMENT.test(segment)) {
    throw new InvalidBrokerDayTokenError();
  }

  try {
    return Buffer.from(segment, "base64url");
  } catch {
    throw new InvalidBrokerDayTokenError();
  }
}

function isUnixSeconds(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function decryptBrokerDayToken(
  token: unknown,
  encodedKey: string | undefined = process.env.QR_TOKEN_KEY,
  nowSeconds = Math.floor(Date.now() / 1000),
): BrokerDayTokenPayload {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > MAX_TOKEN_LENGTH
  ) {
    throw new InvalidBrokerDayTokenError();
  }

  const key = decodeBrokerDayKey(encodedKey);
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    throw new InvalidBrokerDayTokenError();
  }

  const iv = decodeSegment(parts[1]);
  const ciphertext = decodeSegment(parts[2]);
  const authTag = decodeSegment(parts[3]);
  if (
    iv.length !== IV_BYTES ||
    !ciphertext.length ||
    authTag.length !== AUTH_TAG_BYTES
  ) {
    throw new InvalidBrokerDayTokenError();
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;
    const email = normalizeEmail(parsed.email);

    if (
      !email ||
      !isUnixSeconds(parsed.iat) ||
      !isUnixSeconds(parsed.exp) ||
      parsed.iat > nowSeconds + CLOCK_SKEW_SECONDS ||
      parsed.exp <= nowSeconds ||
      parsed.exp <= parsed.iat
    ) {
      throw new InvalidBrokerDayTokenError();
    }

    return { email, iat: parsed.iat, exp: parsed.exp };
  } catch (error) {
    if (error instanceof InvalidBrokerDayTokenError) throw error;
    throw new InvalidBrokerDayTokenError();
  }
}

/** Used by trusted generation tooling and compatibility tests only. */
export function encryptBrokerDayToken(
  payload: BrokerDayTokenPayload,
  encodedKey: string,
  iv: Buffer = randomBytes(IV_BYTES),
): string {
  const key = decodeBrokerDayKey(encodedKey);
  const email = normalizeEmail(payload.email);
  if (
    !email ||
    iv.length !== IV_BYTES ||
    !isUnixSeconds(payload.iat) ||
    !isUnixSeconds(payload.exp) ||
    payload.exp <= payload.iat
  ) {
    throw new InvalidBrokerDayTokenError();
  }

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({ email, iat: payload.iat, exp: payload.exp }),
      "utf8",
    ),
    cipher.final(),
  ]);

  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}
