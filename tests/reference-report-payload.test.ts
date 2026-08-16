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
    clinicalReferral: overrides.clinicalReferral ?? false,
    componentVariants: overrides.componentVariants ?? [],
    sourceOnly: overrides.sourceOnly ?? false,
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
      sexAtBirth: "female",
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
  assert.equal(payload.profile.sexAtBirth, "female");
  assert.deepEqual(payload.domains, []);
  assert.deepEqual(payload.priorities, []);
  assert.equal(payload.recommendations.supplementsLocked, true);
  assert.equal(payload.recommendations.rulesVersion, "2026.07");
  assert.equal(payload.calls.rs4680, "G/A");
  assert.equal(payload.calls["COMT:rs4680"], "G/A");
  assert.equal(payload.results["COMT:rs4680"].state, "called");
  assert.equal(payload.results["COMT:rs4680"].genotype, "AG");
  assert.equal(payload.receipt.sourceLabel, "Azure SQL gene results");
  assert.equal(
    payload.reportKey,
    "IG8194:2026-07-31T09:00:00.000Z:2026.07",
  );
});

test("retains unmapped source calls with raw metadata and without scoring them", () => {
  const sourceOnly = marker({
    id: "UNMAPPED:rs987654",
    gene: "SOURCEGENE",
    variantId: "rs987654",
    expectedAlleles: "unknown",
    domainIds: [],
    domainNames: [],
    evidenceGrade: "ungraded",
    impact: "This source marker has no definition in the current catalogue.",
    assayNote: "Retained for source visibility and excluded from scoring.",
    state: "unmapped",
    rawGenotype: "T/C",
    genotype: "T/C",
    leverage: null,
    interpretation: "No catalogue interpretation exists.",
    quality: 97.5,
  });
  const payload = buildReferenceReportPayload(report([sourceOnly]));

  assert.equal(payload.calls.rs987654, "T/C");
  assert.equal(payload.calls["SOURCEGENE:rs987654"], "T/C");
  assert.equal(payload.results["SOURCEGENE:rs987654"].state, "unmapped");
  assert.deepEqual(payload.unmappedMarkers, [
    {
      key: "SOURCEGENE:rs987654",
      gene: "SOURCEGENE",
      variantId: "rs987654",
      expectedAlleles: "unknown",
      rawGenotype: "T/C",
      genotype: "T/C",
      interpretation: "No catalogue interpretation exists.",
      assayNote: "Retained for source visibility and excluded from scoring.",
      quality: 97.5,
      state: "unmapped",
    },
  ]);
  assert.deepEqual(payload.ledger, {
    called: 0,
    nocall: 0,
    unreadable: 0,
    design: 0,
    amb: 0,
    flip: 0,
    withheld: 0,
  });
});

test("retains an uncatalogued source no-call as a visible raw row", () => {
  const sourceNoCall = marker({
    id: "UNMAPPED:rs-no-call",
    gene: "SOURCEGENE",
    variantId: "rs-no-call",
    expectedAlleles: "unknown",
    domainIds: [],
    domainNames: [],
    evidenceGrade: "ungraded",
    state: "not-called",
    rawGenotype: "--",
    genotype: null,
    leverage: null,
    interpretation: "The source reported no call for this uncatalogued marker.",
  });
  const payload = buildReferenceReportPayload(report([sourceNoCall]));

  assert.equal(payload.calls["rs-no-call"], "--");
  assert.equal(payload.calls["SOURCEGENE:rs-no-call"], "--");
  assert.equal(payload.unmappedMarkers.length, 1);
  assert.deepEqual(payload.unmappedMarkers[0], {
    key: "SOURCEGENE:rs-no-call",
    gene: "SOURCEGENE",
    variantId: "rs-no-call",
    expectedAlleles: "unknown",
    rawGenotype: "--",
    genotype: null,
    interpretation: "The source reported no call for this uncatalogued marker.",
    assayNote: null,
    quality: 99,
    state: "not-called",
  });
  assert.equal(payload.ledger.nocall, 0);
});

test("includes catalogued source-only inputs in stored and unscored metadata", () => {
  const nat2Component = marker({
    id: "NAT2-rs1801280-160",
    gene: "NAT2",
    variantId: "rs1801280",
    sourceOnly: true,
    state: "unmapped",
    rawGenotype: "C/T",
    genotype: "C/T",
    leverage: null,
    interpretation:
      "This component call is retained for source visibility and is not scored independently.",
  });
  const payload = buildReferenceReportPayload(report([nat2Component]));

  assert.equal(payload.results["NAT2:rs1801280"].state, "unmapped");
  assert.equal(payload.unmappedMarkers.length, 1);
  assert.equal(payload.unmappedMarkers[0].key, "NAT2:rs1801280");
  assert.equal(payload.unmappedMarkers[0].state, "unmapped");
});

test("keeps a catalogued source-only no-call visible in Raw", () => {
  const nat2NoCall = marker({
    id: "NAT2-rs1801280-160",
    gene: "NAT2",
    variantId: "rs1801280",
    sourceOnly: true,
    state: "not-called",
    rawGenotype: "--",
    genotype: null,
    leverage: null,
  });
  const payload = buildReferenceReportPayload(report([nat2NoCall]));

  assert.equal(payload.calls.rs1801280, "--");
  assert.equal(payload.calls["NAT2:rs1801280"], "--");
  assert.equal(payload.results["NAT2:rs1801280"].state, "not-called");
  assert.equal(payload.unmappedMarkers[0]?.rawGenotype, "--");
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

test("projects a released adult APOE result into the revised report", () => {
  const apoe = marker({
    gene: "APOE",
    variantId: "rs429358+rs7412",
    state: "called",
    rawGenotype: "C/T · C/C",
    genotype: "E3/E4",
    leverage: 2,
    interpretation: "Adult recovery context after head impact.",
  });
  const payload = buildReferenceReportPayload(report([apoe]));

  assert.equal(payload.results[referenceMarkerKey(apoe)].state, "called");
  assert.equal(payload.results[referenceMarkerKey(apoe)].genotype, "E3/E4");
  assert.equal(payload.calls["APOE:rs429358+rs7412"], "C/T · C/C");
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

test("builds authoritative live ledger counts without collapsing marker states", () => {
  const payload = buildReferenceReportPayload(
    report([
      marker({
        gene: "CALLED",
        variantId: "rs-called",
        strandFlipped: true,
      }),
      marker({
        gene: "MISSING",
        variantId: "rs-missing",
        state: "not-called",
        rawGenotype: null,
        genotype: null,
      }),
      marker({
        gene: "BAD",
        variantId: "rs-bad",
        state: "unreadable",
        rawGenotype: "unexpected",
        genotype: null,
        strandAmbiguous: true,
      }),
      marker({
        gene: "DESIGN",
        variantId: "design item",
        state: "not-called",
        rawGenotype: null,
        genotype: null,
      }),
      marker({
        gene: "HELD",
        variantId: "rs-held",
        state: "withheld",
        rawGenotype: null,
        genotype: null,
      }),
      marker({
        gene: "EXTRA",
        variantId: "rs-extra",
        state: "unmapped",
      }),
    ]),
  );

  assert.deepEqual(payload.ledger, {
    called: 1,
    nocall: 1,
    unreadable: 1,
    design: 1,
    amb: 1,
    flip: 1,
    withheld: 1,
  });
});
