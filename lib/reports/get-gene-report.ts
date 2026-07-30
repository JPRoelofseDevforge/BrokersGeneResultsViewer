import type { GeneResultsSource } from "@/lib/data/gene-results-source";
import { PhaseOneGeneResultsSource } from "@/lib/data/phase-one-gene-results-source";
import type { BrokerDayIdentity } from "@/lib/data/broker-day-profile-source";
import { markerCatalogue } from "@/lib/gene-processing/catalogue";
import { processGeneReport } from "@/lib/gene-processing/process-report";

const source: GeneResultsSource = new PhaseOneGeneResultsSource();

export async function getGeneReport(profileId: string) {
  const profile = await source.getProfile(profileId);
  return buildReport(profile, source);
}

export async function getGeneReportByEmail(
  email: string,
  identity?: BrokerDayIdentity,
  resultsSource: GeneResultsSource = source,
) {
  // A real database identity must never label the demonstration genotype
  // fixture. Until the production gene source exists, the caller receives the
  // matched person's safe "report not ready" state instead.
  if (identity && resultsSource.sourceMode === "demonstration") return null;

  const profile = await resultsSource.getProfileByEmail(email);
  if (!profile) return null;

  return buildReport(
    {
      ...profile,
      displayName: identity?.displayName ?? profile.displayName,
      firstName: identity ? identity.firstName ?? "" : profile.firstName,
      lastName: identity ? identity.lastName ?? "" : profile.lastName,
    },
    resultsSource,
  );
}

async function buildReport(
  profile: Awaited<ReturnType<GeneResultsSource["getProfile"]>>,
  resultsSource: GeneResultsSource,
) {
  if (!profile || profile.consentStatus !== "active") return null;

  const genotypeRecords = await resultsSource.getGenotypeRecords(profile.id);
  return processGeneReport(profile, genotypeRecords, markerCatalogue);
}
