import sql from "mssql";

import { GeneResultsConfigurationError } from "./gene-results-source";

export class GeneDatabaseConfigurationError extends GeneResultsConfigurationError {
  constructor() {
    super("Gene result database configuration is incomplete");
    this.name = "GeneDatabaseConfigurationError";
  }
}

let poolPromise: Promise<sql.ConnectionPool> | undefined;

interface SafeErrorDiagnostic {
  name: string;
  code: string | number | null;
  causes?: SafeErrorDiagnostic[];
}

function safeErrorDiagnostic(
  error: unknown,
  depth = 0,
): SafeErrorDiagnostic {
  const value =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const code = value?.code;
  const diagnostic: SafeErrorDiagnostic = {
    name: error instanceof Error ? error.name : "UnknownError",
    code:
      typeof code === "string" || typeof code === "number" ? code : null,
  };

  if (!value || depth >= 3) return diagnostic;

  const causes = [
    value.originalError,
    value.cause,
    ...(Array.isArray(value.errors) ? value.errors.slice(0, 5) : []),
  ].filter((candidate) => candidate !== undefined && candidate !== null);

  if (causes.length) {
    diagnostic.causes = causes.map((candidate) =>
      safeErrorDiagnostic(candidate, depth + 1),
    );
  }

  return diagnostic;
}

function managedIdentityConfig(): sql.config {
  const server = process.env.AZURE_SQL_SERVER?.trim();
  const database = process.env.AZURE_SQL_DATABASE?.trim();
  const clientId = process.env.AZURE_CLIENT_ID?.trim();

  if (!server || !database) {
    throw new GeneDatabaseConfigurationError();
  }

  return {
    server,
    database,
    port: 1433,
    connectionTimeout: 15_000,
    requestTimeout: 30_000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    authentication: process.env.WEBSITE_SITE_NAME?.trim()
      ? {
          type: "azure-active-directory-msi-app-service",
          options: clientId ? { clientId } : {},
        }
      : {
          type: "azure-active-directory-default",
          options: clientId ? { clientId } : {},
        },
  };
}

function createPool(): sql.ConnectionPool {
  const connectionString = process.env.SQL_CONNECTION_STRING?.trim();
  return connectionString
    ? new sql.ConnectionPool(connectionString)
    : new sql.ConnectionPool(managedIdentityConfig());
}

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const pool = createPool();
    pool.on("error", () => {
      if (poolPromise) {
        void pool.close();
        poolPromise = undefined;
      }
    });
    poolPromise = pool.connect().catch((error: unknown) => {
      poolPromise = undefined;
      console.error(
        "[gene-results] Azure SQL connection failed",
        JSON.stringify(safeErrorDiagnostic(error)),
      );
      throw error;
    });
  }

  return poolPromise;
}
