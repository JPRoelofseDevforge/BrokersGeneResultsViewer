import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const importerSql = readFileSync(
  new URL("../database/002_broker_gene_import.sql", import.meta.url),
  "utf8",
);

test("the administrative importer accepts only the reviewed non-rs assay pairs", () => {
  const exactPairPattern =
    /source_row\.GeneSymbol\s*=\s*N'([^']+)'\s+AND source_row\.VariantId\s*=\s*N'([^']+)'/g;
  const exactPairs = [...importerSql.matchAll(exactPairPattern)]
    .map((match) => `${match[1]}|${match[2]}`)
    .sort();

  assert.deepEqual(exactPairs, [
    "APOE|rs429358+rs7412",
    "AR|cag repeat",
    "DRD4|vntr 7r",
    "NAT2|various",
    "PER3|vntr 4/5",
    "SLC6A3|dat1 vntr 9/10",
    "SLC6A4|5-httlpr",
  ]);
  assert.match(
    importerSql,
    /parsed\.rsNumber\)\)\) = N'rs429358,rs7412'[\s\S]+THEN N'rs429358\+rs7412'/,
  );
  assert.match(importerSql, /@ImportScope NOT IN \('full', 'delta'\)/);
  assert.match(importerSql, /N'broker-gene-import-v4'/);
  assert.match(importerSql, /THROW 51206, 'Conflicting duplicate genotype calls were found\.'/);
});
