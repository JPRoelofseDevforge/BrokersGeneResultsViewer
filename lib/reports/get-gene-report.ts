import {
  GeneResultsConfigurationError,
  GeneResultsIntegrityError,
  type GeneResultsSource,
} from "@/lib/data/gene-results-source";
import { PhaseOneGeneResultsSource } from "@/lib/data/phase-one-gene-results-source";
import type { BrokerDayIdentity } from "@/lib/data/broker-day-profile-source";
import { markerCatalogue } from "@/lib/gene-processing/catalogue";
import { processGeneReport } from "@/lib/gene-processing/process-report";

const previewSource: GeneResultsSource = new PhaseOneGeneResultsSource();
let azureSqlSourcePromise: Promise<GeneResultsSource> | undefined;

async function configuredGeneResultsSource(): Promise<GeneResultsSource> {
  const configured = process.env.GENE_RESULTS_SOURCE?.trim().toLowerCase();
  if (!configured || configured === "demonstration") return previewSource;

  if (configured !== "azure-sql") {
    throw new GeneResultsConfigurationError();
  }

  azureSqlSourcePromise ??= import(
    "@/lib/data/azure-sql-gene-results-source"
  ).then(({ AzureSqlGeneResultsSource }) => new AzureSqlGeneResultsSource());
  return azureSqlSourcePromise;
}

export async function getGeneReport(profileId: string) {
  const profile = await previewSource.getProfile(profileId);
  return buildReport(profile, previewSource);
}

export async function getGeneReportByEmail(
  email: string,
  identity?: BrokerDayIdentity,
  resultsSource?: GeneResultsSource,
) {
  const selectedSource = resultsSource ?? (await configuredGeneResultsSource());

  // A real database identity must never label the demonstration genotype
  // fixture. A deployment that has not selected the production source returns
  // the matched person's safe "report not ready" state instead.
  if (identity && selectedSource.sourceMode === "demonstration") return null;

  const profile = await selectedSource.getProfileByEmail(email);
  if (!profile) return null;

  return buildReport(
    {
      ...profile,
      displayName: identity?.displayName ?? profile.displayName,
      firstName: identity ? identity.firstName ?? "" : profile.firstName,
      lastName: identity ? identity.lastName ?? "" : profile.lastName,
    },
    selectedSource,
  );
}

async function buildReport(
  profile: Awaited<ReturnType<GeneResultsSource["getProfile"]>>,
  resultsSource: GeneResultsSource,
) {
  if (!profile || profile.reportAccessStatus !== "enabled") return null;

  const genotypeRecords = await resultsSource.getGenotypeRecords(profile.id);
  if (!genotypeRecords.length) {
    if (resultsSource.sourceMode === "production") {
      throw new GeneResultsIntegrityError();
    }
    return null;
  }

  const report = processGeneReport(profile, genotypeRecords, markerCatalogue, {
    source:
      resultsSource.sourceMode === "production"
        ? "azure-sql"
        : "seeded-repository",
    sourceLabel:
      resultsSource.sourceMode === "production"
        ? "the protected Intelligene database"
        : "the Phase 1 member repository",
    asOf: new Date().toISOString(),
  });

  return report.receipt.calledMarkers ? report : null;
}
