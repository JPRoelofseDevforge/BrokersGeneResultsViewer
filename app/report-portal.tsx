"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ReferenceReport } from "@/app/reference-report";
import type { GeneReport } from "@/lib/gene-processing/types";
import { GENERIC_BROKER_DAY_PROFILE_NAME } from "@/lib/reports/profile-display";

const REPORT_REQUEST_TIMEOUT_MS = 25_000;

type PortalState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: GeneReport }
  | { status: "error"; title: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CURRENT_PRIMARY_SUPPLEMENT_LIMIT = 5;

const REQUIRED_PRACTITIONER_CHECKLIST = [
  "Practitioner approved",
  "Medication interaction checked",
  "Interaction with current supplements checked",
  "Interaction with other clinician/doctor recommendations checked",
  "Contraindications reviewed",
  "Dose/form confirmed",
] as const;

const REQUIRED_CLINICAL_CONTEXT = [
  "Chronic medication",
  "Prescription medication",
  "Existing supplementation",
  "Medical conditions",
  "Pregnancy or breastfeeding where relevant",
  "Renal impairment where relevant",
  "Hepatic impairment where relevant",
  "Recommendations already made by another healthcare professional",
] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOneToFiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function isSameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => isSameJsonValue(item, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        isSameJsonValue(left[key], right[key]),
    )
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isExactStringList(
  value: unknown,
  expected: readonly string[],
): value is string[] {
  return (
    isStringArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function isRecommendationContributor(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.gene) &&
    isNonEmptyString(value.variantId)
  );
}

function isCurrentSupplementRecommendation(value: unknown) {
  if (!isRecord(value)) return false;

  const measurement = value.measurementGuidance;
  const ranking = value.ranking;

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    value.considerationLabel === "CONSIDER / PRACTITIONER REVIEW" &&
    (value.decision === "food-first" ||
      value.decision === "measure-first" ||
      value.decision === "clinician-only") &&
    (value.eligibilityBasis === "genetic-convergence" ||
      value.eligibilityBasis === "genetic-convergence-plus-age" ||
      value.eligibilityBasis === "safety-review-marker") &&
    isNonEmptyString(value.plainReason) &&
    isNonEmptyString(value.supportingPathway) &&
    isNonEmptyString(value.whatConfirmsNeed) &&
    isNonEmptyString(value.whatRefinesDecision) &&
    isNonEmptyString(value.referenceAmount) &&
    isNonEmptyString(value.preferredForm) &&
    isNonEmptyString(value.formRationale) &&
    isNonEmptyString(value.timing) &&
    isNonEmptyString(value.timingRationale) &&
    isNonEmptyString(value.duration) &&
    isNonEmptyString(value.foodFirst) &&
    isStringArray(value.checksBeforeStarting) &&
    isStringArray(value.interactionWarnings) &&
    isNonEmptyString(value.medicationInteractionCheck) &&
    isNonEmptyString(value.currentSupplementInteractionCheck) &&
    isStringArray(value.contraindications) &&
    isRecord(measurement) &&
    typeof measurement.advisable === "boolean" &&
    (measurement.status === "not-routinely-needed" ||
      measurement.status === "clinically-indicated" ||
      measurement.status === "required-before-implementation") &&
    isNonEmptyString(measurement.baseline) &&
    isNonEmptyString(measurement.followUp) &&
    value.practitionerApprovalRequired === true &&
    isExactStringList(
      value.practitionerChecklist,
      REQUIRED_PRACTITIONER_CHECKLIST,
    ) &&
    isExactStringList(
      value.clinicalContextChecklist,
      REQUIRED_CLINICAL_CONTEXT,
    ) &&
    typeof value.ageStrengthened === "boolean" &&
    (value.ageContext === null || isNonEmptyString(value.ageContext)) &&
    isNonEmptyString(value.ageConsiderations) &&
    isNonEmptyString(value.review) &&
    isFiniteNumber(value.score) &&
    value.score >= 0 &&
    isRecord(ranking) &&
    Number.isInteger(ranking.rank) &&
    (ranking.rank as number) > 0 &&
    isFiniteNumber(ranking.geneticRationaleScore) &&
    ranking.geneticRationaleScore >= 0 &&
    ranking.geneticRationaleScore === value.score &&
    isOneToFiveInteger(ranking.clinicalRelevance) &&
    isOneToFiveInteger(ranking.safetyPriority) &&
    isOneToFiveInteger(ranking.actionability) &&
    isStringArray(value.domainIds) &&
    value.domainIds.length > 0 &&
    Array.isArray(value.contributors) &&
    value.contributors.length > 0 &&
    value.contributors.every(isRecommendationContributor) &&
    isStringArray(value.executiveFitnessIds)
  );
}

function isCurrentSupplementPlan(value: unknown) {
  if (!isRecord(value)) return false;

  const primaryItems = value.primaryItems;
  const additionalItems = value.additionalItems;
  const items = value.items;

  if (
    !isNonEmptyString(value.rulesVersion) ||
    (value.outcome !== "review-ready" && value.outcome !== "none") ||
    !isNonEmptyString(value.framing) ||
    !isExactStringList(
      value.practitionerChecklist,
      REQUIRED_PRACTITIONER_CHECKLIST,
    ) ||
    !isExactStringList(
      value.clinicalContextChecklist,
      REQUIRED_CLINICAL_CONTEXT,
    ) ||
    value.primaryLimit !== CURRENT_PRIMARY_SUPPLEMENT_LIMIT ||
    !Array.isArray(primaryItems) ||
    !Array.isArray(additionalItems) ||
    !Array.isArray(items) ||
    !primaryItems.every(isCurrentSupplementRecommendation) ||
    !additionalItems.every(isCurrentSupplementRecommendation) ||
    !items.every(isCurrentSupplementRecommendation)
  ) {
    return false;
  }

  const primaryLimit = CURRENT_PRIMARY_SUPPLEMENT_LIMIT;
  const combinedItems = [...primaryItems, ...additionalItems];
  const expectedPrimaryCount = Math.min(primaryLimit, items.length);
  const itemIds = items.map((item) => (item as Record<string, unknown>).id);
  const combinedIds = combinedItems.map(
    (item) => (item as Record<string, unknown>).id,
  );

  return (
    primaryItems.length === expectedPrimaryCount &&
    additionalItems.length === items.length - expectedPrimaryCount &&
    new Set(itemIds).size === itemIds.length &&
    itemIds.every((id, index) => id === combinedIds[index]) &&
    combinedItems.every((item, index) => isSameJsonValue(item, items[index])) &&
    items.every(
      (item, index) =>
        ((item as Record<string, unknown>).ranking as Record<string, unknown>)
          .rank ===
        index + 1,
    ) &&
    ((items.length === 0 && value.outcome === "none") ||
      (items.length > 0 && value.outcome === "review-ready"))
  );
}

export function isGeneReport(value: unknown): value is GeneReport {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRecord(value.profile) &&
    Array.isArray(value.domains) &&
    Array.isArray(value.markers) &&
    Array.isArray(value.priorities) &&
    isRecord(value.recommendations) &&
    Array.isArray(value.recommendations.safety) &&
    Array.isArray(value.recommendations.actions) &&
    Array.isArray(value.recommendations.measurements) &&
    Array.isArray(value.recommendations.nearThreshold) &&
    isCurrentSupplementPlan(value.recommendations.supplements) &&
    Array.isArray(value.groups)
  );
}

function matchedPersonName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.person)) return null;
  const displayName = value.person.displayName;
  if (typeof displayName !== "string") return null;

  const name = displayName.trim();
  return name &&
    name.length <= 200 &&
    name !== GENERIC_BROKER_DAY_PROFILE_NAME
    ? name
    : null;
}

function AccessState({
  state,
}: {
  state: Exclude<PortalState, { status: "ready" }>;
}) {
  const loading = state.status === "loading";
  const statusText = loading ? "Secure lookup in progress" : "Encrypted access";
  const [showCloseHelp, setShowCloseHelp] = useState(false);

  return (
    <main className="access-shell">
      <header className="site-header">
        <Link
          className="sam-logo"
          href="/"
          aria-label="Return to SAM gene results"
        >
          <Image
            className="sam-logo-image"
            src="/brand/sam-logo-ink.svg"
            alt="SAM"
            width={1080}
            height={298}
            priority
            unoptimized
          />
        </Link>
        <span className="header-status">
          <i aria-hidden="true" />
          {statusText}
        </span>
      </header>

      <section className="access-panel" aria-labelledby="access-title">
        <div className="access-copy">
          <p className="eyebrow">Private gene report</p>
          <h1 id="access-title">
            Your blueprint,
            <br />
            clearly.
          </h1>
          <p>
            Open this report from your SAM Broker Day profile. The encrypted
            link identifies the approved report record without putting your
            email in the address.
          </p>
          <div className="access-privacy">
            <span aria-hidden="true" />
            Encrypted link / No browser storage
          </div>
        </div>

        <div
          className="access-status-card"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading ? (
            <>
              <span className="access-loader" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <p className="eyebrow">Opening your report</p>
              <h2>Gathering your gene results…</h2>
              <p>This usually takes only a moment.</p>
            </>
          ) : state.status === "error" ? (
            <>
              <p className="eyebrow">We could not open this report</p>
              <h2>{state.title}</h2>
              <p>{state.message}</p>
              <button
                className="quiet-button"
                type="button"
                onClick={() => {
                  window.close();
                  window.setTimeout(() => setShowCloseHelp(true), 150);
                }}
              >
                Close this tab
              </button>
              {showCloseHelp ? (
                <p className="close-help" role="status">
                  If this tab stays open, close it using your browser and return
                  to your SAM profile.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="eyebrow">Ready when you are</p>
              <h2>Open your gene report from Broker Day.</h2>
              <p>
                Use the private Intelligene link in your SAM profile when your
                result is marked ready.
              </p>
            </>
          )}
        </div>
      </section>

      <footer className="site-footer">
        <span>SAM / Gene results</span>
        <span>Private / Encrypted / No-store</span>
      </footer>
    </main>
  );
}

export function ReportPortal({
  previewEnabled,
}: {
  previewEnabled: boolean;
}) {
  const [state, setState] = useState<PortalState>({ status: "idle" });

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
    if (!token && !previewEnabled) return;

    const controller = new AbortController();
    let timeoutTimer: number | undefined;
    let timedOut = false;

    const requestTimer = window.setTimeout(async () => {
      if (token) {
        window.history.replaceState(
          {},
          document.title,
          `${url.pathname}${url.search}`,
        );
      }
      setState({ status: "loading" });
      timeoutTimer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REPORT_REQUEST_TIMEOUT_MS);

      try {
        const response = token
          ? await fetch("/api/reports/resolve", {
              method: "POST",
              cache: "no-store",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ token }),
              signal: controller.signal,
            })
          : await fetch("/api/reports/sam-240184", {
              cache: "no-store",
              headers: { Accept: "application/json" },
              signal: controller.signal,
            });

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = null;
        }

        const report =
          token &&
          isRecord(body) &&
          body.ok === true &&
          isGeneReport(body.data)
            ? body.data
            : !token && isGeneReport(body)
              ? body
              : null;

        if (response.ok && report) {
          setState({ status: "ready", report });
          return;
        }

        if (response.status === 400) {
          setState({
            status: "error",
            title: "Link unavailable",
            message:
              "This private link is invalid or has expired. Return to your SAM profile for a fresh link.",
          });
          return;
        }

        if (response.status === 404) {
          const personName = matchedPersonName(body);
          setState({
            status: "error",
            title: personName ? `Welcome, ${personName}.` : "No matching report",
            message: personName
              ? "Your private gene profile was matched, but its approved report is not ready yet."
              : "No approved gene report is ready for this profile yet.",
          });
          return;
        }

        setState({
          status: "error",
          title: "Report temporarily unavailable",
          message:
            "The gene report service is not ready right now. Please try again shortly.",
        });
      } catch {
        if (controller.signal.aborted && !timedOut) return;

        if (!controller.signal.aborted) {
          setState({
            status: "error",
            title: "Could not reach the report",
            message:
              "Check your connection and open the private link from your SAM profile again.",
          });
        } else {
          setState({
            status: "error",
            title: "Report lookup timed out",
            message:
              "Return to your SAM profile and try opening the report again.",
          });
        }
      } finally {
        if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);
      }
    }, 0);

    return () => {
      window.clearTimeout(requestTimer);
      if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);
      controller.abort();
    };
  }, [previewEnabled]);

  if (state.status === "ready") {
    return <ReferenceReport key={state.report.id} report={state.report} />;
  }

  return <AccessState state={state} />;
}
