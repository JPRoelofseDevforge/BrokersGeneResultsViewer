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
                 └─ GET /api/reports/:profileId
```

The future database integration belongs behind
`lib/data/gene-results-source.ts`. An Azure SQL implementation can replace the
seeded adapter without changing the processing engine, API response, or report
interface.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

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
5. Add the production `GeneResultsSource` with managed identity and private
   network access to Azure SQL.
6. Keep consent status, sample identity, processing time, and rules version in
   the database audit trail.

Microsoft references:

- [Configure Node.js in Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
- [Configure Azure App Service settings](https://learn.microsoft.com/en-us/azure/app-service/configure-common)

## Important scope

This report is educational and wellness-oriented. It does not diagnose,
prescribe, or replace a qualified clinician. The seeded Phase 1 member and
genotypes are demonstration records, not a real person.
