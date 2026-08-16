import assert from "node:assert/strict";
import test from "node:test";

import { markerCatalogue } from "../lib/gene-processing/catalogue";
import { processGeneReport } from "../lib/gene-processing/process-report";
import { buildReferenceReportPayload } from "../lib/reports/reference-report-payload";
import type {
  EvidenceGrade,
  GeneProfile,
  GenotypeRecord,
  LeverageLevel,
  MarkerCatalogue,
  MarkerDefinition,
} from "../lib/gene-processing/types";

const profile: GeneProfile = {
  id: "report-15-test",
  memberNumber: "IG-TEST",
  firstName: "Report",
  lastName: "Fifteen",
  dateOfBirth: "1990-01-01",
  sexAtBirth: "female",
  sampleId: "SAMPLE-15",
  assayName: "Test assay",
  assayVersion: "1",
  assayStrand: "forward",
  reportAccessStatus: "enabled",
  processedAt: "2026-08-16T10:00:00.000Z",
};

function catalogueFor(markers: MarkerDefinition[]): MarkerCatalogue {
  const domainIds = new Set(markers.flatMap((marker) => marker.domainIds));
  return {
    version: markerCatalogue.version,
    domains: Object.fromEntries(
      [...domainIds].map((domainId) => {
        const domain = markerCatalogue.domains[domainId];
        assert.ok(domain, `Missing domain ${domainId}`);
        return [domainId, domain];
      }),
    ),
    bands: markerCatalogue.bands,
    markers,
  };
}

function sourceRecord(
  variantId: string,
  genotype: string,
  gene?: string,
): GenotypeRecord {
  return {
    profileId: profile.id,
    ...(gene ? { gene } : {}),
    variantId,
    genotype,
    quality: 0.99,
  };
}

test("extracts the report 15 taxonomy without duplicate markers", () => {
  assert.equal(markerCatalogue.version, "2026.08.16");
  assert.equal(Object.keys(markerCatalogue.domains).length, 18);
  assert.equal(markerCatalogue.markers.length, 161);

  const keys = markerCatalogue.markers.map(
    (marker) => `${marker.gene}|${marker.variantId}`.toLowerCase(),
  );
  assert.equal(new Set(keys).size, 161);

  const referrals = markerCatalogue.markers.filter(
    (marker) => marker.clinicalReferral,
  );
  assert.deepEqual(
    referrals.map((marker) => marker.variantId).sort(),
    ["rs28942112", "rs334", "rs3798220", "rs60910145", "rs73885319"],
  );
  for (const marker of referrals) {
    assert.ok(
      Object.values(marker.interpretations).every(
        ([leverage]) => leverage === 0,
      ),
    );
  }

  const nat2 = markerCatalogue.markers.find(
    (marker) => marker.variantId === "acetylator status",
  );
  assert.ok(nat2);
  assert.equal(nat2.componentVariants.length, 31);
  assert.deepEqual(
    markerCatalogue.markers
      .filter((marker) => marker.sourceOnly)
      .map((marker) => marker.variantId)
      .sort(),
    ["rs1799930", "rs1801280"],
  );
});

test("classifies only a validated NAT2 star diplotype summary", () => {
  const nat2 = markerCatalogue.markers.find(
    (marker) => marker.variantId === "acetylator status",
  );
  assert.ok(nat2);
  const catalogue = catalogueFor([nat2]);
  const cases = [
    ["*4/*4", "RAPID"],
    ["*4/*6J", "INTERMEDIATE"],
    ["*5E/*12K", "INTERMEDIATE"],
    ["*6/*6P", "SLOW"],
  ] as const;

  for (const [summary, expected] of cases) {
    const report = processGeneReport(
      profile,
      [sourceRecord("various", summary, "NAT2")],
      catalogue,
    );
    const composite = report.markers.find(
      (marker) => marker.variantId === "acetylator status",
    );
    const rawSummary = report.markers.find(
      (marker) => marker.id === "UNMAPPED:various",
    );

    assert.equal(composite?.state, "called", summary);
    assert.equal(composite?.genotype, expected, summary);
    assert.equal(composite?.rawGenotype, summary, summary);
    assert.equal(rawSummary?.state, "unmapped", summary);
    assert.equal(rawSummary?.rawGenotype, summary, summary);
    assert.equal(report.receipt.calledMarkers, 1, summary);
    assert.equal(report.receipt.unmappedMarkers, 1, summary);
  }
});

test("fails NAT2 closed for an absent, no-call, malformed, or unphased input", () => {
  const nat2 = markerCatalogue.markers.find(
    (marker) => marker.variantId === "acetylator status",
  );
  assert.ok(nat2);
  const catalogue = catalogueFor([nat2]);

  const absent = processGeneReport(profile, [], catalogue);
  assert.equal(absent.markers[0]?.state, "not-called");

  const noCall = processGeneReport(
    profile,
    [sourceRecord("various", "UND", "NAT2")],
    catalogue,
  );
  assert.equal(noCall.markers[0]?.state, "not-called");

  const malformed = processGeneReport(
    profile,
    [sourceRecord("various", "*4/*15", "NAT2")],
    catalogue,
  );
  assert.equal(malformed.markers[0]?.state, "unreadable");
  assert.equal(malformed.markers[0]?.rawGenotype, "*4/*15");

  for (const invalid of ["*4/*6J EXTRA", "*4/*6ZZ", "*4/*6J2"]) {
    const invalidReport = processGeneReport(
      profile,
      [sourceRecord("various", invalid, "NAT2")],
      catalogue,
    );
    assert.equal(invalidReport.markers[0]?.state, "unreadable", invalid);
    assert.equal(invalidReport.markers[0]?.rawGenotype, invalid, invalid);
  }

  const unphased = processGeneReport(
    profile,
    [
      sourceRecord("rs1801280", "C/C", "NAT2"),
      sourceRecord("rs1799930", "A/A", "NAT2"),
    ],
    catalogue,
  );
  assert.equal(unphased.markers[0]?.state, "not-called");
  assert.equal(unphased.receipt.calledMarkers, 0);
  assert.equal(unphased.receipt.unmappedMarkers, 2);
});

test("keeps standalone NAT2 component calls visible and out of scoring", () => {
  const component = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs1801280",
  );
  assert.ok(component?.sourceOnly);

  const report = processGeneReport(
    profile,
    [sourceRecord("rs1801280", "C/T", "NAT2")],
    catalogueFor([component]),
  );
  const processed = report.markers[0];

  assert.equal(processed?.state, "unmapped");
  assert.equal(processed?.rawGenotype, "C/T");
  assert.equal(processed?.leverage, null);
  assert.equal(processed?.sourceOnly, true);
  assert.equal(report.receipt.calledMarkers, 0);
  assert.equal(report.receipt.callableMarkers, 0);
  assert.equal(report.receipt.unmappedMarkers, 1);
  assert.equal(report.domains[0]?.calledMarkers, 0);
  assert.equal(report.domains[0]?.totalMarkers, 0);
  assert.equal(report.domains[0]?.band, null);
  assert.deepEqual(report.recommendations.actions, []);
  assert.deepEqual(report.recommendations.measurements, []);
});

test("keeps APOE component calls visible beside the scored composite", () => {
  const apoe = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);
  const report = processGeneReport(
    profile,
    [
      sourceRecord("rs429358", "C/T", "APOE"),
      sourceRecord("rs7412", "C/C", "APOE"),
    ],
    catalogueFor([apoe]),
  );

  assert.equal(report.markers[0]?.state, "called");
  assert.equal(report.markers[0]?.genotype, "E3/E4");
  assert.deepEqual(
    report.markers
      .filter((marker) => marker.state === "unmapped")
      .map((marker) => [marker.variantId, marker.rawGenotype]),
    [
      ["rs429358", "C/T"],
      ["rs7412", "C/C"],
    ],
  );
  assert.equal(report.receipt.unmappedMarkers, 2);
});

test("does not expose APOE component calls for a confirmed minor", () => {
  const apoe = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);
  const minorProfile: GeneProfile = {
    ...profile,
    dateOfBirth: "2010-01-01",
  };
  const report = processGeneReport(
    minorProfile,
    [
      { ...sourceRecord("rs429358", "C/T", "APOE"), profileId: minorProfile.id },
      { ...sourceRecord("rs7412", "C/C", "APOE"), profileId: minorProfile.id },
    ],
    catalogueFor([apoe]),
  );
  const payload = buildReferenceReportPayload(report);

  assert.equal(report.markers.length, 1);
  assert.equal(report.markers[0]?.state, "withheld");
  assert.equal(report.receipt.unmappedMarkers, 0);
  assert.equal(payload.calls.rs429358, undefined);
  assert.equal(payload.calls.rs7412, undefined);
  assert.equal(payload.calls["APOE:rs429358"], undefined);
  assert.equal(payload.calls["APOE:rs7412"], undefined);
  assert.deepEqual(payload.unmappedMarkers, []);
});

test("fails APOE components closed when source text contains annotations", () => {
  const apoe = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);
  for (const malformed of ["C/T extra", "junk C/T", "C / T ?"]) {
    const report = processGeneReport(
      profile,
      [
        sourceRecord("rs429358", malformed, "APOE"),
        sourceRecord("rs7412", "C/C", "APOE"),
      ],
      catalogueFor([apoe]),
    );
    assert.equal(report.markers[0]?.state, "unreadable", malformed);
    assert.equal(report.markers[0]?.genotype, null, malformed);
  }
});

test("reports referral markers but excludes leverage zero from every score", () => {
  const hbb = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs334",
  );
  assert.ok(hbb?.clinicalReferral);
  const report = processGeneReport(
    profile,
    [sourceRecord("rs334", "A/T", "HBB")],
    catalogueFor([hbb]),
  );

  assert.equal(report.markers[0]?.state, "called");
  assert.equal(report.markers[0]?.leverage, 0);
  assert.equal(report.markers[0]?.clinicalReferral, true);
  assert.equal(report.domains[0]?.totalMarkers, 0);
  assert.equal(report.domains[0]?.calledMarkers, 0);
  assert.equal(report.domains[0]?.band, null);
  assert.deepEqual(report.priorities, []);
  assert.deepEqual(report.recommendations.actions, []);
  assert.deepEqual(report.recommendations.measurements, []);
});

function weightedMarker(
  index: number,
  evidenceGrade: EvidenceGrade,
  leverage: LeverageLevel,
  clinicalReferral = false,
): MarkerDefinition {
  return {
    id: `WEIGHT-rs${index}-${index}`,
    gene: `WEIGHT${index}`,
    variantId: `rs-weight-${index}`,
    expectedAlleles: "A/G",
    domainIds: ["ef_primary"],
    evidenceGrade,
    impact: "Weighted band test",
    interpretations: {
      GG: [leverage, `Leverage ${leverage}`],
    },
    namedVariants: {},
    assayNote: null,
    palindromic: false,
    xLinked: false,
    clinicalReferral,
    componentVariants: [],
    sourceOnly: false,
  };
}

test("matches report 15 evidence weighting, spread, shrinkage, and caps", () => {
  const markers = [
    weightedMarker(1, "A", 3),
    weightedMarker(2, "A", 3),
    weightedMarker(3, "A", 3),
    weightedMarker(4, "D", 1),
    weightedMarker(5, "D", 1),
    weightedMarker(6, "A", 0, true),
  ];
  const records = markers.map((marker) =>
    sourceRecord(marker.variantId, "G/G", marker.gene),
  );
  const report = processGeneReport(
    profile,
    records,
    catalogueFor(markers),
  );
  const domain = report.domains[0];
  assert.ok(domain);

  const expectedMean = 9.5 / 3.5;
  const unshrunk = expectedMean + 0.75 * (3 / 5) - 0.55 * (2 / 5);
  const expectedScore = (unshrunk * 5 + 2 * 2) / (5 + 2);
  assert.ok(Math.abs((domain.averageLeverage ?? 0) - expectedMean) < 1e-12);
  assert.ok(Math.abs((domain.bandScore ?? 0) - expectedScore) < 1e-12);
  assert.equal(domain.totalMarkers, 5);
  assert.equal(domain.calledMarkers, 5);
  assert.equal(domain.band, 5);
  assert.equal(domain.topMarkerIds.length, 3);

  const oneMarker = processGeneReport(
    profile,
    [sourceRecord(markers[0]!.variantId, "G/G", markers[0]!.gene)],
    catalogueFor([markers[0]!]),
  );
  assert.equal(oneMarker.domains[0]?.band, 3);
});
