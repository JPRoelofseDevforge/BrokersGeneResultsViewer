import type {
  ProcessedMarker,
  RecommendationContributor,
  SupplementDecision,
  SupplementEligibilityBasis,
  SupplementMeasurementGuidance,
  SupplementPlan,
  SupplementRecommendation,
} from "./types";

export const SUPPLEMENT_RULES_VERSION = "2026.08.17-s4";
export const PRIMARY_SUPPLEMENT_LIMIT = 5;

export const PRACTITIONER_APPROVAL_CHECKLIST = [
  "Practitioner approved",
  "Medication interaction checked",
  "Interaction with current supplements checked",
  "Interaction with other clinician/doctor recommendations checked",
  "Contraindications reviewed",
  "Dose/form confirmed",
] as const;

export const CLINICAL_CONTEXT_CHECKLIST = [
  "Chronic medication",
  "Prescription medication",
  "Existing supplementation",
  "Medical conditions",
  "Pregnancy or breastfeeding where relevant",
  "Renal impairment where relevant",
  "Hepatic impairment where relevant",
  "Recommendations already made by another healthcare professional",
] as const;

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
  supportingPathway: string;
  whatRefinesDecision: string;
  referenceAmount: string;
  preferredForm: string;
  formRationale: string;
  timing: string;
  timingRationale: string;
  duration: string;
  foodFirst: string;
  checksBeforeStarting: string[];
  interactionWarnings: string[];
  medicationInteractionCheck: string;
  currentSupplementInteractionCheck: string;
  contraindications: string[];
  measurementStatus: SupplementMeasurementGuidance["status"];
  baselineMeasurement: string;
  followUpMeasurement: string;
  review: string;
  executiveFitnessIds: string[];
  criteria: SupplementCriterion[];
  order: number;
  minimumMarkers?: number;
  minimumGenes?: number;
  minimumScore?: number;
  clinicalRelevance: number;
  safetyPriority: number;
  actionability: number;
  ageReview?: {
    fromAge: number;
    context: string;
    canEstablishEligibility?: boolean;
    minimumMarkers?: number;
    minimumGenes?: number;
    minimumScore?: number;
  };
}

interface ScoredSupplementRule {
  rule: SupplementRule;
  score: number;
  contributors: RecommendationContributor[];
  domainIds: string[];
  geneCount: number;
  hfeSafetyCall: boolean;
}

const UNIVERSAL_PRACTITIONER_CONTEXT =
  "This is a practitioner-review consideration, not an instruction to start, stop or change a supplement.";

const ORDINARY_ADULT_LIFE_STAGE_CONTEXT =
  "Population references in this report describe an ordinary adult. Pregnancy planning, pregnancy and breastfeeding can change nutrient requirements, product choice, safety and monitoring; this report does not infer any of those states, so the applicable life-stage guidance must be confirmed separately.";

const CDC_FOLIC_ACID_CONTEXT =
  "Separate CDC public-health guidance says that anyone who could become pregnant should get 400 micrograms of folic acid daily, even with a common MTHFR variant. That guidance is independent of this genetic review; a clinician must set any higher amount or special-risk plan.";

function buildAgeConsiderations(
  rule: SupplementRule,
  ageStrengthened: boolean,
) {
  const ageContext = ageStrengthened
    ? rule.ageReview?.context
    : rule.ageReview
      ? `No age escalation was applied. This rule has additional age context from age ${rule.ageReview.fromAge}, but age never replaces its genetic minimum.`
      : "No age-specific escalation is defined for this rule.";
  return [
    ageContext,
    ORDINARY_ADULT_LIFE_STAGE_CONTEXT,
    rule.id === "folate-b12" ? CDC_FOLIC_ACID_CONTEXT : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
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
    supportingPathway:
      "Vitamin D transport, receptor signalling, and liver activation",
    whatRefinesDecision:
      "A recognised 25-OH vitamin D result can refine the amount and follow-up, but it is not required for this genetics-guided item to appear for practitioner review.",
    referenceAmount:
      "U.S. population nutrition reference: 600 IU (15 micrograms) daily from age 19 to 70, or 800 IU (20 micrograms) over 70. The U.S. adult upper limit of 4,000 IU (100 micrograms) is a ceiling, not a recommended dose or South African product limit. A low result needs a clinician-set treatment amount.",
    preferredForm:
      "Vitamin D3 (cholecalciferol) is a practical maintenance form; vitamin D2 also raises 25-OH vitamin D. No form is selected by genotype.",
    formRationale:
      "Both D2 and D3 are absorbed, while D3 generally raises and maintains 25-OH vitamin D more effectively. That evidence is general, not gene-specific.",
    timing:
      "If used to close an agreed intake gap, take it once daily with a meal that contains some fat. Do not automatically add vitamin K2.",
    timingRationale:
      "Vitamin D is fat soluble, so a meal or snack containing some fat supports absorption. DNA does not create a morning or evening preference.",
    duration:
      "Use the review date set with the blood result. This report does not create an open-ended course from genetics.",
    foodFirst:
      "Oily fish, egg yolk, and fortified foods contribute, while sunlight exposure varies by season, skin, clothing, and time outdoors.",
    checksBeforeStarting: [
      "Confirm the blood unit: this report uses nmol/L, not ng/mL.",
      "Review kidney disease, abnormal calcium, hyperparathyroidism or granulomatous disease with a clinician.",
      "Check medicines, especially thiazide diuretics.",
    ],
    interactionWarnings: [
      "Thiazide diuretics combined with vitamin D can increase the risk of high calcium, especially with renal impairment or hyperparathyroidism.",
      "Do not automatically pair vitamin D with vitamin K2. Vitamin K can interact seriously with warfarin.",
    ],
    medicationInteractionCheck:
      "Review thiazide diuretics, steroids, orlistat, statins and every prescription medicine with the practitioner or pharmacist.",
    currentSupplementInteractionCheck:
      "Add vitamin D from every current multivitamin, calcium product and separate D product before agreeing a total; check any vitamin K product if warfarin is used.",
    contraindications: [
      "Renal impairment, high calcium, hyperparathyroidism, granulomatous disease, or a history of vitamin D toxicity requires clinician-led use.",
      "A deficiency-treatment amount must follow a recognised 25-OH vitamin D result and clinical context.",
    ],
    measurementStatus: "clinically-indicated",
    baselineMeasurement:
      "Genetics alone does not require routine screening. When a clinician identifies an indication, use 25-OH vitamin D in nmol/L and review calcium and renal context where clinically relevant.",
    followUpMeasurement:
      "If supplementation is started or changed, the practitioner should set the repeat 25-OH vitamin D date and maintenance or stopping rule.",
    review:
      "If a clinician starts treatment for a low level, agree the repeat test and stopping or maintenance rule at the same time.",
    executiveFitnessIds: ["ef8"],
    order: 1,
    clinicalRelevance: 4,
    safetyPriority: 3,
    actionability: 4,
    ageReview: {
      fromAge: 71,
      context:
        "From age 71 the general vitamin D intake reference rises from 600 IU to 800 IU daily. Age therefore strengthens the reason for practitioner review, but it does not set a treatment dose.",
      canEstablishEligibility: true,
      minimumMarkers: 2,
      minimumGenes: 2,
      minimumScore: 2,
    },
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
    supportingPathway:
      "Inflammatory signalling, recovery, and resolution pathways",
    whatRefinesDecision:
      "A normal-week food review, product label, cardiovascular history, medicines and bleeding risk refine whether an EPA/DHA product is appropriate. They are not required for the genetic review item to be raised.",
    referenceAmount:
      "EFSA's 250 mg combined EPA plus DHA daily is a population adequate-intake reference, not an automatically prescribed supplement amount or a South African product limit. Higher clinical amounts are not set by this report.",
    preferredForm:
      "A product that clearly states the combined EPA and DHA amount; fish oil or an algal EPA/DHA product can be considered. No EPA:DHA ratio is selected by genotype.",
    formRationale:
      "Direct EPA and DHA avoids relying on the limited conversion of plant ALA. The report does not claim that one oil chemistry or ratio is genetically superior.",
    timing:
      "Take with a meal. Read the EPA and DHA amounts on the label rather than the total fish-oil weight.",
    timingRationale:
      "Using it with a meal is a practical tolerance and adherence choice. DNA does not create a morning or evening requirement.",
    duration:
      "No universal course length follows from genetics. If a product is approved, the practitioner records why it is used and when diet, tolerance, medicines and the clinical indication will be reviewed.",
    foodFirst:
      "Use oily fish such as sardines, salmon, mackerel or anchovies. Algal EPA/DHA is an alternative for people who avoid fish.",
    checksBeforeStarting: [
      "Review anticoagulant or antiplatelet medicines with a clinician or pharmacist.",
      "Ask for advice before higher amounts if you have atrial fibrillation or a bleeding disorder.",
      "Check fish or shellfish allergy and product quality.",
    ],
    interactionWarnings: [
      "Review anticoagulant and antiplatelet medicines before use; higher omega-3 amounts can affect bleeding risk.",
      "Higher-dose omega-3 has been linked with more atrial fibrillation in some trials, so rhythm history matters.",
    ],
    medicationInteractionCheck:
      "Review anticoagulants, antiplatelet medicines, anti-inflammatory medicines and planned surgery with a practitioner or pharmacist.",
    currentSupplementInteractionCheck:
      "Add EPA and DHA from every fish-oil, krill-oil, algal-oil and multinutrient product before comparing with the agreed amount.",
    contraindications: [
      "A bleeding disorder, clinically significant arrhythmia or atrial fibrillation, fish or shellfish allergy, or upcoming procedure requires practitioner review.",
      "Higher clinical amounts for triglycerides or cardiovascular disease are outside this genetic report.",
    ],
    measurementStatus: "not-routinely-needed",
    baselineMeasurement:
      "No routine biochemical deficiency test is required for a general food-intake review; document food pattern, medicines, bleeding risk and rhythm history.",
    followUpMeasurement:
      "If a clinician uses omega-3 for high triglycerides or another clinical indication, that clinician sets the relevant laboratory and symptom follow-up.",
    review:
      "This is a food-gap decision, not a treatment for an inflammatory gene or a high hs-CRP result.",
    executiveFitnessIds: ["ef1", "ef5", "ef8"],
    order: 2,
    clinicalRelevance: 3,
    safetyPriority: 4,
    actionability: 4,
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
      "Your called PEMT, MTHFD1, and BHMT results converge on a choline-related pathway worth reviewing. They do not quantify your personal requirement or diagnose a deficiency.",
    supportingPathway:
      "Choline synthesis, one-carbon transfer, and methyl-donor recycling",
    whatRefinesDecision:
      "A normal-week food calculation, the applicable adult or pregnancy/lactation life-stage reference, medicines and liver history refine the discussion. The report does not infer pregnancy or breastfeeding status, and the genetic convergence does not quantify a personal requirement.",
    referenceAmount:
      "U.S. population adequate-intake references from all sources are 425 mg daily for ordinary-adult women and 550 mg for ordinary-adult men. The separate pregnancy and lactation references are 450 mg and 550 mg, respectively, but this report does not infer either status or automatically apply those life-stage values. None of these population references is an exact personal target or prescribed supplement amount.",
    preferredForm:
      "No choline form is selected by genotype. Food is preferred; if a gap remains, the practitioner can choose a labelled choline source such as choline bitartrate or phosphatidylcholine for the agreed amount.",
    formRationale:
      "Several choline forms contribute usable choline, but current evidence does not justify calling one form genetically superior.",
    timing:
      "Timing is flexible. If a gap-closing product is used, take it with a meal and count it together with food rather than as an extra target.",
    timingRationale:
      "There is no gene-based morning or evening requirement. Using it with a meal makes the product part of the day's total intake and can improve routine use.",
    duration:
      "Use a practitioner-agreed food review period. No universal course length or repeat interval follows from these variants.",
    foodFirst:
      "Eggs, soybeans, fish, meat, dairy and some legumes are practical sources. Two eggs provide a meaningful part of a day, but not the whole target.",
    checksBeforeStarting: [
      "Have a practitioner confirm which ordinary-adult or pregnancy/lactation life-stage reference applies; the report does not select it from genes or profile assumptions.",
      "Do not chase the 3,500 mg adult upper limit; high intakes can cause low blood pressure, sweating, odour and liver effects.",
      "Review a large-dose plan if you have liver disease or take medicines that affect blood pressure.",
    ],
    interactionWarnings: [
      "NIH reports no known clinically relevant medicine interactions, but high total intake can cause low blood pressure, sweating, fishy odour, vomiting and liver toxicity.",
    ],
    medicationInteractionCheck:
      "No clinically relevant medicine interaction is established in the NIH reference, but the practitioner should still review blood-pressure treatment, liver disease and the complete medication list.",
    currentSupplementInteractionCheck:
      "Add choline from multivitamins, prenatal products, lecithin and separate choline products before calculating any food gap.",
    contraindications: [
      "Pregnancy or breastfeeding changes the intake target and requires the applicable clinician-led context.",
      "Large amounts are inappropriate with hypotension, liver disease, troublesome sweating or fishy body odour without review.",
    ],
    measurementStatus: "not-routinely-needed",
    baselineMeasurement:
      "A normal-week food estimate is more useful than a routine plasma choline test in a generally healthy adult; document sex-at-birth, pregnancy or lactation and liver history.",
    followUpMeasurement:
      "Repeat the food calculation after about four weeks. Laboratory follow-up is only added when a clinician has a separate liver or metabolic indication.",
    review:
      "The marker result raises the review priority. A normal-week intake comparison is educational context; the practitioner decides whether any product and amount are appropriate after reviewing the applicable life stage, total intake and safety context.",
    executiveFitnessIds: ["ef1", "ef5", "ef8"],
    order: 3,
    clinicalRelevance: 3,
    safetyPriority: 2,
    actionability: 5,
    criteria: [
      { variantId: "rs7946", genotypes: ["CT", "TT"], weight: 2 },
      { variantId: "rs2236225", genotypes: ["AG", "AA"], weight: 1 },
      { variantId: "rs7700970", genotypes: ["CT", "TT"], weight: 1 },
    ],
  },
  {
    id: "folate-b12",
    name: "Folate and vitamin B12 review",
    decision: "clinician-only",
    plainReason:
      "Several called one-carbon markers converge across different enzymes. That makes food intake, vitamin B12 status and—when clinically useful—homocysteine worth checking together.",
    supportingPathway:
      "Folate-dependent one-carbon metabolism, vitamin B12 recycling, and homocysteine handling",
    whatRefinesDecision:
      "Diet, pregnancy plans, vitamin B12 status and—when clinically useful—homocysteine or methylmalonic acid refine the plan. Common MTHFR variants alone do not require methylfolate or avoidance of folic acid.",
    referenceAmount:
      "U.S. population nutrition references only: 400 micrograms DFE of folate and 2.4 micrograms of vitamin B12 daily for most ordinary adults. Separately, CDC recommends that anyone who could become pregnant get 400 micrograms of folic acid daily, even with a common MTHFR variant. No self-start treatment amount is set here because vitamin B12 is clinician-gated. The U.S. 1,000-microgram synthetic-folate upper limit is a ceiling, not a dose or South African product limit.",
    preferredForm:
      "No genotype-selected active form. Common MTHFR variants do not require methylfolate or avoidance of folic acid, and no vitamin B12 form is selected from these markers.",
    formRationale:
      "CDC guidance supports folic acid even with common MTHFR variants, and available evidence does not show one supplemental B12 form is better absorbed than another. The practitioner chooses form from the actual indication.",
    timing:
      "There is no gene-based morning or evening requirement. Take an agreed gap-closing amount at a time you can use consistently.",
    timingRationale:
      "Consistency and medication scheduling matter more than clock time. Pregnancy prevention guidance, measured B12 status and prescribed medicines can change the plan.",
    duration:
      "A treatment course and repeat testing belong to the measured result. High-dose folate should not continue while vitamin B12 status is unknown.",
    foodFirst:
      "Greens, legumes and fortified grains supply folate. Fish, meat, eggs and dairy supply B12; a vegan diet needs a reliable B12 source regardless of genotype.",
    checksBeforeStarting: [
      "Check vitamin B12 before high-dose folate; a borderline B12 result may need methylmalonic acid interpreted with kidney function.",
      "Review metformin, acid-suppressing medicines, vegan or vegetarian intake, pregnancy plans and malabsorption history.",
      "Common MTHFR variants are not a reason to avoid folic acid.",
    ],
    interactionWarnings: [
      "High-dose folate can mask the blood signs of vitamin B12 deficiency while neurological injury progresses, so B12 status must be considered first.",
      "Metformin and acid-suppressing medicines can contribute to vitamin B12 inadequacy and should be reviewed.",
      "Folate can interact with methotrexate, antiepileptic medicines and sulfasalazine; the prescriber must review the indication before supplementation.",
    ],
    medicationInteractionCheck:
      "Review methotrexate, phenytoin, carbamazepine, valproate, sulfasalazine, metformin, proton-pump inhibitors and H2 blockers with the prescriber or pharmacist.",
    currentSupplementInteractionCheck:
      "Total folic acid, folate and B12 from multivitamins, prenatal products, B-complex products and single-nutrient products must be counted together.",
    contraindications: [
      "Do not use high-dose folate while vitamin B12 status is unresolved, because folate can correct anaemia while neurological injury progresses.",
      "Pregnancy planning, malabsorption, pernicious anaemia, neurological symptoms, cancer treatment or antiepileptic therapy require clinician-led selection.",
    ],
    measurementStatus: "required-before-implementation",
    baselineMeasurement:
      "Vitamin B12 and full blood count; a clinician may add methylmalonic acid, folate or homocysteine when the clinical question justifies it.",
    followUpMeasurement:
      "The practitioner sets repeat B12, blood count and any functional marker from the cause, route and amount used.",
    review:
      "Use a clinician-set repeat date if a measured shortfall is treated. Homocysteine is nonspecific and does not unlock a B-complex by itself.",
    executiveFitnessIds: ["ef1", "ef5", "ef8"],
    order: 4,
    clinicalRelevance: 4,
    safetyPriority: 4,
    actionability: 3,
    ageReview: {
      fromAge: 51,
      context:
        "After age 50, absorption of food-bound vitamin B12 can decline. Age strengthens the B12 side of this practitioner review, without making MTHFR a diagnosis or selecting a folate form.",
    },
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
    decision: "clinician-only",
    plainReason:
      "Your called absorption, transport and recycling markers converge on vitamin B12 handling. The useful next step is a dietary and measured check, not a preferred supplement form inferred from DNA.",
    supportingPathway:
      "Vitamin B12 absorption, transport, cellular delivery, and recycling",
    whatRefinesDecision:
      "Diet pattern, metformin or acid-suppressing medicine use, gastric history and recognised B12 assessment refine the amount and route. They are not required for the genetics-guided review item to appear.",
    referenceAmount:
      "U.S. population nutrition reference only: 2.4 micrograms daily for most adults. No self-start supplement amount is set here. Deficiency treatment can use much larger amounts, but the amount and route must follow the measured result and clinical context.",
    preferredForm:
      "No genotype-selected form. Cyanocobalamin is common; methylcobalamin, adenosylcobalamin and hydroxocobalamin also exist, but form and oral or injectable route are clinician-selected.",
    formRationale:
      "NIH reports no evidence that supplemental B12 absorption differs by form. The cause of a low result, not these common variants, determines form and route.",
    timing:
      "Timing is flexible, with or without food. No evidence in this report supports choosing methylcobalamin over cyanocobalamin from genotype.",
    timingRationale:
      "There is no gene-based morning or evening preference. A consistent schedule and the clinician's route and medicine plan are the relevant factors.",
    duration:
      "Continue according to the cause of the shortfall and the clinician's repeat-testing plan; do not infer lifelong use from these markers.",
    foodFirst:
      "Fish, meat, eggs and dairy provide B12. A vegan diet requires a reliable fortified food or supplement source independent of this genetic result.",
    checksBeforeStarting: [
      "A borderline result may need methylmalonic acid rather than an automatic deficiency label.",
      "Review kidney function when methylmalonic acid is interpreted.",
      "Check metformin, acid-suppressing medicines, gastric surgery and malabsorption history.",
    ],
    interactionWarnings: [
      "Metformin and acid-suppressing medicines can reduce vitamin B12 status; the medicine should not be stopped without the prescriber.",
    ],
    medicationInteractionCheck:
      "Review metformin, proton-pump inhibitors, H2 blockers and medicines or procedures affecting the stomach or small intestine with the prescriber.",
    currentSupplementInteractionCheck:
      "Count B12 from fortified foods, multivitamins, B-complex products, injections and separate oral or sublingual products before review.",
    contraindications: [
      "Neurological symptoms, pernicious anaemia, gastric or ileal surgery, inflammatory bowel disease or suspected malabsorption require prompt clinician assessment.",
      "Kidney function can affect interpretation of methylmalonic acid and must be considered by the clinician.",
    ],
    measurementStatus: "required-before-implementation",
    baselineMeasurement:
      "Vitamin B12 and full blood count; a borderline result may need methylmalonic acid interpreted with kidney function.",
    followUpMeasurement:
      "The clinician sets the repeat B12, blood count and symptom review according to the cause, amount and route.",
    review:
      "Agree what will be rechecked and when. No upper limit is established, but that does not make an unnecessary high dose useful.",
    executiveFitnessIds: ["ef1", "ef5", "ef8"],
    order: 5,
    clinicalRelevance: 5,
    safetyPriority: 4,
    actionability: 3,
    ageReview: {
      fromAge: 51,
      context:
        "Adults over 50 can absorb less food-bound vitamin B12 and are advised to obtain the recommended amount mainly from fortified foods or supplements. This strengthens practitioner review, not a deficiency diagnosis.",
      canEstablishEligibility: true,
      minimumMarkers: 2,
      minimumGenes: 2,
      minimumScore: 2,
    },
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
    supportingPathway:
      "Iron absorption, transport, storage, and iron-related restless-legs susceptibility",
    whatRefinesDecision:
      "A full blood count, ferritin and transferrin saturation inform the clinician's assessment together with symptoms, losses, diet and inflammation. The genetic result can raise iron for practitioner review, but iron remains clinician-only because both deficiency and overload can cause harm.",
    referenceAmount:
      "No self-start amount. The U.S. healthy-adult upper limit of 45 mg daily is a ceiling, not a treatment dose or South African product limit. Iron treatment may exceed it, so the clinician sets the elemental amount, schedule and follow-up from confirmed deficiency and its cause.",
    preferredForm:
      "No genotype-selected form. The clinician selects a ferrous or ferric product, elemental iron amount, route and schedule from laboratory findings, cause and tolerance.",
    formRationale:
      "Iron forms provide different elemental amounts and tolerability. Genetics cannot identify which product will be effective or safe for an individual.",
    timing:
      "If a clinician prescribes it, follow that product's instructions. Iron is usually separated from tea, coffee and calcium, and from levothyroxine by at least four hours.",
    timingRationale:
      "Food and other products can change absorption and tolerability. The prescriber balances those factors; no morning or evening schedule is selected by genotype.",
    duration:
      "Treatment is time-limited and monitored. The prescriber should set an early response check and the point at which iron stops.",
    foodFirst:
      "Meat, legumes and fortified foods contribute. Vitamin C with plant iron improves absorption; tea and coffee with the same meal reduce it.",
    checksBeforeStarting: [
      "Do not use fatigue alone as evidence of iron deficiency.",
      "Review HFE C282Y or H63D results and family history with the clinician.",
      "Keep iron products away from children and check levothyroxine, levodopa and stomach medicines.",
    ],
    interactionWarnings: [
      "Iron reduces absorption of levothyroxine and should be separated from it by at least four hours.",
      "Iron can reduce absorption of levodopa, and proton-pump inhibitors can reduce iron absorption.",
      "HFE variants or a family history of iron overload make self-starting iron unsafe.",
    ],
    medicationInteractionCheck:
      "Review levothyroxine, levodopa, proton-pump inhibitors, antacids and every medicine with the prescriber or pharmacist; levothyroxine must be separated by at least four hours.",
    currentSupplementInteractionCheck:
      "Count iron and calcium in every multivitamin, prenatal product, mineral blend and single-ingredient product; calcium and iron may need different times.",
    contraindications: [
      "Known or suspected haemochromatosis, iron overload, HFE risk with abnormal iron studies, repeated transfusions or unexplained high ferritin requires specialist review and no self-start iron.",
      "Iron products can poison children and must be stored securely.",
    ],
    measurementStatus: "required-before-implementation",
    baselineMeasurement:
      "Full blood count, ferritin and transferrin saturation interpreted with symptoms, losses, diet, inflammation and family history.",
    followUpMeasurement:
      "For clinician-treated iron-deficiency anaemia, the prescriber sets an early haemoglobin response check and later store assessment; there is no genetics-set interval.",
    review:
      "For confirmed, clinician-treated iron-deficiency anaemia, the prescriber may check haemoglobin response within about four weeks, then continues only as needed to restore stores and address the cause.",
    executiveFitnessIds: ["ef1", "ef3"],
    order: 6,
    clinicalRelevance: 5,
    safetyPriority: 5,
    actionability: 2,
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
  const contributedVariants = new Set<string>();
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
      marker.leverage < 1 ||
      marker.leverage > 3 ||
      !criterion.genotypes.includes(marker.genotype) ||
      contributedVariants.has(marker.variantId.toLowerCase())
    ) {
      continue;
    }

    score += (marker.leverage - 1) * criterion.weight;
    contributedVariants.add(marker.variantId.toLowerCase());
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

function eligibilityBasis(
  scored: ScoredSupplementRule,
  profileAge: number | null,
): SupplementEligibilityBasis | null {
  if (scored.hfeSafetyCall) return "safety-review-marker";
  if (
    scored.contributors.length >= (scored.rule.minimumMarkers ?? 3) &&
    scored.geneCount >= (scored.rule.minimumGenes ?? 3) &&
    scored.score >= (scored.rule.minimumScore ?? 3)
  ) {
    return "genetic-convergence";
  }
  const ageReview = scored.rule.ageReview;
  if (
    ageReview?.canEstablishEligibility &&
    profileAge !== null &&
    profileAge >= ageReview.fromAge &&
    scored.contributors.length >= (ageReview.minimumMarkers ?? 2) &&
    scored.geneCount >= (ageReview.minimumGenes ?? 2) &&
    scored.score >= (ageReview.minimumScore ?? 2)
  ) {
    return "genetic-convergence-plus-age";
  }
  return null;
}

function rankingDimensions(
  scored: ScoredSupplementRule,
  profileAge: number | null,
) {
  const ageStrengthened = Boolean(
    scored.rule.ageReview &&
      profileAge !== null &&
      profileAge >= scored.rule.ageReview.fromAge,
  );
  return {
    geneticRationaleScore: scored.score,
    clinicalRelevance: Math.min(
      5,
      scored.rule.clinicalRelevance + (ageStrengthened ? 1 : 0),
    ),
    safetyPriority: scored.rule.safetyPriority,
    actionability: scored.rule.actionability,
  };
}

function compareRanked(
  left: ScoredSupplementRule,
  right: ScoredSupplementRule,
  profileAge: number | null,
) {
  const leftRanking = rankingDimensions(left, profileAge);
  const rightRanking = rankingDimensions(right, profileAge);
  if (
    rightRanking.geneticRationaleScore !==
    leftRanking.geneticRationaleScore
  ) {
    return (
      rightRanking.geneticRationaleScore -
      leftRanking.geneticRationaleScore
    );
  }
  if (rightRanking.clinicalRelevance !== leftRanking.clinicalRelevance) {
    return rightRanking.clinicalRelevance - leftRanking.clinicalRelevance;
  }
  if (rightRanking.safetyPriority !== leftRanking.safetyPriority) {
    return rightRanking.safetyPriority - leftRanking.safetyPriority;
  }
  if (rightRanking.actionability !== leftRanking.actionability) {
    return rightRanking.actionability - leftRanking.actionability;
  }
  return left.rule.order - right.rule.order;
}

function project(
  scored: ScoredSupplementRule,
  profileAge: number | null,
  basis: SupplementEligibilityBasis,
  rank: number,
): SupplementRecommendation {
  const ageStrengthened = Boolean(
    scored.rule.ageReview &&
      profileAge !== null &&
      profileAge >= scored.rule.ageReview.fromAge,
  );
  const plainReason =
    basis === "safety-review-marker"
      ? `An exact called HFE result raised an iron safety review so a practitioner can assess iron status and overload risk. It is not a recommendation to take iron, and genetics cannot show whether current iron stores are low, normal or high. ${UNIVERSAL_PRACTITIONER_CONTEXT}`
      : `${scored.rule.plainReason} ${UNIVERSAL_PRACTITIONER_CONTEXT}`;
  return {
    id: scored.rule.id,
    name: scored.rule.name,
    considerationLabel: "CONSIDER / PRACTITIONER REVIEW",
    decision: scored.rule.decision,
    eligibilityBasis: basis,
    plainReason,
    supportingPathway: scored.rule.supportingPathway,
    whatConfirmsNeed: scored.rule.whatRefinesDecision,
    whatRefinesDecision: scored.rule.whatRefinesDecision,
    referenceAmount: scored.rule.referenceAmount,
    preferredForm: scored.rule.preferredForm,
    formRationale: scored.rule.formRationale,
    timing: scored.rule.timing,
    timingRationale: scored.rule.timingRationale,
    duration: scored.rule.duration,
    foodFirst: scored.rule.foodFirst,
    checksBeforeStarting: [...scored.rule.checksBeforeStarting],
    interactionWarnings: [...scored.rule.interactionWarnings],
    medicationInteractionCheck: scored.rule.medicationInteractionCheck,
    currentSupplementInteractionCheck:
      scored.rule.currentSupplementInteractionCheck,
    contraindications: [...scored.rule.contraindications],
    measurementGuidance: {
      advisable:
        scored.rule.measurementStatus === "required-before-implementation",
      status: scored.rule.measurementStatus,
      baseline: scored.rule.baselineMeasurement,
      followUp: scored.rule.followUpMeasurement,
    },
    practitionerApprovalRequired: true,
    practitionerChecklist: [...PRACTITIONER_APPROVAL_CHECKLIST],
    clinicalContextChecklist: [...CLINICAL_CONTEXT_CHECKLIST],
    ageStrengthened,
    ageContext: ageStrengthened ? scored.rule.ageReview?.context ?? null : null,
    ageConsiderations: buildAgeConsiderations(
      scored.rule,
      ageStrengthened,
    ),
    review: scored.rule.review,
    score: scored.score,
    ranking: {
      rank,
      ...rankingDimensions(scored, profileAge),
    },
    domainIds: [...scored.domainIds],
    contributors: [...scored.contributors],
    executiveFitnessIds: [...scored.rule.executiveFitnessIds],
  };
}

export function buildSupplementPlan(
  markers: ProcessedMarker[],
  options: {
    adultReferencesAllowed?: boolean;
    profileAge?: number | null;
  } = {},
): SupplementPlan {
  if (options.adultReferencesAllowed === false) {
    return {
      rulesVersion: SUPPLEMENT_RULES_VERSION,
      outcome: "none",
      framing:
        "General adult supplement amounts are withheld for a confirmed person under 18. A paediatric clinician must use age, growth, diet, medicines and measured results instead.",
      practitionerChecklist: [...PRACTITIONER_APPROVAL_CHECKLIST],
      clinicalContextChecklist: [...CLINICAL_CONTEXT_CHECKLIST],
      primaryLimit: PRIMARY_SUPPLEMENT_LIMIT,
      primaryItems: [],
      additionalItems: [],
      items: [],
    };
  }
  const markersByVariant = new Map(
    markers.map((marker) => [marker.variantId.toLowerCase(), marker]),
  );
  const profileAge = options.profileAge ?? null;
  const ranked = SUPPLEMENT_RULES.map((rule) =>
    scoreRule(rule, markersByVariant),
  )
    .map((item) => ({
      item,
      basis: eligibilityBasis(item, profileAge),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        item: ScoredSupplementRule;
        basis: SupplementEligibilityBasis;
      } => candidate.basis !== null,
    )
    .sort((left, right) => compareRanked(left.item, right.item, profileAge));
  const items = ranked.map((candidate, index) =>
    project(candidate.item, profileAge, candidate.basis, index + 1),
  );
  const primaryItems = items.slice(0, PRIMARY_SUPPLEMENT_LIMIT);
  const additionalItems = items.slice(PRIMARY_SUPPLEMENT_LIMIT);

  return {
    rulesVersion: SUPPLEMENT_RULES_VERSION,
    outcome: items.length ? "review-ready" : "none",
    framing:
      "Genetic convergence can raise a supplement for consideration before a food gap, laboratory abnormality or symptom is documented. For selected nutrients, age can make an already genetically susceptible pathway more clinically relevant, but age alone cannot create a recommendation. Genetics does not prove a deficiency, diagnose disease or calculate a therapeutic dose; implementation still requires the approval, interaction, contraindication, dose, form and monitoring checks shown for every item.",
    practitionerChecklist: [...PRACTITIONER_APPROVAL_CHECKLIST],
    clinicalContextChecklist: [...CLINICAL_CONTEXT_CHECKLIST],
    primaryLimit: PRIMARY_SUPPLEMENT_LIMIT,
    primaryItems,
    additionalItems,
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
