import assert from "node:assert/strict";
import test from "node:test";

import { markerCatalogue } from "../lib/gene-processing/catalogue";
import {
  buildSupplementPlan,
  CLINICAL_CONTEXT_CHECKLIST,
  PRACTITIONER_APPROVAL_CHECKLIST,
  SUPPLEMENT_RULES_VERSION,
  supplementRuleReferences,
} from "../lib/gene-processing/supplements";
import type { ProcessedMarker } from "../lib/gene-processing/types";

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
  assert.ok(interpretation, `Missing ${variantId}/${genotype}`);
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
    leverage: interpretation[0],
    interpretation: interpretation[1],
    strandFlipped: false,
    strandAmbiguous: false,
    quality: 0.99,
    clinicalReferral: definition.clinicalReferral,
    componentVariants: [...definition.componentVariants],
    sourceOnly: definition.sourceOnly,
    ...overrides,
  };
}

test("every supplement criterion is an exact supported catalogue interpretation", () => {
  const references = supplementRuleReferences();
  const ruleVariants = new Set<string>();
  assert.ok(references.length > 0);

  for (const reference of references) {
    const ruleVariant = `${reference.ruleId}:${reference.variantId.toLowerCase()}`;
    assert.equal(ruleVariants.has(ruleVariant), false, ruleVariant);
    ruleVariants.add(ruleVariant);
    const matches = markerCatalogue.markers.filter(
      (marker) =>
        marker.variantId.toLowerCase() === reference.variantId.toLowerCase(),
    );
    assert.equal(matches.length, 1, reference.variantId);
    const marker = matches[0];
    assert.ok(marker);
    for (const genotype of reference.genotypes) {
      assert.ok(
        Object.hasOwn(marker.interpretations, genotype),
        `${reference.ruleId} references unsupported ${reference.variantId}/${genotype}`,
      );
    }
  }
});

test("supplement review needs three exact called markers from three genes", () => {
  const vitaminD = [
    calledMarker("rs2282679", "CC"),
    calledMarker("rs2228570", "AA"),
    calledMarker("rs10741657", "GG"),
  ];
  const plan = buildSupplementPlan(vitaminD);
  const item = plan.items.find((candidate) => candidate.id === "vitamin-d");

  assert.ok(item);
  assert.equal(item.decision, "measure-first");
  assert.equal(item.contributors.length, 3);
  assert.equal(plan.outcome, "review-ready");

  for (const disallowed of [
    { state: "not-called" as const },
    { state: "unreadable" as const },
    { state: "withheld" as const },
    { state: "unmapped" as const },
    { clinicalReferral: true },
    { sourceOnly: true },
  ]) {
    const blocked = buildSupplementPlan([
      vitaminD[0],
      vitaminD[1],
      { ...vitaminD[2], ...disallowed },
    ]);
    assert.equal(
      blocked.items.some((candidate) => candidate.id === "vitamin-d"),
      false,
      JSON.stringify(disallowed),
    );
  }
});

test("supplement genetic rationale uses the exact weighted leverage-minus-one score", () => {
  const plan = buildSupplementPlan([
    calledMarker("rs2282679", "CC", { leverage: 1 }),
    calledMarker("rs2228570", "AA", { leverage: 2 }),
    calledMarker("rs10741657", "GG", { leverage: 3 }),
  ]);
  const vitaminD = plan.items.find((item) => item.id === "vitamin-d");
  assert.ok(vitaminD);
  assert.equal(vitaminD.score, 4); // (1-1)*2 + (2-1)*2 + (3-1)*1
  assert.equal(vitaminD.ranking.geneticRationaleScore, 4);
});

test("safe adult references are explicit and never presented as gene-calculated doses", () => {
  const plan = buildSupplementPlan([
    calledMarker("rs2282679", "CC"),
    calledMarker("rs2228570", "AA"),
    calledMarker("rs10741657", "GG"),
    calledMarker("rs1800629", "AA"),
    calledMarker("rs1800795", "GG"),
    calledMarker("rs1205", "CC"),
    calledMarker("rs7946", "TT"),
    calledMarker("rs2236225", "AA"),
    calledMarker("rs7700970", "TT"),
  ]);
  const vitaminD = plan.items.find((item) => item.id === "vitamin-d");
  const omega3 = plan.items.find((item) => item.id === "omega-3");
  const choline = plan.items.find((item) => item.id === "choline");

  assert.ok(vitaminD);
  assert.match(vitaminD.referenceAmount, /600 IU/);
  assert.match(vitaminD.referenceAmount, /4,000 IU/);
  assert.doesNotMatch(vitaminD.name, /\bK2\b|MK-7/i);
  assert.doesNotMatch(vitaminD.referenceAmount, /\bK2\b|MK-7/i);
  assert.match(vitaminD.timing, /Do not automatically add vitamin K2/i);
  assert.ok(omega3);
  assert.match(omega3.referenceAmount, /250 mg/);
  assert.doesNotMatch(omega3.referenceAmount, /1–2 g|1-2 g/);
  assert.ok(choline);
  assert.match(choline.referenceAmount, /425 mg/);
  assert.match(choline.referenceAmount, /550 mg/);
  assert.match(choline.referenceAmount, /ordinary-adult/i);
  assert.match(choline.referenceAmount, /does not infer/i);
  assert.match(choline.review, /educational context/i);
  assert.match(choline.review, /practitioner decides/i);
  assert.match(plan.framing, /does not prove a deficiency/i);
  assert.match(plan.framing, /before a food gap, laboratory abnormality or symptom/i);
});

test("one-carbon and B12 cards require cross-gene convergence and reject MTHFR hype", () => {
  const plan = buildSupplementPlan([
    calledMarker("rs1801133", "AA"),
    calledMarker("rs1805087", "GG"),
    calledMarker("rs1801394", "GG"),
    calledMarker("rs1801222", "GG"),
    calledMarker("rs526934", "GG"),
    calledMarker("rs601338", "AA"),
  ]);
  const folate = plan.items.find((item) => item.id === "folate-b12");
  const b12 = plan.items.find((item) => item.id === "vitamin-b12");

  assert.ok(folate);
  assert.equal(folate.decision, "clinician-only");
  assert.match(folate.whatConfirmsNeed, /MTHFR variants alone do not require/i);
  assert.match(folate.referenceAmount, /400 micrograms DFE/);
  assert.match(folate.referenceAmount, /CDC recommends/i);
  assert.match(folate.referenceAmount, /400 micrograms of folic acid/i);
  assert.match(folate.referenceAmount, /even with a common MTHFR variant/i);
  assert.match(folate.ageConsiderations, /CDC public-health guidance/i);
  assert.match(folate.ageConsiderations, /could become pregnant/i);
  assert.match(folate.checksBeforeStarting.join(" "), /not a reason to avoid folic acid/i);
  assert.ok(b12);
  assert.equal(b12.decision, "clinician-only");
  assert.match(b12.referenceAmount, /No self-start supplement amount/i);
  assert.match(b12.timing, /No evidence.*methylcobalamin.*cyanocobalamin/i);
});

test("every genetics-guided candidate carries the practitioner approval workflow", () => {
  assert.deepEqual([...PRACTITIONER_APPROVAL_CHECKLIST], [
    "Practitioner approved",
    "Medication interaction checked",
    "Interaction with current supplements checked",
    "Interaction with other clinician/doctor recommendations checked",
    "Contraindications reviewed",
    "Dose/form confirmed",
  ]);
  assert.deepEqual([...CLINICAL_CONTEXT_CHECKLIST], [
    "Chronic medication",
    "Prescription medication",
    "Existing supplementation",
    "Medical conditions",
    "Pregnancy or breastfeeding where relevant",
    "Renal impairment where relevant",
    "Hepatic impairment where relevant",
    "Recommendations already made by another healthcare professional",
  ]);
  const plan = buildSupplementPlan(
    [
      calledMarker("rs2282679", "CC"),
      calledMarker("rs2228570", "AA"),
      calledMarker("rs10741657", "GG"),
      calledMarker("rs1800629", "AA"),
      calledMarker("rs1800795", "GG"),
      calledMarker("rs1205", "CC"),
      calledMarker("rs7946", "TT"),
      calledMarker("rs2236225", "AA"),
      calledMarker("rs7700970", "TT"),
      calledMarker("rs1801133", "AA"),
      calledMarker("rs1805087", "GG"),
      calledMarker("rs1801394", "GG"),
      calledMarker("rs1801222", "GG"),
      calledMarker("rs526934", "GG"),
      calledMarker("rs601338", "AA"),
      calledMarker("rs1800562", "AG"),
    ],
    { profileAge: 72 },
  );

  assert.ok(plan.items.length >= 6);
  assert.equal(plan.rulesVersion, SUPPLEMENT_RULES_VERSION);
  assert.equal(plan.rulesVersion, "2026.08.17-s4");
  assert.equal(plan.primaryLimit, 5);
  assert.equal(plan.primaryItems.length, 5);
  assert.ok(plan.additionalItems.length >= 1);
  assert.deepEqual(
    [...plan.primaryItems, ...plan.additionalItems],
    plan.items,
  );
  assert.equal(new Set(plan.items.map((item) => item.id)).size, plan.items.length);
  assert.deepEqual(plan.practitionerChecklist, [
    ...PRACTITIONER_APPROVAL_CHECKLIST,
  ]);
  assert.deepEqual(plan.clinicalContextChecklist, [
    ...CLINICAL_CONTEXT_CHECKLIST,
  ]);
  for (const item of plan.items) {
    assert.equal(item.practitionerApprovalRequired, true);
    assert.equal(item.considerationLabel, "CONSIDER / PRACTITIONER REVIEW");
    assert.match(item.plainReason, /practitioner-review consideration/i);
    assert.match(item.plainReason, /not an instruction to start, stop or change/i);
    assert.deepEqual(item.practitionerChecklist, [
      ...PRACTITIONER_APPROVAL_CHECKLIST,
    ]);
    assert.deepEqual(item.clinicalContextChecklist, [
      ...CLINICAL_CONTEXT_CHECKLIST,
    ]);
    assert.ok(item.interactionWarnings.length > 0, item.id);
    assert.ok(item.supportingPathway.length > 0, item.id);
    assert.ok(item.preferredForm.length > 0, item.id);
    assert.ok(item.formRationale.length > 0, item.id);
    assert.ok(item.timingRationale.length > 0, item.id);
    assert.ok(item.medicationInteractionCheck.length > 0, item.id);
    assert.ok(item.currentSupplementInteractionCheck.length > 0, item.id);
    assert.ok(item.contraindications.length > 0, item.id);
    assert.ok(item.measurementGuidance.baseline.length > 0, item.id);
    assert.ok(item.measurementGuidance.followUp.length > 0, item.id);
    assert.ok(item.ageConsiderations.length > 0, item.id);
    assert.match(item.ageConsiderations, /ordinary adult/i, item.id);
    assert.match(item.ageConsiderations, /pregnancy/i, item.id);
    assert.match(item.ageConsiderations, /breastfeeding/i, item.id);
    assert.ok(item.whatRefinesDecision.length > 0, item.id);
    assert.ok(item.referenceAmount.length > 0, item.id);
    assert.ok(item.timing.length > 0, item.id);
    assert.ok(item.ranking.rank >= 1, item.id);
  }
  assert.deepEqual(
    plan.items.map((item) => item.ranking.rank),
    plan.items.map((_, index) => index + 1),
  );
  assert.deepEqual(
    Object.fromEntries(
      plan.items.map((item) => [item.id, item.measurementGuidance.status]),
    ),
    {
      "vitamin-d": "clinically-indicated",
      "omega-3": "not-routinely-needed",
      choline: "not-routinely-needed",
      "folate-b12": "required-before-implementation",
      "vitamin-b12": "required-before-implementation",
      iron: "required-before-implementation",
    },
  );
  for (const item of plan.items) {
    assert.equal(
      item.measurementGuidance.advisable,
      item.measurementGuidance.status === "required-before-implementation",
      item.id,
    );
  }
});

test("age can escalate an already susceptible pathway but never creates a review by itself", () => {
  const vitaminDMarkers = [
    calledMarker("rs2282679", "CC"),
    calledMarker("rs2228570", "AA"),
  ];
  const age70 = buildSupplementPlan(vitaminDMarkers, { profileAge: 70 });
  const age71 = buildSupplementPlan(vitaminDMarkers, { profileAge: 71 });
  const noGeneticBasis = buildSupplementPlan([], { profileAge: 85 });
  const oneMarkerOnly = buildSupplementPlan([vitaminDMarkers[0]], {
    profileAge: 85,
  });
  const oneGeneOnly = buildSupplementPlan(
    vitaminDMarkers.map((marker) => ({ ...marker, gene: "SAME" })),
    { profileAge: 85 },
  );
  const noPositiveScore = buildSupplementPlan(
    vitaminDMarkers.map((marker) => ({ ...marker, leverage: 1 })),
    { profileAge: 85 },
  );

  assert.equal(age70.items.some((item) => item.id === "vitamin-d"), false);
  const olderVitaminD = age71.items.find((item) => item.id === "vitamin-d");
  assert.equal(olderVitaminD?.ageStrengthened, true);
  assert.equal(
    olderVitaminD?.eligibilityBasis,
    "genetic-convergence-plus-age",
  );
  assert.match(olderVitaminD?.ageContext ?? "", /age 71|800 IU/i);
  assert.match(olderVitaminD?.ageConsiderations ?? "", /age 71|800 IU/i);
  assert.equal(noGeneticBasis.outcome, "none");
  assert.deepEqual(noGeneticBasis.items, []);
  assert.equal(oneMarkerOnly.items.some((item) => item.id === "vitamin-d"), false);
  assert.equal(oneGeneOnly.items.some((item) => item.id === "vitamin-d"), false);
  assert.equal(noPositiveScore.items.some((item) => item.id === "vitamin-d"), false);
});

test("an exact HFE safety call surfaces iron as clinician-only with no self-start dose", () => {
  const carrier = buildSupplementPlan([calledMarker("rs1800562", "AG")]);
  const iron = carrier.items.find((item) => item.id === "iron");

  assert.ok(iron);
  assert.equal(iron.decision, "clinician-only");
  assert.equal(iron.eligibilityBasis, "safety-review-marker");
  assert.equal(
    iron.measurementGuidance.status,
    "required-before-implementation",
  );
  assert.match(iron.plainReason, /safety review/i);
  assert.match(iron.plainReason, /not a recommendation to take iron/i);
  assert.match(iron.referenceAmount, /No self-start amount/);
  assert.match(iron.whatConfirmsNeed, /full blood count, ferritin and transferrin saturation/i);

  const common = buildSupplementPlan([calledMarker("rs1800562", "GG")]);
  assert.equal(common.items.some((item) => item.id === "iron"), false);
});

test("supplement output is deterministic and excludes weak genotype-only products", () => {
  const markers = [
    calledMarker("rs1800629", "AA"),
    calledMarker("rs1800795", "GG"),
    calledMarker("rs1205", "CC"),
    calledMarker("rs7946", "TT"),
    calledMarker("rs2236225", "AA"),
    calledMarker("rs7700970", "TT"),
  ];
  const forward = buildSupplementPlan(markers);
  const reversed = buildSupplementPlan([...markers].reverse());

  assert.deepEqual(reversed, forward);
  assert.doesNotMatch(
    forward.items.map((item) => item.name).join(" "),
    /DAO|glycine|sulforaphane|magnesium glycinate/i,
  );
});

test("confirmed minors never receive general adult supplement amounts", () => {
  const plan = buildSupplementPlan(
    [
      calledMarker("rs2282679", "CC"),
      calledMarker("rs2228570", "AA"),
      calledMarker("rs10741657", "GG"),
    ],
    { adultReferencesAllowed: false },
  );

  assert.equal(plan.outcome, "none");
  assert.deepEqual(plan.items, []);
  assert.deepEqual(plan.primaryItems, []);
  assert.deepEqual(plan.additionalItems, []);
  assert.match(plan.framing, /under 18|paediatric/i);
});
