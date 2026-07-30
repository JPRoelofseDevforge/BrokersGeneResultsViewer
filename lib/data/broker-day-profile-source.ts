import { normalizeEmail } from "@/lib/access/email";

const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 15_000;

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface BrokerDayIdentity {
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}

export class BrokerDayProfileConfigurationError extends Error {
  constructor() {
    super("Broker Day profile API configuration is invalid");
    this.name = "BrokerDayProfileConfigurationError";
  }
}

export class InvalidBrokerDayProfileLinkError extends Error {
  constructor() {
    super("Broker Day rejected the private link");
    this.name = "InvalidBrokerDayProfileLinkError";
  }
}

export class BrokerDayProfileNotFoundError extends Error {
  constructor() {
    super("Broker Day profile was not found");
    this.name = "BrokerDayProfileNotFoundError";
  }
}

export class BrokerDayProfileUnavailableError extends Error {
  constructor() {
    super("Broker Day profile service is unavailable");
    this.name = "BrokerDayProfileUnavailableError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= 200 ? text : null;
}

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function brokerDayProfileEndpoint(
  configuredValue = process.env.BROKER_DAY_PROFILE_API_URL,
): URL | null {
  const configured = configuredValue?.trim();
  if (!configured) return null;

  try {
    const endpoint = new URL(configured);
    const localHttp =
      endpoint.protocol === "http:" && isLocalHost(endpoint.hostname);
    const path = endpoint.pathname.replace(/\/+$/, "");

    if (
      (endpoint.protocol !== "https:" && !localHttp) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      path !== "/api/person"
    ) {
      throw new BrokerDayProfileConfigurationError();
    }

    endpoint.pathname = path;
    return endpoint;
  } catch (error) {
    if (error instanceof BrokerDayProfileConfigurationError) throw error;
    throw new BrokerDayProfileConfigurationError();
  }
}

function projectIdentity(value: unknown): BrokerDayIdentity | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    return null;
  }

  const email = normalizeEmail(value.data.email);
  const sleepRows = value.data.sleepAssessmentSubmissions;
  const preorderRows = value.data.brokerDayPreOrders;

  if (
    !email ||
    !Array.isArray(sleepRows) ||
    !sleepRows.every(isRecord) ||
    !Array.isArray(preorderRows) ||
    !preorderRows.every(isRecord)
  ) {
    return null;
  }

  // Keep this precedence aligned with BrokerDayEndResult/ResultsProfile:
  // newest sleep full name, then newest Broker Day preorder name.
  const sleepFullName = cleanText(sleepRows[0]?.fullName);
  const firstName = cleanText(preorderRows[0]?.firstName);
  const lastName = cleanText(preorderRows[0]?.surname);
  const preorderName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    email,
    displayName:
      sleepFullName ?? (preorderName || "Your broker day profile"),
    firstName,
    lastName,
  };
}

export async function resolveBrokerDayIdentity(
  token: string,
  options: {
    endpoint?: string | URL | null;
    fetcher?: Fetcher;
  } = {},
): Promise<BrokerDayIdentity | null> {
  let endpoint: URL | null;
  if (options.endpoint === null) {
    endpoint = null;
  } else if (options.endpoint instanceof URL) {
    endpoint = brokerDayProfileEndpoint(options.endpoint.href);
  } else {
    endpoint = brokerDayProfileEndpoint(
      options.endpoint === undefined
        ? process.env.BROKER_DAY_PROFILE_API_URL
        : options.endpoint,
    );
  }
  if (!endpoint) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      cache: "no-store",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });
  } catch {
    throw new BrokerDayProfileUnavailableError();
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 400) {
    throw new InvalidBrokerDayProfileLinkError();
  }
  if (response.status === 404) {
    throw new BrokerDayProfileNotFoundError();
  }
  if (!response.ok) {
    throw new BrokerDayProfileUnavailableError();
  }

  const mediaType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new BrokerDayProfileUnavailableError();
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_RESPONSE_BYTES
  ) {
    throw new BrokerDayProfileUnavailableError();
  }

  try {
    const rawBody = await response.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_RESPONSE_BYTES) {
      throw new BrokerDayProfileUnavailableError();
    }

    const identity = projectIdentity(JSON.parse(rawBody) as unknown);
    if (!identity) throw new BrokerDayProfileUnavailableError();
    return identity;
  } catch (error) {
    if (error instanceof BrokerDayProfileUnavailableError) throw error;
    throw new BrokerDayProfileUnavailableError();
  }
}
