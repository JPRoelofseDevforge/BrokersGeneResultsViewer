import phaseOneData from "@/data/phase-1-gene-records.json";
import type {
  GeneProfile,
  GenotypeRecord,
} from "@/lib/gene-processing/types";

import type { GeneResultsSource } from "./gene-results-source";

interface PhaseOneRecords {
  profiles: GeneProfile[];
  genotypeCalls: GenotypeRecord[];
}

const records = phaseOneData as PhaseOneRecords;

/**
 * Phase 1 behaves like a repository-backed data source while remaining
 * deterministic for development and review. No browser upload is involved.
 */
export class PhaseOneGeneResultsSource implements GeneResultsSource {
  async getProfile(profileId: string) {
    return (
      records.profiles.find((profile) => profile.id === profileId) ?? null
    );
  }

  async getGenotypeRecords(profileId: string) {
    return records.genotypeCalls.filter(
      (record) => record.profileId === profileId,
    );
  }
}
