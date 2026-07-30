import type { GeneResultsSource } from "@/lib/data/gene-results-source";
import { PhaseOneGeneResultsSource } from "@/lib/data/phase-one-gene-results-source";
import { markerCatalogue } from "@/lib/gene-processing/catalogue";
import { processGeneReport } from "@/lib/gene-processing/process-report";

const source = new PhaseOneGeneResultsSource();

export async function getGeneReport(profileId: string) {
  const profile = await source.getProfile(profileId);
  return buildReport(profile);
}

export async function getGeneReportByEmail(email: string) {
  const profile = await source.getProfileByEmail(email);
  return buildReport(profile);
}

async function buildReport(
  profile: Awaited<ReturnType<GeneResultsSource["getProfile"]>>,
) {
  if (!profile || profile.consentStatus !== "active") return null;

  const genotypeRecords = await source.getGenotypeRecords(profile.id);
  return processGeneReport(profile, genotypeRecords, markerCatalogue);
}
