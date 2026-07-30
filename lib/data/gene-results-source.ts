import type {
  GeneProfile,
  GenotypeRecord,
} from "@/lib/gene-processing/types";

/**
 * The processing layer depends on this contract, not on a file format or a
 * database client. A future Azure SQL adapter only needs to implement these
 * lookup and record reads.
 */
export interface GeneResultsSource {
  /**
   * Demonstration sources must never be combined with a real Broker Day
   * identity. Production sources represent consented records for that person.
   */
  readonly sourceMode: "demonstration" | "production";
  getProfile(profileId: string): Promise<GeneProfile | null>;
  getProfileByEmail(email: string): Promise<GeneProfile | null>;
  getGenotypeRecords(profileId: string): Promise<GenotypeRecord[]>;
}
