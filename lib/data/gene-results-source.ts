import type {
  GeneProfile,
  GenotypeRecord,
} from "@/lib/gene-processing/types";

export class GeneResultsConfigurationError extends Error {
  constructor(message = "Gene result source configuration is invalid") {
    super(message);
    this.name = "GeneResultsConfigurationError";
  }
}

export class GeneResultsUnavailableError extends Error {
  constructor() {
    super("Gene result source is unavailable");
    this.name = "GeneResultsUnavailableError";
  }
}

export class GeneResultsIntegrityError extends Error {
  constructor() {
    super("Gene result source returned an invalid record");
    this.name = "GeneResultsIntegrityError";
  }
}

/**
 * The processing layer depends on this contract, not on a file format or a
 * database client. Each approved source implements the same lookup and record
 * reads.
 */
export interface GeneResultsSource {
  /**
   * Demonstration sources must never be combined with a real Broker Day
   * identity. Production sources represent enabled report records for that
   * person.
   */
  readonly sourceMode: "demonstration" | "production";
  getProfile(profileId: string): Promise<GeneProfile | null>;
  getProfileByEmail(email: string): Promise<GeneProfile | null>;
  getGenotypeRecords(profileId: string): Promise<GenotypeRecord[]>;
}
