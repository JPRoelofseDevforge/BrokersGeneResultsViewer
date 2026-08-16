import type {
  NearThresholdRecommendation,
  ProcessedMarker,
  RecommendationKind,
  RecommendationSynthesis,
  SafetyRecommendation,
  WholeReportRecommendation,
} from "./types";

export const RECOMMENDATION_RULES_VERSION = "2026.08.16";

interface RecommendationCriterion {
  variantId: string;
  genotypes: string[];
  weight: number;
}

interface RecommendationRule {
  id: string;
  kind: RecommendationKind;
  title: string;
  why: string;
  how: string;
  note: string | null;
  canUnlock: string | null;
  criteria: RecommendationCriterion[];
  order: number;
  minimumDomainCount?: number;
}

interface SafetyRule {
  id: string;
  variantId: string;
  genotypes: string[];
  title: string;
  why: string;
  how: string;
}

interface ScoredRule {
  rule: RecommendationRule;
  score: number;
  domainIds: string[];
  contributors: Array<{ gene: string; variantId: string }>;
  geneCount: number;
}

const RULES: RecommendationRule[] = [
  {
    id: "fixed-wake-time",
    kind: "behaviour",
    title: "A fixed wake time, seven days a week",
    why: "Your clock, stress-axis, and arousal results converge on the same thing: timing moves more for you than duration does.",
    how: "Pick the wake time you can hold on a Sunday and anchor to it. Bedtime usually follows within about two weeks.",
    note: "Nothing to buy and nothing to measure. This is one of the highest-return changes a genetic report can justify.",
    canUnlock: null,
    order: 1,
    criteria: [
      { variantId: "rs1801260", genotypes: ["GG", "AG"], weight: 2 },
      { variantId: "rs1360780", genotypes: ["TT", "CT"], weight: 2 },
      { variantId: "rs1006737", genotypes: ["AA", "AG"], weight: 1 },
      { variantId: "rs5751876", genotypes: ["TT", "CT"], weight: 1 },
      { variantId: "rs2305160", genotypes: ["AA", "AG"], weight: 1 },
    ],
  },
  {
    id: "morning-light",
    kind: "behaviour",
    title: "Daylight in the first hour, dark in the last",
    why: "Your light-sensing and melatonin results mean the clock signal you get indoors may be weaker than the one you get outside.",
    how: "Spend ten minutes outside within an hour of waking—outdoors, not through a window—and bring light levels down after sunset.",
    note: "Outdoor light is many times brighter than a lit room. That gap is the intervention.",
    canUnlock: null,
    order: 2,
    criteria: [
      { variantId: "rs1801260", genotypes: ["GG", "AG"], weight: 2 },
      { variantId: "rs4446909", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs10830963", genotypes: ["GG", "CG"], weight: 1 },
      { variantId: "rs934945", genotypes: ["AA", "AG"], weight: 1 },
    ],
  },
  {
    id: "caffeine-cutoff",
    kind: "behaviour",
    title: "A real caffeine cut-off time",
    why: "Your clearance and receptor results together suggest caffeine may reach further into your night than it does for some people.",
    how: "Set the cut-off at midday and hold it for two weeks. Judge the experiment by sleep onset and next-morning clarity.",
    note: "This is a timing decision, not a quantity recommendation. No dose follows from a genotype.",
    canUnlock: null,
    order: 3,
    criteria: [
      { variantId: "rs762551", genotypes: ["CC", "AC"], weight: 3 },
      { variantId: "rs5751876", genotypes: ["TT", "CT"], weight: 2 },
      { variantId: "rs1801253", genotypes: ["GG"], weight: 1 },
    ],
  },
  {
    id: "space-maximal-sessions",
    kind: "behaviour",
    title: "Two days between maximal sessions",
    why: "Several inflammatory results point in the same direction: your response to hard work may be louder and last longer.",
    how: "Space maximal sessions about 48 hours apart and protect sleep in that window. Easy work between them is fine.",
    note: "Spacing is a training decision, not a recovery product.",
    canUnlock: null,
    order: 4,
    criteria: [
      { variantId: "rs1800629", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs1800795", genotypes: ["GG", "CG"], weight: 2 },
      { variantId: "rs1205", genotypes: ["CC", "CT"], weight: 2 },
      { variantId: "rs1815739", genotypes: ["CC"], weight: 1 },
      { variantId: "rs419598", genotypes: ["CC"], weight: 1 },
      { variantId: "rs2228145", genotypes: ["CC"], weight: 1 },
    ],
  },
  {
    id: "slow-heavy-loading",
    kind: "behaviour",
    title: "Slow heavy loading, twice a week",
    why: "Your connective-tissue and cartilage results converge on tissue that answers to progressive load rather than stretching alone.",
    how: "Use slow, controlled strength work through a comfortable range for the tendons your sport uses. Progress in steps, not jumps.",
    note: "Tendon adapts to load. Food and products do not replace that signal.",
    canUnlock: null,
    order: 5,
    criteria: [
      { variantId: "rs12722", genotypes: ["TT", "CT"], weight: 2 },
      { variantId: "rs143383", genotypes: ["TT", "CT"], weight: 2 },
      { variantId: "rs1800012", genotypes: ["GG"], weight: 1 },
      { variantId: "rs679620", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs970547", genotypes: ["GG"], weight: 1 },
      { variantId: "rs1799750", genotypes: ["2G/2G"], weight: 1 },
    ],
  },
  {
    id: "sulphur-rich-vegetables",
    kind: "food",
    title: "Sulphur-rich vegetables, most days",
    why: "Your clearance enzymes are spread across several routes, and more than one result points toward making their food inputs routine.",
    how: "Use ordinary foods such as broccoli, rocket, kale, cabbage, garlic, and onions across the week.",
    note: "Food regulates these enzymes without pretending to replace them.",
    canUnlock: null,
    order: 6,
    criteria: [
      { variantId: "rs1695", genotypes: ["GG", "AG"], weight: 2 },
      { variantId: "rs2266637", genotypes: ["NULL", "HET"], weight: 2 },
      { variantId: "rs4147567", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs4880", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs3957357", genotypes: ["AA", "AG"], weight: 1 },
    ],
  },
  {
    id: "one-carbon-foods",
    kind: "food",
    title: "Greens, legumes, and eggs, daily",
    why: "Your one-carbon results sit across several enzymes at once. That is a food-supply question long before it is a supplement question.",
    how: "Make cooked greens or legumes routine, include eggs if they suit you, and use beetroot or spinach as food sources of betaine.",
    note: "Whether support is ever needed is decided by a measured shortfall, not by these genes.",
    canUnlock: null,
    order: 7,
    minimumDomainCount: 1,
    criteria: [
      { variantId: "rs1801133", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs1801131", genotypes: ["GG", "GT"], weight: 1 },
      { variantId: "rs7946", genotypes: ["TT", "CT"], weight: 2 },
      { variantId: "rs1051266", genotypes: ["AA", "AG"], weight: 1 },
      { variantId: "rs2236225", genotypes: ["AA", "AG"], weight: 1 },
      { variantId: "rs1979277", genotypes: ["AA", "AG"], weight: 1 },
      { variantId: "rs7700970", genotypes: ["TT", "CT"], weight: 1 },
      { variantId: "rs1805087", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs1801394", genotypes: ["GG", "AG"], weight: 1 },
    ],
  },
  {
    id: "freshness-first",
    kind: "food",
    title: "Cook it and eat it—freshness first",
    why: "Your histamine-clearance results converge on freshness as a useful experiment, especially when training load is high.",
    how: "Try freshly cooked food rather than repeated reheating for two weeks, then judge the change against your own symptom pattern.",
    note: "The trial comes before any permanent restriction.",
    canUnlock: null,
    order: 8,
    criteria: [
      { variantId: "rs1049793", genotypes: ["GG", "CG"], weight: 3 },
      { variantId: "rs1050891", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs601338", genotypes: ["AA"], weight: 1 },
    ],
  },
  {
    id: "nitrate-rich-greens",
    kind: "food",
    title: "Nitrate-rich leafy greens before hard work",
    why: "Your nitric-oxide and blood-pressure results converge on a food lever that is measurable and easy to trial.",
    how: "Use beetroot, rocket, or spinach before a demanding session and balance sodium against what you actually lose in sweat.",
    note: "Food first. The nitrate is already in the vegetable.",
    canUnlock: null,
    order: 9,
    criteria: [
      { variantId: "rs1799983", genotypes: ["TT", "GT"], weight: 2 },
      { variantId: "rs699", genotypes: ["GG", "AG"], weight: 2 },
      { variantId: "rs1799722", genotypes: ["CC"], weight: 1 },
      { variantId: "rs4341", genotypes: ["CC", "CG"], weight: 1 },
    ],
  },
  {
    id: "oily-fish",
    kind: "food",
    title: "Oily fish, two or three times a week",
    why: "Several inflammatory results point toward supporting resolution through food rather than trying to suppress every training response.",
    how: "Use foods such as salmon, sardines, or mackerel two or three times a week if they suit your diet.",
    note: "A capsule is not inferred from this result. Any further step needs measured context.",
    canUnlock: null,
    order: 10,
    criteria: [
      { variantId: "rs1800629", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs1800795", genotypes: ["GG", "CG"], weight: 1 },
      { variantId: "rs1205", genotypes: ["CC", "CT"], weight: 1 },
      { variantId: "rs419598", genotypes: ["CC", "CT"], weight: 1 },
      {
        variantId: "rs429358+rs7412",
        genotypes: ["E3/E4", "E4/E4"],
        weight: 1,
      },
    ],
  },
  {
    id: "measure-vitamin-d",
    kind: "measurement",
    title: "25-OH vitamin D",
    why: "Your carrier-protein and receptor results together make a measured level more useful than guessing from sunlight exposure.",
    how: "Discuss one blood test with a qualified clinician, ideally at a consistent time of year.",
    note: null,
    canUnlock: "a vitamin D conversation",
    order: 11,
    criteria: [
      { variantId: "rs2282679", genotypes: ["CC", "AC"], weight: 2 },
      { variantId: "rs7041", genotypes: ["CC", "AC"], weight: 1 },
      { variantId: "rs2228570", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs1544410", genotypes: ["AA", "AG"], weight: 1 },
      { variantId: "rs10741657", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs731236", genotypes: ["GG"], weight: 1 },
    ],
  },
  {
    id: "measure-homocysteine",
    kind: "measurement",
    title: "Homocysteine",
    why: "This is the number that shows whether your one-carbon genotypes are creating a measurable effect rather than a theoretical one.",
    how: "Discuss a fasting, rested blood test with a qualified clinician.",
    note: null,
    canUnlock: "a B-vitamin assessment",
    order: 12,
    criteria: [
      { variantId: "rs1801133", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs1801131", genotypes: ["GG"], weight: 1 },
      { variantId: "rs1805087", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs1801394", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs2236225", genotypes: ["AA", "AG"], weight: 1 },
      { variantId: "rs7700970", genotypes: ["TT", "CT"], weight: 1 },
      { variantId: "rs234714", genotypes: ["TT", "CT"], weight: 1 },
    ],
  },
  {
    id: "measure-iron",
    kind: "measurement",
    title: "Ferritin with transferrin saturation",
    why: "Your iron-handling results can point in different directions. The paired measurements help a clinician distinguish absorption from retention.",
    how: "Take both values from the same draw and avoid testing immediately after hard training or illness.",
    note: "Iron remains clinician-gated regardless of genotype.",
    canUnlock: "an iron assessment",
    order: 13,
    criteria: [
      { variantId: "rs1800562", genotypes: ["AG", "AA"], weight: 3 },
      { variantId: "rs1799945", genotypes: ["CG", "GG"], weight: 1 },
      { variantId: "rs855791", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs2300478", genotypes: ["GG", "GT"], weight: 1 },
      { variantId: "rs9296249", genotypes: ["TT", "CT"], weight: 1 },
    ],
  },
  {
    id: "measure-b12",
    kind: "measurement",
    title: "Vitamin B12",
    why: "Your absorption and transport results make a B12 number worth discussing, particularly if you eat little animal-source food.",
    how: "Discuss one blood test with a qualified clinician. A borderline result may need a follow-up marker rather than guesswork.",
    note: "Vitamin B12 remains clinician-gated.",
    canUnlock: "a vitamin B12 assessment",
    order: 14,
    criteria: [
      { variantId: "rs1805087", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs1801394", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs1801222", genotypes: ["GG", "AG"], weight: 2 },
      { variantId: "rs526934", genotypes: ["GG", "AG"], weight: 1 },
      { variantId: "rs601338", genotypes: ["AA"], weight: 1 },
    ],
  },
  {
    id: "measure-hs-crp",
    kind: "measurement",
    title: "hs-CRP, rested",
    why: "Your inflammatory genotypes describe a tendency; this measurement describes what is happening now.",
    how: "Discuss a rested measurement and avoid the immediate aftermath of hard training, illness, or injury.",
    note: null,
    canUnlock: null,
    order: 15,
    criteria: [
      { variantId: "rs1205", genotypes: ["CC", "CT"], weight: 2 },
      { variantId: "rs1800629", genotypes: ["AA", "AG"], weight: 2 },
      { variantId: "rs1800795", genotypes: ["GG", "CG"], weight: 1 },
      { variantId: "rs2228145", genotypes: ["CC", "AC"], weight: 1 },
    ],
  },
  {
    id: "measure-blood-pressure",
    kind: "measurement",
    title: "Resting blood pressure",
    why: "Your renin-angiotensin results make a real cuff measurement more useful than an assumption about salt response.",
    how: "Use a validated upper-arm cuff at rest or discuss a reading with a qualified clinician.",
    note: null,
    canUnlock: null,
    order: 16,
    criteria: [
      { variantId: "rs699", genotypes: ["GG", "AG"], weight: 2 },
      { variantId: "rs4341", genotypes: ["CC", "CG"], weight: 1 },
      { variantId: "rs1799983", genotypes: ["TT", "GT"], weight: 1 },
    ],
  },
];

const SAFETY_RULES: SafetyRule[] = [
  {
    id: "hfe-c282y-homozygous",
    variantId: "rs1800562",
    genotypes: ["AA"],
    title: "Discuss an iron-overload assessment with your doctor",
    why: "This exact called result warrants a proper haemochromatosis assessment rather than a supplement decision.",
    how: "Take the result to a qualified clinician for appropriate iron studies and family-history context.",
  },
  {
    id: "hfe-c282y-carrier",
    variantId: "rs1800562",
    genotypes: ["AG"],
    title: "Measure before taking iron",
    why: "This exact called result makes iron status a measurement question, not a fatigue assumption.",
    how: "Discuss ferritin and transferrin saturation with a qualified clinician before using supplemental iron.",
  },
  {
    id: "apoe-head-impact",
    variantId: "rs429358+rs7412",
    genotypes: ["E3/E4", "E4/E4"],
    title: "Use a clinician-led, paced return after head impact",
    why: "This adult-only result is used here only as recovery context after a head impact. It does not predict concussion or decide clearance.",
    how: "Tell the treating clinician before return-to-play decisions. Symptoms and professional assessment remain decisive.",
  },
];

function compareScored(left: ScoredRule, right: ScoredRule) {
  if (right.score !== left.score) return right.score - left.score;
  if (right.domainIds.length !== left.domainIds.length) {
    return right.domainIds.length - left.domainIds.length;
  }
  if (right.contributors.length !== left.contributors.length) {
    return right.contributors.length - left.contributors.length;
  }
  return left.rule.order - right.rule.order;
}

function scoreRule(
  rule: RecommendationRule,
  markersByVariant: Map<string, ProcessedMarker>,
): ScoredRule {
  const contributors: Array<{ gene: string; variantId: string }> = [];
  const genes = new Set<string>();
  const domains = new Set<string>();
  let score = 0;

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
  }

  return {
    rule,
    score,
    domainIds: [...domains].sort(),
    contributors,
    geneCount: genes.size,
  };
}

function projectRecommendation(scored: ScoredRule): WholeReportRecommendation {
  return {
    id: scored.rule.id,
    kind: scored.rule.kind,
    title: scored.rule.title,
    why: scored.rule.why,
    how: scored.rule.how,
    note: scored.rule.note,
    canUnlock: scored.rule.canUnlock,
    score: scored.score,
    domainIds: scored.domainIds,
    contributors: scored.contributors,
  };
}

function qualifiesAction(scored: ScoredRule) {
  return (
    scored.score >= 3 &&
    scored.contributors.length >= 3 &&
    scored.geneCount >= 3 &&
    scored.domainIds.length >= (scored.rule.minimumDomainCount ?? 2)
  );
}

function qualifiesMeasurement(scored: ScoredRule) {
  return (
    scored.score >= 2 &&
    scored.contributors.length >= 2 &&
    scored.geneCount >= 2
  );
}

function nearThresholdReason(
  scored: ScoredRule,
  selected: Set<string>,
): NearThresholdRecommendation["reason"] {
  const measurement = scored.rule.kind === "measurement";
  const markerMinimum = measurement ? 2 : 3;
  const geneMinimum = measurement ? 2 : 3;
  const scoreMinimum = measurement ? 2 : 3;

  if (scored.contributors.length < markerMinimum) return "too-few-markers";
  if (scored.geneCount < geneMinimum) return "too-few-genes";
  if (
    !measurement &&
    scored.domainIds.length < (scored.rule.minimumDomainCount ?? 2)
  ) {
    return "too-few-systems";
  }
  if (scored.score < scoreMinimum) return "below-threshold";
  if (!selected.has(scored.rule.id)) return "outside-shortlist";
  return "below-threshold";
}

function buildSafety(
  markersByVariant: Map<string, ProcessedMarker>,
): SafetyRecommendation[] {
  return SAFETY_RULES.flatMap((rule) => {
    const marker = markersByVariant.get(rule.variantId.toLowerCase());
    if (
      !marker ||
      marker.state !== "called" ||
      marker.clinicalReferral ||
      marker.sourceOnly ||
      !marker.genotype ||
      !rule.genotypes.includes(marker.genotype)
    ) {
      return [];
    }

    return [
      {
        id: rule.id,
        title: rule.title,
        why: rule.why,
        how: rule.how,
        contributor: { gene: marker.gene, variantId: marker.variantId },
      },
    ];
  });
}

export function buildRecommendationSynthesis(
  markers: ProcessedMarker[],
): RecommendationSynthesis {
  const markersByVariant = new Map(
    markers.map((marker) => [marker.variantId.toLowerCase(), marker]),
  );
  const scored = RULES.map((rule) => scoreRule(rule, markersByVariant));
  const behaviours = scored
    .filter(
      (item) => item.rule.kind === "behaviour" && qualifiesAction(item),
    )
    .sort(compareScored)
    .slice(0, 3);
  const foods = scored
    .filter((item) => item.rule.kind === "food" && qualifiesAction(item))
    .sort(compareScored)
    .slice(0, 2);
  const actions = [...behaviours, ...foods].sort(compareScored);
  const measurements = scored
    .filter(
      (item) =>
        item.rule.kind === "measurement" && qualifiesMeasurement(item),
    )
    .sort(compareScored)
    .slice(0, 5);
  const selected = new Set(
    [...actions, ...measurements].map((item) => item.rule.id),
  );
  const nearThreshold = scored
    .filter((item) => item.score > 0 && !selected.has(item.rule.id))
    .sort(compareScored)
    .slice(0, 5)
    .map((item) => ({
      id: item.rule.id,
      kind: item.rule.kind,
      title: item.rule.title,
      score: item.score,
      contributorCount: item.contributors.length,
      domainCount: item.domainIds.length,
      reason: nearThresholdReason(item, selected),
    }));
  const actionRuleVariants = new Set(
    RULES.filter((rule) => rule.kind !== "measurement").flatMap((rule) =>
      rule.criteria.map((criterion) => criterion.variantId.toLowerCase()),
    ),
  );
  const relevantCalledMarkers = markers.filter(
    (marker) =>
      marker.state === "called" &&
      !marker.clinicalReferral &&
      !marker.sourceOnly &&
      actionRuleVariants.has(marker.variantId.toLowerCase()),
  ).length;

  return {
    rulesVersion: RECOMMENDATION_RULES_VERSION,
    actionOutcome: actions.length
      ? "ready"
      : relevantCalledMarkers < 3
        ? "insufficient-data"
        : "no-convergence",
    safety: buildSafety(markersByVariant),
    actions: actions.map(projectRecommendation),
    measurements: measurements.map(projectRecommendation),
    nearThreshold,
    supplementsLocked: true,
  };
}

export function recommendationRuleReferences() {
  return RULES.flatMap((rule) =>
    rule.criteria.map((criterion) => ({
      ruleId: rule.id,
      variantId: criterion.variantId,
      genotypes: [...criterion.genotypes],
    })),
  );
}
