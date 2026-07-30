import assert from "node:assert/strict";
import test from "node:test";

import { markerCatalogue } from "../lib/gene-processing/catalogue";
import { processGeneReport } from "../lib/gene-processing/process-report";
import type {
  GeneProfile,
  MarkerCatalogue,
} from "../lib/gene-processing/types";
import type { GeneResultsSource } from "../lib/data/gene-results-source";
import { PhaseOneGeneResultsSource } from "../lib/data/phase-one-gene-results-source";
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
  consentStatus: "active",
  processedAt: "2026-07-30T06:42:00.000Z",
};

test("builds the Phase 1 report from repository records", async () => {
  const report = await getGeneReport("sam-240184");

  assert.ok(report);
  assert.equal(report.profile.memberNumber, "SAM-240184");
  assert.equal(report.receipt.source, "seeded-repository");
  assert.equal(report.receipt.genotypeRows, 131);
  assert.equal(report.receipt.catalogueMarkers, markerCatalogue.markers.length);
  assert.ok(report.receipt.calledMarkers > 100);
  assert.ok(report.receipt.calledMarkers <= report.receipt.callableMarkers);
  assert.equal(report.domains.length, 22);
  assert.equal(report.priorities.length, 3);
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
    getGenotypeRecords: async () => [],
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
  assert.doesNotMatch(
    JSON.stringify(report.profile),
    /dateOfBirth|sexAtBirth|sampleId|consentStatus/i,
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
