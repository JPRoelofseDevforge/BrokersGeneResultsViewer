import { ReportPortal } from "@/app/report-portal";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <ReportPortal previewEnabled={process.env.PHASE_ONE_PREVIEW === "true"} />
  );
}
