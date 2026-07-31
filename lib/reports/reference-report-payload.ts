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

export interface ReferenceReportPayload {
  type: typeof REFERENCE_REPORT_MESSAGE;
  version: 1;
  profile: {
    name: string;
    memberNumber: string;
    assayName: string;
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
  calls: Record<string, string>;
  results: Record<string, ReferenceMarkerResult>;
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
    (marker.state !== "called" && marker.state !== "unreadable") ||
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

  for (const marker of report.markers) {
    addReportedCall(calls, marker);
    results[referenceMarkerKey(marker)] = {
      state: marker.state,
      genotype: marker.genotype,
      rawGenotype: marker.rawGenotype,
      leverage: marker.leverage,
      interpretation: marker.interpretation,
      strandFlipped: marker.strandFlipped,
      strandAmbiguous: marker.strandAmbiguous,
    };
  }

  return {
    type: REFERENCE_REPORT_MESSAGE,
    version: 1,
    profile: {
      name: reportDisplayName(report.profile) ?? "Your report",
      memberNumber: report.profile.memberNumber,
      assayName: report.profile.assayName,
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
    calls,
    results,
  };
}
