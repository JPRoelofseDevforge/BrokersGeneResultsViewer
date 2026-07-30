import { PhaseOneGeneResultsSource } from "@/lib/data/phase-one-gene-results-source";
import { markerCatalogue } from "@/lib/gene-processing/catalogue";
import { processGeneReport } from "@/lib/gene-processing/process-report";

const source = new PhaseOneGeneResultsSource();

export async function getGeneReport(profileId: string) {
  const profile = await source.getProfile(profileId);
  if (!profile || profile.consentStatus !== "active") return null;

  const genotypeRecords = await source.getGenotypeRecords(profileId);
  return processGeneReport(profile, genotypeRecords, markerCatalogue);
}
