import assert from "node:assert/strict";
import test from "node:test";

import {
  AzureSqlGeneResultsSource,
  type GeneProcedureExecutor,
} from "../lib/data/azure-sql-gene-results-source";
import { GeneResultsIntegrityError } from "../lib/data/gene-results-source";

const readyProfile = {
  profileId: "101",
  memberNumber: "IG8185",
  sampleId: "IG8185",
  assayName: "Intelligene broker genetic panel",
  assayVersion: "695eb6fa8f93",
  assayStrand: "unknown",
  dateOfBirth: null,
  sexAtBirth: "M",
  reportAccessStatus: "enabled",
  reportStatus: "ready",
  expectedVariantCount: 132,
  observedVariantCount: 132,
  processedAt: new Date("2026-07-30T10:41:40.000Z"),
};

test("projects a ready Azure SQL profile and its canonical calls", async () => {
  const calls: Array<{ procedure: string; value: string }> = [];
  const executor: GeneProcedureExecutor = async (procedure, value) => {
    calls.push({ procedure, value });
    if (procedure === "dbo.usp_BrokerGene_GetProfileByEmail") {
      return [readyProfile];
    }
    if (procedure === "dbo.usp_BrokerGene_GetResultsByProfileId") {
      return [
        {
          gene: "ACE",
          variantId: "rs4343",
          genotype: "A/A",
          quality: null,
        },
      ];
    }
    return [];
  };
  const source = new AzureSqlGeneResultsSource(executor);

  const profile = await source.getProfileByEmail("  PERSON@Example.com ");
  const genotypes = await source.getGenotypeRecords(profile?.id ?? "");

  assert.ok(profile);
  assert.equal(profile.id, "101");
  assert.equal(profile.dateOfBirth, null);
  assert.equal(profile.sexAtBirth, "male");
  assert.equal(profile.assayStrand, "unknown");
  assert.equal(profile.reportAccessStatus, "enabled");
  assert.deepEqual(genotypes, [
    {
      profileId: "101",
      gene: "ACE",
      variantId: "rs4343",
      genotype: "A/A",
      quality: null,
    },
  ]);
  assert.deepEqual(calls, [
    {
      procedure: "dbo.usp_BrokerGene_GetProfileByEmail",
      value: "person@example.com",
    },
    {
      procedure: "dbo.usp_BrokerGene_GetResultsByProfileId",
      value: "101",
    },
  ]);
});

test("fails closed for duplicate profiles or duplicate canonical variants", async () => {
  const duplicateProfiles = new AzureSqlGeneResultsSource(async () => [
    readyProfile,
    readyProfile,
  ]);
  await assert.rejects(
    duplicateProfiles.getProfileByEmail("person@example.com"),
    GeneResultsIntegrityError,
  );

  const duplicateVariants = new AzureSqlGeneResultsSource(
    async (procedure) =>
      procedure === "dbo.usp_BrokerGene_GetResultsByProfileId"
        ? [
            {
              gene: "ACE",
              variantId: "rs4343",
              genotype: "A/A",
              quality: null,
            },
            {
              gene: "ACE",
              variantId: "RS4343",
              genotype: "A/A",
              quality: null,
            },
          ]
        : [readyProfile],
  );
  await assert.rejects(
    duplicateVariants.getGenotypeRecords("101"),
    GeneResultsIntegrityError,
  );
});

test("accepts only the panel's exact non-rs assay identifiers", async () => {
  const supported = [
    ["PER3", "VNTR 4/5", "4/5"],
    ["SLC6A4", "5-HTTLPR", "S/L"],
    ["DRD4", "VNTR 7R", "4/7"],
    ["AR", "CAG repeat", "MID"],
    ["SLC6A3", "DAT1 VNTR 9/10", "10/10"],
  ];
  const source = new AzureSqlGeneResultsSource(async (procedure) =>
    procedure === "dbo.usp_BrokerGene_GetResultsByProfileId"
      ? supported.map(([gene, variantId, genotype]) => ({
          gene,
          variantId,
          genotype,
          quality: null,
        }))
      : [readyProfile],
  );

  const genotypes = await source.getGenotypeRecords("101");
  assert.deepEqual(
    genotypes.map(({ gene, variantId, genotype }) => ({
      gene,
      variantId,
      genotype,
    })),
    supported.map(([gene, variantId, genotype]) => ({
      gene,
      variantId: variantId.toLowerCase(),
      genotype,
    })),
  );

  const unsupported = new AzureSqlGeneResultsSource(async (procedure) =>
    procedure === "dbo.usp_BrokerGene_GetResultsByProfileId"
      ? [
          {
            gene: "UNKNOWN",
            variantId: "arbitrary assay",
            genotype: "A/A",
            quality: null,
          },
        ]
      : [readyProfile],
  );
  await assert.rejects(
    unsupported.getGenotypeRecords("101"),
    GeneResultsIntegrityError,
  );

  const wrongGene = new AzureSqlGeneResultsSource(async (procedure) =>
    procedure === "dbo.usp_BrokerGene_GetResultsByProfileId"
      ? [
          {
            gene: "UNKNOWN",
            variantId: "VNTR 4/5",
            genotype: "4/5",
            quality: null,
          },
        ]
      : [readyProfile],
  );
  await assert.rejects(
    wrongGene.getGenotypeRecords("101"),
    GeneResultsIntegrityError,
  );
});

test("does not project partial, disabled, or malformed profiles", async () => {
  for (const row of [
    { ...readyProfile, reportStatus: "partial" },
    { ...readyProfile, reportAccessStatus: "disabled" },
    { ...readyProfile, observedVariantCount: 2 },
  ]) {
    const source = new AzureSqlGeneResultsSource(async () => [row]);
    await assert.rejects(
      source.getProfileByEmail("person@example.com"),
      GeneResultsIntegrityError,
    );
  }
});
