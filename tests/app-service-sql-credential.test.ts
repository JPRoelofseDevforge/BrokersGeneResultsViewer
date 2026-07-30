import assert from "node:assert/strict";
import test from "node:test";

import {
  AppServiceManagedIdentityError,
  AppServiceSqlTokenCredential,
  type IdentityRequester,
} from "../lib/data/app-service-sql-credential";

const SQL_SCOPE = "https://database.windows.net/.default";

test("requests an Azure SQL token from the protected App Service endpoint", async () => {
  let requestedEndpoint: URL | undefined;
  let requestedHeader: string | undefined;
  const requester: IdentityRequester = async (endpoint, identityHeader) => {
    requestedEndpoint = endpoint;
    requestedHeader = identityHeader;
    return {
      statusCode: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        access_token: "private-access-token",
        expires_on: String(Math.floor(Date.now() / 1_000) + 3_600),
      }),
    };
  };

  const credential = new AppServiceSqlTokenCredential(
    {
      IDENTITY_ENDPOINT: "http://127.0.0.1:41741/MSI/token?ignored=yes",
      IDENTITY_HEADER: "rotating-platform-header",
    },
    requester,
  );
  const accessToken = await credential.getToken(SQL_SCOPE);

  assert.equal(accessToken.token, "private-access-token");
  assert.ok(accessToken.expiresOnTimestamp > Date.now());
  assert.equal(requestedEndpoint?.origin, "http://127.0.0.1:41741");
  assert.equal(requestedEndpoint?.pathname, "/MSI/token");
  assert.equal(
    requestedEndpoint?.searchParams.get("resource"),
    "https://database.windows.net/",
  );
  assert.equal(
    requestedEndpoint?.searchParams.get("api-version"),
    "2019-08-01",
  );
  assert.equal(requestedEndpoint?.searchParams.has("ignored"), false);
  assert.equal(requestedHeader, "rotating-platform-header");
  assert.equal(requestedEndpoint?.href.includes(requestedHeader ?? ""), false);
});

test("rejects non-local identity endpoints and unexpected scopes", async () => {
  const external = new AppServiceSqlTokenCredential({
    IDENTITY_ENDPOINT: "https://example.com/token",
    IDENTITY_HEADER: "header",
  });
  await assert.rejects(
    external.getToken(SQL_SCOPE),
    AppServiceManagedIdentityError,
  );

  const local = new AppServiceSqlTokenCredential(
    {
      IDENTITY_ENDPOINT: "http://169.254.1.2/token",
      IDENTITY_HEADER: "header",
    },
    async () => {
      throw new Error("requester should not run");
    },
  );
  await assert.rejects(
    local.getToken("https://vault.azure.net/.default"),
    AppServiceManagedIdentityError,
  );
});

test("fails closed for rejected or malformed identity responses", async () => {
  const environment = {
    IDENTITY_ENDPOINT: "http://localhost:41741/MSI/token",
    IDENTITY_HEADER: "header",
  };
  const rejected = new AppServiceSqlTokenCredential(
    environment,
    async () => ({
      statusCode: 503,
      contentType: "application/json",
      body: '{"error":"temporarily_unavailable"}',
    }),
  );
  await assert.rejects(
    rejected.getToken(SQL_SCOPE),
    /identity endpoint returned 503/,
  );

  const malformed = new AppServiceSqlTokenCredential(
    environment,
    async () => ({
      statusCode: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "",
        expires_on: "not-a-date",
      }),
    }),
  );
  await assert.rejects(
    malformed.getToken(SQL_SCOPE),
    /did not contain a usable token/,
  );
});
