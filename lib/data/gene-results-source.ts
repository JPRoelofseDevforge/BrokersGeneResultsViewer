import type {
  GeneProfile,
  GenotypeRecord,
} from "@/lib/gene-processing/types";

/**
 * The processing layer depends on this contract, not on a file format or a
 * database client. A future Azure SQL adapter only needs to implement these
 * three reads.
 */
export interface GeneResultsSource {
  getProfile(profileId: string): Promise<GeneProfile | null>;
  getGenotypeRecords(profileId: string): Promise<GenotypeRecord[]>;
}
