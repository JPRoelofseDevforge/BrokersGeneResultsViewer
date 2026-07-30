import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET as getPreviewReport } from "../app/api/reports/[profileId]/route";
import { POST as resolveReport } from "../app/api/reports/resolve/route";
import { encryptBrokerDayToken } from "../lib/access/broker-day-token";

const KEY = Buffer.alloc(32, 7).toString("base64");

function postRequest(body: string, contentType = "application/json") {
  return new Request("http://localhost/api/reports/resolve", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

describe("private report route boundary", () => {
  it("rejects unsupported media, extra fields, and oversized JSON", async () => {
    const unsupported = await resolveReport(
      postRequest('{"token":"value"}', "text/plain"),
    );
    assert.equal(unsupported.status, 400);

    const extraField = await resolveReport(
      postRequest('{"token":"value","email":"person@example.com"}'),
    );
    assert.equal(extraField.status, 400);

    const oversized = await resolveReport(
      postRequest(JSON.stringify({ token: "x".repeat(8_193) })),
    );
    assert.equal(oversized.status, 400);
  });

  it("resolves a compatible token only through the configured lookup", async () => {
    const previousKey = process.env.QR_TOKEN_KEY;
    const previousEmail = process.env.PHASE_ONE_PROFILE_EMAIL;

    try {
      process.env.QR_TOKEN_KEY = KEY;
      process.env.PHASE_ONE_PROFILE_EMAIL = "person@example.com";
      const now = Math.floor(Date.now() / 1000);
      const token = encryptBrokerDayToken(
        {
          email: "person@example.com",
          iat: now - 10,
          exp: now + 600,
        },
        KEY,
        Buffer.alloc(12, 3),
      );

      const response = await resolveReport(
        postRequest(JSON.stringify({ token })),
      );
      const body = (await response.json()) as {
        ok: boolean;
        data?: { id?: string };
      };

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.data?.id, "report-sam-240184-2026.07.29");
      assert.equal(
        response.headers.get("cache-control"),
        "no-store, no-cache, must-revalidate, private, max-age=0",
      );
    } finally {
      if (previousKey === undefined) delete process.env.QR_TOKEN_KEY;
      else process.env.QR_TOKEN_KEY = previousKey;

      if (previousEmail === undefined) {
        delete process.env.PHASE_ONE_PROFILE_EMAIL;
      } else {
        process.env.PHASE_ONE_PROFILE_EMAIL = previousEmail;
      }
    }
  });
});

describe("Phase 1 preview boundary", () => {
  it("is disabled by default and requires an explicit opt-in", async () => {
    const previousPreview = process.env.PHASE_ONE_PREVIEW;

    try {
      delete process.env.PHASE_ONE_PREVIEW;
      const closed = await getPreviewReport(new Request("http://localhost"), {
        params: Promise.resolve({ profileId: "sam-240184" }),
      });
      assert.equal(closed.status, 404);

      process.env.PHASE_ONE_PREVIEW = "true";
      const open = await getPreviewReport(new Request("http://localhost"), {
        params: Promise.resolve({ profileId: "sam-240184" }),
      });
      assert.equal(open.status, 200);
    } finally {
      if (previousPreview === undefined) {
        delete process.env.PHASE_ONE_PREVIEW;
      } else {
        process.env.PHASE_ONE_PREVIEW = previousPreview;
      }
    }
  });
});
