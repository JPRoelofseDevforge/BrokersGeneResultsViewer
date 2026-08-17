import assert from "node:assert/strict";
import test from "node:test";

import { markerCatalogue } from "../lib/gene-processing/catalogue";
import type {
  GeneProfile,
  GenotypeRecord,
  MarkerCatalogue,
  MarkerDefinition,
} from "../lib/gene-processing/types";
import type { GeneResultsSource } from "../lib/data/gene-results-source";
import { PhaseOneGeneResultsSource } from "../lib/data/phase-one-gene-results-source";
import {
  GenotypeRecordIntegrityError,
  processGeneReport,
} from "../lib/gene-processing/process-report";
import {
  getGeneReport,
  getGeneReportByEmail,
} from "../lib/reports/get-gene-report";

const profile: GeneProfile = {
  id: "test-profile",
  memberNumber: "TEST-1",
  firstName: "Test",
  lastName: "Member",
  dateOfBirth: "1990-01-01",
  sexAtBirth: "female",
  sampleId: "SAMPLE-1",
  assayName: "Test assay",
  assayVersion: "1",
  assayStrand: "forward",
  reportAccessStatus: "enabled",
  processedAt: "2026-07-30T06:42:00.000Z",
};

function testMarker(
  overrides: Partial<MarkerDefinition> = {},
): MarkerDefinition {
  return {
    id: "TEST-rs1-1",
    gene: "TEST",
    variantId: "rs1",
    expectedAlleles: "A/G",
    domainIds: ["focus"],
    evidenceGrade: "A",
    impact: "Test impact",
    interpretations: {
      AA: [1, "Low leverage"],
      AG: [2, "Middle leverage"],
      GG: [3, "High leverage"],
    },
    namedVariants: {},
    assayNote: null,
    palindromic: false,
    xLinked: false,
    ...overrides,
    clinicalReferral: overrides.clinicalReferral ?? false,
    componentVariants: overrides.componentVariants ?? [],
    sourceOnly: overrides.sourceOnly ?? false,
  };
}

function testCatalogue(marker: MarkerDefinition): MarkerCatalogue {
  return {
    version: "test",
    domains: {
      focus: {
        id: "focus",
        name: "Focus",
        group: "exec",
        description: "Test domain",
      },
    },
    bands: [
      { level: 1, name: "One", summary: "One" },
      { level: 2, name: "Two", summary: "Two" },
      { level: 3, name: "Three", summary: "Three" },
      { level: 4, name: "Four", summary: "Four" },
      { level: 5, name: "Five", summary: "Five" },
    ],
    markers: [marker],
  };
}

function apoeTestCatalogue(): MarkerCatalogue {
  const apoe = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);
  return {
    version: markerCatalogue.version,
    domains: markerCatalogue.domains,
    bands: markerCatalogue.bands,
    markers: [apoe],
  };
}

function apoeRecords(
  rs429358: string,
  rs7412: string,
): GenotypeRecord[] {
  return [
    {
      profileId: profile.id,
      variantId: "rs429358",
      genotype: rs429358,
      quality: 0.99,
    },
    {
      profileId: profile.id,
      variantId: "rs7412",
      genotype: rs7412,
      quality: 0.99,
    },
  ];
}

function directApoeRecord(genotype: string): GenotypeRecord {
  return {
    profileId: profile.id,
    gene: "APOE",
    variantId: "rs429358+rs7412",
    genotype,
    quality: 0.98,
  };
}

test("builds the Phase 1 report from repository records", async () => {
  const report = await getGeneReport("sam-240184");

  assert.ok(report);
  assert.equal(report.profile.memberNumber, "SAM-240184");
  assert.equal(report.receipt.source, "seeded-repository");
  assert.equal(report.receipt.genotypeRows, 132);
  assert.equal(report.receipt.catalogueMarkers, markerCatalogue.markers.length);
  assert.ok(report.receipt.calledMarkers > 90);
  assert.ok(report.receipt.calledMarkers <= report.receipt.callableMarkers);
  assert.equal(report.domains.length, 18);
  assert.equal(report.priorities.length, 3);
  assert.ok(report.recommendations.actions.length > 0);
  assert.ok(report.recommendations.measurements.length > 0);
  assert.equal(report.recommendations.supplementsLocked, false);
  assert.ok(Array.isArray(report.recommendations.supplements.items));
  assert.ok(report.markers.some((marker) => marker.state === "not-called"));
});

test("keeps Phase 1 token lookup behind a second explicit test gate", async () => {
  const previousEmail = process.env.PHASE_ONE_PROFILE_EMAIL;
  const previousTokenTest = process.env.PHASE_ONE_TOKEN_TEST;
  const phaseOneSource = new PhaseOneGeneResultsSource();

  try {
    process.env.PHASE_ONE_PROFILE_EMAIL = "person@example.com";
    delete process.env.PHASE_ONE_TOKEN_TEST;
    assert.equal(
      await phaseOneSource.getProfileByEmail("person@example.com"),
      null,
    );

    process.env.PHASE_ONE_TOKEN_TEST = "true";
    assert.equal(
      (await phaseOneSource.getProfileByEmail("person@example.com"))?.id,
      "sam-240184",
    );
  } finally {
    if (previousEmail === undefined) {
      delete process.env.PHASE_ONE_PROFILE_EMAIL;
    } else {
      process.env.PHASE_ONE_PROFILE_EMAIL = previousEmail;
    }

    if (previousTokenTest === undefined) {
      delete process.env.PHASE_ONE_TOKEN_TEST;
    } else {
      process.env.PHASE_ONE_TOKEN_TEST = previousTokenTest;
    }
  }
});

test("applies Broker Day identity only to a production gene source", async () => {
  const productionSource: GeneResultsSource = {
    sourceMode: "production",
    getProfile: async () => profile,
    getProfileByEmail: async () => profile,
    getGenotypeRecords: async () => [
      {
        profileId: profile.id,
        gene: "ADRB2",
        variantId: "rs1042713",
        genotype: "G/G",
        quality: null,
      },
    ],
  };

  const report = await getGeneReportByEmail(
    "person@example.com",
    {
      email: "person@example.com",
      displayName: "Dr Amina Ndlovu",
      firstName: "Amina",
      lastName: "Ndlovu",
    },
    productionSource,
  );

  assert.ok(report);
  assert.equal(report.profile.displayName, "Dr Amina Ndlovu");
  assert.equal(report.profile.firstName, "Amina");
  assert.equal(report.profile.lastName, "Ndlovu");
  assert.equal(report.profile.sexAtBirth, "female");
  assert.doesNotMatch(
    JSON.stringify(report.profile),
    /dateOfBirth|sampleId|reportAccessStatus/i,
  );
});

test("resolves reverse-strand calls before interpretation", () => {
  const catalogue: MarkerCatalogue = {
    version: "test",
    domains: {
      focus: {
        id: "focus",
        name: "Focus",
        group: "exec",
        description: "Test domain",
      },
    },
    bands: [
      { level: 1, name: "One", summary: "One" },
      { level: 2, name: "Two", summary: "Two" },
      { level: 3, name: "Three", summary: "Three" },
      { level: 4, name: "Four", summary: "Four" },
      { level: 5, name: "Five", summary: "Five" },
    ],
    markers: [
      {
        id: "TEST-rs1-1",
        gene: "TEST",
        variantId: "rs1",
        expectedAlleles: "A/G",
        domainIds: ["focus"],
        evidenceGrade: "A",
        impact: "Test impact",
        interpretations: {
          AA: [1, "Low leverage"],
          AG: [2, "Middle leverage"],
          GG: [3, "High leverage"],
        },
        namedVariants: {},
        assayNote: null,
        palindromic: false,
        xLinked: false,
        clinicalReferral: false,
        componentVariants: [],
        sourceOnly: false,
      },
    ],
  };

  const report = processGeneReport(
    profile,
    [
      {
        profileId: profile.id,
        variantId: "rs1",
        genotype: "T/C",
        quality: 0.98,
      },
    ],
    catalogue,
  );

  assert.equal(report.markers[0].state, "called");
  assert.equal(report.markers[0].genotype, "AG");
  assert.equal(report.markers[0].strandFlipped, true);
  assert.equal(report.markers[0].leverage, 2);
});

test("treats UND as no-call before CNV handling and does not guess PRS", () => {
  const catalogue = testCatalogue(
    testMarker({
      expectedAlleles: "CNV",
      interpretations: {
        PRESENT: [1, "Present"],
        HET: [2, "Heterozygous"],
        NULL: [3, "Absent"],
      },
    }),
  );

  const und = processGeneReport(
    profile,
    [
      {
        profileId: profile.id,
        variantId: "rs1",
        genotype: "UND",
        quality: null,
      },
    ],
    catalogue,
  );
  const prs = processGeneReport(
    profile,
    [
      {
        profileId: profile.id,
        variantId: "rs1",
        genotype: "PRS",
        quality: null,
      },
    ],
    catalogue,
  );

  assert.equal(und.markers[0].state, "not-called");
  assert.equal(und.domains[0].calledMarkers, 0);
  assert.equal(prs.markers[0].state, "unreadable");
  assert.equal(prs.markers[0].genotype, "PRS");
  assert.equal(prs.domains[0].calledMarkers, 0);
});

test("keeps a nonempty malformed SNP call visible as unreadable", () => {
  for (const genotype of ["PRS", "AA (het)", "A/G EXTRA"]) {
    const report = processGeneReport(
      profile,
      [
        {
          profileId: profile.id,
          variantId: "rs1",
          genotype,
          quality: null,
        },
      ],
      testCatalogue(testMarker()),
    );

    assert.equal(report.markers[0].state, "unreadable", genotype);
    assert.equal(report.markers[0].rawGenotype, genotype);
    assert.equal(report.markers[0].genotype, null);
    assert.equal(report.domains[0].calledMarkers, 0);
  }
});

test("treats repeated dash source values as no-calls", () => {
  for (const genotype of ["--", "---"]) {
    const report = processGeneReport(
      profile,
      [
        {
          profileId: profile.id,
          variantId: "rs1",
          genotype,
          quality: null,
        },
      ],
      testCatalogue(testMarker()),
    );

    assert.equal(report.markers[0].state, "not-called");
    assert.equal(report.markers[0].rawGenotype, null);
  }
});

test("accepts single-allele calls only for X-linked markers with verified male sex", () => {
  const xLinkedCatalogue = testCatalogue(
    testMarker({
      xLinked: true,
      interpretations: {
        A: [1, "Single A"],
        G: [3, "Single G"],
        AA: [1, "AA"],
        AG: [2, "AG"],
        GG: [3, "GG"],
      },
    }),
  );
  const record = {
    profileId: profile.id,
    variantId: "rs1",
    genotype: "A",
    quality: null,
  };

  const female = processGeneReport(profile, [record], xLinkedCatalogue);
  const unspecified = processGeneReport(
    { ...profile, sexAtBirth: "unspecified" },
    [record],
    xLinkedCatalogue,
  );
  const male = processGeneReport(
    { ...profile, sexAtBirth: "male" },
    [record],
    xLinkedCatalogue,
  );
  const autosomal = processGeneReport(
    { ...profile, sexAtBirth: "male" },
    [record],
    testCatalogue(testMarker()),
  );

  assert.equal(female.markers[0].state, "unreadable");
  assert.equal(unspecified.markers[0].state, "unreadable");
  assert.equal(male.markers[0].state, "called");
  assert.equal(autosomal.markers[0].state, "unreadable");

  const unspecifiedDiploid = processGeneReport(
    { ...profile, sexAtBirth: "unspecified" },
    [{ ...record, genotype: "A/G" }],
    xLinkedCatalogue,
  );
  const maleHeterozygous = processGeneReport(
    { ...profile, sexAtBirth: "male" },
    [{ ...record, genotype: "A/G" }],
    xLinkedCatalogue,
  );
  const maleHomozygous = processGeneReport(
    { ...profile, sexAtBirth: "male" },
    [{ ...record, genotype: "A/A" }],
    xLinkedCatalogue,
  );

  assert.equal(unspecifiedDiploid.markers[0].state, "unreadable");
  assert.equal(maleHeterozygous.markers[0].state, "unreadable");
  assert.equal(maleHomozygous.markers[0].state, "called");
  assert.equal(maleHomozygous.markers[0].genotype, "A");
});

test("does not score a palindromic marker when assay strand is unknown", () => {
  const catalogue = testCatalogue(
    testMarker({
      expectedAlleles: "A/T",
      palindromic: true,
      interpretations: {
        AA: [1, "AA"],
        AT: [2, "AT"],
        TT: [3, "TT"],
      },
    }),
  );
  const record = {
    profileId: profile.id,
    variantId: "rs1",
    genotype: "A/A",
    quality: null,
  };

  const unknown = processGeneReport(
    { ...profile, assayStrand: "unknown" },
    [record],
    catalogue,
  );
  const forward = processGeneReport(profile, [record], catalogue);

  assert.equal(unknown.markers[0].state, "unreadable");
  assert.equal(unknown.markers[0].strandAmbiguous, true);
  assert.equal(unknown.domains[0].calledMarkers, 0);
  assert.equal(forward.markers[0].state, "called");
});

test("retains uncatalogued source records without letting them affect scoring", () => {
  const catalogue = testCatalogue(testMarker());
  const report = processGeneReport(
    profile,
    [
      {
        profileId: profile.id,
        variantId: "rs1",
        genotype: "G/G",
        quality: null,
      },
      {
        profileId: profile.id,
        gene: "EXTRA",
        variantId: "rs998",
        genotype: "UND",
        quality: null,
      },
      {
        profileId: profile.id,
        gene: "EXTRA",
        variantId: "rs999",
        genotype: "A/G",
        quality: null,
      },
    ],
    catalogue,
    {
      source: "azure-sql",
      sourceLabel: "Imported test batch",
    },
  );

  const noCall = report.markers.find(
    (marker) => marker.variantId === "rs998",
  );
  const unmapped = report.markers.find(
    (marker) => marker.variantId === "rs999",
  );

  assert.equal(noCall?.state, "not-called");
  assert.equal(noCall?.evidenceGrade, "ungraded");
  assert.equal(unmapped?.state, "unmapped");
  assert.equal(unmapped?.evidenceGrade, "ungraded");
  assert.equal(report.receipt.calledMarkers, 1);
  assert.equal(report.receipt.source, "azure-sql");
  assert.equal(report.receipt.sourceLabel, "Imported test batch");
  assert.equal(report.receipt.unmappedMarkers, 1);
  assert.equal(report.domains[0].calledMarkers, 1);
  assert.equal(report.domains[0].totalMarkers, 1);
});

test("deduplicates exact calls and rejects conflicting duplicates", () => {
  const catalogue = testCatalogue(testMarker());
  const exact = {
    profileId: profile.id,
    gene: "TEST",
    variantId: "rs1",
    genotype: "A/G",
    quality: 0.98,
  };

  const report = processGeneReport(
    profile,
    [exact, { ...exact }],
    catalogue,
  );
  assert.equal(report.receipt.genotypeRows, 1);
  assert.equal(report.markers[0].state, "called");

  assert.throws(
    () =>
      processGeneReport(
        profile,
        [exact, { ...exact, genotype: "G/G" }],
        catalogue,
      ),
    (error) =>
      error instanceof GenotypeRecordIntegrityError &&
      error.variantId === "rs1",
  );
});

test("excludes missing calls instead of assigning an average", () => {
  const singleMarkerCatalogue: MarkerCatalogue = {
    version: "test",
    domains: {
      sleep: {
        id: "sleep",
        name: "Sleep",
        group: "sleep",
        description: "Test domain",
      },
    },
    bands: [
      { level: 1, name: "One", summary: "One" },
      { level: 2, name: "Two", summary: "Two" },
      { level: 3, name: "Three", summary: "Three" },
      { level: 4, name: "Four", summary: "Four" },
      { level: 5, name: "Five", summary: "Five" },
    ],
    markers: [
      {
        id: "TEST-rs2-1",
        gene: "TEST",
        variantId: "rs2",
        expectedAlleles: "A/G",
        domainIds: ["sleep"],
        evidenceGrade: "B",
        impact: "Test impact",
        interpretations: {
          AA: [1, "Low leverage"],
          AG: [2, "Middle leverage"],
          GG: [3, "High leverage"],
        },
        namedVariants: {},
        assayNote: null,
        palindromic: false,
        xLinked: false,
        clinicalReferral: false,
        componentVariants: [],
        sourceOnly: false,
      },
    ],
  };

  const report = processGeneReport(profile, [], singleMarkerCatalogue);

  assert.equal(report.markers[0].state, "not-called");
  assert.equal(report.domains[0].band, null);
  assert.equal(report.domains[0].averageLeverage, null);
  assert.equal(report.domains[0].coverage, 0);
});

test("withholds the adult-only composite result for a minor", () => {
  const apoe = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);

  const minorProfile = {
    ...profile,
    dateOfBirth: "2012-01-01",
  };
  const report = processGeneReport(
    minorProfile,
    [
      {
        profileId: profile.id,
        variantId: "rs429358",
        genotype: "C/T",
        quality: 0.99,
      },
      {
        profileId: profile.id,
        variantId: "rs7412",
        genotype: "C/C",
        quality: 0.99,
      },
    ],
    {
      version: markerCatalogue.version,
      domains: markerCatalogue.domains,
      bands: markerCatalogue.bands,
      markers: [apoe],
    },
  );

  assert.equal(report.markers[0].state, "withheld");
  assert.equal(report.markers[0].genotype, null);
});

test("releases the APOE composite unless the reader is confirmed under 18", () => {
  const apoe = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);

  const report = processGeneReport(
    { ...profile, dateOfBirth: null },
    [
      {
        profileId: profile.id,
        variantId: "rs429358",
        genotype: "C/T",
        quality: 0.99,
      },
      {
        profileId: profile.id,
        variantId: "rs7412",
        genotype: "C/C",
        quality: 0.99,
      },
    ],
    {
      version: markerCatalogue.version,
      domains: markerCatalogue.domains,
      bands: markerCatalogue.bands,
      markers: [apoe],
    },
  );

  assert.equal(report.markers[0].state, "called");
  assert.equal(report.markers[0].genotype, "E3/E4");
  assert.equal(report.receipt.withheldMarkers, 0);
  assert.ok(
    report.recommendations.safety.some(
      (recommendation) => recommendation.id === "apoe-head-impact",
    ),
  );
});

test("releases APOE for a reader who is exactly 18", () => {
  const report = processGeneReport(
    { ...profile, dateOfBirth: "2008-07-30" },
    apoeRecords("C/T", "C/C"),
    apoeTestCatalogue(),
  );

  assert.equal(report.markers[0].state, "called");
  assert.equal(report.markers[0].genotype, "E3/E4");
});

test("releases APOE after the reader turns 18 even when the assay is older", () => {
  const apoe = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);
  const report = processGeneReport(
    {
      ...profile,
      dateOfBirth: "2008-08-16",
      processedAt: "2025-08-16T10:00:00.000Z",
    },
    [
      {
        profileId: profile.id,
        gene: "APOE",
        variantId: "rs429358",
        genotype: "C/T",
        quality: null,
      },
      {
        profileId: profile.id,
        gene: "APOE",
        variantId: "rs7412",
        genotype: "C/C",
        quality: null,
      },
    ],
    testCatalogue(apoe),
    { asOf: "2026-08-16T10:00:00.000Z" },
  );

  assert.equal(report.markers[0].state, "called");
  assert.equal(report.markers[0].genotype, "E3/E4");
});

test("resolves only the six supported APOE diplotypes", () => {
  const supported = [
    ["T/T", "T/T", "E2/E2"],
    ["T/T", "C/T", "E2/E3"],
    ["C/T", "C/T", "E2/E4"],
    ["T/T", "C/C", "E3/E3"],
    ["C/T", "C/C", "E3/E4"],
    ["C/C", "C/C", "E4/E4"],
  ] as const;

  for (const [rs429358, rs7412, expected] of supported) {
    const report = processGeneReport(
      profile,
      apoeRecords(rs429358, rs7412),
      apoeTestCatalogue(),
    );
    assert.equal(report.markers[0].state, "called");
    assert.equal(report.markers[0].genotype, expected);
  }

  const unsupported = processGeneReport(
    profile,
    apoeRecords("C/C", "C/T"),
    apoeTestCatalogue(),
  );
  assert.equal(unsupported.markers[0].state, "unreadable");
  assert.equal(unsupported.markers[0].rawGenotype, "C/C · C/T");
  assert.equal(unsupported.markers[0].genotype, null);
});

test("uses a strictly supported direct APOE diplotype when components are absent", () => {
  const report = processGeneReport(
    profile,
    [directApoeRecord("E2/E3")],
    apoeTestCatalogue(),
  );

  assert.equal(report.markers[0].state, "called");
  assert.equal(report.markers[0].genotype, "E2/E3");
  assert.equal(report.markers[0].rawGenotype, "E2/E3");
  assert.equal(report.receipt.unmappedMarkers, 0);
});

test("cross-checks a direct APOE diplotype against its component calls", () => {
  const report = processGeneReport(
    profile,
    [...apoeRecords("C/T", "C/C"), directApoeRecord("E3/E4")],
    apoeTestCatalogue(),
  );

  assert.equal(report.markers[0].state, "called");
  assert.equal(report.markers[0].genotype, "E3/E4");
  assert.equal(report.receipt.unmappedMarkers, 2);

  assert.throws(
    () =>
      processGeneReport(
        profile,
        [...apoeRecords("C/T", "C/C"), directApoeRecord("E3/E3")],
        apoeTestCatalogue(),
      ),
    GenotypeRecordIntegrityError,
  );
});

test("canonicalizes the comma APOE alias and rejects conflicting aliases", () => {
  const commaAlias = {
    ...directApoeRecord("E3/E4"),
    variantId: "rs429358,rs7412",
  };
  const report = processGeneReport(
    profile,
    [directApoeRecord("E3/E4"), commaAlias],
    apoeTestCatalogue(),
  );

  assert.equal(report.receipt.genotypeRows, 1);
  assert.equal(report.markers[0].state, "called");
  assert.equal(report.markers[0].genotype, "E3/E4");

  assert.throws(
    () =>
      processGeneReport(
        profile,
        [
          directApoeRecord("E3/E4"),
          { ...commaAlias, genotype: "E3/E3" },
        ],
        apoeTestCatalogue(),
      ),
    GenotypeRecordIntegrityError,
  );
});

test("fails closed for an unsupported direct APOE diplotype", () => {
  assert.throws(
    () =>
      processGeneReport(
        profile,
        [directApoeRecord("E1/E4")],
        apoeTestCatalogue(),
      ),
    GenotypeRecordIntegrityError,
  );
});

test("withholds a valid direct APOE result for a confirmed minor", () => {
  const report = processGeneReport(
    { ...profile, dateOfBirth: "2012-01-01" },
    [directApoeRecord("E2/E3")],
    apoeTestCatalogue(),
  );

  assert.equal(report.markers[0].state, "withheld");
  assert.equal(report.markers[0].genotype, null);
});

test("treats an UND APOE component as no-call", () => {
  const apoe = markerCatalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);

  const report = processGeneReport(
    profile,
    [
      {
        profileId: profile.id,
        variantId: "rs429358",
        genotype: "UND",
        quality: null,
      },
      {
        profileId: profile.id,
        variantId: "rs7412",
        genotype: "C/C",
        quality: null,
      },
    ],
    {
      version: markerCatalogue.version,
      domains: markerCatalogue.domains,
      bands: markerCatalogue.bands,
      markers: [apoe],
    },
  );

  assert.equal(report.markers[0].state, "not-called");
});

test("does not claim APOE was withheld when a minor has no composite call", () => {
  const report = processGeneReport(
    { ...profile, dateOfBirth: "2012-01-01" },
    apoeRecords("UND", "C/C"),
    apoeTestCatalogue(),
  );

  assert.equal(report.markers[0].state, "not-called");
  assert.equal(report.markers[0].genotype, null);
  assert.equal(report.receipt.withheldMarkers, 0);
});
