import sql from "mssql";

import { normalizeEmail } from "@/lib/access/email";
import type {
  GeneProfile,
  GenotypeRecord,
  SexAtBirth,
} from "@/lib/gene-processing/types";

import {
  GeneResultsIntegrityError,
  GeneResultsUnavailableError,
  type GeneResultsSource,
} from "./gene-results-source";
import {
  GeneDatabaseConfigurationError,
  getSqlPool,
} from "./sql-pool";

type DbRow = Record<string, unknown>;

export type GeneProcedureName =
  | "dbo.usp_BrokerGene_GetProfileByEmail"
  | "dbo.usp_BrokerGene_GetProfileByNumber"
  | "dbo.usp_BrokerGene_GetResultsByProfileId";

export type GeneProcedureExecutor = (
  procedure: GeneProcedureName,
  value: string,
) => Promise<readonly DbRow[]>;

async function executeProcedure(
  procedure: GeneProcedureName,
  value: string,
): Promise<readonly DbRow[]> {
  const pool = await getSqlPool();
  const request = pool.request();

  if (procedure === "dbo.usp_BrokerGene_GetProfileByEmail") {
    request.input("Email", sql.NVarChar(320), value);
  } else if (procedure === "dbo.usp_BrokerGene_GetResultsByProfileId") {
    request.input("ProfileId", sql.BigInt, value);
  } else {
    request.input("IntelligeneNumber", sql.NVarChar(20), value);
  }

  const result = (await request.execute(procedure)) as sql.IProcedureResult<DbRow>;
  return result.recordset;
}

function cleanString(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= maximumLength ? cleaned : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function isoTimestamp(value: unknown): string | null {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;

  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const timestamp = isoTimestamp(value);
  return timestamp?.slice(0, 10) ?? null;
}

function sexAtBirth(value: unknown): SexAtBirth {
  if (value === "F") return "female";
  if (value === "M") return "male";
  return "unspecified";
}

function projectProfile(rows: readonly DbRow[]): GeneProfile | null {
  if (!rows.length) return null;
  if (rows.length !== 1) throw new GeneResultsIntegrityError();

  const row = rows[0];
  const id = cleanString(row.profileId, 32);
  const memberNumber = cleanString(row.memberNumber, 20);
  const sampleId = cleanString(row.sampleId, 100);
  const assayName = cleanString(row.assayName, 160);
  const assayVersion = cleanString(row.assayVersion, 40);
  const processedAt = isoTimestamp(row.processedAt);
  const expectedVariantCount = positiveInteger(row.expectedVariantCount);
  const observedVariantCount = positiveInteger(row.observedVariantCount);

  if (
    !id ||
    !/^\d+$/.test(id) ||
    !memberNumber ||
    !/^IG\d+$/i.test(memberNumber) ||
    !sampleId ||
    !assayName ||
    !assayVersion ||
    !processedAt ||
    row.reportAccessStatus !== "enabled" ||
    row.reportStatus !== "ready" ||
    !expectedVariantCount ||
    observedVariantCount !== expectedVariantCount
  ) {
    throw new GeneResultsIntegrityError();
  }

  const assayStrand =
    row.assayStrand === "forward" || row.assayStrand === "reverse"
      ? row.assayStrand
      : "unknown";

  return {
    id,
    memberNumber: memberNumber.toUpperCase(),
    firstName: "",
    lastName: "",
    dateOfBirth: isoDate(row.dateOfBirth),
    sexAtBirth: sexAtBirth(row.sexAtBirth),
    sampleId,
    assayName,
    assayVersion,
    assayStrand,
    reportAccessStatus: "enabled",
    processedAt,
  };
}

function projectGenotypes(
  profileId: string,
  rows: readonly DbRow[],
): GenotypeRecord[] {
  const seen = new Map<string, string>();

  return rows.map((row) => {
    const variantId = cleanString(row.variantId, 64);
    const genotype = cleanString(row.genotype, 128);
    const gene = cleanString(row.gene, 32);
    const quality =
      row.quality === null || row.quality === undefined
        ? null
        : typeof row.quality === "number" &&
            Number.isFinite(row.quality) &&
            row.quality >= 0 &&
            row.quality <= 1
          ? row.quality
          : Number.NaN;

    if (
      !variantId ||
      !/^rs\d+$/i.test(variantId) ||
      !genotype ||
      Number.isNaN(quality)
    ) {
      throw new GeneResultsIntegrityError();
    }

    const key = variantId.toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new GeneResultsIntegrityError();
    }
    seen.set(key, genotype);

    return {
      profileId,
      variantId: key,
      genotype,
      quality,
      ...(gene ? { gene } : {}),
    };
  });
}

export class AzureSqlGeneResultsSource implements GeneResultsSource {
  readonly sourceMode = "production" as const;

  constructor(
    private readonly executor: GeneProcedureExecutor = executeProcedure,
  ) {}

  async getProfile(profileId: string) {
    const id = profileId.trim().toUpperCase();
    if (!/^IG\d+$/.test(id)) return null;

    return this.run(() =>
      this.executor("dbo.usp_BrokerGene_GetProfileByNumber", id).then(
        projectProfile,
      ),
    );
  }

  async getProfileByEmail(email: string) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;

    return this.run(() =>
      this.executor("dbo.usp_BrokerGene_GetProfileByEmail", normalized).then(
        projectProfile,
      ),
    );
  }

  async getGenotypeRecords(profileId: string) {
    const id = profileId.trim();
    if (!/^\d+$/.test(id)) return [];

    return this.run(() =>
      this.executor("dbo.usp_BrokerGene_GetResultsByProfileId", id).then(
        (rows) =>
        projectGenotypes(id, rows),
      ),
    );
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof GeneDatabaseConfigurationError ||
        error instanceof GeneResultsIntegrityError ||
        error instanceof GeneResultsUnavailableError
      ) {
        throw error;
      }
      throw new GeneResultsUnavailableError();
    }
  }
}
