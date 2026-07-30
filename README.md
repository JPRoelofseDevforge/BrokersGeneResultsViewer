# SAM Gene Report — Phase 1

SAM is a server-processed gene report. Phase 1 turns the original
`sam_report-3.html` prototype into a structured application with a versioned
marker catalogue, deterministic processing engine, repository boundary, report
API, and responsive interface.

The original HTML remains in the repository as source material. It is not
loaded by the production application.

## What Phase 1 does

- Reads a consented member and genotype rows from a server-side repository.
- Normalizes allele calls and resolves supported reverse-strand calls.
- Keeps ambiguous, missing, unreadable, and withheld results explicit.
- Handles composite APOE and supported X-linked calls.
- Scores 22 systems from called markers only.
- Produces one typed report contract for the interface and API.
- Provides no raw genotype upload path.

## Architecture

```text
GeneResultsSource
  └─ PhaseOneGeneResultsSource (seeded records)
       └─ processGeneReport()
            ├─ domain scores
            ├─ processed markers
            ├─ priorities
            └─ processing receipt
                 ├─ server-rendered report
                 ├─ preview GET /api/reports/:profileId
                 └─ token POST /api/reports/resolve
```

The future database integration belongs behind
`lib/data/gene-results-source.ts`. An Azure SQL implementation can replace the
seeded adapter without changing the processing engine, API response, or report
interface.

## Broker Day handoff

This app accepts the same encrypted fragment-token contract as
`C:\Work\BrokerDayEndResult`:

```text
Broker Day Intelligene link
  → https://<gene-app>/#token=<encrypted-token>
  → browser removes the fragment
  → POST /api/reports/resolve
  → decrypt token on the server
  → look up the consented profile by normalized email
  → process and return the report with no-store headers
```

Keep the token in the URL fragment, never in the query string or path. The
link in Broker Day should open a new private tab with `noopener noreferrer`.
Both apps use AES-256-GCM token version `v1` with AAD `sam-profile:v1`, so the
gene App Service must receive the same `QR_TOKEN_KEY` through secure runtime
configuration.

Phase 1 does not accept arbitrary tokens. For an end-to-end seeded test, set
`PHASE_ONE_PROFILE_EMAIL` to the email encrypted into the token. The production
database adapter should implement `getProfileByEmail` and the two existing
profile/genotype reads. Seeded preview access is fail-closed and requires the
explicit setting `PHASE_ONE_PREVIEW=true`; leave it unset or false in
production.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

To see the fake Phase 1 report without a token, create an ignored `.env.local`
containing `PHASE_ONE_PREVIEW=true`. With no opt-in, the root page shows the
private Broker Day entry state.

Useful checks:

```bash
npm test
npm run lint
npm run build
```

To regenerate the structured catalogue and Phase 1 records from the original
prototype:

```bash
npm run catalogue:extract
```

## Azure App Service handoff

The production build emits `dist/standalone/server.js`. The `start` script runs
that server, which listens on the `PORT` environment variable supplied by Azure
App Service.

Recommended handoff:

1. Use a Linux App Service with a supported Node.js 24 LTS runtime.
2. Build with `npm ci` followed by `npm run build`.
3. Start with `npm start`.
4. Store runtime settings in App Service configuration, not in committed files.
5. Set `QR_TOKEN_KEY` to the same Key Vault-backed secret used by Broker Day.
6. Leave `PHASE_ONE_PREVIEW` unset or set it to `false` before enabling the
   production Intelligene link.
7. Add the production `GeneResultsSource` with managed identity and private
   network access to Azure SQL.
8. Keep consent status, sample identity, processing time, and rules version in
   the database audit trail.

Microsoft references:

- [Configure Node.js in Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
- [Configure Azure App Service settings](https://learn.microsoft.com/en-us/azure/app-service/configure-common)

## Important scope

This report is educational and wellness-oriented. It does not diagnose,
prescribe, or replace a qualified clinician. The seeded Phase 1 member and
genotypes are demonstration records, not a real person.
