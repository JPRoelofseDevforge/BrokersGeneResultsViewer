import { ReportDashboard } from "@/app/report-dashboard";
import { getGeneReport } from "@/lib/reports/get-gene-report";

const PHASE_ONE_PROFILE_ID = "sam-240184";

export default async function Home() {
  const report = await getGeneReport(PHASE_ONE_PROFILE_ID);

  if (!report) {
    return (
      <main className="empty-state">
        <span className="brand">
          sam<span aria-hidden="true">.</span>
        </span>
        <h1>No consented gene report is available.</h1>
        <p>
          The member record could not be loaded. No report has been generated.
        </p>
      </main>
    );
  }

  return <ReportDashboard report={report} />;
}
