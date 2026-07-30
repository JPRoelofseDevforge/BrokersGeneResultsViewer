import {
  BrokerDayTokenConfigurationError,
  decryptBrokerDayToken,
  InvalidBrokerDayTokenError,
} from "@/lib/access/broker-day-token";
import {
  BrokerDayProfileConfigurationError,
  BrokerDayProfileNotFoundError,
  BrokerDayProfileUnavailableError,
  InvalidBrokerDayProfileLinkError,
  resolveBrokerDayIdentity,
} from "@/lib/data/broker-day-profile-source";
import { getGeneReportByEmail } from "@/lib/reports/get-gene-report";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;
const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "Content-Type": "application/json; charset=utf-8",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readToken(request: Request): Promise<string | null> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") return null;

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return null;
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return null;

    const body = JSON.parse(rawBody) as unknown;
    if (!isRecord(body)) return null;

    const keys = Object.keys(body);
    if (
      keys.length !== 1 ||
      keys[0] !== "token" ||
      typeof body.token !== "string"
    ) {
      return null;
    }

    return body.token;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const token = await readToken(request);
  if (token === null) {
    return Response.json(
      { ok: false, error: "invalid-request" },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const brokerDayIdentity = await resolveBrokerDayIdentity(token);
    const email =
      brokerDayIdentity?.email ?? decryptBrokerDayToken(token).email;
    const report = await getGeneReportByEmail(
      email,
      brokerDayIdentity ?? undefined,
    );

    if (!report) {
      return Response.json(
        {
          ok: false,
          error: "report-not-found",
          ...(brokerDayIdentity
            ? {
                person: {
                  displayName: brokerDayIdentity.displayName,
                },
              }
            : {}),
        },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }

    return Response.json(
      { ok: true, data: report },
      {
        headers: {
          ...PRIVATE_HEADERS,
          "X-Gene-Rules-Version": report.receipt.rulesVersion,
        },
      },
    );
  } catch (error) {
    if (
      error instanceof BrokerDayTokenConfigurationError ||
      error instanceof BrokerDayProfileConfigurationError
    ) {
      return Response.json(
        { ok: false, error: "service-not-configured" },
        { status: 503, headers: PRIVATE_HEADERS },
      );
    }

    if (error instanceof BrokerDayProfileUnavailableError) {
      return Response.json(
        { ok: false, error: "profile-service-unavailable" },
        { status: 503, headers: PRIVATE_HEADERS },
      );
    }

    if (
      error instanceof InvalidBrokerDayTokenError ||
      error instanceof InvalidBrokerDayProfileLinkError
    ) {
      return Response.json(
        { ok: false, error: "invalid-or-expired-link" },
        { status: 400, headers: PRIVATE_HEADERS },
      );
    }

    if (error instanceof BrokerDayProfileNotFoundError) {
      return Response.json(
        { ok: false, error: "profile-not-found" },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }

    return Response.json(
      { ok: false, error: "report-unavailable" },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}

export function GET() {
  return Response.json(
    { ok: false, error: "method-not-allowed" },
    {
      status: 405,
      headers: { ...PRIVATE_HEADERS, Allow: "POST" },
    },
  );
}
