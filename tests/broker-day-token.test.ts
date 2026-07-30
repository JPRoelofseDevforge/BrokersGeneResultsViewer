import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BrokerDayTokenConfigurationError,
  decryptBrokerDayToken,
  encryptBrokerDayToken,
  InvalidBrokerDayTokenError,
} from "../lib/access/broker-day-token";
import { normalizeEmail } from "../lib/access/email";

const KEY_BYTES = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);
const KEY = KEY_BYTES.toString("base64");
const IV = Buffer.from("101112131415161718191a1b", "hex");
const NOW = 1_800_000_000;

describe("Broker Day token compatibility", () => {
  it("round-trips the shared v1 AES-256-GCM envelope", () => {
    const token = encryptBrokerDayToken(
      {
        email: " Person+SAM@Example.COM ",
        iat: NOW - 60,
        exp: NOW + 3600,
      },
      KEY,
      IV,
    );

    assert.match(
      token,
      /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    assert.deepEqual(decryptBrokerDayToken(token, KEY, NOW), {
      email: "person+sam@example.com",
      iat: NOW - 60,
      exp: NOW + 3600,
    });
  });

  it("rejects expired and tampered links", () => {
    const expired = encryptBrokerDayToken(
      {
        email: "person@example.com",
        iat: NOW - 3600,
        exp: NOW,
      },
      KEY,
      IV,
    );
    assert.throws(
      () => decryptBrokerDayToken(expired, KEY, NOW),
      InvalidBrokerDayTokenError,
    );

    const valid = encryptBrokerDayToken(
      {
        email: "person@example.com",
        iat: NOW - 60,
        exp: NOW + 3600,
      },
      KEY,
      IV,
    );
    const parts = valid.split(".");
    const tag = Buffer.from(parts[3], "base64url");
    tag[0] ^= 0xff;
    parts[3] = tag.toString("base64url");

    assert.throws(
      () => decryptBrokerDayToken(parts.join("."), KEY, NOW),
      InvalidBrokerDayTokenError,
    );
  });

  it("requires the shared 32-byte base64 key", () => {
    const token = encryptBrokerDayToken(
      {
        email: "person@example.com",
        iat: NOW - 60,
        exp: NOW + 3600,
      },
      KEY,
      IV,
    );

    assert.throws(
      () => decryptBrokerDayToken(token, "", NOW),
      BrokerDayTokenConfigurationError,
    );
    assert.throws(
      () =>
        decryptBrokerDayToken(
          token,
          Buffer.alloc(31).toString("base64"),
          NOW,
        ),
      BrokerDayTokenConfigurationError,
    );
  });
});

describe("Broker Day identity lookup", () => {
  it("normalizes valid lookup emails and rejects malformed values", () => {
    assert.equal(
      normalizeEmail(" Person+SAM@Example.COM "),
      "person+sam@example.com",
    );
    assert.equal(normalizeEmail("not-an-email"), null);
    assert.equal(normalizeEmail("a..b@example.com"), null);
  });
});
