# SAM Gene Report — Phase 1

SAM is a private, server-processed Intelligene report for Broker Day
recipients. The production path resolves the existing encrypted Broker Day
token, reads the matching approved gene-result profile from the shared Azure
SQL database, applies the versioned marker catalogue, and returns a no-store
report.

The original `sam_report-3.html` remains design source material. It is not
loaded by the application.

## Production data flow

```text
Broker Day private link
  → https://<gene-app>/#token=<encrypted-token>
  → browser immediately removes the fragment
  → POST /api/reports/resolve
  → Broker Day POST /api/person validates the token and returns identity
  → Azure SQL stored procedure resolves that email to one exact IG number
  → canonical calls for the current ready profile are processed server-side
  → the browser receives only that member's report
```

The email, SQL credentials, workbook, and other members' calls are never sent
to the browser. The App Service uses its Microsoft Entra managed identity and
has `EXECUTE` only on three read procedures; it has no direct table access.

## Result repository

The database migration is split into:

- `database/001_broker_gene_results.sql`: versioned import batches, immutable
  profile snapshots, preserved source calls, current-profile pointers,
  read-only procedures, indexes, and the narrow executor role.
- `database/002_broker_gene_import.sql`: an administrator-only, transactional,
  idempotent importer for the approved long-form source contract.

The first production batch preserves all 2,414 workbook rows and selects one
canonical row for each profile/variant pair. Exact duplicates are retained for
audit; conflicting duplicates abort the import. A profile is report-ready only
when it contains the full expected 132-variant panel. Partial profiles remain
stored but cannot be served.

`ReportAccessStatus` is an operational publication control. It deliberately
does not claim or infer clinical consent.

## Processing safeguards

- Missing and `UND` calls remain missing.
- `PRS` is not guessed into a copy-number interpretation.
- Single-allele calls require an X-linked marker and verified male sex.
- Palindromic markers are excluded when the assay strand is unknown.
- Adult-only APOE is withheld when age is unknown or under 18.
- Exact duplicate rows are deduplicated; conflicting rows fail closed.
- Workbook-only variants remain visible as stored/unscored and never affect a
  domain score.
- Catalogue markers without a usable call remain explicit.
- No raw file upload route exists.

This report is educational and wellness-oriented. It does not diagnose,
prescribe, or replace a qualified clinician.

## Local development

Node.js 22.13 or newer is required.

```bash
npm ci
npm test
npm run lint
npm run build
```

To open the deterministic local demonstration without a token, set
`PHASE_ONE_PREVIEW=true` in ignored `.env.local`. The demonstration source is
never combined with a real Broker Day identity.

## Configuration

Production App Service settings:

```text
GENE_RESULTS_SOURCE=azure-sql
AZURE_SQL_SERVER=rxg.database.windows.net
AZURE_SQL_DATABASE=BrokerDay
BROKER_DAY_PROFILE_API_URL=https://<broker-day-origin>/api/person
PHASE_ONE_PREVIEW=false
PHASE_ONE_TOKEN_TEST=false
```

Leave `AZURE_CLIENT_ID` unset for the system-assigned App Service identity.
Do not configure a SQL password or copy `QR_TOKEN_KEY` into this App Service
when the Broker Day profile endpoint owns token decryption.

## Deployment

The GitHub Actions workflow builds the Vinext standalone server and deploys it
to the Linux Azure App Service. Azure remains the end-user destination.

The checked-in `.openai/hosting.json` is used only for the private Sites review
deployment. It must not be used as the Broker Day gene-report destination
because that environment does not have Azure SQL managed-identity access.
