export type SexAtBirth = "female" | "male" | "unspecified";

export type AssayStrand = "forward" | "reverse" | "unknown";

export type EvidenceGrade = "A" | "B" | "C" | "D" | "ungraded";

/** Leverage 0 is reserved for clinician-referral markers and is never scored. */
export type LeverageLevel = 0 | 1 | 2 | 3;

export type DomainBand = 1 | 2 | 3 | 4 | 5;

export interface GeneProfile {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  /**
   * Canonical person label from the Broker Day database. This is kept
   * separately because the source may provide a full name without safe
   * first/last-name boundaries.
   */
  displayName?: string;
  dateOfBirth: string | null;
  sexAtBirth: SexAtBirth;
  sampleId: string;
  assayName: string;
  assayVersion: string;
  assayStrand: AssayStrand;
  reportAccessStatus: "enabled" | "disabled";
  processedAt: string;
}

export interface GeneReportProfile {
  memberNumber: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  assayName: string;
  sexAtBirth: SexAtBirth;
}

export interface GenotypeRecord {
  profileId: string;
  gene?: string;
  variantId: string;
  genotype: string;
  quality: number | null;
}

export interface DomainDefinition {
  id: string;
  name: string;
  group: string;
  description: string;
}

export interface BandDefinition {
  level: DomainBand;
  name: string;
  summary: string;
}

export interface MarkerDefinition {
  id: string;
  gene: string;
  variantId: string;
  expectedAlleles: string;
  domainIds: string[];
  evidenceGrade: EvidenceGrade;
  impact: string;
  interpretations: Record<string, [LeverageLevel, string]>;
  namedVariants: Record<string, string>;
  assayNote: string | null;
  palindromic: boolean;
  xLinked: boolean;
  clinicalReferral: boolean;
  componentVariants: string[];
  sourceOnly: boolean;
}

export interface MarkerCatalogue {
  version: string;
  domains: Record<string, DomainDefinition>;
  bands: BandDefinition[];
  markers: MarkerDefinition[];
}

export type MarkerState =
  | "called"
  | "not-called"
  | "unreadable"
  | "withheld"
  | "unmapped";

export interface ProcessedMarker {
  id: string;
  gene: string;
  variantId: string;
  expectedAlleles: string;
  domainIds: string[];
  domainNames: string[];
  evidenceGrade: EvidenceGrade;
  impact: string;
  assayNote: string | null;
  clinicalReferral: boolean;
  componentVariants: string[];
  sourceOnly: boolean;
  state: MarkerState;
  rawGenotype: string | null;
  genotype: string | null;
  namedVariant: string | null;
  leverage: LeverageLevel | null;
  interpretation: string;
  strandFlipped: boolean;
  strandAmbiguous: boolean;
  quality: number | null;
}

export interface DomainScore {
  id: string;
  name: string;
  group: string;
  description: string;
  band: DomainBand | null;
  bandName: string;
  bandSummary: string;
  averageLeverage: number | null;
  bandScore: number | null;
  calledMarkers: number;
  totalMarkers: number;
  coverage: number;
  topMarkerIds: string[];
}

export interface ReportAction {
  domainId: string;
  domainName: string;
  title: string;
  description: string;
  rationale: string;
  band: DomainBand;
}

export type RecommendationKind = "behaviour" | "food" | "measurement";

export interface RecommendationContributor {
  gene: string;
  variantId: string;
}

export interface WholeReportRecommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  why: string;
  how: string;
  note: string | null;
  canUnlock: string | null;
  score: number;
  domainIds: string[];
  contributors: RecommendationContributor[];
}

export interface SafetyRecommendation {
  id: string;
  title: string;
  why: string;
  how: string;
  contributor: RecommendationContributor;
}

export interface NearThresholdRecommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  score: number;
  contributorCount: number;
  domainCount: number;
  reason:
    | "below-threshold"
    | "too-few-markers"
    | "too-few-genes"
    | "too-few-systems"
    | "outside-shortlist";
}

export type SupplementDecision =
  | "food-first"
  | "measure-first"
  | "clinician-only";

export interface SupplementRecommendation {
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
  score: number;
  domainIds: string[];
  contributors: RecommendationContributor[];
  executiveFitnessIds: string[];
}

export interface SupplementPlan {
  rulesVersion: string;
  outcome: "review-ready" | "none";
  framing: string;
  items: SupplementRecommendation[];
}

export interface RecommendationSynthesis {
  rulesVersion: string;
  actionOutcome: "ready" | "insufficient-data" | "no-convergence";
  safety: SafetyRecommendation[];
  actions: WholeReportRecommendation[];
  measurements: WholeReportRecommendation[];
  nearThreshold: NearThresholdRecommendation[];
  supplementsLocked: boolean;
  supplements: SupplementPlan;
}

export interface ProcessingReceipt {
  status: "complete";
  source: "seeded-repository" | "azure-sql";
  sourceLabel: string;
  profileRows: number;
  genotypeRows: number;
  catalogueMarkers: number;
  callableMarkers: number;
  calledMarkers: number;
  unreadableMarkers: number;
  withheldMarkers: number;
  unmappedMarkers: number;
  strandFlips: number;
  overallCoverage: number;
  rulesVersion: string;
  processedAt: string;
  durationMs: number;
}

export interface ProcessingContext {
  source?: ProcessingReceipt["source"];
  sourceLabel?: string;
  /** ISO timestamp used for age-gated release decisions. */
  asOf?: string;
}

export interface GeneReport {
  id: string;
  profile: GeneReportProfile;
  receipt: ProcessingReceipt;
  domains: DomainScore[];
  markers: ProcessedMarker[];
  priorities: ReportAction[];
  recommendations: RecommendationSynthesis;
  groups: Array<{
    id: string;
    name: string;
    domainIds: string[];
  }>;
}
