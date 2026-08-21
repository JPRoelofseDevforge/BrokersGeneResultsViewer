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
    const previousTokenTest = process.env.PHASE_ONE_TOKEN_TEST;

    try {
      process.env.QR_TOKEN_KEY = KEY;
      process.env.PHASE_ONE_TOKEN_TEST = "true";
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
      assert.equal(body.data?.id, "report-sam-240184-2026.08.16");
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

      if (previousTokenTest === undefined) {
        delete process.env.PHASE_ONE_TOKEN_TEST;
      } else {
        process.env.PHASE_ONE_TOKEN_TEST = previousTokenTest;
      }
    }
  });

  it("uses Broker Day's database-backed profile identity for the greeting", async () => {
    const previousEndpoint = process.env.BROKER_DAY_PROFILE_API_URL;
    const previousKey = process.env.QR_TOKEN_KEY;
    const previousEmail = process.env.PHASE_ONE_PROFILE_EMAIL;
    const previousTokenTest = process.env.PHASE_ONE_TOKEN_TEST;
    const previousFetch = globalThis.fetch;

    try {
      process.env.BROKER_DAY_PROFILE_API_URL =
        "https://sam.example.com/api/person";
      process.env.PHASE_ONE_TOKEN_TEST = "true";
      process.env.PHASE_ONE_PROFILE_EMAIL = "person@example.com";
      delete process.env.QR_TOKEN_KEY;
      globalThis.fetch = async () =>
        Response.json({
          ok: true,
          data: {
            email: "person@example.com",
            sleepAssessmentSubmissions: [
              { fullName: "Dr Amina Ndlovu" },
            ],
            brokerDayPreOrders: [
              { firstName: "Amina", surname: "Ndlovu" },
            ],
          },
        });

      const response = await resolveReport(
        postRequest(JSON.stringify({ token: "opaque-private-token" })),
      );
      const body = (await response.json()) as {
        ok: boolean;
        error?: string;
        person?: {
          displayName?: string;
        };
        data?: unknown;
      };

      assert.equal(response.status, 404);
      assert.equal(body.ok, false);
      assert.equal(body.error, "report-not-found");
      assert.equal(body.person?.displayName, "Dr Amina Ndlovu");
      assert.equal(body.data, undefined);
      assert.doesNotMatch(JSON.stringify(body), /person@example\.com/i);
    } finally {
      globalThis.fetch = previousFetch;

      if (previousEndpoint === undefined) {
        delete process.env.BROKER_DAY_PROFILE_API_URL;
      } else {
        process.env.BROKER_DAY_PROFILE_API_URL = previousEndpoint;
      }

      if (previousKey === undefined) delete process.env.QR_TOKEN_KEY;
      else process.env.QR_TOKEN_KEY = previousKey;

      if (previousEmail === undefined) {
        delete process.env.PHASE_ONE_PROFILE_EMAIL;
      } else {
        process.env.PHASE_ONE_PROFILE_EMAIL = previousEmail;
      }

      if (previousTokenTest === undefined) {
        delete process.env.PHASE_ONE_TOKEN_TEST;
      } else {
        process.env.PHASE_ONE_TOKEN_TEST = previousTokenTest;
      }
    }
  });

  it("falls back to a locally authenticated email only for a missing Broker Day profile", async () => {
    const previousEndpoint = process.env.BROKER_DAY_PROFILE_API_URL;
    const previousGeneSource = process.env.GENE_RESULTS_SOURCE;
    const previousKey = process.env.QR_TOKEN_KEY;
    const previousEmail = process.env.PHASE_ONE_PROFILE_EMAIL;
    const previousTokenTest = process.env.PHASE_ONE_TOKEN_TEST;
    const previousFetch = globalThis.fetch;

    try {
      process.env.BROKER_DAY_PROFILE_API_URL =
        "https://sam.example.com/api/person";
      delete process.env.GENE_RESULTS_SOURCE;
      process.env.QR_TOKEN_KEY = KEY;
      process.env.PHASE_ONE_TOKEN_TEST = "true";
      process.env.PHASE_ONE_PROFILE_EMAIL = "gene-only@example.com";
      globalThis.fetch = async () => new Response(null, { status: 404 });

      const now = Math.floor(Date.now() / 1000);
      const token = encryptBrokerDayToken(
        {
          email: "gene-only@example.com",
          iat: now - 10,
          exp: now + 600,
        },
        KEY,
        Buffer.alloc(12, 4),
      );
      const response = await resolveReport(
        postRequest(JSON.stringify({ token })),
      );
      const body = (await response.json()) as {
        ok: boolean;
        data?: { id?: string; profile?: { firstName?: string } };
      };

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.data?.id, "report-sam-240184-2026.08.16");
      assert.equal(body.data?.profile?.firstName, "Sam");
    } finally {
      globalThis.fetch = previousFetch;

      if (previousEndpoint === undefined) {
        delete process.env.BROKER_DAY_PROFILE_API_URL;
      } else {
        process.env.BROKER_DAY_PROFILE_API_URL = previousEndpoint;
      }

      if (previousGeneSource === undefined) {
        delete process.env.GENE_RESULTS_SOURCE;
      } else {
        process.env.GENE_RESULTS_SOURCE = previousGeneSource;
      }

      if (previousKey === undefined) delete process.env.QR_TOKEN_KEY;
      else process.env.QR_TOKEN_KEY = previousKey;

      if (previousEmail === undefined) {
        delete process.env.PHASE_ONE_PROFILE_EMAIL;
      } else {
        process.env.PHASE_ONE_PROFILE_EMAIL = previousEmail;
      }

      if (previousTokenTest === undefined) {
        delete process.env.PHASE_ONE_TOKEN_TEST;
      } else {
        process.env.PHASE_ONE_TOKEN_TEST = previousTokenTest;
      }
    }
  });

  it("does not fall back when Broker Day rejects the token or is unavailable", async () => {
    const previousEndpoint = process.env.BROKER_DAY_PROFILE_API_URL;
    const previousKey = process.env.QR_TOKEN_KEY;
    const previousFetch = globalThis.fetch;

    try {
      process.env.BROKER_DAY_PROFILE_API_URL =
        "https://sam.example.com/api/person";
      process.env.QR_TOKEN_KEY = KEY;
      const now = Math.floor(Date.now() / 1000);
      const token = encryptBrokerDayToken(
        {
          email: "gene-only@example.com",
          iat: now - 10,
          exp: now + 600,
        },
        KEY,
        Buffer.alloc(12, 5),
      );

      for (const scenario of [
        {
          upstreamStatus: 400,
          expectedStatus: 400,
          expectedError: "invalid-or-expired-link",
        },
        {
          upstreamStatus: 500,
          expectedStatus: 503,
          expectedError: "profile-service-unavailable",
        },
      ]) {
        globalThis.fetch = async () =>
          new Response(null, { status: scenario.upstreamStatus });
        const response = await resolveReport(
          postRequest(JSON.stringify({ token })),
        );
        const body = (await response.json()) as { error?: string };

        assert.equal(response.status, scenario.expectedStatus);
        assert.equal(body.error, scenario.expectedError);
      }

      globalThis.fetch = async () => new Response(null, { status: 404 });
      const invalidLocalToken = await resolveReport(
        postRequest(JSON.stringify({ token: "not-a-valid-token" })),
      );
      const invalidBody = (await invalidLocalToken.json()) as {
        error?: string;
      };
      assert.equal(invalidLocalToken.status, 400);
      assert.equal(invalidBody.error, "invalid-or-expired-link");
    } finally {
      globalThis.fetch = previousFetch;

      if (previousEndpoint === undefined) {
        delete process.env.BROKER_DAY_PROFILE_API_URL;
      } else {
        process.env.BROKER_DAY_PROFILE_API_URL = previousEndpoint;
      }

      if (previousKey === undefined) delete process.env.QR_TOKEN_KEY;
      else process.env.QR_TOKEN_KEY = previousKey;
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
