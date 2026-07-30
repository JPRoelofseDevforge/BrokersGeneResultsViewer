import sql from "mssql";

import { GeneResultsConfigurationError } from "./gene-results-source";

export class GeneDatabaseConfigurationError extends GeneResultsConfigurationError {
  constructor() {
    super("Gene result database configuration is incomplete");
    this.name = "GeneDatabaseConfigurationError";
  }
}

let poolPromise: Promise<sql.ConnectionPool> | undefined;

function safeErrorCode(error: unknown): string | number | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = error.code;
  return typeof code === "string" || typeof code === "number" ? code : null;
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
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
    authentication: {
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
      console.error("[gene-results] Azure SQL connection failed", {
        name: safeErrorName(error),
        code: safeErrorCode(error),
      });
      throw error;
    });
  }

  return poolPromise;
}
