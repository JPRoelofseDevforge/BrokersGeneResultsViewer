import type {
  GeneReport,
  MarkerState,
  ProcessedMarker,
} from "@/lib/gene-processing/types";
import { reportDisplayName } from "@/lib/reports/profile-display";

export const REFERENCE_REPORT_MESSAGE = "sam-reference-report";

export interface ReferenceMarkerResult {
  state: MarkerState;
  genotype: string | null;
  rawGenotype: string | null;
  leverage: ProcessedMarker["leverage"];
  interpretation: string;
  strandFlipped: boolean;
  strandAmbiguous: boolean;
}

export interface ReferenceUnmappedMarker {
  key: string;
  gene: string;
  variantId: string;
  expectedAlleles: string;
  rawGenotype: string | null;
  genotype: string | null;
  interpretation: string;
  assayNote: string | null;
  quality: number | null;
  state: Extract<MarkerState, "unmapped">;
}

export interface ReferenceReportPayload {
  type: typeof REFERENCE_REPORT_MESSAGE;
  version: 1;
  reportKey: string;
  profile: {
    name: string;
    memberNumber: string;
    assayName: string;
    sexAtBirth: GeneReport["profile"]["sexAtBirth"];
  };
  receipt: {
    sourceLabel: string;
    genotypeRows: number;
    catalogueMarkers: number;
    callableMarkers: number;
    calledMarkers: number;
    unreadableMarkers: number;
    withheldMarkers: number;
    strandFlips: number;
    overallCoverage: number;
    processedAt: string;
    rulesVersion: string;
  };
  ledger: {
    called: number;
    nocall: number;
    unreadable: number;
    design: number;
    amb: number;
    flip: number;
    withheld: number;
  };
  calls: Record<string, string>;
  results: Record<string, ReferenceMarkerResult>;
  unmappedMarkers: ReferenceUnmappedMarker[];
  domains: GeneReport["domains"];
  priorities: GeneReport["priorities"];
  recommendations: GeneReport["recommendations"];
}

export function referenceMarkerKey(
  marker: Pick<ProcessedMarker, "gene" | "variantId">,
) {
  return `${marker.gene}:${marker.variantId}`;
}

function addReportedCall(
  calls: Record<string, string>,
  marker: ProcessedMarker,
) {
  if (
    marker.state === "withheld" ||
    marker.state === "not-called" ||
    (!marker.rawGenotype && !marker.genotype)
  ) {
    return;
  }

  const call = marker.rawGenotype ?? marker.genotype;
  if (!call) return;

  calls[marker.variantId] = call;
  calls[marker.variantId.toLowerCase()] = call;
  calls[referenceMarkerKey(marker)] = call;
}

export function buildReferenceLedgerCounts(markers: ProcessedMarker[]) {
  const counts: ReferenceReportPayload["ledger"] = {
    called: 0,
    nocall: 0,
    unreadable: 0,
    design: 0,
    amb: 0,
    flip: 0,
    withheld: 0,
  };

  for (const marker of markers) {
    if (marker.state === "unmapped" || marker.id.startsWith("UNMAPPED:")) {
      continue;
    }
    if (marker.variantId === "design item") {
      counts.design += 1;
      continue;
    }

    if (marker.strandAmbiguous) counts.amb += 1;
    if (marker.strandFlipped) counts.flip += 1;

    if (marker.state === "called") counts.called += 1;
    if (marker.state === "not-called") counts.nocall += 1;
    if (marker.state === "unreadable") counts.unreadable += 1;
    if (marker.state === "withheld") counts.withheld += 1;
  }

  return counts;
}

/**
 * Projects the server-authoritative report into the revised reference UI.
 *
 * Genotype states are not recomputed in the browser. The reference renderer
 * receives the approved calls for display, while every called/no-call/
 * withheld decision continues to come from the versioned server processor.
 */
export function buildReferenceReportPayload(
  report: GeneReport,
): ReferenceReportPayload {
  const calls: Record<string, string> = {};
  const results: Record<string, ReferenceMarkerResult> = {};
  const unmappedMarkers: ReferenceUnmappedMarker[] = [];

  for (const marker of report.markers) {
    addReportedCall(calls, marker);
    const key = referenceMarkerKey(marker);
    results[key] = {
      state: marker.state,
      genotype: marker.genotype,
      rawGenotype: marker.rawGenotype,
      leverage: marker.leverage,
      interpretation: marker.interpretation,
      strandFlipped: marker.strandFlipped,
      strandAmbiguous: marker.strandAmbiguous,
    };

    if (
      (marker.id.startsWith("UNMAPPED:") || marker.sourceOnly) &&
      marker.state === "unmapped"
    ) {
      unmappedMarkers.push({
        key,
        gene: marker.gene,
        variantId: marker.variantId,
        expectedAlleles: marker.expectedAlleles,
        rawGenotype: marker.rawGenotype,
        genotype: marker.genotype,
        interpretation: marker.interpretation,
        assayNote: marker.assayNote,
        quality: marker.quality,
        state: marker.state,
      });
    }
  }

  return {
    type: REFERENCE_REPORT_MESSAGE,
    version: 1,
    reportKey: [
      report.profile.memberNumber,
      report.receipt.processedAt,
      report.receipt.rulesVersion,
    ].join(":"),
    profile: {
      name: reportDisplayName(report.profile) ?? "Your report",
      memberNumber: report.profile.memberNumber,
      assayName: report.profile.assayName,
      sexAtBirth: report.profile.sexAtBirth,
    },
    receipt: {
      sourceLabel: report.receipt.sourceLabel,
      genotypeRows: report.receipt.genotypeRows,
      catalogueMarkers: report.receipt.catalogueMarkers,
      callableMarkers: report.receipt.callableMarkers,
      calledMarkers: report.receipt.calledMarkers,
      unreadableMarkers: report.receipt.unreadableMarkers,
      withheldMarkers: report.receipt.withheldMarkers,
      strandFlips: report.receipt.strandFlips,
      overallCoverage: report.receipt.overallCoverage,
      processedAt: report.receipt.processedAt,
      rulesVersion: report.receipt.rulesVersion,
    },
    ledger: buildReferenceLedgerCounts(report.markers),
    calls,
    results,
    unmappedMarkers,
    domains: report.domains,
    priorities: report.priorities,
    recommendations: report.recommendations,
  };
}
