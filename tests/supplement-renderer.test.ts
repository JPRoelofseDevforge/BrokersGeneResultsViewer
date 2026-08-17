import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { ReportDashboard } from "../app/report-dashboard";
import type {
  GeneReport,
  SupplementRecommendation,
} from "../lib/gene-processing/types";
import { getGeneReport } from "../lib/reports/get-gene-report";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const practitionerChecklist = [
  "Practitioner approved",
  "Medication interaction checked",
  "Interaction with current supplements checked",
  "Interaction with other clinician/doctor recommendations checked",
  "Contraindications reviewed",
  "Dose/form confirmed",
];

const clinicalContextChecklist = [
  "Chronic medication",
  "Prescription medication",
  "Existing supplementation",
  "Medical conditions",
  "Pregnancy or breastfeeding where relevant",
  "Renal impairment where relevant",
  "Hepatic impairment where relevant",
  "Recommendations already made by another healthcare professional",
];

function supplement(
  name: string,
  rank: number,
  domainId: string,
  decision: SupplementRecommendation["decision"] = "measure-first",
): SupplementRecommendation {
  const slug = name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");

  return {
    id: `test-${slug}`,
    name,
    considerationLabel: "CONSIDER / PRACTITIONER REVIEW",
    decision,
    eligibilityBasis:
      rank === 2
        ? "genetic-convergence-plus-age"
        : decision === "clinician-only"
          ? "safety-review-marker"
          : "genetic-convergence",
    plainReason: `${name} has a multi-marker nutritional rationale worth practitioner review.`,
    supportingPathway: `${name} synthesis, transport and metabolism pathway.`,
    whatConfirmsNeed:
      "Clinical context and, where useful, baseline measurement refine rather than create the genetic rationale.",
    whatRefinesDecision:
      "Review health history, medicines, current supplements and an appropriate baseline measurement.",
    referenceAmount:
      decision === "clinician-only"
        ? "No self-start amount is provided; a clinician must decide whether and how to proceed."
        : "A general adult maintenance range only; this is not a prescribed or therapeutic dose.",
    preferredForm: `A practitioner-selected bioavailable form of ${name}.`,
    formRationale:
      "This form is commonly used and the final choice still depends on tolerance and clinical context.",
    timing: "With food in the morning unless the practitioner advises otherwise.",
    timingRationale:
      "Food can improve tolerance; morning timing makes adherence easier to review.",
    duration: "Review after an agreed trial period; do not continue automatically.",
    foodFirst:
      "Keep a varied food pattern in place while the practitioner reviews whether a supplement adds value.",
    checksBeforeStarting: [
      "Confirm the product, amount and intended duration.",
      "Review medicines, current supplements and relevant medical conditions.",
    ],
    interactionWarnings: [
      "A practitioner or pharmacist must check medicine and supplement interactions before use.",
    ],
    medicationInteractionCheck:
      "Check chronic and prescription medicines with the practitioner or pharmacist.",
    currentSupplementInteractionCheck:
      "Add up duplicate ingredients and review the complete current supplement list.",
    contraindications: [
      "Review pregnancy or breastfeeding and renal or hepatic impairment where relevant.",
    ],
    measurementGuidance: {
      advisable: rank !== 1,
      status:
        decision === "clinician-only"
          ? "required-before-implementation"
          : rank === 1
            ? "not-routinely-needed"
          : "clinically-indicated",
      baseline: "A relevant baseline measurement is advisable before implementation.",
      followUp: "Repeat only at a practitioner-selected interval and interpret clinically.",
    },
    practitionerApprovalRequired: true,
    practitionerChecklist: [...practitionerChecklist],
    clinicalContextChecklist: [...clinicalContextChecklist],
    ageStrengthened: rank === 2,
    ageContext:
      rank === 2
        ? "Age strengthened the existing genetic rationale but did not diagnose a deficiency."
        : null,
    ageConsiderations:
      rank === 2
        ? "Age can reduce physiological reserve, so monitoring becomes more useful; age alone does not select a dose."
        : "No age-only escalation applies; use life-stage guidance and clinical context.",
    review:
      "Reassess benefit, tolerance, interactions and whether continuation remains appropriate.",
    score: 12 - rank,
    ranking: {
      rank,
      geneticRationaleScore: 12 - rank,
      clinicalRelevance: 5,
      safetyPriority: decision === "clinician-only" ? 5 : 3,
      actionability: decision === "clinician-only" ? 2 : 4,
    },
    domainIds: [domainId],
    contributors: [
      { gene: `GENE${rank}A`, variantId: `rs100${rank}` },
      { gene: `GENE${rank}B`, variantId: `rs200${rank}` },
    ],
    executiveFitnessIds: [],
  };
}

async function sixItemReport() {
  const report = await getGeneReport("sam-240184");
  assert.ok(report);
  const domainId = report.domains[0]?.id;
  assert.ok(domainId);

  const items = [
    supplement("Vitamin D3", 1, domainId),
    supplement("Omega-3 EPA and DHA", 2, domainId),
    supplement("Choline", 3, domainId),
    supplement("Folate and vitamin B12 review", 4, domainId, "clinician-only"),
    supplement("Vitamin B12", 5, domainId, "clinician-only"),
    supplement("Iron", 6, domainId, "clinician-only"),
  ];

  report.recommendations.supplements = {
    rulesVersion: "renderer-test-s4",
    outcome: "review-ready",
    framing:
      "Genetics can justify practitioner consideration without proving a deficiency or prescribing treatment.",
    practitionerChecklist: [...practitionerChecklist],
    clinicalContextChecklist: [...clinicalContextChecklist],
    primaryLimit: 5,
    primaryItems: items.slice(0, 5),
    additionalItems: items.slice(5),
    items,
  };

  return report;
}

function countOccurrences(text: string, value: string) {
  return text.split(value).length - 1;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadPortalValidator() {
  const portal = readFileSync(`${projectRoot}app/report-portal.tsx`, "utf8");
  const start = portal.indexOf("function isRecord");
  const end = portal.indexOf("function matchedPersonName");
  assert.ok(start >= 0 && end > start, "portal validator source should be present");

  const output = ts.transpileModule(portal.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", output)(loaded, loaded.exports);
  const validator = loaded.exports.isGeneReport;
  assert.equal(typeof validator, "function");
  return validator as (value: unknown) => value is GeneReport;
}

test("fallback dashboard renders five primary and one additional complete practitioner-review cards", async () => {
  const report = await sixItemReport();
  const html = renderToStaticMarkup(createElement(ReportDashboard, { report }));

  assert.equal(countOccurrences(html, 'data-supplement-tier="primary"'), 5);
  assert.equal(countOccurrences(html, 'data-supplement-tier="additional"'), 1);
  assert.match(html, /Primary Supplement Considerations/);
  assert.match(html, /Additional Supplement Considerations/);
  assert.match(html, /none has been omitted/i);

  for (const name of [
    "Vitamin D3",
    "Omega-3 EPA and DHA",
    "Choline",
    "Folate and vitamin B12 review",
    "Vitamin B12",
    "Iron",
  ]) {
    assert.match(html, new RegExp(name));
  }

  for (const heading of [
    "Reason for practitioner review",
    "Supporting genetic markers / pathway",
    "Relevant SAM systems / domains",
    "Form context — if approved",
    "Timing context — if approved",
    "Why this form",
    "Why this timing",
    "Review interval — if approved",
    "Age considerations",
    "Medication interaction check",
    "Current supplement interaction check",
    "Contraindications / safety cautions",
    "Practitioner approval required",
    "Baseline and follow-up measurement",
    "Clinical context the practitioner must consider",
  ]) {
    assert.match(html, new RegExp(heading.replaceAll("/", "\\/")));
  }

  assert.match(html, /CONSIDER \/ PRACTITIONER REVIEW/);
  assert.match(
    html,
    /Do not start any supplement from this report without recorded practitioner approval\./,
  );
  assert.match(html, /Clinician-gated — do not initiate independently/);
  assert.match(
    html,
    /Genetics may trigger investigation and practitioner consideration, but it does not determine the dose, form, route, or whether this item should be started\./,
  );
  assert.doesNotMatch(html, /start of iron or vitamin B12/);
  assert.match(html, /Required before implementation/);
  assert.match(html, /Not routinely needed/);
  assert.match(
    html,
    /Only when clinically indicated, not routinely from DNA alone/,
  );
  assert.match(html, /not a prescription/i);
  for (const check of practitionerChecklist) assert.match(html, new RegExp(check));
  for (const context of clinicalContextChecklist)
    assert.match(html, new RegExp(context));
});

test("portal accepts the current complete plan and rejects incomplete legacy supplement payloads", async () => {
  const validate = loadPortalValidator();
  const report = await sixItemReport();

  assert.equal(validate(jsonClone(report)), true);

  const zeroItemReport = jsonClone(report);
  zeroItemReport.recommendations.supplements = {
    ...zeroItemReport.recommendations.supplements,
    outcome: "none",
    primaryItems: [],
    additionalItems: [],
    items: [],
  };
  assert.equal(validate(zeroItemReport), true);

  const missingDetail = structuredClone(report);
  delete (missingDetail.recommendations.supplements.items[0] as Partial<
    SupplementRecommendation
  >).preferredForm;
  assert.equal(validate(missingDetail), false);

  const missingAgeField = structuredClone(report);
  delete (missingAgeField.recommendations.supplements.items[0] as Partial<
    SupplementRecommendation
  >).ageConsiderations;
  assert.equal(validate(missingAgeField), false);

  const prePrimaryAdditionalSplit = structuredClone(report);
  delete (prePrimaryAdditionalSplit.recommendations.supplements as Partial<
    GeneReport["recommendations"]["supplements"]
  >).additionalItems;
  assert.equal(validate(prePrimaryAdditionalSplit), false);

  const wrongPrimaryLimit = jsonClone(report);
  wrongPrimaryLimit.recommendations.supplements.primaryLimit = 99;
  assert.equal(validate(wrongPrimaryLimit), false);

  const divergentPartition = jsonClone(report);
  divergentPartition.recommendations.supplements.primaryItems[0].plainReason =
    "Different but otherwise structurally valid practitioner-review copy.";
  assert.equal(validate(divergentPartition), false);

  const outOfRangeRanking = jsonClone(report);
  outOfRangeRanking.recommendations.supplements.items[0].ranking.safetyPriority =
    6;
  outOfRangeRanking.recommendations.supplements.primaryItems[0].ranking.safetyPriority =
    6;
  assert.equal(validate(outOfRangeRanking), false);

  const negativeGeneticScore = jsonClone(report);
  negativeGeneticScore.recommendations.supplements.items[0].score = -1;
  negativeGeneticScore.recommendations.supplements.items[0].ranking.geneticRationaleScore =
    -1;
  negativeGeneticScore.recommendations.supplements.primaryItems[0].score = -1;
  negativeGeneticScore.recommendations.supplements.primaryItems[0].ranking.geneticRationaleScore =
    -1;
  assert.equal(validate(negativeGeneticScore), false);

  const wrongRankOrder = jsonClone(report);
  wrongRankOrder.recommendations.supplements.items[0].ranking.rank = 2;
  wrongRankOrder.recommendations.supplements.primaryItems[0].ranking.rank = 2;
  assert.equal(validate(wrongRankOrder), false);
});
