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

  return {
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
    state: "called",
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

  assert.ok(references.length > 0);

  for (const reference of references) {
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
    }
  }
});

test("actions require enough independent markers and cross-system convergence", () => {
  const twoHighScoringMarkers = [
    calledMarker("rs762551", "CC"),
    calledMarker("rs5751876", "TT"),
  ];
  const belowMarkerMinimum = buildRecommendationSynthesis(
    twoHighScoringMarkers,
  );
  const nearCaffeine = belowMarkerMinimum.nearThreshold.find(
    (recommendation) => recommendation.id === "caffeine-cutoff",
  );

  assert.ok(nearCaffeine);
  assert.ok(nearCaffeine.score > 3);
  assert.equal(nearCaffeine.reason, "too-few-markers");
  assert.equal(
    belowMarkerMinimum.actions.some(
      (recommendation) => recommendation.id === "caffeine-cutoff",
    ),
    false,
  );
  assert.equal(belowMarkerMinimum.actionOutcome, "insufficient-data");

  const convergedMarkers = [
    ...twoHighScoringMarkers,
    calledMarker("rs73598374", "GG"),
  ];
  const converged = buildRecommendationSynthesis(convergedMarkers);
  const caffeine = converged.actions.find(
    (recommendation) => recommendation.id === "caffeine-cutoff",
  );

  assert.ok(caffeine);
  assert.equal(caffeine.contributors.length, 3);
  assert.ok(caffeine.domainIds.length >= 2);
  assert.equal(converged.actionOutcome, "ready");

  const oneSystemOnly = convergedMarkers.map((marker) => ({
    ...marker,
    domainIds: ["single-system"],
    domainNames: ["Single system"],
  }));
  const noCrossSystemConvergence =
    buildRecommendationSynthesis(oneSystemOnly);
  const nearSingleSystem = noCrossSystemConvergence.nearThreshold.find(
    (recommendation) => recommendation.id === "caffeine-cutoff",
  );

  assert.equal(
    noCrossSystemConvergence.actions.some(
      (recommendation) => recommendation.id === "caffeine-cutoff",
    ),
    false,
  );
  assert.ok(nearSingleSystem);
  assert.equal(nearSingleSystem.reason, "too-few-systems");
  assert.equal(noCrossSystemConvergence.actionOutcome, "no-convergence");
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
      calledMarker("rs762551", "CC"),
      calledMarker("rs5751876", "TT"),
      calledMarker("rs73598374", "GG", { state }),
    ]);
    const nearCaffeine = synthesis.nearThreshold.find(
      (recommendation) => recommendation.id === "caffeine-cutoff",
    );

    assert.equal(
      synthesis.actions.some(
        (recommendation) => recommendation.id === "caffeine-cutoff",
      ),
      false,
      `${state} marker incorrectly unlocked an action`,
    );
    assert.ok(nearCaffeine, `${state} case should remain near threshold`);
    assert.equal(nearCaffeine.contributorCount, 2);
    assert.equal(nearCaffeine.reason, "too-few-markers");
    assert.equal(synthesis.actionOutcome, "insufficient-data");
  }
});

test("measurements need two called markers from two genes", () => {
  const markers = [
    calledMarker("rs699", "GG"),
    calledMarker("rs4341", "CC"),
  ];
  const synthesis = buildRecommendationSynthesis(markers);
  const bloodPressure = synthesis.measurements.find(
    (recommendation) => recommendation.id === "measure-blood-pressure",
  );

  assert.ok(bloodPressure);
  assert.equal(bloodPressure.kind, "measurement");
  assert.deepEqual(bloodPressure.contributors, [
    { gene: "AGT", variantId: "rs699" },
    { gene: "ACE", variantId: "rs4341" },
  ]);
  assert.ok(bloodPressure.score >= 2);

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

test("rich whole-report synthesis is deterministic, capped, and keeps supplements locked", () => {
  const markers = [
    calledMarker("rs1801260", "GG"),
    calledMarker("rs1360780", "TT"),
    calledMarker("rs1006737", "AA"),
    calledMarker("rs1800629", "AG"),
    calledMarker("rs1800795", "GG"),
    calledMarker("rs1205", "CC"),
    calledMarker("rs12722", "TT"),
    calledMarker("rs143383", "TT"),
    calledMarker("rs1800012", "GG"),
    calledMarker("rs1695", "GG"),
    calledMarker("rs2266637", "NULL"),
    calledMarker("rs4147567", "GG"),
    calledMarker("rs1799983", "TT"),
    calledMarker("rs699", "GG"),
    calledMarker("rs4341", "CC"),
  ];

  const forward = buildRecommendationSynthesis(markers);
  const reversed = buildRecommendationSynthesis([...markers].reverse());

  assert.deepEqual(reversed, forward);
  assert.deepEqual(
    forward.actions.map((recommendation) => recommendation.id),
    [
      "space-maximal-sessions",
      "nitrate-rich-greens",
      "fixed-wake-time",
      "slow-heavy-loading",
      "sulphur-rich-vegetables",
    ],
  );
  assert.ok(forward.actions.length <= 5);
  assert.ok(forward.measurements.length <= 5);
  assert.ok(
    forward.actions.filter(
      (recommendation) => recommendation.kind === "behaviour",
    ).length <= 3,
  );
  assert.ok(
    forward.actions.filter(
      (recommendation) => recommendation.kind === "food",
    ).length <= 2,
  );
  assert.equal(forward.supplementsLocked, true);
  assert.equal(forward.actionOutcome, "ready");
});
