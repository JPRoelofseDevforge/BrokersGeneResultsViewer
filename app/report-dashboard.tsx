"use client";

import { useMemo, useState, type CSSProperties } from "react";

import type {
  DomainScore,
  GeneReport,
  MarkerState,
  ProcessedMarker,
} from "@/lib/gene-processing/types";

const STATE_LABELS: Record<MarkerState, string> = {
  called: "Called",
  "not-called": "Not called",
  unreadable: "Needs review",
  withheld: "Withheld",
};

const GROUP_NAMES: Record<string, string> = {
  movement: "Movement",
  recovery: "Recovery",
  sleep: "Sleep",
  exec: "Executive fitness",
  systems: "Core systems",
};

function percentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

function reportDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function displayGenotype(marker: ProcessedMarker) {
  if (!marker.genotype) return "—";
  if (/^[ACGT]{2}$/.test(marker.genotype)) {
    return `${marker.genotype[0]}/${marker.genotype[1]}`;
  }
  return marker.genotype;
}

function DnaField() {
  return (
    <div className="dna-field" aria-hidden="true">
      <div className="dna-orbit dna-orbit-one" />
      <div className="dna-orbit dna-orbit-two" />
      <div className="dna-rungs">
        {Array.from({ length: 17 }, (_, index) => {
          const phase = index * 0.74;
          const first = 50 + Math.sin(phase) * 28;
          const second = 50 - Math.sin(phase) * 28;
          const left = Math.min(first, second);
          const width = Math.abs(first - second);
          const opacity = 0.25 + Math.abs(Math.sin(phase)) * 0.65;

          return (
            <span
              className="dna-rung"
              key={index}
              style={
                {
                  "--rung-top": `${5 + index * 5.6}%`,
                  "--rung-left": `${left}%`,
                  "--rung-width": `${Math.max(width, 4)}%`,
                  "--rung-opacity": opacity,
                } as CSSProperties
              }
            >
              <i />
              <b />
            </span>
          );
        })}
      </div>
      <span className="dna-caption">You are still the author.</span>
    </div>
  );
}

function BandGlyph({ band }: { band: number | null }) {
  return (
    <span
      className="band-glyph"
      role="img"
      aria-label={band ? `${band} of 5` : "No score"}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <i
          className={band && index < band ? "is-on" : ""}
          key={index}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function DomainCard({
  domain,
  selected,
  onSelect,
}: {
  domain: DomainScore;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`domain-card ${selected ? "is-selected" : ""}`}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="domain-card-top">
        <span>{GROUP_NAMES[domain.group]}</span>
        <b>{domain.band ?? "—"}</b>
      </span>
      <strong>{domain.name}</strong>
      <span className="domain-band-name">{domain.bandName}</span>
      <BandGlyph band={domain.band} />
      <span className="domain-coverage">
        {domain.calledMarkers}/{domain.totalMarkers} markers
        <i>
          <b style={{ width: percentage(domain.coverage) }} />
        </i>
      </span>
    </button>
  );
}

function MarkerDetail({ marker }: { marker: ProcessedMarker }) {
  return (
    <aside className="marker-detail" aria-live="polite">
      <div className="marker-detail-heading">
        <div>
          <span className="eyebrow">Marker detail</span>
          <h3>
            {marker.gene} <em>{marker.variantId}</em>
          </h3>
        </div>
        <span className={`state-tag state-${marker.state}`}>
          {STATE_LABELS[marker.state]}
        </span>
      </div>

      <div className="marker-call">
        <span>Result</span>
        <strong>{displayGenotype(marker)}</strong>
        {marker.namedVariant ? <em>{marker.namedVariant}</em> : null}
      </div>

      <div className="detail-block">
        <span>What it shapes</span>
        <p>{marker.impact}</p>
      </div>

      <div className="detail-block detail-interpretation">
        <span>Your reading</span>
        <p>{marker.interpretation}</p>
      </div>

      <dl className="marker-facts">
        <div>
          <dt>Evidence</dt>
          <dd>Grade {marker.evidenceGrade}</dd>
        </div>
        <div>
          <dt>Leverage</dt>
          <dd>{marker.leverage ? `${marker.leverage} / 3` : "Excluded"}</dd>
        </div>
        <div>
          <dt>Quality</dt>
          <dd>
            {marker.quality === null
              ? "Not available"
              : percentage(marker.quality)}
          </dd>
        </div>
        <div>
          <dt>Orientation</dt>
          <dd>
            {marker.strandFlipped
              ? "Forward strand resolved"
              : marker.strandAmbiguous
                ? "Ambiguity flagged"
                : "As reported"}
          </dd>
        </div>
      </dl>

      {marker.assayNote ? (
        <div className="assay-note">
          <span>Assay note</span>
          <p>{marker.assayNote}</p>
        </div>
      ) : null}
    </aside>
  );
}

export function ReportDashboard({ report }: { report: GeneReport }) {
  const [activeGroup, setActiveGroup] = useState("movement");
  const [selectedDomainId, setSelectedDomainId] = useState(
    report.priorities[0]?.domainId ?? report.domains[0]?.id,
  );
  const [markerQuery, setMarkerQuery] = useState("");
  const [markerState, setMarkerState] = useState<MarkerState | "all">("all");
  const [evidenceGrade, setEvidenceGrade] = useState("all");
  const [showAllMarkers, setShowAllMarkers] = useState(false);
  const firstCalledMarker =
    report.markers.find((marker) => marker.state === "called") ??
    report.markers[0];
  const [selectedMarkerId, setSelectedMarkerId] = useState(
    firstCalledMarker?.id,
  );

  const evaluatedDomains = report.domains.filter(
    (domain) => domain.band !== null,
  ).length;
  const groupDomains = report.domains.filter(
    (domain) => domain.group === activeGroup,
  );
  const activeDomain =
    groupDomains.find((domain) => domain.id === selectedDomainId) ??
    groupDomains[0];
  const activeDomainMarkers = activeDomain
    ? activeDomain.topMarkerIds
        .map((id) => report.markers.find((marker) => marker.id === id))
        .filter((marker): marker is ProcessedMarker => Boolean(marker))
    : [];

  const filteredMarkers = useMemo(() => {
    const query = markerQuery.trim().toLowerCase();

    return report.markers.filter((marker) => {
      const matchesQuery =
        !query ||
        marker.gene.toLowerCase().includes(query) ||
        marker.variantId.toLowerCase().includes(query) ||
        marker.domainNames.some((name) => name.toLowerCase().includes(query));
      const matchesState =
        markerState === "all" || marker.state === markerState;
      const matchesGrade =
        evidenceGrade === "all" || marker.evidenceGrade === evidenceGrade;

      return matchesQuery && matchesState && matchesGrade;
    });
  }, [evidenceGrade, markerQuery, markerState, report.markers]);

  const visibleMarkers = showAllMarkers
    ? filteredMarkers
    : filteredMarkers.slice(0, 28);
  const selectedMarker =
    report.markers.find((marker) => marker.id === selectedMarkerId) ??
    firstCalledMarker;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#overview" aria-label="SAM home">
          sam<span aria-hidden="true">.</span>
        </a>
        <nav aria-label="Report sections">
          <a href="#overview">Overview</a>
          <a href="#systems">Systems</a>
          <a href="#markers">Markers</a>
          <a href="#method">Method</a>
        </nav>
        <span className="header-status">
          <i aria-hidden="true" />
          Report ready
        </span>
      </header>

      <section className="hero" id="overview">
        <div className="hero-copy">
          <span className="eyebrow eyebrow-light">Your blueprint · Phase 1</span>
          <h1>
            Know what responds.
            <br />
            <em>Spend attention there.</em>
          </h1>
          <p className="hero-lede">
            Your genes are the instrument, not the verdict. SAM reads the
            systems underneath performance, recovery, sleep, and focus—then
            shows you where daily choices carry the most weight.
          </p>
          <div className="member-line">
            <span className="member-avatar">
              {report.profile.firstName[0]}
              {report.profile.lastName[0]}
            </span>
            <div>
              <strong>
                {report.profile.firstName} {report.profile.lastName}
              </strong>
              <span>
                {report.profile.memberNumber} · {report.profile.assayName}
              </span>
            </div>
          </div>
        </div>

        <DnaField />

        <aside className="processing-card">
          <div className="processing-heading">
            <div>
              <span className="eyebrow eyebrow-light">Processing receipt</span>
              <h2>Complete</h2>
            </div>
            <span className="complete-mark" aria-label="Processing complete">
              ✓
            </span>
          </div>
          <div className="processing-steps">
            <div>
              <i>01</i>
              <span>
                <b>Member matched</b>
                Consent active
              </span>
              <em>Done</em>
            </div>
            <div>
              <i>02</i>
              <span>
                <b>{report.receipt.genotypeRows} records read</b>
                From the Phase 1 repository
              </span>
              <em>Done</em>
            </div>
            <div>
              <i>03</i>
              <span>
                <b>{report.receipt.calledMarkers} markers interpreted</b>
                Missing calls excluded
              </span>
              <em>Done</em>
            </div>
            <div>
              <i>04</i>
              <span>
                <b>{evaluatedDomains} systems scored</b>
                Rules {report.receipt.rulesVersion}
              </span>
              <em>Done</em>
            </div>
          </div>
          <div className="receipt-foot">
            <span>
              <i aria-hidden="true" />
              Database-ready source
            </span>
            <time dateTime={report.receipt.processedAt}>
              {reportDate(report.receipt.processedAt)}
            </time>
          </div>
        </aside>
      </section>

      <section className="metric-strip" aria-label="Report summary">
        <div>
          <span>Marker coverage</span>
          <strong>{percentage(report.receipt.overallCoverage)}</strong>
          <small>
            {report.receipt.calledMarkers} of {report.receipt.callableMarkers}
          </small>
        </div>
        <div>
          <span>Systems evaluated</span>
          <strong>
            {evaluatedDomains}
            <em>/{report.domains.length}</em>
          </strong>
          <small>Missing data stays missing</small>
        </div>
        <div>
          <span>Highest-return levers</span>
          <strong>{report.priorities.length}</strong>
          <small>Ranked by score and coverage</small>
        </div>
        <div>
          <span>Guessed results</span>
          <strong>0</strong>
          <small>{report.receipt.unreadableMarkers} calls held for review</small>
        </div>
      </section>

      <section className="content-section priority-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Start here</span>
            <h2>Your highest-return levers.</h2>
          </div>
          <p>
            These are not weaknesses. They are the systems where consistent
            effort has the most room to land.
          </p>
        </div>

        <div className="priority-grid">
          {report.priorities.map((priority, index) => (
            <article className="priority-card" key={priority.domainId}>
              <div className="priority-number">0{index + 1}</div>
              <div className="priority-score">
                <span>{priority.domainName}</span>
                <strong>{priority.band}</strong>
                <em>/ 5</em>
              </div>
              <h3>{priority.title}</h3>
              <p>{priority.description}</p>
              <span className="priority-rationale">{priority.rationale}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section systems-section" id="systems">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your systems</span>
            <h2>The whole picture, without the fog.</h2>
          </div>
          <p>
            A five-band scale shows how much leverage your habits have—not how
            “good” or “bad” your genes are.
          </p>
        </div>

        <div className="group-tabs" role="tablist" aria-label="System groups">
          {report.groups.map((group) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeGroup === group.id}
              key={group.id}
              onClick={() => setActiveGroup(group.id)}
            >
              {group.name}
              <span>{group.domainIds.length}</span>
            </button>
          ))}
        </div>

        <div className="systems-layout">
          <div className="domain-grid">
            {groupDomains.map((domain) => (
              <DomainCard
                domain={domain}
                key={domain.id}
                selected={activeDomain?.id === domain.id}
                onSelect={() => setSelectedDomainId(domain.id)}
              />
            ))}
          </div>

          {activeDomain ? (
            <aside className="domain-detail">
              <span className="domain-detail-group">
                {GROUP_NAMES[activeDomain.group]}
              </span>
              <div className="domain-detail-score">
                <strong>{activeDomain.band ?? "—"}</strong>
                <span>
                  <b>{activeDomain.bandName}</b>
                  <BandGlyph band={activeDomain.band} />
                </span>
              </div>
              <h3>{activeDomain.name}</h3>
              <p>{activeDomain.description}</p>
              <blockquote>{activeDomain.bandSummary}</blockquote>

              <div className="coverage-panel">
                <span>
                  Evidence coverage
                  <b>{percentage(activeDomain.coverage)}</b>
                </span>
                <i>
                  <b style={{ width: percentage(activeDomain.coverage) }} />
                </i>
                <small>
                  {activeDomain.calledMarkers} called ·{" "}
                  {activeDomain.totalMarkers - activeDomain.calledMarkers} not
                  called
                </small>
              </div>

              {activeDomainMarkers.length ? (
                <div className="top-markers">
                  <span>Strongest contributors</span>
                  <div>
                    {activeDomainMarkers.slice(0, 6).map((marker) => (
                      <button
                        type="button"
                        key={marker.id}
                        onClick={() => {
                          setSelectedMarkerId(marker.id);
                          document
                            .getElementById("markers")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        {marker.gene} <em>{marker.variantId}</em>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="no-top-markers">
                  No individual marker reached the top leverage tier in this
                  system.
                </p>
              )}
            </aside>
          ) : null}
        </div>
      </section>

      <section className="content-section marker-section" id="markers">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Marker explorer</span>
            <h2>Every call. Nothing hidden.</h2>
          </div>
          <p>
            Called, missing, unreadable, and withheld results remain visible.
            Only supported calls enter a score.
          </p>
        </div>

        <div className="marker-controls">
          <label className="search-control">
            <span>Search markers</span>
            <input
              type="search"
              value={markerQuery}
              onChange={(event) => {
                setMarkerQuery(event.target.value);
                setShowAllMarkers(false);
              }}
              placeholder="Gene, rsID, or system"
            />
          </label>
          <label>
            <span>Call state</span>
            <select
              value={markerState}
              onChange={(event) => {
                setMarkerState(event.target.value as MarkerState | "all");
                setShowAllMarkers(false);
              }}
            >
              <option value="all">All states</option>
              <option value="called">Called</option>
              <option value="not-called">Not called</option>
              <option value="unreadable">Needs review</option>
              <option value="withheld">Withheld</option>
            </select>
          </label>
          <label>
            <span>Evidence</span>
            <select
              value={evidenceGrade}
              onChange={(event) => {
                setEvidenceGrade(event.target.value);
                setShowAllMarkers(false);
              }}
            >
              <option value="all">All grades</option>
              <option value="A">Grade A</option>
              <option value="B">Grade B</option>
              <option value="C">Grade C</option>
              <option value="D">Grade D</option>
            </select>
          </label>
          <span className="result-count">
            <b>{filteredMarkers.length}</b> markers
          </span>
        </div>

        <div className="marker-layout">
          <div className="marker-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gene / variant</th>
                  <th>Call</th>
                  <th>Evidence</th>
                  <th>System</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleMarkers.map((marker) => (
                  <tr
                    key={marker.id}
                    className={
                      marker.id === selectedMarker?.id ? "is-selected" : ""
                    }
                  >
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedMarkerId(marker.id)}
                        aria-label={`Open ${marker.gene} ${marker.variantId}`}
                      >
                        <strong>{marker.gene}</strong>
                        <span>{marker.variantId}</span>
                      </button>
                    </td>
                    <td className="genotype">
                      {displayGenotype(marker)}
                      {marker.strandFlipped ? <small>resolved</small> : null}
                    </td>
                    <td>
                      <span className={`grade grade-${marker.evidenceGrade}`}>
                        {marker.evidenceGrade}
                      </span>
                    </td>
                    <td>
                      <span className="system-name">
                        {marker.domainNames[0] ?? "Pathway context"}
                      </span>
                    </td>
                    <td>
                      <span className={`state-tag state-${marker.state}`}>
                        {STATE_LABELS[marker.state]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredMarkers.length ? (
              <div className="no-results">
                No marker matches those filters. Nothing has been removed from
                the report.
              </div>
            ) : null}

            {filteredMarkers.length > 28 ? (
              <button
                className="show-more"
                type="button"
                onClick={() => setShowAllMarkers((current) => !current)}
              >
                {showAllMarkers
                  ? "Show first 28"
                  : `Show all ${filteredMarkers.length} markers`}
              </button>
            ) : null}
          </div>

          {selectedMarker ? <MarkerDetail marker={selectedMarker} /> : null}
        </div>
      </section>

      <section className="method-section" id="method">
        <div className="method-inner">
          <div className="section-heading section-heading-light">
            <div>
              <span className="eyebrow eyebrow-light">How Phase 1 works</span>
              <h2>Built for the database handoff.</h2>
            </div>
            <p>
              The processing engine never knows whether records came from a
              fixture, Azure SQL, or another approved source. It receives the
              same typed genotype rows every time.
            </p>
          </div>

          <div className="pipeline" aria-label="Gene report data flow">
            <div>
              <span>01</span>
              <strong>Member record</strong>
              <p>Identity, consent, sample, assay</p>
            </div>
            <i aria-hidden="true">→</i>
            <div className="pipeline-active">
              <span>02</span>
              <strong>Source adapter</strong>
              <p>Seeded now · Azure SQL next</p>
            </div>
            <i aria-hidden="true">→</i>
            <div>
              <span>03</span>
              <strong>Gene engine</strong>
              <p>Normalize, resolve, interpret, score</p>
            </div>
            <i aria-hidden="true">→</i>
            <div>
              <span>04</span>
              <strong>Report contract</strong>
              <p>One API for the interface and services</p>
            </div>
          </div>

          <div className="method-grid">
            <article>
              <span className="method-kicker">Ready now</span>
              <h3>Server-side gene processing</h3>
              <ul>
                <li>158 versioned marker definitions</li>
                <li>Forward-strand resolution with ambiguity flags</li>
                <li>Missing calls excluded from every score</li>
                <li>Composite and X-linked call handling</li>
              </ul>
            </article>
            <article>
              <span className="method-kicker">Production swap</span>
              <h3>Azure data source</h3>
              <ul>
                <li>Replace the Phase 1 repository adapter</li>
                <li>Keep the engine and report interface unchanged</li>
                <li>Use managed identity and private database access</li>
                <li>Retain consent and rules-version audit fields</li>
              </ul>
            </article>
            <article className="api-card">
              <span className="method-kicker">Live contract</span>
              <h3>Report API</h3>
              <p>
                The interface is rendered from the same response future clients
                can consume.
              </p>
              <a
                href={`/api/reports/${report.profile.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open this report as JSON <span aria-hidden="true">↗</span>
              </a>
            </article>
          </div>

          <div className="governance-row">
            <div>
              <span>01</span>
              <p>
                <b>No raw file upload.</b> Phase 1 reads repository records on
                the server.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <b>No silent defaults.</b> Missing and unreadable calls stay
                explicit.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <b>No diagnosis.</b> The report is educational and supports a
                clinician conversation.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <span className="brand">
          sam<span aria-hidden="true">.</span>
        </span>
        <p>Be the author of your DNA.</p>
        <small>
          Educational and wellness use. Not a diagnostic test or a substitute
          for a qualified clinician.
        </small>
      </footer>
    </main>
  );
}
