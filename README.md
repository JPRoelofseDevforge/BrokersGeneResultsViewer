# SAM Gene Report — Phase 1

SAM is a private, server-processed Intelligene report for Broker Day
recipients. The production path resolves the existing encrypted Broker Day
token, reads the matching approved gene-result profile from the shared Azure
SQL database, applies the versioned marker catalogue, and returns a no-store
report.

`sam_report-15.html` is the authenticated report display source. It is
rendered only after the token/database lookup succeeds, inside a sandboxed
report frame. The production adapter removes its prototype upload, sample,
editable-profile, external-model, wearable-pairing, and practitioner-override
paths. Marker call states still come from the server processor; the reference
renderer cannot turn a withheld, unreadable, or missing call into a result.
Its ledger is generated from those same live marker objects and separates a
lab no-call, an unreadable source value, a policy-held result, and a stored
source-only call that is not interpreted. Missing and no-call marker identities
are hidden from member-facing detail views, exports, figures, and agent answers;
the complete catalogue, callable, domain, and status counts remain visible.

Report 15 adds a private, in-tab intake and action brief, nine Executive Fitness
views, six cross-tagged Movement views, the revised
Movement/Recovery/Sleep/Executive/Systems taxonomy, and a separate
clinician-referral tier. Its active catalogue contains 161 rows across 18
primary systems: 154 may contribute to leverage scoring, five are referral-only,
and two NAT2 component calls are retained as source-only evidence.
Referral-only and source-only results never enter a leverage score. Primary
bands and the Necessary recommendations displayed in a private report come
from the server payload.

The Pathology and All three layers views retain the report 12 fail-closed
safeguards. In Phase 1, pathology values, intake answers, and the brief are
ephemeral browser inputs only. Imported pathology rows require a recognised
unit; missing or unsupported units are not guessed. A verified sex-at-birth
value from Broker Day enables the matching sex-specific ranges; if it is
missing, X-linked scoring and Pathology remain unavailable. Sample wearable
nights are never mixed into an authenticated member report. Recommendation
scores are server-authoritative and use `Σ((leverage - 1) × rule weight)` over
called, interpreted markers only. Behaviours and foods need score 3 from three
markers; measurements need score 2 from two markers. The member lists are
capped at three behaviours, two foods and five measurements, while every
genetically supported item excluded by a threshold or display cap remains in
the practitioner audit with its score and reason.

Supplement review is also server-authoritative. Cross-gene convergence can
raise a nutrient for `CONSIDER / PRACTITIONER REVIEW` without requiring a food
gap, symptom or abnormal laboratory result; selected older-adult rules can use
age to escalate an already susceptible two-marker pathway, never age alone.
Every item separates genetic rationale, supporting markers and SAM systems,
preferred form and timing with their rationale, population nutrition context,
age context, interaction and contraindication checks, and baseline/follow-up
measurement advice. Measurement status is structured as not routinely needed,
clinically indicated, or required before implementation; vitamin D screening is
not inferred from DNA alone. Every item carries non-null age and life-stage
context: displayed population references describe an ordinary adult, while
pregnancy planning, pregnancy, and breastfeeding require the applicable
guidance. The explicit exception is CDC public-health guidance that anyone who
could become pregnant should get 400 micrograms of folic acid daily even with a
common MTHFR variant. The five highest-ranked eligible items appear as Primary
Supplement Considerations and every remainder appears as Additional Supplement
Considerations. All entries use the same consider-only, practitioner-review
semantics. An exact HFE result can raise iron only as a safety-review marker,
never as a recommendation to take iron. Genetics never establishes a
deficiency or calculates a therapeutic dose; iron and vitamin B12 are
clinician-gated, and adult amounts are withheld for a confirmed minor.

The earlier `sam_report-12.html`, `sam_report-11.html`, `sam_report-7.html`,
`sam_report-new.html`, and original `sam_report-3.html` remain archived design
source material.

## Production data flow

```text
Broker Day private link
  → https://<gene-app>/#token=<encrypted-token>
  → browser immediately removes the fragment
  → POST /api/reports/resolve
  → Broker Day POST /api/person validates the token and returns identity
    → if Broker Day has no person profile, SAM authenticates the same token
      locally and uses its email to resolve an approved gene-only recipient
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
- `database/003_broker_gene_profile_identity.sql`: a rerunnable runtime upgrade
  that projects the recipient's stored display name without exposing email or
  widening the App Service database role.

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
- Every X-linked interpretation requires verified sex at birth. A verified
  male heterozygous diploid call is unreadable; a supported homozygous call is
  collapsed to its one-copy interpretation.
- Palindromic markers are excluded when the assay strand is unknown.
- APOE is withheld only when the profile confirms the reader is under 18 at
  report access; otherwise a valid composite call is released with its
  adult-use context. Raw component calls are also suppressed for a confirmed
  minor.
- Exact duplicate rows are deduplicated; conflicting rows fail closed.
- Seven non-rs or composite assays are accepted only under their exact
  gene/assay pairs; arbitrary assay labels still fail closed. The source APOE
  summary is canonicalised to the catalogue composite, checked against its
  component calls when present, and used as a strict fallback when they are
  absent. The laboratory's strictly validated NAT2 star-diplotype summary is
  mapped once to rapid, intermediate, or slow acetylator status. Unknown star
  alleles fail closed; unphased component SNPs are never guessed into a
  haplotype.
- Five clinician-referral markers use a factual, non-scored result path. They
  remain visible but cannot lower or raise a domain band or unlock an automated
  recommendation.
- Workbook-only variants remain visible as stored/unscored and never affect a
  domain score.
- Catalogue markers without a usable call remain in the full denominators and
  aggregate ledger, while their individual rows are hidden.
- No raw file upload route exists.
- Phase 1 lab values remain in the current report tab only. Browser intake and
  pathology cannot unlock or alter a supplement item. Only the versioned server
  plan can select a genetics-guided review candidate, and every displayed amount
  is labelled as a general adult reference rather than a DNA-derived dose.
  Practitioner overrides, model endpoints, and wearable connections stay
  disabled until their authenticated and audited server workflows exist.

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
# Required for direct SAM links whose recipients have no Broker Day person row.
# Use the same shared key as a Key Vault-backed App Service setting.
QR_TOKEN_KEY=<base64-encoded-32-byte-shared-key>
PHASE_ONE_PREVIEW=false
PHASE_ONE_TOKEN_TEST=false
```

Leave `AZURE_CLIENT_ID` unset for the system-assigned App Service identity.
Do not configure a SQL password. Keep `QR_TOKEN_KEY` unset when Broker Day owns
all token decryption; configure it through Key Vault only when gene-only direct
links need the explicit profile-not-found fallback.

## Deployment

The GitHub Actions workflow builds the Vinext standalone server and deploys it
to the Linux Azure App Service. Azure remains the end-user destination.

The checked-in `.openai/hosting.json` is used only for the private Sites review
deployment. It must not be used as the Broker Day gene-report destination
because that environment does not have Azure SQL managed-identity access.
