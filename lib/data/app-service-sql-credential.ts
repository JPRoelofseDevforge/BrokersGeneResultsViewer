import type {
  AccessToken,
  TokenCredential,
} from "@azure/core-auth";
import { request as httpRequest } from "node:http";

const SQL_SCOPE = "https://database.windows.net/.default";
const SQL_RESOURCE = "https://database.windows.net/";
const TOKEN_API_VERSION = "2019-08-01";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 65_536;

interface IdentityEnvironment {
  IDENTITY_ENDPOINT?: string;
  IDENTITY_HEADER?: string;
}

interface IdentityResponse {
  statusCode: number;
  contentType: string | null;
  body: string;
}

export type IdentityRequester = (
  endpoint: URL,
  identityHeader: string,
) => Promise<IdentityResponse>;

export class AppServiceManagedIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppServiceManagedIdentityError";
  }
}

function isLocalIdentityHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("169.254.")
  );
}

function identityEndpoint(environment: IdentityEnvironment): {
  endpoint: URL;
  identityHeader: string;
} {
  const rawEndpoint = environment.IDENTITY_ENDPOINT?.trim();
  const identityHeader = environment.IDENTITY_HEADER?.trim();
  if (!rawEndpoint || !identityHeader) {
    throw new AppServiceManagedIdentityError(
      "App Service identity endpoint is not configured",
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new AppServiceManagedIdentityError(
      "App Service identity endpoint is invalid",
    );
  }

  if (
    endpoint.protocol !== "http:" ||
    !isLocalIdentityHost(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  ) {
    throw new AppServiceManagedIdentityError(
      "App Service identity endpoint is not a local HTTP endpoint",
    );
  }

  endpoint.search = "";
  endpoint.searchParams.set("resource", SQL_RESOURCE);
  endpoint.searchParams.set("api-version", TOKEN_API_VERSION);

  return { endpoint, identityHeader };
}

function requestIdentity(
  endpoint: URL,
  identityHeader: string,
): Promise<IdentityResponse> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      endpoint,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-IDENTITY-HEADER": identityHeader,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let byteLength = 0;

        response.on("data", (chunk: Buffer | string) => {
          const bytes = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, "utf8");
          byteLength += bytes.length;
          if (byteLength > MAX_RESPONSE_BYTES) {
            request.destroy(
              new AppServiceManagedIdentityError(
                "App Service identity response was too large",
              ),
            );
            return;
          }
          chunks.push(bytes);
        });

        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            contentType:
              typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : null,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new AppServiceManagedIdentityError(
          "App Service identity endpoint timed out",
        ),
      );
    });
    request.on("error", (error) => {
      reject(
        error instanceof AppServiceManagedIdentityError
          ? error
          : new AppServiceManagedIdentityError(
              `App Service identity endpoint failed: ${
                typeof (error as NodeJS.ErrnoException).code === "string"
                  ? (error as NodeJS.ErrnoException).code
                  : "network-error"
              }`,
            ),
      );
    });
    request.end();
  });
}

function expirationTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1_000;
  }

  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    if (!Number.isSafeInteger(numeric)) return null;
    return numeric > 10_000_000_000 ? numeric : numeric * 1_000;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectAccessToken(response: IdentityResponse): AccessToken {
  if (response.statusCode !== 200) {
    throw new AppServiceManagedIdentityError(
      `App Service identity endpoint returned ${response.statusCode}`,
    );
  }

  if (
    response.contentType?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    throw new AppServiceManagedIdentityError(
      "App Service identity response was not JSON",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(response.body) as unknown;
  } catch {
    throw new AppServiceManagedIdentityError(
      "App Service identity response was malformed",
    );
  }

  if (typeof payload !== "object" || payload === null) {
    throw new AppServiceManagedIdentityError(
      "App Service identity response was malformed",
    );
  }

  const token = Reflect.get(payload, "access_token");
  const expiresOnTimestamp = expirationTimestamp(
    Reflect.get(payload, "expires_on"),
  );
  if (
    typeof token !== "string" ||
    !token.trim() ||
    token.length > MAX_RESPONSE_BYTES ||
    expiresOnTimestamp === null ||
    expiresOnTimestamp <= Date.now() + 30_000
  ) {
    throw new AppServiceManagedIdentityError(
      "App Service identity response did not contain a usable token",
    );
  }

  return {
    token,
    expiresOnTimestamp,
  };
}

export class AppServiceSqlTokenCredential implements TokenCredential {
  constructor(
    private readonly environment: IdentityEnvironment = {
      IDENTITY_ENDPOINT: process.env.IDENTITY_ENDPOINT,
      IDENTITY_HEADER: process.env.IDENTITY_HEADER,
    },
    private readonly requester: IdentityRequester = requestIdentity,
  ) {}

  async getToken(scopes: string | string[]): Promise<AccessToken> {
    const requestedScopes = Array.isArray(scopes) ? scopes : [scopes];
    if (requestedScopes.length !== 1 || requestedScopes[0] !== SQL_SCOPE) {
      throw new AppServiceManagedIdentityError(
        "App Service SQL credential rejected an unexpected token scope",
      );
    }

    const { endpoint, identityHeader } = identityEndpoint(this.environment);
    return projectAccessToken(
      await this.requester(endpoint, identityHeader),
    );
  }
}
