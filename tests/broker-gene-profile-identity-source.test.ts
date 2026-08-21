import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const identitySql = readFileSync(
  new URL(
    "../database/003_broker_gene_profile_identity.sql",
    import.meta.url,
  ),
  "utf8",
);

test("the identity migration projects recipient names without exposing emails", () => {
  assert.match(
    identitySql,
    /CREATE OR ALTER PROCEDURE dbo\.usp_BrokerGene_GetProfileByEmail/,
  );
  assert.match(
    identitySql,
    /CREATE OR ALTER PROCEDURE dbo\.usp_BrokerGene_GetProfileByNumber/,
  );
  assert.equal(
    [...identitySql.matchAll(/recipient\.\[Name\] AS displayName/g)].length,
    2,
  );
  assert.doesNotMatch(identitySql, /recipient\.Email AS/i);
  assert.match(
    identitySql,
    /COL_LENGTH\(N'dbo\.BrokerDayReportRecipients', N'Name'\) IS NULL/,
  );
});

test("the identity migration preserves the narrow runtime permission model", () => {
  const grants = [
    ...identitySql.matchAll(
      /GRANT EXECUTE\s+ON OBJECT::dbo\.(usp_BrokerGene_[A-Za-z]+)\s+TO broker_gene_report_executor/g,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(grants.sort(), [
    "usp_BrokerGene_GetProfileByEmail",
    "usp_BrokerGene_GetProfileByNumber",
  ]);
  assert.doesNotMatch(identitySql, /GRANT\s+SELECT/i);
});
