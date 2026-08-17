import assert from "node:assert/strict";
import test from "node:test";

import { markerCatalogue } from "../lib/gene-processing/catalogue";
import {
  buildRecommendationSynthesis,
  recommendationRuleReferences,
} from "../lib/gene-processing/recommendations";
import type {
  MarkerState,
  ProcessedMarker,
} from "../lib/gene-processing/types";

function calledMarker(
  variantId: string,
  genotype: string,
  overrides: Partial<ProcessedMarker> = {},
): ProcessedMarker {
  const definition = markerCatalogue.markers.find(
    (marker) => marker.variantId.toLowerCase() === variantId.toLowerCase(),
  );
  assert.ok(definition, `Missing catalogue marker ${variantId}`);

  const interpretation = definition.interpretations[genotype];
  assert.ok(
    interpretation,
    `Missing ${genotype} interpretation for catalogue marker ${variantId}`,
  );

  const [leverage, interpretationText] = interpretation;

  const result = {
    id: definition.id,
    gene: definition.gene,
    variantId: definition.variantId,
    expectedAlleles: definition.expectedAlleles,
    domainIds: [...definition.domainIds],
    domainNames: definition.domainIds.map(
      (domainId) => markerCatalogue.domains[domainId]?.name ?? domainId,
    ),
    evidenceGrade: definition.evidenceGrade,
    impact: definition.impact,
    assayNote: definition.assayNote,
    state: "called" as const,
    rawGenotype: genotype,
    genotype,
    namedVariant: definition.namedVariants[genotype] ?? null,
    leverage,
    interpretation: interpretationText,
    strandFlipped: false,
    strandAmbiguous: false,
    quality: 0.99,
    ...overrides,
  };
  return {
    ...result,
    clinicalReferral:
      overrides.clinicalReferral ?? definition.clinicalReferral,
    componentVariants:
      overrides.componentVariants ?? [...definition.componentVariants],
    sourceOnly: overrides.sourceOnly ?? definition.sourceOnly,
  };
}

function recommendationIds(
  markers: ProcessedMarker[],
  key: "actions" | "measurements" | "safety",
) {
  return buildRecommendationSynthesis(markers)[key].map(
    (recommendation) => recommendation.id,
  );
}

test("every recommendation rule reference resolves to a unique supported catalogue interpretation", () => {
  const references = recommendationRuleReferences();
  const ruleVariants = new Set<string>();

  assert.ok(references.length > 0);

  for (const reference of references) {
    const ruleVariant = `${reference.ruleId}:${reference.variantId.toLowerCase()}`;
    assert.equal(
      ruleVariants.has(ruleVariant),
      false,
      `${ruleVariant} must be distinct within its rule`,
    );
    ruleVariants.add(ruleVariant);
    const matches = markerCatalogue.markers.filter(
      (marker) =>
        marker.variantId.toLowerCase() === reference.variantId.toLowerCase(),
    );
    assert.equal(
      matches.length,
      1,
      `${reference.ruleId} should resolve ${reference.variantId} exactly once`,
    );
    const [marker] = matches;
    assert.ok(marker);

    assert.ok(
      reference.genotypes.length > 0,
      `${reference.ruleId}/${reference.variantId} has no genotypes`,
    );

    for (const genotype of reference.genotypes) {
      assert.equal(
        Object.hasOwn(marker.interpretations, genotype),
        true,
        `${reference.ruleId}/${reference.variantId} references unsupported genotype ${genotype}`,
      );
      assert.ok(
        marker.interpretations[genotype]?.[0] >= 2,
        `${reference.ruleId}/${reference.variantId}/${genotype} must be a positive-leverage trigger`,
      );
    }
  }
});

test("recommendation score is the exact weighted leverage-minus-one sum", () => {
  const synthesis = buildRecommendationSynthesis([
    calledMarker("rs1801260", "GG", { leverage: 1 }),
    calledMarker("rs1360780", "TT", { leverage: 2 }),
    calledMarker("rs1006737", "AA", { leverage: 3 }),
  ]);
  const wakeTime = synthesis.actions.find(
    (recommendation) => recommendation.id === "fixed-wake-time",
  );

  assert.ok(wakeTime);
  assert.equal(wakeTime.score, 4); // (1-1)*2 + (2-1)*2 + (3-1)*1
  assert.equal(wakeTime.contributors.length, 3);
});

test("behaviour and food rules require score three and three called markers, without hidden gene or system gates", () => {
  const twoHighScoringMarkers = [
    calledMarker("rs1801260", "GG", { leverage: 3 }),
    calledMarker("rs1360780", "TT", { leverage: 3 }),
  ];
  const belowMarkerMinimum = buildRecommendationSynthesis(
    twoHighScoringMarkers,
  );
  const nearWakeTime = belowMarkerMinimum.nearThreshold.find(
    (recommendation) => recommendation.id === "fixed-wake-time",
  );

  assert.ok(nearWakeTime);
  assert.equal(nearWakeTime.score, 8);
  assert.equal(nearWakeTime.reason, "too-few-markers");
  assert.equal(
    belowMarkerMinimum.actions.some(
      (recommendation) => recommendation.id === "fixed-wake-time",
    ),
    false,
  );
  assert.equal(belowMarkerMinimum.actionOutcome, "insufficient-data");

  const exactBoundary = [
    calledMarker("rs1801260", "GG", {
      leverage: 2,
      gene: "SAME",
      domainIds: ["same-system"],
      domainNames: ["Same system"],
    }),
    calledMarker("rs1360780", "TT", {
      leverage: 1,
      gene: "SAME",
      domainIds: ["same-system"],
      domainNames: ["Same system"],
    }),
    calledMarker("rs1006737", "AA", {
      leverage: 2,
      gene: "SAME",
      domainIds: ["same-system"],
      domainNames: ["Same system"],
    }),
  ];
  const converged = buildRecommendationSynthesis(exactBoundary);
  const wakeTime = converged.actions.find(
    (recommendation) => recommendation.id === "fixed-wake-time",
  );

  assert.ok(wakeTime);
  assert.equal(wakeTime.score, 3);
  assert.equal(wakeTime.contributors.length, 3);
  assert.deepEqual(wakeTime.domainIds, ["same-system"]);
  assert.equal(converged.actionOutcome, "ready");

  const belowScore = buildRecommendationSynthesis([
    calledMarker("rs1801260", "GG", { leverage: 2 }),
    calledMarker("rs1360780", "TT", { leverage: 1 }),
    calledMarker("rs1006737", "AA", { leverage: 1 }),
  ]);
  const belowScoreAudit = belowScore.nearThreshold.find(
    (recommendation) => recommendation.id === "fixed-wake-time",
  );
  assert.ok(belowScoreAudit);
  assert.equal(belowScoreAudit.score, 2);
  assert.equal(belowScoreAudit.reason, "below-threshold");
});

test("one-carbon foods can converge across independent enzymes in one pathway", () => {
  const synthesis = buildRecommendationSynthesis([
    calledMarker("rs1801133", "AA"),
    calledMarker("rs7946", "TT"),
    calledMarker("rs1051266", "AA"),
  ]);
  const oneCarbon = synthesis.actions.find(
    (recommendation) => recommendation.id === "one-carbon-foods",
  );

  assert.ok(oneCarbon);
  assert.equal(oneCarbon.kind, "food");
  assert.equal(oneCarbon.contributors.length, 3);
  assert.deepEqual(oneCarbon.domainIds, ["sy_methyl"]);
});

test("non-called marker states never contribute to recommendation scores", () => {
  const nonCalledStates: MarkerState[] = [
    "not-called",
    "unreadable",
    "withheld",
    "unmapped",
  ];

  for (const state of nonCalledStates) {
    const synthesis = buildRecommendationSynthesis([
      calledMarker("rs1801260", "GG"),
      calledMarker("rs1360780", "TT"),
      calledMarker("rs1006737", "AA", { state }),
    ]);
    const nearWakeTime = synthesis.nearThreshold.find(
      (recommendation) => recommendation.id === "fixed-wake-time",
    );

    assert.equal(
      synthesis.actions.some(
        (recommendation) => recommendation.id === "fixed-wake-time",
      ),
      false,
      `${state} marker incorrectly unlocked an action`,
    );
    assert.ok(nearWakeTime, `${state} case should remain near threshold`);
    assert.equal(nearWakeTime.contributorCount, 2);
    assert.equal(nearWakeTime.reason, "too-few-markers");
    assert.equal(synthesis.actionOutcome, "insufficient-data");
  }
});

test("measurements require score two and two called markers, without a distinct-gene gate", () => {
  const markers = [
    calledMarker("rs699", "GG", { leverage: 2, gene: "SAME" }),
    calledMarker("rs4341", "CC", { leverage: 1, gene: "SAME" }),
  ];
  const synthesis = buildRecommendationSynthesis(markers);
  const bloodPressure = synthesis.measurements.find(
    (recommendation) => recommendation.id === "measure-blood-pressure",
  );

  assert.ok(bloodPressure);
  assert.equal(bloodPressure.kind, "measurement");
  assert.deepEqual(bloodPressure.contributors, [
    { gene: "SAME", variantId: "rs699" },
    { gene: "SAME", variantId: "rs4341" },
  ]);
  assert.equal(bloodPressure.score, 2);

  const oneCalledMarker = buildRecommendationSynthesis([
    markers[0],
    { ...markers[1], state: "unreadable" },
  ]);
  const nearBloodPressure = oneCalledMarker.nearThreshold.find(
    (recommendation) => recommendation.id === "measure-blood-pressure",
  );

  assert.equal(
    oneCalledMarker.measurements.some(
      (recommendation) => recommendation.id === "measure-blood-pressure",
    ),
    false,
  );
  assert.ok(nearBloodPressure);
  assert.equal(nearBloodPressure.contributorCount, 1);
  assert.equal(nearBloodPressure.reason, "too-few-markers");

  const belowScore = buildRecommendationSynthesis([
    calledMarker("rs699", "GG", { leverage: 1 }),
    calledMarker("rs4341", "CC", { leverage: 2 }),
  ]);
  const belowScoreAudit = belowScore.nearThreshold.find(
    (recommendation) => recommendation.id === "measure-blood-pressure",
  );
  assert.ok(belowScoreAudit);
  assert.equal(belowScoreAudit.score, 1);
  assert.equal(belowScoreAudit.reason, "below-threshold");
});

test("safety notices require the exact called HFE or APOE result", () => {
  assert.deepEqual(
    recommendationIds([calledMarker("rs1800562", "AA")], "safety"),
    ["hfe-c282y-homozygous"],
  );
  assert.deepEqual(
    recommendationIds([calledMarker("rs1800562", "AG")], "safety"),
    ["hfe-c282y-carrier"],
  );
  assert.deepEqual(
    recommendationIds([calledMarker("rs1800562", "GG")], "safety"),
    [],
  );
  assert.deepEqual(
    recommendationIds(
      [calledMarker("rs1800562", "AA", { state: "withheld" })],
      "safety",
    ),
    [],
  );

  assert.deepEqual(
    recommendationIds(
      [calledMarker("rs429358+rs7412", "E3/E4")],
      "safety",
    ),
    ["apoe-head-impact"],
  );
  assert.deepEqual(
    recommendationIds(
      [calledMarker("rs429358+rs7412", "E4/E4")],
      "safety",
    ),
    ["apoe-head-impact"],
  );
  assert.deepEqual(
    recommendationIds(
      [calledMarker("rs429358+rs7412", "E3/E3")],
      "safety",
    ),
    [],
  );
  assert.deepEqual(
    recommendationIds(
      [
        calledMarker("rs429358+rs7412", "E3/E4", {
          state: "withheld",
        }),
      ],
      "safety",
    ),
    [],
  );
});

test("referral and source-only calls cannot enter recommendation synthesis", () => {
  const referral = buildRecommendationSynthesis([
    calledMarker("rs1800562", "AA", {
      clinicalReferral: true,
      leverage: 0,
    }),
  ]);
  assert.deepEqual(referral.safety, []);
  assert.deepEqual(referral.actions, []);
  assert.deepEqual(referral.measurements, []);

  const sourceOnly = buildRecommendationSynthesis([
    calledMarker("rs1801260", "GG", { sourceOnly: true }),
    calledMarker("rs1360780", "TT", { sourceOnly: true }),
    calledMarker("rs1006737", "AA", { sourceOnly: true }),
  ]);
  assert.deepEqual(sourceOnly.actions, []);
  assert.deepEqual(sourceOnly.measurements, []);
  assert.equal(sourceOnly.actionOutcome, "insufficient-data");
});

test("only genetically supported exclusions are audited", () => {
  assert.deepEqual(buildRecommendationSynthesis([]).nearThreshold, []);
  const oneCall = buildRecommendationSynthesis([
    calledMarker("rs1801260", "GG"),
  ]);
  assert.deepEqual(
    oneCall.nearThreshold.map((item) => item.id).sort(),
    ["fixed-wake-time", "morning-light"],
  );
});

test("ranking caps are exact and every supported item cut by a cap remains in the practitioner audit", () => {
  const references = recommendationRuleReferences();
  const genotypeByVariant = new Map<string, string>();
  for (const reference of references) {
    if (!genotypeByVariant.has(reference.variantId)) {
      const genotype = reference.genotypes[0];
      assert.ok(genotype);
      genotypeByVariant.set(reference.variantId, genotype);
    }
  }
  const markers = [...genotypeByVariant].map(([variantId, genotype]) =>
    calledMarker(variantId, genotype),
  );

  const forward = buildRecommendationSynthesis(markers);
  const reversed = buildRecommendationSynthesis([...markers].reverse());

  assert.deepEqual(reversed, forward);
  assert.equal(
    forward.actions.filter(
      (recommendation) => recommendation.kind === "behaviour",
    ).length,
    3,
  );
  assert.equal(
    forward.actions.filter(
      (recommendation) => recommendation.kind === "food",
    ).length,
    2,
  );
  assert.equal(forward.measurements.length, 5);
  assert.equal(forward.nearThreshold.length, 6);
  assert.ok(
    forward.nearThreshold.every((item) => item.reason === "display-cap"),
  );

  const allRuleIds = new Set(references.map((reference) => reference.ruleId));
  const selectedIds = new Set(
    [...forward.actions, ...forward.measurements].map((item) => item.id),
  );
  const auditIds = new Set(forward.nearThreshold.map((item) => item.id));
  assert.equal(selectedIds.size + auditIds.size, allRuleIds.size);
  assert.deepEqual(new Set([...selectedIds, ...auditIds]), allRuleIds);
  assert.ok([...auditIds].every((id) => !selectedIds.has(id)));
  for (const item of forward.nearThreshold) {
    assert.ok(item.score > 0);
    assert.ok(item.contributors.length > 0);
    assert.equal(item.contributors.length, item.contributorCount);
  }
  assert.equal(forward.supplementsLocked, false);
  assert.ok(Array.isArray(forward.supplements.items));
  assert.match(forward.supplements.framing, /does not prove a deficiency/i);
  assert.equal(forward.actionOutcome, "ready");
});
