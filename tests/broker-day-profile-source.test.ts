import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BrokerDayProfileConfigurationError,
  BrokerDayProfileNotFoundError,
  brokerDayProfileEndpoint,
  resolveBrokerDayIdentity,
} from "../lib/data/broker-day-profile-source";

describe("Broker Day database-backed identity source", () => {
  it("accepts only the fixed HTTPS person endpoint", () => {
    assert.equal(
      brokerDayProfileEndpoint("https://sam.example.com/api/person")?.href,
      "https://sam.example.com/api/person",
    );
    assert.equal(
      brokerDayProfileEndpoint("http://localhost:7071/api/person")?.href,
      "http://localhost:7071/api/person",
    );

    for (const endpoint of [
      "http://sam.example.com/api/person",
      "https://sam.example.com/other",
      "https://sam.example.com/api/person?code=secret",
      "https://user:pass@sam.example.com/api/person",
    ]) {
      assert.throws(
        () => brokerDayProfileEndpoint(endpoint),
        BrokerDayProfileConfigurationError,
      );
    }
  });

  it("forwards only the token and mirrors Broker Day name precedence", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;

    const identity = await resolveBrokerDayIdentity("private-token", {
      endpoint: "https://sam.example.com/api/person",
      fetcher: async (input, init) => {
        requestedUrl = String(input);
        requestedInit = init;
        return Response.json({
          ok: true,
          data: {
            email: " Person@Example.COM ",
            sleepAssessmentSubmissions: [
              { fullName: " Dr Amina Ndlovu " },
            ],
            brokerDayPreOrders: [
              { firstName: "Amina", surname: "Ndlovu" },
            ],
          },
        });
      },
    });

    assert.deepEqual(identity, {
      email: "person@example.com",
      displayName: "Dr Amina Ndlovu",
      firstName: "Amina",
      lastName: "Ndlovu",
    });
    assert.equal(requestedUrl, "https://sam.example.com/api/person");
    assert.equal(requestedInit?.method, "POST");
    assert.equal(requestedInit?.cache, "no-store");
    assert.equal(requestedInit?.redirect, "manual");
    assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
      token: "private-token",
    });
  });

  it("uses the latest preorder name when no sleep name is present", async () => {
    const identity = await resolveBrokerDayIdentity("private-token", {
      endpoint: "https://sam.example.com/api/person",
      fetcher: async () =>
        Response.json({
          ok: true,
          data: {
            email: "person@example.com",
            sleepAssessmentSubmissions: [],
            brokerDayPreOrders: [
              { firstName: "Amina", surname: "Ndlovu" },
              { firstName: "Older", surname: "Record" },
            ],
          },
        }),
    });

    assert.equal(identity?.displayName, "Amina Ndlovu");
  });

  it("keeps the same generic fallback as Broker Day when no name exists", async () => {
    const identity = await resolveBrokerDayIdentity("private-token", {
      endpoint: "https://sam.example.com/api/person",
      fetcher: async () =>
        Response.json({
          ok: true,
          data: {
            email: "person@example.com",
            sleepAssessmentSubmissions: [{}],
            brokerDayPreOrders: [{}],
          },
        }),
    });

    assert.equal(identity?.displayName, "Your broker day profile");
    assert.equal(identity?.firstName, null);
    assert.equal(identity?.lastName, null);
  });

  it("keeps a missing Broker Day profile distinct from service failures", async () => {
    await assert.rejects(
      resolveBrokerDayIdentity("private-token", {
        endpoint: "https://sam.example.com/api/person",
        fetcher: async () => new Response(null, { status: 404 }),
      }),
      BrokerDayProfileNotFoundError,
    );
  });
});
