"use client";

import Image from "next/image";
import { useMemo, useState, type CSSProperties } from "react";

import type {
  DomainScore,
  GeneReport,
  MarkerState,
  ProcessedMarker,
  SupplementRecommendation,
  WholeReportRecommendation,
} from "@/lib/gene-processing/types";
import {
  reportDisplayName,
  reportInitials,
} from "@/lib/reports/profile-display";

const LogoImage =
  ((Image as unknown as { default?: typeof Image }).default ?? Image) as typeof Image;

const STATE_LABELS: Record<MarkerState, string> = {
  called: "Called",
  "not-called": "Not called",
  unmapped: "Stored / unscored",
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

const NEAR_THRESHOLD_LABELS: Record<
  GeneReport["recommendations"]["nearThreshold"][number]["reason"],
  string
> = {
  "below-threshold": "The combined score stayed below the threshold.",
  "too-few-markers": "Too few independent markers supported it.",
  "display-cap": "It qualified, but ranked below this section's display cap.",
};

function percentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

function readyRatio(count: number) {
  return count > 0 ? `${count}/${count}` : "—";
}

function readyPercentage(count: number) {
  return count > 0 ? "100%" : "—";
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
        {readyRatio(domain.calledMarkers)} markers ready
        <i>
          <b style={{ width: readyPercentage(domain.calledMarkers) }} />
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
          <dd>
            {marker.evidenceGrade === "ungraded"
              ? "Not graded"
              : `Grade ${marker.evidenceGrade}`}
          </dd>
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

function recommendationGenes(recommendation: WholeReportRecommendation) {
  return Array.from(
    new Set(recommendation.contributors.map((contributor) => contributor.gene)),
  ).join(" · ");
}

function RecommendationCard({
  recommendation,
  index,
}: {
  recommendation: WholeReportRecommendation;
  index: number;
}) {
  return (
    <article className="necessary-card">
      <div className="necessary-card-top">
        <span className="necessary-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="necessary-kind">
          {recommendation.kind === "measurement"
            ? "Worth measuring"
            : recommendation.kind}
        </span>
        {recommendation.canUnlock ? (
          <span className="unlock-pill">Can unlock a next step</span>
        ) : null}
      </div>
      <h3>{recommendation.title}</h3>
      <div className="necessary-copy">
        <div>
          <span>Why you</span>
          <p>{recommendation.why}</p>
        </div>
        <div>
          <span>How</span>
          <p>{recommendation.how}</p>
        </div>
      </div>
      <div className="necessary-evidence">
        <strong>
          {recommendation.contributors.length}{" "}
          {recommendation.contributors.length === 1 ? "marker" : "markers"} ·{" "}
          {recommendation.domainIds.length}{" "}
          {recommendation.domainIds.length === 1 ? "system" : "systems"}
        </strong>
        <span>{recommendationGenes(recommendation)}</span>
      </div>
      {recommendation.canUnlock ? (
        <p className="necessary-note">
          <b>Can unlock:</b> {recommendation.canUnlock}
        </p>
      ) : null}
      {recommendation.note ? (
        <p className="necessary-note">{recommendation.note}</p>
      ) : null}
    </article>
  );
}

function supplementAgeConsiderations(item: SupplementRecommendation) {
  return item.ageConsiderations;
}

function supplementMeasurementStatus(
  status: SupplementRecommendation["measurementGuidance"]["status"],
) {
  if (status === "required-before-implementation") {
    return "Required before implementation";
  }
  if (status === "clinically-indicated") {
    return "Only when clinically indicated, not routinely from DNA alone";
  }
  return "Not routinely needed";
}

function SupplementReviewCard({
  item,
  report,
  tier,
}: {
  item: SupplementRecommendation;
  report: GeneReport;
  tier: "Primary" | "Additional";
}) {
  const domains = item.domainIds
    .map(
      (domainId) =>
        report.domains.find((domain) => domain.id === domainId)?.name ??
        domainId,
    )
    .join(" · ");
  const contributors = item.contributors
    .map((contributor) => `${contributor.gene} ${contributor.variantId}`)
    .join(" · ");
  const clinicianGated = item.decision === "clinician-only";

  return (
    <article
      className="necessary-card supplement-review-card"
      data-supplement-tier={tier.toLowerCase()}
    >
      <div className="necessary-card-top">
        <span className="necessary-kind">{tier} consideration</span>
        <span className="unlock-pill">{item.considerationLabel}</span>
      </div>

      <span className="eyebrow">Supplement / nutrient</span>
      <h3>{item.name}</h3>
      <p>
        <b>Reason for practitioner review:</b> {item.plainReason}
      </p>
      <p className="necessary-note">
        <b>Review route:</b> {item.decision.replaceAll("-", " ")} ·{" "}
        {item.eligibilityBasis.replaceAll("-", " ")}
      </p>

      <div className="necessary-copy">
        <div>
          <span>Supporting genetic markers / pathway</span>
          <p>{item.supportingPathway}</p>
          <small>{contributors || "Called-marker convergence"}</small>
        </div>
        <div>
          <span>Relevant SAM systems / domains</span>
          <p>{domains || "Cross-system review"}</p>
          <small>
            Rank {item.ranking.rank} · genetic rationale{" "}
            {item.ranking.geneticRationaleScore} · clinical relevance{" "}
            {item.ranking.clinicalRelevance}/5 · safety priority{" "}
            {item.ranking.safetyPriority}/5 · actionability{" "}
            {item.ranking.actionability}/5
          </small>
        </div>
      </div>

      {clinicianGated ? (
        <p className="necessary-note">
          <b>Clinician-gated — do not initiate independently.</b> Genetics may
          trigger investigation and practitioner consideration, but it does
          not determine the dose, form, route, or whether this item should be
          started.
        </p>
      ) : null}

      <div className="necessary-copy">
        <div>
          <span>Form context — if approved</span>
          <p>{item.preferredForm}</p>
          <small>
            <b>Why this form:</b> {item.formRationale}
          </small>
        </div>
        <div>
          <span>Timing context — if approved</span>
          <p>{item.timing}</p>
          <small>
            <b>Why this timing:</b> {item.timingRationale}
          </small>
        </div>
      </div>

      <div className="necessary-copy">
        <div>
          <span>Age considerations</span>
          <p>{supplementAgeConsiderations(item)}</p>
        </div>
        <div>
          <span>Population nutrition context — not a prescribed dose</span>
          <p>{item.referenceAmount}</p>
        </div>
      </div>

      <div className="necessary-copy">
        <div>
          <span>Food-first context</span>
          <p>{item.foodFirst}</p>
        </div>
        <div>
          <span>Review interval — if approved</span>
          <p>{item.duration}</p>
        </div>
      </div>

      <div className="necessary-copy">
        <div>
          <span>What can refine the decision</span>
          <p>{item.whatRefinesDecision}</p>
        </div>
        <div>
          <span>Checks before implementation</span>
          <ul>
            {item.checksBeforeStarting.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="necessary-copy">
        <div>
          <span>Medication interaction check</span>
          <p>{item.medicationInteractionCheck}</p>
        </div>
        <div>
          <span>Current supplement interaction check</span>
          <p>{item.currentSupplementInteractionCheck}</p>
        </div>
      </div>

      <div className="necessary-copy">
        <div>
          <span>Contraindications / safety cautions</span>
          <ul>
            {item.contraindications.map((caution) => (
              <li key={caution}>{caution}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>Important interactions</span>
          <ul>
            {item.interactionWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="necessary-copy">
        <div>
          <span>Baseline and follow-up measurement</span>
          <p>
            <b>Status:</b>{" "}
            {supplementMeasurementStatus(item.measurementGuidance.status)}
          </p>
          <p>
            <b>Baseline:</b> {item.measurementGuidance.baseline}
          </p>
          <p>
            <b>Follow-up:</b> {item.measurementGuidance.followUp}
          </p>
        </div>
        <div>
          <span>Practitioner approval required</span>
          <p>
            <b>{item.practitionerApprovalRequired ? "Yes." : "No."}</b>{" "}
            Implementation waits until every applicable check is reviewed and
            practitioner approval is recorded.
          </p>
          <ul>
            {item.practitionerChecklist.map((check) => (
              <li key={check}>☐ {check}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="necessary-copy">
        <div>
          <span>Clinical context the practitioner must consider</span>
          <ul>
            {item.clinicalContextChecklist.map((check) => (
              <li key={check}>☐ {check}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>Follow-up review</span>
          <p>{item.review}</p>
        </div>
      </div>
    </article>
  );
}

export function ReportDashboard({ report }: { report: GeneReport }) {
  const firstReadyGroup =
    report.groups.find((group) =>
      report.domains.some(
        (domain) => domain.group === group.id && domain.calledMarkers > 0,
      ),
    )?.id ?? "movement";
  const [activeGroup, setActiveGroup] = useState(firstReadyGroup);
  const [selectedDomainId, setSelectedDomainId] = useState(
    report.priorities[0]?.domainId ?? report.domains[0]?.id,
  );
  const [markerQuery, setMarkerQuery] = useState("");
  const [evidenceGrade, setEvidenceGrade] = useState("all");
  const [showAllMarkers, setShowAllMarkers] = useState(false);
  const firstVisibleMarker =
    report.markers.find((marker) => marker.state === "called");
  const [selectedMarkerId, setSelectedMarkerId] = useState(
    firstVisibleMarker?.id,
  );

  const evaluatedDomains = report.domains.filter(
    (domain) => domain.band !== null,
  ).length;
  const groupDomains = report.domains.filter(
    (domain) => domain.group === activeGroup && domain.calledMarkers > 0,
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
      if (marker.state !== "called") return false;
      const matchesQuery =
        !query ||
        marker.gene.toLowerCase().includes(query) ||
        marker.variantId.toLowerCase().includes(query) ||
        marker.domainNames.some((name) => name.toLowerCase().includes(query));
      const matchesGrade =
        evidenceGrade === "all" || marker.evidenceGrade === evidenceGrade;

      return matchesQuery && matchesGrade;
    });
  }, [evidenceGrade, markerQuery, report.markers]);

  const visibleMarkers = showAllMarkers
    ? filteredMarkers
    : filteredMarkers.slice(0, 28);
  const selectedMarker =
    report.markers.find(
      (marker) =>
        marker.id === selectedMarkerId && marker.state === "called",
    ) ?? firstVisibleMarker;
  const memberName = reportDisplayName(report.profile);
  const supplementPlan = report.recommendations.supplements;
  const primarySupplements = supplementPlan.primaryItems;
  const additionalSupplements = supplementPlan.additionalItems;

  return (
    <main>
      <header className="site-header">
        <a className="sam-logo" href="#overview" aria-label="Return to the top of your SAM gene report">
          <LogoImage
            className="sam-logo-image"
            src="/brand/sam-logo-ink.svg"
            alt="SAM"
            width={1080}
            height={298}
            priority
            unoptimized
          />
        </a>
        <nav aria-label="Report sections">
          <a href="#overview">Overview</a>
          <a href="#necessary">What&apos;s necessary</a>
          <a href="#systems">Systems</a>
          <a href="#markers">Markers</a>
        </nav>
        <span className="header-status">
          <i aria-hidden="true" />
          Gene report ready
        </span>
      </header>

      <section className="hero" id="overview">
        <div className="hero-copy">
          <span className="eyebrow eyebrow-light">
            Private Intelligene profile · Phase 1
          </span>
          <h1>
            {memberName ? (
              <>
                Welcome,
                <br />
                <em>{memberName}.</em>
              </>
            ) : (
              <>
                Your gene report,
                <br />
                <em>clearly.</em>
              </>
            )}
          </h1>
          <p className="hero-lede">
            Your genes are the instrument, not the verdict. SAM reads the
            systems underneath performance, recovery, sleep, and focus—then
            shows you where daily choices carry the most weight.
          </p>
          <div className="member-line">
            <span className="member-avatar">
              {reportInitials(report.profile)}
            </span>
            <div>
              <strong>{memberName ?? "Your gene report"}</strong>
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
                Report access enabled
              </span>
              <em>Done</em>
            </div>
            <div>
              <i>02</i>
              <span>
                <b>{report.receipt.genotypeRows} records read</b>
                From {report.receipt.sourceLabel}
              </span>
              <em>Done</em>
            </div>
            <div>
              <i>03</i>
              <span>
                <b>
                  {readyRatio(report.receipt.calledMarkers)} markers ready
                </b>
                All ready markers processed
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
              {report.receipt.source === "azure-sql"
                ? "Protected database source"
                : "Repository source"}
            </span>
            <time dateTime={report.receipt.processedAt}>
              {reportDate(report.receipt.processedAt)}
            </time>
          </div>
        </aside>
      </section>

      <section className="metric-strip" aria-label="Report summary">
        <div>
          <span>Markers ready</span>
          <strong>{readyPercentage(report.receipt.calledMarkers)}</strong>
          <small>
            {readyRatio(report.receipt.calledMarkers)}
          </small>
        </div>
        <div>
          <span>Systems evaluated</span>
          <strong>
            {evaluatedDomains}
            <em>/{evaluatedDomains}</em>
          </strong>
          <small>All ready systems processed</small>
        </div>
        <div>
          <span>Whole-report actions</span>
          <strong>{report.recommendations.actions.length}</strong>
          <small>Qualified by score and distinct called markers</small>
        </div>
        <div>
          <span>Report status</span>
          <strong>Ready</strong>
          <small>100% of the ready set</small>
        </div>
      </section>

      <section className="content-section necessary-section" id="necessary">
        <div className="section-heading">
          <div>
            <span className="eyebrow">What&apos;s necessary</span>
            <h2>One conclusion, drawn from the whole report.</h2>
          </div>
          <p>
            No marker recommends anything by itself. For actions, SAM looks for
            places where several results across different systems point at the
            same thing, then keeps the list short. Short is the point.
          </p>
        </div>

        {report.recommendations.safety.length ? (
          <div className="safety-recommendations">
            <div className="tier-heading">
              <span>Before anything else</span>
              <p>These results are worth taking into a clinician conversation.</p>
            </div>
            {report.recommendations.safety.map((item) => (
              <article className="safety-recommendation" key={item.id}>
                <span>Safety note</span>
                <h3>{item.title}</h3>
                <p>{item.why}</p>
                <strong>{item.how}</strong>
                <small>
                  Based on {item.contributor.gene} {item.contributor.variantId}
                </small>
              </article>
            ))}
            <p className="safety-footnote">
              A genetic result is not a diagnosis. It is a reason to ask a
              better question with the right professional.
            </p>
          </div>
        ) : null}

        <div className="necessary-tier">
          <div className="tier-heading">
            <span>Tier one · Do</span>
            <p>
              A deliberately small set of behaviours and foods supported by
              several independent results.
            </p>
          </div>
          {report.recommendations.actions.length ? (
            <div className="necessary-grid">
              {report.recommendations.actions.map((recommendation, index) => (
                <RecommendationCard
                  recommendation={recommendation}
                  index={index}
                  key={recommendation.id}
                />
              ))}
            </div>
          ) : (
            <div className="necessary-empty">
              <h3>No extra personalised action was selected.</h3>
              <p>
                Keep the foundations already shown in your report. SAM adds an
                action only when the ready results make it useful.
              </p>
            </div>
          )}
        </div>

        <div className="necessary-tier">
          <div className="tier-heading">
            <span>Tier two · Know</span>
            <p>
              Measurements that could replace uncertainty with an actual
              number. These are discussion prompts, not diagnoses.
            </p>
          </div>
          {report.recommendations.measurements.length ? (
            <div className="necessary-grid measurement-grid">
              {report.recommendations.measurements.map(
                (recommendation, index) => (
                  <RecommendationCard
                    recommendation={recommendation}
                    index={index}
                    key={recommendation.id}
                  />
                ),
              )}
            </div>
          ) : (
            <div className="necessary-empty">
              <h3>No extra measurement earned a place.</h3>
              <p>
                Your ready results did not justify adding a test to this short
                list.
              </p>
            </div>
          )}
        </div>

        <div className="supplement-lock">
          <div>
            <span className="eyebrow">Tier three · Genetics-guided review</span>
            <h3>
              {supplementPlan.items.length
                ? `${supplementPlan.items.length} nutrients earned a closer look.`
                : "No nutrient reached the approved review threshold."}
            </h3>
            <p>
              <b>
                Do not start any supplement from this report without recorded
                practitioner approval.
              </b>{" "}
              Cross-gene convergence can raise a practitioner review before a
              food gap, laboratory abnormality, or symptom is documented. Each
              candidate still requires interaction, contraindication, dose,
              form, and practitioner approval checks. Amounts are general adult
              references, not doses calculated from DNA.
            </p>
          </div>
          <div
            className="locked-gates"
            aria-label="Genetics-guided supplement review"
          >
            {primarySupplements.map((item) => (
              <span key={item.id}>
                <i aria-hidden="true">•</i>
                {item.name}
                <small>Primary · {item.considerationLabel}</small>
              </span>
            ))}
            {additionalSupplements.map((item) => (
              <span key={item.id}>
                <i aria-hidden="true">•</i>
                {item.name}
                <small>Additional Supplement Consideration · {item.considerationLabel}</small>
              </span>
            ))}
          </div>
        </div>

        {primarySupplements.length ? (
          <div className="necessary-tier supplement-review-tier">
            <div className="tier-heading">
              <span>Primary Supplement Considerations</span>
              <p>
                Ranked by genetic rationale, clinical relevance, safety
                priority, and actionability. Every item remains a practitioner
                review—not a prescription.
              </p>
            </div>
            <div className="necessary-grid">
              {primarySupplements.map((item) => (
                <SupplementReviewCard
                  item={item}
                  report={report}
                  tier="Primary"
                  key={item.id}
                />
              ))}
            </div>
          </div>
        ) : null}

        {additionalSupplements.length ? (
          <div className="necessary-tier supplement-review-tier">
            <div className="tier-heading">
              <span>Additional Supplement Considerations</span>
              <p>
                These items also qualified. They are separated only because
                they ranked below the primary display limit; none has been
                omitted.
              </p>
            </div>
            <div className="necessary-grid">
              {additionalSupplements.map((item) => (
                <SupplementReviewCard
                  item={item}
                  report={report}
                  tier="Additional"
                  key={item.id}
                />
              ))}
            </div>
          </div>
        ) : null}

        {report.recommendations.nearThreshold.length ? (
          <details className="near-threshold">
            <summary>
              Practitioner audit — supported candidates not displayed
              <span>{report.recommendations.nearThreshold.length}</span>
            </summary>
            <p className="tier-intro">
              Every genetically supported candidate excluded by a threshold or
              display cap remains listed here with its score and reason.
            </p>
            <div>
              {report.recommendations.nearThreshold.map((item) => (
                <article className="near-threshold-row" key={item.id}>
                  <div>
                    <span>{item.kind}</span>
                    <strong>{item.title}</strong>
                  </div>
                  <p>{NEAR_THRESHOLD_LABELS[item.reason]}</p>
                  <small>
                    Score {item.score} ·{" "}
                    {item.contributorCount}{" "}
                    {item.contributorCount === 1 ? "marker" : "markers"} ·{" "}
                    {item.domainCount}{" "}
                    {item.domainCount === 1 ? "system" : "systems"}
                  </small>
                  <small>
                    {item.contributors
                      .map(
                        (contributor) =>
                          `${contributor.gene} ${contributor.variantId}`,
                      )
                      .join(" · ")}
                  </small>
                </article>
              ))}
            </div>
          </details>
        ) : null}

        <details className="synthesis-method">
          <summary>How this short list was made</summary>
          <p>
            SAM uses only called, interpretable results. Each matching marker
            contributes (leverage minus one) multiplied by the rule weight. A
            tier-one behaviour or food needs score 3 and three distinct markers.
            A tier-two measurement needs score 2 and two distinct markers.
            Systems are reported for context, and the 3 behaviour, 2 food and 5
            measurement display caps never remove an item from the practitioner
            audit.
          </p>
          <small>
            Recommendation rules {report.recommendations.rulesVersion}
          </small>
        </details>

        <aside className="honest-summary">
          <span>The honest summary</span>
          <strong>
            {report.recommendations.actions.length}{" "}
            {report.recommendations.actions.length === 1 ? "thing" : "things"}{" "}
            worth doing · {report.recommendations.measurements.length}{" "}
            {report.recommendations.measurements.length === 1
              ? "number"
              : "numbers"}{" "}
            worth having
          </strong>
          <p>
            This report is educational. It cannot diagnose a condition or
            replace advice based on your history, examination, and measured
            results.
          </p>
        </aside>
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
          {report.groups.filter((group) =>
            report.domains.some(
              (domain) =>
                domain.group === group.id && domain.calledMarkers > 0,
            ),
          ).map((group) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeGroup === group.id}
              key={group.id}
              onClick={() => setActiveGroup(group.id)}
            >
              {group.name}
              <span>
                {
                  report.domains.filter(
                    (domain) =>
                      domain.group === group.id && domain.calledMarkers > 0,
                  ).length
                }
              </span>
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
                  Markers ready
                  <b>{readyPercentage(activeDomain.calledMarkers)}</b>
                </span>
                <i>
                  <b style={{ width: readyPercentage(activeDomain.calledMarkers) }} />
                </i>
                <small>
                  {readyRatio(activeDomain.calledMarkers)} ready markers
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
            <h2>Every ready result.</h2>
          </div>
          <p>
            Only completed, interpretable marker results are included in the
            member report.
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
              <option value="ungraded">Not graded</option>
            </select>
          </label>
          <span className="result-count">
            <b>{filteredMarkers.length}</b> shown · {readyRatio(report.receipt.calledMarkers)} markers ready
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
                        {marker.evidenceGrade === "ungraded"
                          ? "—"
                          : marker.evidenceGrade}
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
                No returned marker matches those filters.
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

      <aside className="report-privacy" aria-labelledby="privacy-title">
        <p className="eyebrow">Privacy note</p>
        <h2 id="privacy-title">This view is temporary.</h2>
        <p>
          Access uses the same encrypted, expiring link pattern as your Broker
          Day profile, without saving the report in browser storage. Close the
          tab when you are finished, especially on a shared device.
        </p>
      </aside>

      <footer className="site-footer">
        <span>SAM / Gene results</span>
        <span>Private / Educational</span>
      </footer>
    </main>
  );
}
