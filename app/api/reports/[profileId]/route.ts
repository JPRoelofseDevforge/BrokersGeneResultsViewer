import { getGeneReport } from "@/lib/reports/get-gene-report";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  if (process.env.PHASE_ONE_PREVIEW !== "true") {
    return Response.json(
      { error: "The preview report endpoint is disabled." },
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }

  const { profileId } = await context.params;
  const report = await getGeneReport(profileId);

  if (!report) {
    return Response.json(
      { error: "A consented gene profile was not found." },
      { status: 404 },
    );
  }

  return Response.json(report, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Gene-Rules-Version": report.receipt.rulesVersion,
    },
  });
}
