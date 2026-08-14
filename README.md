# SAM Gene Report — Phase 1

SAM is a private, server-processed Intelligene report for Broker Day
recipients. The production path resolves the existing encrypted Broker Day
token, reads the matching approved gene-result profile from the shared Azure
SQL database, applies the versioned marker catalogue, and returns a no-store
report.

`sam_report-12.html` is the authenticated report display source. It is
rendered only after the token/database lookup succeeds, inside a sandboxed
report frame. The production adapter removes its prototype upload, sample,
editable-profile, external-model, wearable-pairing, and practitioner-override
paths. Marker call states still come from the server processor; the reference
renderer cannot turn a withheld, unreadable, or missing call into a result.
Its ledger is generated from those same live marker objects and separates a
lab no-call, an unreadable source value, and a marker not yet present on the
panel.

Report 12 keeps the Pathology and All three layers views and adds South African
laboratory-source guidance, recognised unit conversion, structured supplement
instructions, and explicit contraindication cards. In Phase 1, pathology
values and food-intake answers are ephemeral browser inputs only. Imported
pathology rows require a recognised unit; missing or unsupported units are not
guessed. Sex-specific pathology comparisons remain unavailable until verified
sex at birth is carried through the shared Broker Day profile, and sample
wearable nights are never mixed into an authenticated member report.

The earlier `sam_report-11.html`, `sam_report-7.html`, `sam_report-new.html`,
and original `sam_report-3.html` remain archived design source material.

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
audit; conflicting duplicates abort the import. The importer accepts an exact
expected-variant count per IG number, with the required shared-count parameter
as its backwards-compatible fallback (132 for the original production panel).
A profile is report-ready only when its observed variant count exactly matches
its manifest. Partial profiles remain stored but cannot be served.

The reviewed 2026-08-14 source manifest contains 22 profiles, 4,471 raw rows,
and 3,878 canonical profile/variant calls. Its 593 surplus identical rows remain
in the immutable audit trail. One expanded profile is checked against 193
expected calls and the remaining profiles against the reviewed 187-call panel.
Twenty profiles meet that contract; the two strict subsets are retained as
partial snapshots and cannot be served as complete reports.

`ReportAccessStatus` is an operational publication control. It deliberately
does not claim or infer clinical consent.

## Processing safeguards

- Missing and `UND` calls remain missing.
- `PRS` is not guessed into a copy-number interpretation.
- Single-allele calls require an X-linked marker and verified male sex.
- Palindromic markers are excluded when the assay strand is unknown.
- APOE is withheld only when the processed profile confirms the reader is
  under 18; otherwise a valid composite call is released with its adult-use
  context.
- Exact duplicate rows are deduplicated; conflicting rows fail closed.
- Seven non-rs or composite assays are accepted only under their exact
  gene/assay pairs; arbitrary assay labels still fail closed. The source APOE
  summary is canonicalised to the catalogue composite, checked against its
  component calls when present, and used as a strict fallback when they are
  absent. The NAT2 summary row is retained for audit but remains unscored; its
  separately supplied, versioned component markers drive the report.
- Workbook-only variants remain visible as stored/unscored and never affect a
  domain score.
- Catalogue markers without a usable call remain explicit.
- No raw file upload route exists.
- Phase 1 lab values remain in the current report tab only. Practitioner
  overrides, model endpoints, and wearable connections stay disabled until
  their authenticated and audited server workflows exist.

This report is educational and wellness-oriented. It does not diagnose,
prescribe, or replace a qualified clinician.

The Phase 1 Broker Day invitation cohort is an adults-only audience. A stored
date of birth that proves the reader is under 18 always overrides that audience
assumption and withholds APOE. Before this report is offered outside that
adult-only cohort, the shared identity record must provide verified age
eligibility rather than relying on a missing date of birth.

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
