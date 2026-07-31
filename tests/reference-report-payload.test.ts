import assert from "node:assert/strict";
import test from "node:test";

import type {
  GeneReport,
  ProcessedMarker,
} from "../lib/gene-processing/types";
import {
  buildReferenceReportPayload,
  referenceMarkerKey,
} from "../lib/reports/reference-report-payload";

function marker(
  overrides: Partial<ProcessedMarker> &
    Pick<ProcessedMarker, "gene" | "variantId">,
): ProcessedMarker {
  return {
    id: `${overrides.gene}-${overrides.variantId}`,
    gene: overrides.gene,
    variantId: overrides.variantId,
    expectedAlleles: "A/G",
    domainIds: ["focus"],
    domainNames: ["Focus"],
    evidenceGrade: "B",
    impact: "Test marker",
    assayNote: null,
    state: "called",
    rawGenotype: "A/G",
    genotype: "AG",
    namedVariant: null,
    leverage: 2,
    interpretation: "A server interpretation",
    strandFlipped: false,
    strandAmbiguous: false,
    quality: 99,
    ...overrides,
  };
}

function report(markers: ProcessedMarker[]): GeneReport {
  return {
    id: "report-1",
    profile: {
      memberNumber: "IG8194",
      firstName: "",
      lastName: "",
      displayName: "Elna van Wyk",
      assayName: "Broker Genetic Results",
    },
    receipt: {
      status: "complete",
      source: "azure-sql",
      sourceLabel: "Azure SQL gene results",
      profileRows: 1,
      genotypeRows: 2,
      catalogueMarkers: 2,
      callableMarkers: 2,
      calledMarkers: 1,
      unreadableMarkers: 0,
      withheldMarkers: 1,
      unmappedMarkers: 0,
      strandFlips: 0,
      overallCoverage: 0.5,
      rulesVersion: "2026.07",
      processedAt: "2026-07-31T09:00:00.000Z",
      durationMs: 15,
    },
    domains: [],
    markers,
    priorities: [],
    recommendations: {
      rulesVersion: "2026.07",
      actionOutcome: "ready",
      safety: [],
      actions: [],
      measurements: [],
      nearThreshold: [],
      supplementsLocked: true,
    },
    groups: [],
  };
}

test("projects approved database calls into the reference report contract", () => {
  const comt = marker({
    gene: "COMT",
    variantId: "rs4680",
    rawGenotype: "G/A",
    genotype: "AG",
  });
  const payload = buildReferenceReportPayload(report([comt]));

  assert.equal(payload.profile.name, "Elna van Wyk");
  assert.equal(payload.calls.rs4680, "G/A");
  assert.equal(payload.calls["COMT:rs4680"], "G/A");
  assert.equal(payload.results["COMT:rs4680"].state, "called");
  assert.equal(payload.results["COMT:rs4680"].genotype, "AG");
  assert.equal(payload.receipt.sourceLabel, "Azure SQL gene results");
});

test("does not expose calls for a withheld adult-only result", () => {
  const apoe = marker({
    gene: "APOE",
    variantId: "rs429358+rs7412",
    state: "withheld",
    rawGenotype: null,
    genotype: null,
    leverage: null,
    interpretation: "Withheld until adult eligibility is verified.",
  });
  const payload = buildReferenceReportPayload(report([apoe]));

  assert.equal(payload.results[referenceMarkerKey(apoe)].state, "withheld");
  assert.equal(payload.calls["rs429358+rs7412"], undefined);
  assert.equal(payload.calls["APOE:rs429358+rs7412"], undefined);
});

test("keeps an unreadable source value visible without treating it as called", () => {
  const unreadable = marker({
    gene: "PER3",
    variantId: "VNTR 4/5",
    state: "unreadable",
    rawGenotype: "unexpected",
    genotype: null,
    leverage: null,
  });
  const payload = buildReferenceReportPayload(report([unreadable]));

  assert.equal(payload.calls["PER3:VNTR 4/5"], "unexpected");
  assert.equal(payload.results["PER3:VNTR 4/5"].state, "unreadable");
});
