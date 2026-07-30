export type SexAtBirth = "female" | "male" | "unspecified";

export type EvidenceGrade = "A" | "B" | "C" | "D";

export type LeverageLevel = 1 | 2 | 3;

export type DomainBand = 1 | 2 | 3 | 4 | 5;

export interface GeneProfile {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sexAtBirth: SexAtBirth;
  sampleId: string;
  assayName: string;
  assayVersion: string;
  consentStatus: "active" | "withdrawn";
  processedAt: string;
}

export interface GenotypeRecord {
  profileId: string;
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
  | "withheld";

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

export interface ProcessingReceipt {
  status: "complete";
  source: "seeded-repository";
  sourceLabel: string;
  profileRows: number;
  genotypeRows: number;
  catalogueMarkers: number;
  callableMarkers: number;
  calledMarkers: number;
  unreadableMarkers: number;
  withheldMarkers: number;
  strandFlips: number;
  overallCoverage: number;
  rulesVersion: string;
  processedAt: string;
  durationMs: number;
}

export interface GeneReport {
  id: string;
  profile: GeneProfile;
  receipt: ProcessingReceipt;
  domains: DomainScore[];
  markers: ProcessedMarker[];
  priorities: ReportAction[];
  groups: Array<{
    id: string;
    name: string;
    domainIds: string[];
  }>;
}
