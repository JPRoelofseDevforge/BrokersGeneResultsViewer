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
encrypted token
  └─ Broker Day POST /api/person
       └─ existing Azure SQL profile aggregate
            ├─ normalized email (server only)
            └─ canonical display name
                 └─ GeneResultsSource
                      └─ processGeneReport()
                           ├─ domain scores
                           ├─ processed markers
                           ├─ priorities
                           └─ personalized report
```

The existing Broker Day API remains the owner of its token and database lookup.
This app calls that endpoint server-to-server, reproduces the same ordered name
precedence as the Broker Day profile, and never sends the email to the browser.
It does not duplicate Broker Day SQL credentials.

Raw Intelligene calls still enter through `lib/data/gene-results-source.ts`.
The checked-in Broker Day schema has questionnaire gene scores, but not the
`variantId`, genotype, quality, consent, sample, and assay records required by
this engine. Phase 1 therefore keeps its deterministic seeded gene repository.
Once the matching Intelligene tables or stored procedure exist in the same
Azure SQL database, its adapter can replace the seeded source without changing
the processing engine or report interface.

## Broker Day handoff

This app accepts the same encrypted fragment-token contract as
`C:\Work\BrokerDayEndResult`:

```text
Broker Day Intelligene link
  → https://<gene-app>/#token=<encrypted-token>
  → browser removes the fragment
  → POST /api/reports/resolve
  → server forwards only the token to Broker Day POST /api/person
  → Broker Day decrypts it and reads the existing Azure SQL database
  → use its normalized email and canonical name on the server
  → real gene record ready: process and return the report
  → no real gene record: greet the matched person and show "not ready"
```

Keep the token in the URL fragment, never in the query string or path. The
link in Broker Day should open a new private tab with `noopener noreferrer`.
Set `BROKER_DAY_PROFILE_API_URL` to the existing Broker Day HTTPS endpoint
ending in `/api/person`. With this preferred configuration, the gene App
Service does not need Broker Day's `QR_TOKEN_KEY`; the existing profile API
continues to own decryption and the Azure SQL read.

The personalized heading follows the same rule as Broker Day: the newest sleep
assessment `FullName`, otherwise the newest preorder `FirstName + Surname`,
otherwise the generic label `Your broker day profile`. No name is derived from
the email address. Initials come from the same displayed name.

The existing Broker Day `/api/person` returns a profile only when the person has
at least one current sleep, GreenChemy, preorder, or Scale Data record. Confirm
that every Intelligene recipient also has one of those records, or add a narrow
upstream token-to-identity endpoint before supporting Intelligene-only people.

Phase 1 does not accept arbitrary tokens. For a controlled local token test,
leave `BROKER_DAY_PROFILE_API_URL` unset, set `PHASE_ONE_TOKEN_TEST=true`, set
`PHASE_ONE_PROFILE_EMAIL` to the email encrypted into the token, and supply the
local fallback `QR_TOKEN_KEY`. A real Broker Day identity is never applied to
the seeded demonstration genotypes. The production gene adapter should
implement `getProfileByEmail` and the existing profile/genotype reads against
the approved Intelligene schema.

Seeded preview access is fail-closed and requires the explicit setting
`PHASE_ONE_PREVIEW=true`; leave it unset or false in production.

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

## Private review deployment

The checked-in `.openai/hosting.json` supports an owner-only Sites review
deployment. That review environment deliberately enables the demonstration
preview and is not the public Broker Day destination. Do not place its URL in
the Broker Day Intelligene tab.

Azure App Service remains the intended end-user deployment. Its production
settings must keep `PHASE_ONE_PREVIEW` disabled and must not enable the
Intelligene link until a real, consented production `GeneResultsSource` is
available.

## Azure App Service handoff

The production build emits `dist/standalone/server.js`. The `start` script runs
that server, which listens on the `PORT` environment variable supplied by Azure
App Service.

Recommended handoff:

1. Use a Linux App Service with a supported Node.js 24 LTS runtime.
2. Build with `npm ci` followed by `npm run build`.
3. Start with `npm start`.
4. Store runtime settings in App Service configuration, not in committed files.
5. Set `BROKER_DAY_PROFILE_API_URL` to
   `https://<broker-day-origin>/api/person`.
6. Do not copy `QR_TOKEN_KEY` into this App Service when the shared profile
   endpoint is configured.
7. Leave `PHASE_ONE_PREVIEW` unset or set it to `false` before enabling the
   production Intelligene link.
8. Add the production `GeneResultsSource` only after the raw Intelligene profile
   and genotype schema is confirmed in the shared database.
9. Give this App Service its own least-privilege managed identity and private
   Azure SQL network access for that future gene source.
10. Keep consent status, sample identity, processing time, and rules version in
    the database audit trail.
11. Add the Broker Day Intelligene CTA only after a trustworthy report-ready
    signal exists; open `https://<gene-app>/#token=<token>` in a new tab with
    `noopener noreferrer`.

Microsoft references:

- [Configure Node.js in Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
- [Configure Azure App Service settings](https://learn.microsoft.com/en-us/azure/app-service/configure-common)

## Important scope

This report is educational and wellness-oriented. It does not diagnose,
prescribe, or replace a qualified clinician. The seeded Phase 1 member and
genotypes are demonstration records, not a real person.
