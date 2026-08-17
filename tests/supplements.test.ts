import assert from "node:assert/strict";
import test from "node:test";

import { markerCatalogue } from "../lib/gene-processing/catalogue";
import {
  buildSupplementPlan,
  CLINICAL_CONTEXT_CHECKLIST,
  PRACTITIONER_APPROVAL_CHECKLIST,
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
  assert.ok(references.length > 0);

  for (const reference of references) {
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
  assert.match(folate.whatConfirmsNeed, /MTHFR variants alone do not require/i);
  assert.match(folate.referenceAmount, /400 micrograms DFE/);
  assert.match(folate.checksBeforeStarting.join(" "), /not a reason to avoid folic acid/i);
  assert.ok(b12);
  assert.match(b12.timing, /No evidence.*methylcobalamin.*cyanocobalamin/i);
});

test("every genetics-guided candidate carries the practitioner approval workflow", () => {
  assert.deepEqual([...PRACTITIONER_APPROVAL_CHECKLIST], [
    "Practitioner approved",
    "Medication interaction checked",
    "Interaction with current supplements checked",
    "Interaction with other clinician or doctor recommendations checked",
    "Contraindications reviewed",
    "Dose and form confirmed",
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
  assert.deepEqual(plan.practitionerChecklist, [
    ...PRACTITIONER_APPROVAL_CHECKLIST,
  ]);
  assert.deepEqual(plan.clinicalContextChecklist, [
    ...CLINICAL_CONTEXT_CHECKLIST,
  ]);
  for (const item of plan.items) {
    assert.equal(item.practitionerApprovalRequired, true);
    assert.deepEqual(item.practitionerChecklist, [
      ...PRACTITIONER_APPROVAL_CHECKLIST,
    ]);
    assert.deepEqual(item.clinicalContextChecklist, [
      ...CLINICAL_CONTEXT_CHECKLIST,
    ]);
    assert.ok(item.interactionWarnings.length > 0, item.id);
    assert.ok(item.whatRefinesDecision.length > 0, item.id);
    assert.ok(item.referenceAmount.length > 0, item.id);
    assert.ok(item.timing.length > 0, item.id);
  }
});

test("age strengthens selected genetic reviews but never creates one by itself", () => {
  const vitaminDMarkers = [
    calledMarker("rs2282679", "CC"),
    calledMarker("rs2228570", "AA"),
    calledMarker("rs10741657", "GG"),
  ];
  const age70 = buildSupplementPlan(vitaminDMarkers, { profileAge: 70 });
  const age71 = buildSupplementPlan(vitaminDMarkers, { profileAge: 71 });
  const noGeneticBasis = buildSupplementPlan([], { profileAge: 85 });

  assert.equal(
    age70.items.find((item) => item.id === "vitamin-d")?.ageStrengthened,
    false,
  );
  const olderVitaminD = age71.items.find((item) => item.id === "vitamin-d");
  assert.equal(olderVitaminD?.ageStrengthened, true);
  assert.match(olderVitaminD?.ageContext ?? "", /age 71|800 IU/i);
  assert.equal(noGeneticBasis.outcome, "none");
  assert.deepEqual(noGeneticBasis.items, []);
});

test("an exact HFE safety call surfaces iron as clinician-only with no self-start dose", () => {
  const carrier = buildSupplementPlan([calledMarker("rs1800562", "AG")]);
  const iron = carrier.items.find((item) => item.id === "iron");

  assert.ok(iron);
  assert.equal(iron.decision, "clinician-only");
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
  assert.match(plan.framing, /under 18|paediatric/i);
});
