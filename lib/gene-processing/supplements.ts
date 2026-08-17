import type {
  ProcessedMarker,
  RecommendationContributor,
  SupplementDecision,
  SupplementPlan,
  SupplementRecommendation,
} from "./types";

export const SUPPLEMENT_RULES_VERSION = "2026.08.17-s1";

interface SupplementCriterion {
  variantId: string;
  genotypes: string[];
  weight: number;
}

interface SupplementRule {
  id: string;
  name: string;
  decision: SupplementDecision;
  plainReason: string;
  whatConfirmsNeed: string;
  referenceAmount: string;
  timing: string;
  duration: string;
  foodFirst: string;
  checksBeforeStarting: string[];
  review: string;
  executiveFitnessIds: string[];
  criteria: SupplementCriterion[];
  order: number;
  minimumMarkers?: number;
  minimumGenes?: number;
}

interface ScoredSupplementRule {
  rule: SupplementRule;
  score: number;
  contributors: RecommendationContributor[];
  domainIds: string[];
  geneCount: number;
  hfeSafetyCall: boolean;
}

/*
 * Genetics chooses which nutrient deserves a closer look. It does not prove a
 * deficiency or calculate a personal dose. Amounts below are deliberately
 * labelled as general adult references and every rule states what must confirm
 * a real need before somebody treats it as a plan.
 */
const SUPPLEMENT_RULES: SupplementRule[] = [
  {
    id: "vitamin-d",
    name: "Vitamin D3",
    decision: "measure-first",
    plainReason:
      "Your called results converge across vitamin D transport, receptor signalling, and liver activation. That makes your actual 25-OH vitamin D level more useful than guessing from sunlight or genes.",
    whatConfirmsNeed:
      "A recognised 25-OH vitamin D blood result, interpreted with the laboratory unit, season, calcium, kidney context, and a qualified clinician.",
    referenceAmount:
      "General adult intake reference: 600 IU (15 micrograms) daily from age 19 to 70, or 800 IU (20 micrograms) over 70. A low result needs a clinician-set treatment amount. Do not exceed 4,000 IU (100 micrograms) daily without review.",
    timing:
      "If used to close an agreed intake gap, take it once daily with a meal that contains some fat. Do not automatically add vitamin K2.",
    duration:
      "Use the review date set with the blood result. This report does not create an open-ended course from genetics.",
    foodFirst:
      "Oily fish, egg yolk, and fortified foods contribute, while sunlight exposure varies by season, skin, clothing, and time outdoors.",
    checksBeforeStarting: [
      "Confirm the blood unit: this report uses nmol/L, not ng/mL.",
      "Review kidney disease, abnormal calcium, hyperparathyroidism or granulomatous disease with a clinician.",
      "Check medicines, especially thiazide diuretics.",
    ],
    review:
      "If a clinician starts treatment for a low level, agree the repeat test and stopping or maintenance rule at the same time.",
    executiveFitnessIds: ["ef8"],
    order: 1,
    criteria: [
      { variantId: "rs2282679", genotypes: ["AC", "CC"], weight: 2 },
      { variantId: "rs7041", genotypes: ["AC", "CC"], weight: 1 },
      { variantId: "rs2228570", genotypes: ["AG", "AA"], weight: 2 },
      { variantId: "rs1544410", genotypes: ["AG", "AA"], weight: 1 },
      { variantId: "rs10741657", genotypes: ["AG", "GG"], weight: 1 },
      { variantId: "rs731236", genotypes: ["GG"], weight: 1 },
    ],
  },
  {
    id: "omega-3",
    name: "Omega-3 (EPA and DHA)",
    decision: "food-first",
    plainReason:
      "Several called inflammatory and recovery markers point in the same direction. They do not diagnose an omega-3 deficiency; they make regular omega-3 food intake worth checking.",
    whatConfirmsNeed:
      "A normal-week food review showing that oily fish or an equivalent source is consistently absent, or a separate clinician-led cardiovascular indication.",
    referenceAmount:
      "If oily fish is absent, a general adult gap-closing reference is about 250 mg combined EPA plus DHA daily. Higher clinical amounts are not set by this report.",
    timing:
      "Take with a meal. Read the EPA and DHA amounts on the label rather than the total fish-oil weight.",
    duration:
      "Continue only while the food gap remains, then review after about 12 weeks or when the diet changes.",
    foodFirst:
      "Use oily fish such as sardines, salmon, mackerel or anchovies. Algal EPA/DHA is an alternative for people who avoid fish.",
    checksBeforeStarting: [
      "Review anticoagulant or antiplatelet medicines with a clinician or pharmacist.",
      "Ask for advice before higher amounts if you have atrial fibrillation or a bleeding disorder.",
      "Check fish or shellfish allergy and product quality.",
    ],
    review:
      "This is a food-gap decision, not a treatment for an inflammatory gene or a high hs-CRP result.",
    executiveFitnessIds: ["ef1", "ef5", "ef8"],
    order: 2,
    criteria: [
      { variantId: "rs1800629", genotypes: ["AG", "AA"], weight: 2 },
      { variantId: "rs1800795", genotypes: ["CG", "GG"], weight: 1 },
      { variantId: "rs1205", genotypes: ["CT", "CC"], weight: 1 },
      { variantId: "rs419598", genotypes: ["CT", "CC"], weight: 1 },
      {
        variantId: "rs429358+rs7412",
        genotypes: ["E3/E4", "E4/E4"],
        weight: 1,
      },
    ],
  },
  {
    id: "choline",
    name: "Choline",
    decision: "food-first",
    plainReason:
      "Your called PEMT, MTHFD1, and BHMT results converge on how much choline has to arrive from food rather than being made or recycled internally.",
    whatConfirmsNeed:
      "A realistic food calculation showing that eggs, soy, fish, meat, dairy or another choline source does not reach the adult target.",
    referenceAmount:
      "Aim for 425 mg total per day for adult women or 550 mg for adult men. If food falls short, supplement only the estimated difference; many products provide 10 to 250 mg per serving.",
    timing:
      "Timing is flexible. If a gap-closing product is used, take it with a meal and count it together with food rather than as an extra target.",
    duration:
      "Track an ordinary four-week food pattern, then stop or reduce the product when food reliably closes the gap.",
    foodFirst:
      "Eggs, soybeans, fish, meat, dairy and some legumes are practical sources. Two eggs provide a meaningful part of a day, but not the whole target.",
    checksBeforeStarting: [
      "Use the sex-at-birth and pregnancy or lactation target that applies to you.",
      "Do not chase the 3,500 mg adult upper limit; high intakes can cause low blood pressure, sweating, odour and liver effects.",
      "Review a large-dose plan if you have liver disease or take medicines that affect blood pressure.",
    ],
    review:
      "The marker result raises the review priority. The calculated food shortfall determines whether there is anything to supplement.",
    executiveFitnessIds: ["ef1", "ef5", "ef8"],
    order: 3,
    criteria: [
      { variantId: "rs7946", genotypes: ["CT", "TT"], weight: 2 },
      { variantId: "rs2236225", genotypes: ["AG", "AA"], weight: 1 },
      { variantId: "rs7700970", genotypes: ["CT", "TT"], weight: 1 },
    ],
  },
  {
    id: "folate-b12",
    name: "Folate and vitamin B12 review",
    decision: "measure-first",
    plainReason:
      "Several called one-carbon markers converge across different enzymes. That makes food intake, vitamin B12 status and—when clinically useful—homocysteine worth checking together.",
    whatConfirmsNeed:
      "A qualified review of diet and recognised blood results. Common MTHFR variants alone do not prove a folate need and do not require methylfolate.",
    referenceAmount:
      "General adult intake references are 400 micrograms DFE of folate and 2.4 micrograms of vitamin B12 daily. Treatment amounts are not set here. Keep synthetic folate below 1,000 micrograms daily unless a clinician directs otherwise.",
    timing:
      "There is no gene-based morning or evening requirement. Take an agreed gap-closing amount at a time you can use consistently.",
    duration:
      "A treatment course and repeat testing belong to the measured result. High-dose folate should not continue while vitamin B12 status is unknown.",
    foodFirst:
      "Greens, legumes and fortified grains supply folate. Fish, meat, eggs and dairy supply B12; a vegan diet needs a reliable B12 source regardless of genotype.",
    checksBeforeStarting: [
      "Check vitamin B12 before high-dose folate; a borderline B12 result may need methylmalonic acid interpreted with kidney function.",
      "Review metformin, acid-suppressing medicines, vegan or vegetarian intake, pregnancy plans and malabsorption history.",
      "Common MTHFR variants are not a reason to avoid folic acid.",
    ],
    review:
      "Use a clinician-set repeat date if a measured shortfall is treated. Homocysteine is nonspecific and does not unlock a B-complex by itself.",
    executiveFitnessIds: ["ef1", "ef5", "ef8"],
    order: 4,
    criteria: [
      { variantId: "rs1801133", genotypes: ["AG", "AA"], weight: 2 },
      { variantId: "rs1801131", genotypes: ["GT", "GG"], weight: 1 },
      { variantId: "rs1805087", genotypes: ["AG", "GG"], weight: 1 },
      { variantId: "rs1801394", genotypes: ["AG", "GG"], weight: 1 },
      { variantId: "rs2236225", genotypes: ["AG", "AA"], weight: 1 },
      { variantId: "rs1979277", genotypes: ["AG", "AA"], weight: 1 },
    ],
  },
  {
    id: "vitamin-b12",
    name: "Vitamin B12",
    decision: "measure-first",
    plainReason:
      "Your called absorption, transport and recycling markers converge on vitamin B12 handling. The useful next step is a dietary and measured check, not a preferred supplement form inferred from DNA.",
    whatConfirmsNeed:
      "A low-animal-food diet, metformin or acid-suppressing medicine use, malabsorption risk, or a recognised B12 assessment interpreted by a clinician.",
    referenceAmount:
      "General adult intake reference: 2.4 micrograms daily. Deficiency treatment can use much larger amounts, but the amount and route must follow the measured result and clinical context.",
    timing:
      "Timing is flexible, with or without food. No evidence in this report supports choosing methylcobalamin over cyanocobalamin from genotype.",
    duration:
      "Continue according to the cause of the shortfall and the clinician's repeat-testing plan; do not infer lifelong use from these markers.",
    foodFirst:
      "Fish, meat, eggs and dairy provide B12. A vegan diet requires a reliable fortified food or supplement source independent of this genetic result.",
    checksBeforeStarting: [
      "A borderline result may need methylmalonic acid rather than an automatic deficiency label.",
      "Review kidney function when methylmalonic acid is interpreted.",
      "Check metformin, acid-suppressing medicines, gastric surgery and malabsorption history.",
    ],
    review:
      "Agree what will be rechecked and when. No upper limit is established, but that does not make an unnecessary high dose useful.",
    executiveFitnessIds: ["ef1", "ef5", "ef8"],
    order: 5,
    criteria: [
      { variantId: "rs1801222", genotypes: ["AG", "GG"], weight: 2 },
      { variantId: "rs526934", genotypes: ["AG", "GG"], weight: 1 },
      { variantId: "rs601338", genotypes: ["AA"], weight: 1 },
      { variantId: "rs1805087", genotypes: ["AG", "GG"], weight: 1 },
      { variantId: "rs1801394", genotypes: ["AG", "GG"], weight: 1 },
    ],
  },
  {
    id: "iron",
    name: "Iron",
    decision: "clinician-only",
    plainReason:
      "Your called iron-handling and restless-legs-related markers make iron worth getting right in both directions. They cannot tell whether your stores are low, normal or high.",
    whatConfirmsNeed:
      "Symptoms and history plus a full blood count, ferritin and transferrin saturation, interpreted with inflammation context. HFE results make measuring before taking iron especially important.",
    referenceAmount:
      "No self-start amount. Iron treatment often exceeds the healthy-adult 45 mg daily upper limit, so the clinician sets the elemental amount, schedule and follow-up from confirmed deficiency and its cause.",
    timing:
      "If a clinician prescribes it, follow that product's instructions. Iron is usually separated from tea, coffee and calcium, and from levothyroxine by at least four hours.",
    duration:
      "Treatment is time-limited and monitored. The prescriber should set an early response check and the point at which iron stops.",
    foodFirst:
      "Meat, legumes and fortified foods contribute. Vitamin C with plant iron improves absorption; tea and coffee with the same meal reduce it.",
    checksBeforeStarting: [
      "Do not use fatigue alone as evidence of iron deficiency.",
      "Review HFE C282Y or H63D results and family history with the clinician.",
      "Keep iron products away from children and check levothyroxine, levodopa and stomach medicines.",
    ],
    review:
      "A common clinical plan checks haemoglobin response within about four weeks, then continues only as needed to restore stores and address the cause.",
    executiveFitnessIds: ["ef1", "ef3"],
    order: 6,
    criteria: [
      { variantId: "rs855791", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs1800562", genotypes: ["AG", "AA"], weight: 3 },
      { variantId: "rs1799945", genotypes: ["CG", "GG"], weight: 1 },
      { variantId: "rs2300478", genotypes: ["GT", "GG"], weight: 1 },
      { variantId: "rs9296249", genotypes: ["CT", "TT"], weight: 1 },
    ],
  },
];

function scoreRule(
  rule: SupplementRule,
  markersByVariant: Map<string, ProcessedMarker>,
): ScoredSupplementRule {
  const contributors: RecommendationContributor[] = [];
  const domains = new Set<string>();
  const genes = new Set<string>();
  let score = 0;
  let hfeSafetyCall = false;

  for (const criterion of rule.criteria) {
    const marker = markersByVariant.get(criterion.variantId.toLowerCase());
    if (
      !marker ||
      marker.state !== "called" ||
      marker.clinicalReferral ||
      marker.sourceOnly ||
      !marker.genotype ||
      marker.leverage === null ||
      !criterion.genotypes.includes(marker.genotype)
    ) {
      continue;
    }

    score += criterion.weight * (marker.leverage >= 3 ? 1.5 : 1);
    contributors.push({ gene: marker.gene, variantId: marker.variantId });
    genes.add(marker.gene);
    marker.domainIds.forEach((domainId) => domains.add(domainId));
    if (
      rule.id === "iron" &&
      marker.variantId.toLowerCase() === "rs1800562" &&
      ["AG", "AA"].includes(marker.genotype)
    ) {
      hfeSafetyCall = true;
    }
  }

  return {
    rule,
    score,
    contributors,
    domainIds: [...domains].sort(),
    geneCount: genes.size,
    hfeSafetyCall,
  };
}

function qualifies(scored: ScoredSupplementRule) {
  if (scored.hfeSafetyCall) return true;
  return (
    scored.contributors.length >= (scored.rule.minimumMarkers ?? 3) &&
    scored.geneCount >= (scored.rule.minimumGenes ?? 3) &&
    scored.score >= 3
  );
}

function project(scored: ScoredSupplementRule): SupplementRecommendation {
  return {
    id: scored.rule.id,
    name: scored.rule.name,
    decision: scored.rule.decision,
    plainReason: scored.rule.plainReason,
    whatConfirmsNeed: scored.rule.whatConfirmsNeed,
    referenceAmount: scored.rule.referenceAmount,
    timing: scored.rule.timing,
    duration: scored.rule.duration,
    foodFirst: scored.rule.foodFirst,
    checksBeforeStarting: [...scored.rule.checksBeforeStarting],
    review: scored.rule.review,
    score: scored.score,
    domainIds: [...scored.domainIds],
    contributors: [...scored.contributors],
    executiveFitnessIds: [...scored.rule.executiveFitnessIds],
  };
}

export function buildSupplementPlan(
  markers: ProcessedMarker[],
  options: { adultReferencesAllowed?: boolean } = {},
): SupplementPlan {
  if (options.adultReferencesAllowed === false) {
    return {
      rulesVersion: SUPPLEMENT_RULES_VERSION,
      outcome: "none",
      framing:
        "General adult supplement amounts are withheld for a confirmed person under 18. A paediatric clinician must use age, growth, diet, medicines and measured results instead.",
      items: [],
    };
  }
  const markersByVariant = new Map(
    markers.map((marker) => [marker.variantId.toLowerCase(), marker]),
  );
  const items = SUPPLEMENT_RULES.map((rule) =>
    scoreRule(rule, markersByVariant),
  )
    .filter(qualifies)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.rule.order - right.rule.order;
    })
    .map(project);

  return {
    rulesVersion: SUPPLEMENT_RULES_VERSION,
    outcome: items.length ? "review-ready" : "none",
    framing:
      "Your called markers decide which nutrients deserve a closer look. They do not prove a deficiency or calculate a personal dose. Food intake, a recognised measurement and safety context decide whether a general adult reference becomes a real plan.",
    items,
  };
}

export function supplementRuleReferences() {
  return SUPPLEMENT_RULES.flatMap((rule) =>
    rule.criteria.map((criterion) => ({
      ruleId: rule.id,
      variantId: criterion.variantId,
      genotypes: [...criterion.genotypes],
    })),
  );
}
