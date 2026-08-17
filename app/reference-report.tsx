"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import referenceSource from "@/sam_report-15.html?raw";
import type { GeneReport } from "@/lib/gene-processing/types";
import {
  buildReferenceReportPayload,
  REFERENCE_REPORT_MESSAGE,
} from "@/lib/reports/reference-report-payload";

const REFERENCE_READY_MESSAGE = "sam-reference-ready";

const DATABASE_ADAPTER = String.raw`
<style>
  html.sam-db-mode #p-blueprint > .wrap[style*="padding-top"] > .grid.g2 {
    display: none !important;
  }
  html.sam-db-mode #summary {
    margin-top: 0 !important;
  }
  #samDbReceipt {
    margin: 0 0 52px;
  }
  #samDbReceipt .db-lock {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--ink-70);
  }
  #samDbReceipt .db-lock::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sage);
    box-shadow: 0 0 0 4px rgba(151,165,135,.16);
  }
  #samDbReceipt .db-profile {
    border-color: var(--sage);
    background: rgba(151,165,135,.13);
  }
  #samDbReceipt .db-meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0;
    margin-top: 16px;
    border-top: 1px solid var(--ink-14);
  }
  #samDbReceipt .db-meta > div {
    padding: 13px 14px 0 0;
  }
  #samDbReceipt .db-meta > div:nth-child(even) {
    padding-left: 14px;
    border-left: 1px solid var(--ink-14);
  }
  #samDbReceipt .db-meta b {
    display: block;
    margin-top: 3px;
    overflow-wrap: anywhere;
  }
  .sam-phase-note {
    margin-bottom: 22px;
  }
  .sam-integration-disabled {
    opacity: .62;
    cursor: not-allowed !important;
  }
  html.sam-db-mode #manifest,
  html.sam-db-mode #drop,
  html.sam-db-mode #demoSport,
  html.sam-db-mode #demoFull,
  html.sam-db-mode #demoDummy,
  html.sam-db-mode #clearAll,
  html.sam-db-mode .tab[data-p="raw"],
  html.sam-db-mode #p-raw,
  html.sam-db-mode [data-audit-export],
  html.sam-db-mode button[onclick="doPrint('doc')"],
  html.sam-db-mode button[onclick="doPrint('raw')"],
  html.sam-db-mode label[for="file"],
  html.sam-db-mode label[for="annot"],
  html.sam-db-mode label[for="manFile"],
  html.sam-db-mode label[for="pathFile"],
  html.sam-db-mode button[onclick*="makeDays"] {
    display: none !important;
  }
  @media(max-width:640px) {
    #samDbReceipt .db-meta {
      grid-template-columns: 1fr;
    }
    #samDbReceipt .db-meta > div,
    #samDbReceipt .db-meta > div:nth-child(even) {
      padding: 12px 0;
      border-left: 0;
      border-bottom: 1px solid var(--ink-14);
    }
  }
</style>
<script>
(function () {
  "use strict";

  var serverResults = Object.create(null);
  var serverLedger = null;
  var serverDomains = Object.create(null);
  var serverPriorities = [];
  var serverRecommendations = null;
  var serverMode = false;
  var originalBuildSupps = buildSupps;
  var originalBuildRoadmap = buildRoadmap;
  var originalBuildSexPanel = buildSexPanel;
  var originalBuildLedger = buildLedger;
  var originalBuildPathology = buildPathology;
  var originalBuildConverge = buildConverge;
  var originalBuildDashboard = buildDashboard;
  var originalBuildNecessary = buildNecessary;
  var originalComputeDomains = computeDomains;
  var originalBuildPrint = typeof buildPrint === "function" ? buildPrint : null;
  var originalAnswer = typeof answer === "function" ? answer : null;
  var originalSuppState = typeof suppState === "function" ? suppState : null;
  var originalBuildRaw = buildRaw;
  var originalBuildTable = buildTable;
  var originalFindMarker = findM;
  var originalSetFlip = typeof setFlip === "function" ? setFlip : null;
  var originalOpenOverride = typeof openOverride === "function" ? openOverride : null;
  var originalCommitOverride = typeof commitOverride === "function" ? commitOverride : null;
  var activeReportKey = null;
  var sourceOnlyMarkerCount = 0;
  window.SAM_ACTIVE_SUPPLEMENTS = [];

  function safe(value) {
    return esc(String(value == null ? "" : value));
  }

  function verifiedSex() {
    var sex = String((STATE.person && STATE.person.sex) || "").toLowerCase();
    return sex === "f" || sex === "m" ? sex : null;
  }

  function serverMarkerResult(marker) {
    var result = serverResults[marker.g + ":" + marker.rs];
    if (!result) return { state: "nocall" };

    if (result.state === "unmapped") {
      return {
        state: "unmapped",
        gt: result.rawGenotype || result.genotype || "—",
        note: result.interpretation || "Stored from the source and excluded from every score."
      };
    }

    if (result.state === "withheld") {
      return {
        state: "withheld",
        note: result.interpretation || "This result is withheld by policy."
      };
    }

    if (result.state === "unreadable") {
      return {
        state: "unreadable",
        gt: result.genotype || result.rawGenotype || "—",
        flip: !!result.strandFlipped,
        amb: !!result.strandAmbiguous
      };
    }

    if (result.state !== "called" || !result.genotype) {
      return { state: "nocall" };
    }

    var leverage = Number(result.leverage);
    if (!Number.isFinite(leverage) || leverage < 0 || leverage > 3) {
      return {
        state: "unreadable",
        gt: result.genotype,
        note: "The processing service did not return a valid leverage value, so this result is excluded from scoring."
      };
    }

    return {
      state: "ok",
      gt: result.genotype,
      lev: leverage,
      txt: result.interpretation || "Result returned by the approved processing service.",
      flip: !!result.strandFlipped,
      amb: !!result.strandAmbiguous
    };
  }

  markerResult = serverMarkerResult;

  computeDomains = function () {
    var computed = originalComputeDomains();
    if (!serverMode) return computed;

    Object.keys(serverDomains).forEach(function (domainId) {
      var authoritative = serverDomains[domainId];
      var target = computed[domainId];
      if (!authoritative || !target) return;
      target.n = authoritative.calledMarkers;
      target.tot = authoritative.totalMarkers;
      target.band = authoritative.band;
      target.mean = authoritative.averageLeverage;
      target.score = authoritative.bandScore;
      target.conf = authoritative.coverage;
    });
    STATE.dom = computed;
    return computed;
  };

  function markerKey(gene, variantId) {
    return (String(gene || "") + ":" + String(variantId || "")).toLowerCase();
  }

  function appendSourceOnlyMarkers(payload) {
    for (var index = MARKERS.length - 1; index >= 0; index -= 1) {
      if (MARKERS[index] && MARKERS[index]._samSourceOnly) MARKERS.splice(index, 1);
    }

    var existing = Object.create(null);
    MARKERS.forEach(function (marker) {
      existing[markerKey(marker.g, marker.rs)] = true;
    });

    sourceOnlyMarkerCount = 0;
    (payload.unmappedMarkers || []).forEach(function (sourceMarker) {
      if (!sourceMarker || sourceMarker.state !== "unmapped") return;
      sourceOnlyMarkerCount += 1;
      if (existing[markerKey(sourceMarker.gene, sourceMarker.variantId)]) return;

      MARKERS.push({
        g: sourceMarker.gene || "Unmapped",
        rs: sourceMarker.variantId || "unknown source marker",
        al: sourceMarker.expectedAlleles || "unknown",
        d: [],
        gr: "ungraded",
        w: sourceMarker.interpretation || "Stored from the approved source without a catalogue definition.",
        as: sourceMarker.assayNote || "Source-only row. Retained for visibility and excluded from all scoring.",
        gt: {},
        ref: false,
        _samSourceOnly: true
      });
      existing[markerKey(sourceMarker.gene, sourceMarker.variantId)] = true;
    });
  }

  function annotateSourceOnlyRows() {
    if (!serverMode) return;
    var stats = document.getElementById("rawStats");
    if (stats) {
      var first = stats.firstElementChild;
      var firstLabel = first && first.querySelector(".eyebrow");
      var firstNote = first && first.querySelector("p");
      if (firstLabel) firstLabel.textContent = "Panel + source rows";
      if (firstNote) firstNote.textContent = "Catalogue markers plus source-only calls retained without interpretation or scoring.";
      if (sourceOnlyMarkerCount && !document.getElementById("samSourceOnlyStat")) {
        var card = document.createElement("div");
        card.id = "samSourceOnlyStat";
        card.className = "card";
        card.innerHTML = '<span class="eyebrow q">Stored / unscored</span><div class="scoreN" style="margin:10px 0 6px">' + safe(sourceOnlyMarkerCount) + '</div><p class="tiny muted" style="margin:0">Returned by the approved source, preserved verbatim, and excluded from every score.</p>';
        stats.appendChild(card);
      }
    }
  }

  buildRaw = function () {
    originalBuildRaw();
    annotateSourceOnlyRows();
  };

  function annotateSourceOnlyMarkerTable() {
    if (!serverMode) return;
    var body = document.getElementById("mBody");
    if (!body) return;
    body.querySelectorAll("tr").forEach(function (row) {
      if (row.dataset.samSourceOnly === "true") return;
      var cells = row.children;
      if (cells.length < 6) return;
      var gene = cells[0].querySelector("b");
      var key = (gene ? gene.textContent : cells[0].textContent || "").trim() + ":" + (cells[1].textContent || "").trim();
      var result = serverResults[key];
      if (!result || result.state !== "unmapped") return;
      row.dataset.samSourceOnly = "true";
      cells[3].innerHTML = '<span class="pill">stored / unscored</span>';
      cells[4].textContent = result.interpretation || "Source call retained verbatim without a catalogue interpretation or score.";
    });
  }

  function observeSourceOnlyMarkerTable() {
    var body = document.getElementById("mBody");
    if (!body || body.dataset.samSourceObserver === "true") return;
    body.dataset.samSourceObserver = "true";
    new MutationObserver(annotateSourceOnlyMarkerTable).observe(body, {
      childList: true
    });
  }

  buildTable = function () {
    originalBuildTable();
    annotateSourceOnlyMarkerTable();
    observeSourceOnlyMarkerTable();
  };

  if (originalSetFlip) {
    setFlip = function (value) {
      if (serverMode) return;
      originalSetFlip(value);
    };
  }
  if (originalOpenOverride) {
    openOverride = function (key) {
      if (serverMode) return;
      originalOpenOverride(key);
    };
  }
  if (originalCommitOverride) {
    commitOverride = function (key) {
      if (serverMode) return;
      originalCommitOverride(key);
    };
  }

  function applyServerLedgerCounts() {
    if (!serverLedger || typeof STATUSES === "undefined") return;
    var rows = document.querySelectorAll("#ledger table tbody tr");
    STATUSES.forEach(function (status, index) {
      var row = rows[index];
      var cell = row && row.lastElementChild;
      if (!cell || !Object.prototype.hasOwnProperty.call(serverLedger, status.k)) return;
      cell.textContent = String(serverLedger[status.k]);
    });
  }

  function presentMemberLedger() {
    if (!serverMode) {
      applyServerLedgerCounts();
      return;
    }
    var table = document.querySelector("#ledger table");
    if (!table) return;
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (row) {
      var cell = row.lastElementChild;
      if (cell) cell.style.display = "none";
    });
  }

  buildLedger = function () {
    originalBuildLedger();
    presentMemberLedger();
  };

  findM = function (reference) {
    var matched = originalFindMarker(reference);
    if (matched) return matched;
    var key = String(reference || "").trim().toLowerCase();
    return MARKERS.find(function (marker) {
      return (
        (marker.g + " " + marker.rs).toLowerCase() === key ||
        (marker.g + ":" + marker.rs).toLowerCase() === key
      );
    });
  };

  function contributorLabel(item) {
    return (item.contributors || []).map(function (contributor) {
      return contributor.gene + " " + contributor.variantId;
    }).join(", ");
  }

  function recommendationExclusionLabel(reason) {
    if (reason === "too-few-markers") return "Too few distinct called markers";
    if (reason === "below-threshold") return "Score below the eligibility threshold";
    if (reason === "display-cap") return "Eligible, but below this section's display cap";
    return "Not selected by the approved rule";
  }

  function supplementPlanItems(plan) {
    if (!plan) return [];
    if (Array.isArray(plan.items)) return plan.items;
    return (Array.isArray(plan.primaryItems) ? plan.primaryItems : []).concat(
      Array.isArray(plan.additionalItems) ? plan.additionalItems : []
    );
  }

  function supplementPrimaryItems(plan) {
    if (plan && Array.isArray(plan.primaryItems)) return plan.primaryItems;
    return supplementPlanItems(plan).slice(0, Number(plan && plan.primaryLimit) || 5);
  }

  function supplementAdditionalItems(plan) {
    if (plan && Array.isArray(plan.additionalItems)) return plan.additionalItems;
    return supplementPlanItems(plan).slice(Number(plan && plan.primaryLimit) || 5);
  }

  function supplementDomainLabel(item) {
    return (item.domainIds || []).map(function (domainId) {
      var domain = serverDomains[domainId];
      return domain && domain.name ? domain.name : domainId;
    }).join(", ");
  }

  function recommendationCards(items) {
    if (!items || !items.length) {
      return '<div class="card"><h4>Nothing reached the approved threshold.</h4><p class="small muted" style="margin:8px 0 0">The server did not find enough independent, called markers to justify an item in this tier.</p></div>';
    }
    return items.map(function (item) {
      var contributors = contributorLabel(item);
      return '<div class="card stack">' +
        '<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><h4 style="margin:0;font-family:var(--disp);font-size:19px">' + safe(item.title) + '</h4><span class="pill s">server approved</span></div>' +
        '<p class="small" style="margin:0;color:var(--ink)"><b>Why:</b> ' + safe(item.why) + '</p>' +
        '<p class="small muted" style="margin:0"><b>How:</b> ' + safe(item.how) + '</p>' +
        (contributors ? '<p class="tiny" style="margin:0;color:var(--blood)">Contributors: ' + safe(contributors) + '</p>' : '') +
        (item.note ? '<p class="tiny muted" style="margin:0">' + safe(item.note) + '</p>' : '') +
      '</div>';
    }).join("");
  }

  function renderServerNecessary() {
    var host = document.getElementById("necessary");
    if (!host || !serverRecommendations) return;
    var safety = serverRecommendations.safety || [];
    var actions = serverRecommendations.actions || [];
    var measurements = serverRecommendations.measurements || [];
    var near = serverRecommendations.nearThreshold || [];
    var supplementPlan = serverRecommendations.supplements || { items: [] };
    var supplementItems = supplementPlanItems(supplementPlan);
    var priorityCopy = serverPriorities.length
      ? '<p class="tiny muted" style="margin:12px 0 0">Primary systems: ' + safe(serverPriorities.map(function (item) { return item.domainName; }).join(", ")) + '.</p>'
      : '';

    host.innerHTML =
      '<div class="notice sage"><b>Server-authoritative recommendations.</b> Every item below was produced with rules ' + safe(serverRecommendations.rulesVersion) + ' from called markers in this private report. Browser intake and pathology previews cannot add an item to these tiers.</div>' +
      (safety.length ? '<div class="sechead" style="margin-top:34px"><span class="eyebrow">Before anything else</span><span class="rule"></span></div>' + safety.map(function (item) {
        return '<div class="notice" style="margin-top:12px"><h4 style="margin:0 0 8px">' + safe(item.title) + '</h4><p class="small" style="margin:0 0 8px">' + safe(item.why) + '</p><p class="small" style="margin:0"><b>What to do:</b> ' + safe(item.how) + '</p></div>';
      }).join("") : '') +
      '<div class="sechead" style="margin-top:40px"><span class="eyebrow">Tier one — actions</span><span class="rule"></span><span class="mono tiny muted">' + safe(actions.length) + '</span></div>' +
      '<div class="grid g2" style="margin-top:20px">' + recommendationCards(actions) + '</div>' +
      '<div class="sechead" style="margin-top:48px"><span class="eyebrow">Tier two — worth measuring</span><span class="rule"></span><span class="mono tiny muted">' + safe(measurements.length) + '</span></div>' +
      '<div class="grid g2" style="margin-top:20px">' + recommendationCards(measurements) + '</div>' +
      '<div class="notice sage" style="margin-top:34px"><b>Do not start any supplement from this report without recorded practitioner approval.</b> ' + safe(supplementItems.length) + ' genetics-guided supplement ' + (supplementItems.length === 1 ? 'review is' : 'reviews are') + ' ready. These are server-selected practitioner-review candidates, not proof of deficiency or personal prescriptions. Open the Supplements tab for the rationale, age context, general adult reference, timing context, interaction warnings and approval checklist.<div style="margin-top:12px"><button class="btn blood sm" id="samOpenSupplements" type="button">Open supplement details</button></div></div>' +
      (near.length ? '<details class="how" style="margin-top:28px"><summary>Practitioner audit — supported candidates not displayed (' + safe(near.length) + ')</summary><div class="howbody"><p class="small muted" style="margin-top:0">Every genetically supported behaviour, food or measurement excluded by a threshold or display cap remains here for review.</p>' + near.map(function (item) {
        var auditContributors = contributorLabel(item);
        return '<div class="kv"><span><b>' + safe(item.title) + '</b><br><span class="tiny muted">Score ' + safe(item.score) + ' · ' + safe(item.contributorCount) + ' called markers across ' + safe(item.domainCount) + ' SAM systems' + (auditContributors ? '<br>' + safe(auditContributors) : '') + '</span></span><span class="pill">' + safe(recommendationExclusionLabel(item.reason)) + '</span></div>';
      }).join("") + '</div></details>' : '') +
      priorityCopy;
    var supplementButton = document.getElementById("samOpenSupplements");
    if (supplementButton) supplementButton.addEventListener("click", function () { go("supplements"); });
  }

  buildNecessary = function () {
    if (serverMode && serverRecommendations) {
      renderServerNecessary();
      return;
    }
    originalBuildNecessary();
  };

  if (originalSuppState) {
    suppState = function (item) {
      if (!serverMode) return originalSuppState(item);
      return {
        st: "unknown",
        why: "The private report uses only its server-authoritative supplement plan. Browser intake and pathology cannot add or remove an item."
      };
    };
  }

  function supplementDecisionLabel(decision) {
    if (decision === "food-first") return "nutrition-informed review";
    if (decision === "measure-first") return "measurement-informed review";
    return "clinician-only review";
  }

  function supplementAgeConsiderations(item) {
    return item.ageConsiderations || item.ageContext || "No age-based escalation was applied to this practitioner review. Genetics remains the reason it is being considered.";
  }

  function supplementMeasurementStatusLabel(guidance) {
    if (guidance && guidance.status === "required-before-implementation") return "Required before implementation";
    if (guidance && guidance.status === "clinically-indicated") return "Only when clinically indicated, not routinely from DNA alone";
    if (guidance && guidance.status === "not-routinely-needed") return "Not routinely needed";
    return guidance && guidance.advisable ? "Only when clinically indicated, not routinely from DNA alone" : "Not routinely needed";
  }

  function supplementChecklistHtml(item) {
    var checklist = Array.isArray(item.practitionerChecklist) ? item.practitionerChecklist : [];
    return '<div class="card flat" style="padding:16px;border-color:var(--blood)"><span class="eyebrow">Practitioner Review Checklist</span>' +
      '<p class="tiny muted" style="margin:8px 0 12px">Implementation waits until every applicable item has been reviewed and practitioner approval is recorded.</p>' +
      '<div class="stack" style="gap:7px">' + checklist.map(function (check) {
        return '<div class="small" style="display:flex;gap:9px;align-items:flex-start"><span aria-hidden="true" style="font-size:17px;line-height:1">&#9744;</span><span>' + safe(check) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function supplementContextHtml(item) {
    var contexts = Array.isArray(item.clinicalContextChecklist) ? item.clinicalContextChecklist : [];
    if (!contexts.length) return '';
    return '<details class="how" style="margin-top:0"><summary>Clinical context the practitioner must consider</summary><div class="howbody"><ul style="margin:0;padding-left:20px">' +
      contexts.map(function (context) { return '<li>' + safe(context) + '</li>'; }).join('') +
      '</ul></div></details>';
  }

  function supplementWarningsHtml(item) {
    var warnings = Array.isArray(item.interactionWarnings) ? item.interactionWarnings : [];
    if (!warnings.length) return '';
    return '<div class="notice" style="margin:0;border-color:var(--blood)"><b>Important interaction warnings</b><ul style="margin:9px 0 0;padding-left:20px">' +
      warnings.map(function (warning) { return '<li>' + safe(warning) + '</li>'; }).join('') +
      '</ul></div>';
  }

  function supplementContraindicationsHtml(item) {
    var cautions = Array.isArray(item.contraindications) ? item.contraindications : [];
    if (!cautions.length) return '';
    return '<div class="notice" style="margin:0;border-color:var(--blood)"><b>Contraindications and safety cautions</b><ul style="margin:9px 0 0;padding-left:20px">' +
      cautions.map(function (caution) { return '<li>' + safe(caution) + '</li>'; }).join('') +
      '</ul></div>';
  }

  function supplementMeasurementHtml(item) {
    var guidance = item.measurementGuidance || {};
    return '<div class="card flat" style="padding:16px"><span class="eyebrow">Baseline and follow-up measurement</span>' +
      '<p class="small" style="margin:8px 0 6px"><b>Measurement status:</b> ' + safe(supplementMeasurementStatusLabel(guidance)) + '</p>' +
      '<p class="small" style="margin:0 0 6px"><b>Baseline:</b> ' + safe(guidance.baseline || item.whatRefinesDecision || item.whatConfirmsNeed) + '</p>' +
      '<p class="small" style="margin:0"><b>Follow-up:</b> ' + safe(guidance.followUp || item.review) + '</p></div>';
  }

  function supplementCard(item) {
    var contributors = contributorLabel(item);
    var domains = supplementDomainLabel(item);
    var checks = Array.isArray(item.checksBeforeStarting) ? item.checksBeforeStarting : [];
    var ranking = item.ranking || {};
    var clinicianGate = item.decision === "clinician-only"
      ? '<div class="notice" style="margin:0;border-color:var(--blood)"><b>Clinician-gated — do not initiate independently.</b> Genetics may trigger investigation and practitioner consideration, but it does not determine the dose, form, route or whether this item should be started.</div>'
      : '';
    return '<article class="card stack" id="supplement-' + safe(item.id) + '" tabindex="-1" style="border-color:' + (item.decision === "clinician-only" ? 'var(--blood)' : 'var(--ink-14)') + '">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap"><div><span class="eyebrow">Supplement / nutrient</span><h3 style="margin:8px 0 0">' + safe(item.name) + '</h3></div><div style="display:flex;gap:7px;flex-wrap:wrap"><span class="pill b">' + safe(item.considerationLabel || 'CONSIDER / PRACTITIONER REVIEW') + '</span><span class="pill ' + (item.decision === "food-first" ? 's' : item.decision === "clinician-only" ? 'b' : '') + '">' + safe(supplementDecisionLabel(item.decision)) + '</span></div></div>' +
      '<p class="small" style="margin:0"><b>Reason for practitioner review:</b> ' + safe(item.plainReason) + '</p>' +
      '<div class="card flat" style="padding:14px"><p class="small" style="margin:0 0 6px"><b>Supporting genetic markers / pathway:</b> ' + safe(item.supportingPathway || 'Called-marker convergence') + '</p>' +
        (contributors ? '<p class="tiny" style="margin:0 0 6px;color:var(--blood)"><b>Called markers:</b> ' + safe(contributors) + '</p>' : '') +
        '<p class="tiny" style="margin:0"><b>Relevant SAM systems / domains:</b> ' + safe(domains || 'Cross-system review') + '</p>' +
        '<p class="tiny muted" style="margin:6px 0 0"><b>Ranking:</b> genetic rationale ' + safe(item.score) + (ranking.rank ? ' · rank ' + safe(ranking.rank) : '') + (ranking.clinicalRelevance ? ' · clinical relevance ' + safe(ranking.clinicalRelevance) + '/5' : '') + (ranking.safetyPriority ? ' · safety priority ' + safe(ranking.safetyPriority) + '/5' : '') + (ranking.actionability ? ' · actionability ' + safe(ranking.actionability) + '/5' : '') + ' · basis ' + safe(item.eligibilityBasis || 'genetic-convergence') + '</p></div>' +
      clinicianGate +
      '<div class="notice sage" style="margin:0"><b>Age considerations</b><br>' + safe(supplementAgeConsiderations(item)) + '</div>' +
      '<div class="grid g2" style="gap:12px">' +
        '<div class="notice sage" style="margin:0"><b>What can refine the decision</b><br>' + safe(item.whatRefinesDecision || item.whatConfirmsNeed) + '</div>' +
        '<div class="notice" style="margin:0"><b>Population nutrition context — not your prescribed dose</b><br>' + safe(item.referenceAmount) + '</div>' +
      '</div>' +
      '<div class="grid g2" style="gap:12px">' +
        '<div class="card flat" style="padding:14px"><span class="eyebrow q">Form context — if approved</span><p class="small" style="margin:7px 0 0">' + safe(item.preferredForm || 'No genotype-selected form.') + '</p><p class="tiny muted" style="margin:7px 0 0"><b>Why:</b> ' + safe(item.formRationale || 'Form is selected from clinical context, not DNA alone.') + '</p></div>' +
        '<div class="card flat" style="padding:14px"><span class="eyebrow q">Timing context — if approved</span><p class="small" style="margin:7px 0 0">' + safe(item.timing) + '</p><p class="tiny muted" style="margin:7px 0 0"><b>Why:</b> ' + safe(item.timingRationale || 'No genotype-selected time of day.') + '</p></div>' +
      '</div>' +
      '<div class="card flat" style="padding:14px"><span class="eyebrow q">Review interval — if approved</span><p class="small" style="margin:7px 0 0">' + safe(item.duration) + '</p></div>' +
      '<div class="grid g2" style="gap:12px"><div class="card flat" style="padding:14px"><span class="eyebrow">Medication interaction check</span><p class="small" style="margin:7px 0 0">' + safe(item.medicationInteractionCheck || 'Practitioner or pharmacist review required.') + '</p></div>' +
        '<div class="card flat" style="padding:14px"><span class="eyebrow">Current supplement interaction check</span><p class="small" style="margin:7px 0 0">' + safe(item.currentSupplementInteractionCheck || 'Review total intake from every current product.') + '</p></div></div>' +
      supplementWarningsHtml(item) +
      supplementContraindicationsHtml(item) +
      supplementMeasurementHtml(item) +
      '<details class="how" style="margin-top:0"><summary>Food context and additional safety checks</summary><div class="howbody"><p><b>Food context:</b> ' + safe(item.foodFirst) + '</p>' +
        (checks.length ? '<p style="margin-bottom:6px"><b>Before implementation:</b></p><ul style="margin:0;padding-left:20px">' + checks.map(function (check) { return '<li>' + safe(check) + '</li>'; }).join('') + '</ul>' : '') +
        '<p style="margin:12px 0 0"><b>Review rule:</b> ' + safe(item.review) + '</p></div></details>' +
      supplementContextHtml(item) +
      supplementChecklistHtml(item) +
    '</article>';
  }

  function renderDatabaseSupplements() {
    var host = document.getElementById("supps");
    if (!host) return;
    var plan = serverRecommendations && serverRecommendations.supplements;
    var items = supplementPlanItems(plan);
    var primaryItems = supplementPrimaryItems(plan);
    var additionalItems = supplementAdditionalItems(plan);
    window.SAM_ACTIVE_SUPPLEMENTS = items;
    if (!items.length) {
      host.innerHTML = '<div class="notice sage"><b>No genetics-guided supplement review is available.</b> ' + safe((plan && plan.framing) || 'No item reached the approved threshold. Only completed, interpretable markers can contribute.') + ' Keep ordinary food, sleep and movement foundations in place, and use measured clinical advice for any suspected deficiency.</div>';
      return;
    }
    host.innerHTML =
      '<div class="notice sage"><b>Do not start any supplement from this report without recorded practitioner approval.</b> Genetics can raise a practitioner review before a food gap, abnormal laboratory result or symptom is documented. ' + safe(plan.framing || 'Called markers decide what deserves a closer look.') + ' These are not automatic prescriptions. Amounts below are general adult references, never a dose calculated from DNA.</div>' +
      '<div class="sechead" style="margin-top:34px"><span class="eyebrow">Primary Supplement Considerations</span><span class="rule"></span><span class="mono tiny muted">' + safe(primaryItems.length) + ' primary · rules ' + safe(plan.rulesVersion || serverRecommendations.rulesVersion) + '</span></div>' +
      '<p class="small muted" style="margin:10px 0 0">Ranked by genetic rationale, clinical relevance, safety priority and actionability. Every item remains subject to practitioner review.</p>' +
      '<div class="stack" style="margin-top:20px">' + primaryItems.map(supplementCard).join('') + '</div>' +
      (additionalItems.length ? '<div class="sechead" style="margin-top:46px"><span class="eyebrow">Additional Supplement Considerations</span><span class="rule"></span><span class="mono tiny muted">' + safe(additionalItems.length) + ' additional</span></div><p class="small muted" style="margin:10px 0 0">These recommendations are also eligible. They are shown separately only because they ranked below the primary clinician-report display limit; none has been silently removed.</p><div class="stack" style="margin-top:20px">' + additionalItems.map(supplementCard).join('') + '</div>' : '') +
      '<div class="notice" style="margin-top:24px"><b>Do not start any supplement from this report without recorded practitioner approval.</b> A genetic result cannot establish a deficiency. Iron, vitamin B12 and combined folate/B12 reviews are clinician-gated and must not be initiated independently. If you are pregnant, breastfeeding, under 18, have kidney or liver disease, use prescription medicines, or have a complex medical history, take this list to a qualified clinician or pharmacist before using a product.</div>';
  }

  buildSupps = function () {
    if (serverMode) {
      renderDatabaseSupplements();
      return;
    }
    originalBuildSupps();
  };

  function serverSupplementPrintRows(items, startIndex) {
    if (!items.length) {
      return '<p class="small">No supplement review reached the approved genetic convergence threshold.</p>';
    }
    return '<p class="small"><b>Do not start any supplement from this report without recorded practitioner approval.</b> Genetics and age can raise a review item without a documented food gap, laboratory abnormality or symptom. These entries are not prescriptions and the amounts are general adult references.</p>' +
      items.map(function (item, index) {
        var warnings = Array.isArray(item.interactionWarnings) ? item.interactionWarnings : [];
        var contraindications = Array.isArray(item.contraindications) ? item.contraindications : [];
        var checks = Array.isArray(item.checksBeforeStarting) ? item.checksBeforeStarting : [];
        var contexts = Array.isArray(item.clinicalContextChecklist) ? item.clinicalContextChecklist : [];
        var checklist = Array.isArray(item.practitionerChecklist) ? item.practitionerChecklist : [];
        var guidance = item.measurementGuidance || {};
        var contributors = contributorLabel(item);
        var domains = supplementDomainLabel(item);
        return '<div style="border:1px solid #b9b3a8;border-radius:10px;padding:14px;margin:12px 0;page-break-inside:avoid">' +
          '<h4 style="font-size:14px;margin:0 0 8px">' + safe((startIndex || 0) + index + 1) + ' · ' + safe(item.name) + ' — ' + safe(item.considerationLabel || 'CONSIDER / PRACTITIONER REVIEW') + '</h4>' +
          (item.decision === "clinician-only" ? '<p class="small" style="border-left:3px solid #b64b2a;padding-left:9px"><b>Clinician-gated — do not initiate independently.</b> Genetics does not determine dose, form, route or start.</p>' : '') +
          '<p class="small"><b>Reason for practitioner review:</b> ' + safe(item.plainReason) + '<br><b>Supporting pathway:</b> ' + safe(item.supportingPathway) + '<br><b>Called markers:</b> ' + safe(contributors) + '<br><b>SAM systems / domains:</b> ' + safe(domains) + '<br><b>Ranking:</b> genetic rationale ' + safe(item.score) + ' · clinical relevance ' + safe((item.ranking || {}).clinicalRelevance) + '/5 · safety priority ' + safe((item.ranking || {}).safetyPriority) + '/5 · actionability ' + safe((item.ranking || {}).actionability) + '/5</p>' +
          '<p class="small"><b>Age considerations:</b> ' + safe(supplementAgeConsiderations(item)) + '</p>' +
          '<p class="small"><b>What can refine the decision:</b> ' + safe(item.whatRefinesDecision || item.whatConfirmsNeed) + '</p>' +
          '<p class="small"><b>Population nutrition context — not a prescribed dose:</b> ' + safe(item.referenceAmount) + '<br><b>Form context — if approved:</b> ' + safe(item.preferredForm) + '<br><b>Why this form:</b> ' + safe(item.formRationale) + '<br><b>Timing context — if approved:</b> ' + safe(item.timing) + '<br><b>Why this timing:</b> ' + safe(item.timingRationale) + '<br><b>Review interval — if approved:</b> ' + safe(item.duration) + ' ' + safe(item.review) + '</p>' +
          '<p class="small"><b>Food context:</b> ' + safe(item.foodFirst) + '</p>' +
          '<p class="small"><b>Medication interaction check:</b> ' + safe(item.medicationInteractionCheck) + '<br><b>Current supplement interaction check:</b> ' + safe(item.currentSupplementInteractionCheck) + '</p>' +
          (warnings.length ? '<p class="small" style="border-left:3px solid #b64b2a;padding-left:9px"><b>Important interaction warnings:</b><br>' + warnings.map(safe).join('<br>') + '</p>' : '') +
          (contraindications.length ? '<p class="small"><b>Contraindications / safety cautions:</b><br>' + contraindications.map(safe).join('<br>') + '</p>' : '') +
          '<p class="small"><b>Measurement status:</b> ' + safe(supplementMeasurementStatusLabel(guidance)) + '<br><b>Baseline:</b> ' + safe(guidance.baseline || item.whatRefinesDecision || item.whatConfirmsNeed) + '<br><b>Follow-up:</b> ' + safe(guidance.followUp || item.review) + '</p>' +
          (checks.length ? '<p class="small"><b>Before implementation:</b><br>' + checks.map(safe).join('<br>') + '</p>' : '') +
          (contexts.length ? '<p class="tiny"><b>Clinical context to consider:</b> ' + contexts.map(safe).join(' · ') + '</p>' : '') +
          '<p class="small"><b>Practitioner Review Checklist</b><br>' + checklist.map(function (check) { return '&#9744; ' + safe(check); }).join('<br>') + '</p>' +
        '</div>';
      }).join('');
  }

  function serverRecommendationAuditPrintRows() {
    var audit = serverRecommendations && Array.isArray(serverRecommendations.nearThreshold)
      ? serverRecommendations.nearThreshold
      : [];
    if (!audit.length) return '';
    return '<h4 style="font-size:14px;margin:20px 0 8px">Behaviour, food and measurement ranking audit</h4><p class="small">Every genetically supported candidate not selected for the primary lists is retained below with its score and exclusion reason.</p>' +
      audit.map(function (item) {
        return '<p class="small" style="border-top:1px solid #d8d2c7;padding-top:8px"><b>' + safe(item.title) + '</b> · score ' + safe(item.score) + ' · ' + safe(recommendationExclusionLabel(item.reason)) + '<br><span class="tiny">' + safe(contributorLabel(item)) + '</span></p>';
      }).join('');
  }

  function injectServerSupplementPrint(html, mode) {
    var plan = serverRecommendations && serverRecommendations.supplements;
    var primaryItems = supplementPrimaryItems(plan);
    var additionalItems = supplementAdditionalItems(plan);
    var supplementSections = '<h4 style="font-size:14px;margin:12px 0 6px">Primary Supplement Considerations</h4>' + serverSupplementPrintRows(primaryItems, 0) +
      (additionalItems.length ? '<h4 style="font-size:14px;margin:20px 0 6px">Additional Supplement Considerations</h4><p class="small">These eligible recommendations ranked below the primary display limit and remain included for practitioner review.</p>' + serverSupplementPrintRows(additionalItems, primaryItems.length) : '') +
      serverRecommendationAuditPrintRows();
    var section = mode === "doc"
      ? '<h3 style="font-size:15px;margin:20px 0 6px">3 · Supplement Considerations — Practitioner Review Checklist</h3>' + supplementSections
      : '<h3 style="font-size:16px;margin:22px 0 6px">Supplement Considerations — Practitioner Review Checklist</h3>' + supplementSections;
    if (mode === "doc") {
      return html.replace(
        /<h3 style="font-size:15px;margin:20px 0 6px">3 · Supplements currently recommended<\/h3>[\s\S]*?(?=<h3 style="font-size:15px;margin:20px 0 6px">4 · Findings)/,
        section,
      );
    }
    return html.replace(
      /<h3 style="font-size:16px;margin:22px 0 6px">Supplements with an established gap<\/h3>[\s\S]*?(?=<h3 style="font-size:16px;margin:22px 0 6px">Bloods to ask for<\/h3>)/,
      section,
    );
  }

  if (originalBuildPrint) {
    buildPrint = function (mode) {
      if (!serverMode) return originalBuildPrint(mode);
      if (mode === "raw") return buildPrint("doc") + rawAppendix();
      return injectServerSupplementPrint(originalBuildPrint(mode), mode);
    };
  }

  function supplementQuestionRoute(question) {
    var text = String(question || "").toLowerCase();
    var supported = [];
    var unsupported = [];
    function add(list, value) {
      if (list.indexOf(value) === -1) list.push(value);
    }
    if (/\biron\b/.test(text)) add(supported, "iron");
    if (/\b(?:vitamin\s*)?b[-\s]?12\b|\bcobalamin\b/.test(text)) add(supported, "vitamin-b12");
    if (/\bfolate\b|\bfolic acid\b|\bvitamin[-\s]?b9\b|\bb9\b/.test(text)) add(supported, "folate");
    if (/\bomega[-\s]?3\b|\bfish oil\b|\bepa\b|\bdha\b/.test(text)) add(supported, "omega-3");
    if (/\bcholine\b|\bphosphatidylcholine\b|\blecithin\b/.test(text)) add(supported, "choline");
    if (/\bvitamin[-\s]?d3?\b|\bvit(?:amin)?\s+d3?\b|\bd3\b/.test(text)) add(supported, "vitamin-d");
    [
      ["magnesium", /\bmagnesium\b/],
      ["calcium", /\bcalcium\b/],
      ["vitamin A", /\bvitamin[-\s]?a\b|\bretinol\b|\bbeta[-\s]?carotene\b/],
      ["vitamin C", /\bvitamin[-\s]?c\b|\bascorbic acid\b/],
      ["vitamin E", /\bvitamin[-\s]?e\b|\btocopherol\b/],
      ["vitamin K", /\bvitamin[-\s]?k(?:1|2)?\b|\bk1\b|\bk2\b/],
      ["B-complex", /\bb[-\s]?complex\b/],
      ["vitamin B1", /\bvitamin[-\s]?b1\b|\bthiamine\b/],
      ["vitamin B2", /\bvitamin[-\s]?b2\b|\briboflavin\b/],
      ["vitamin B3", /\bvitamin[-\s]?b3\b|\bniacin\b/],
      ["vitamin B5", /\bvitamin[-\s]?b5\b|\bpantothenic acid\b/],
      ["vitamin B6", /\bvitamin[-\s]?b6\b|\bpyridoxine\b/],
      ["vitamin B7", /\bvitamin[-\s]?b7\b|\bbiotin\b/],
      ["zinc", /\bzinc\b/],
      ["selenium", /\bselenium\b/],
      ["copper", /\bcopper\b/],
      ["iodine", /\biodine\b|\biodide\b/],
      ["potassium", /\bpotassium\b/],
      ["multivitamin", /\bmultivitamin\b/],
      ["creatine", /\bcreatine\b/],
      ["glycine", /\bglycine\b/],
      ["sulforaphane", /\bsulforaphane\b/],
      ["DAO", /\bdao\b/]
    ].forEach(function (entry) {
      if (entry[1].test(text)) add(unsupported, entry[0]);
    });
    var genericCatalogueQuestion = /\b(?:what|which|show|list)\b[^?]{0,50}\bsupplements?\b[^?]{0,50}\b(?:recommend|recommended|active|available|report|raised|consider)/.test(text) ||
      /\b(?:recommended|active|available)\s+supplements?\b/.test(text);
    var genericSupplementObject = /\b(?:take|use|add|try)\s+(?:an?\s+|any\s+|some\s+)?supplements?\b/.test(text);
    var explicitProductRequest = /\b(?:should|can|could|may|do|would)\s+i\s+(?:take|use|add|try)\s+/.test(text) ||
      /\bwhat\s+about\s+(?!supplements?\b)/.test(text) ||
      /\bsupplement(?:ing)?\s+with\s+/.test(text);
    if (
      explicitProductRequest &&
      !genericCatalogueQuestion &&
      !genericSupplementObject &&
      !supported.length &&
      !unsupported.length
    ) {
      add(unsupported, "the requested nutrient or product");
    }
    return {
      supported: supported,
      unsupported: unsupported,
      nutrientSpecific: supported.length > 0 || unsupported.length > 0
    };
  }

  function supplementItemMatchesNutrient(item, nutrient) {
    if (!item) return false;
    if (nutrient === "vitamin-b12") return item.id === "vitamin-b12" || item.id === "folate-b12";
    if (nutrient === "folate") return item.id === "folate-b12";
    return item.id === nutrient;
  }

  function supplementItemsForQuestion(question, items) {
    var candidates = Array.isArray(items) ? items : [];
    var route = supplementQuestionRoute(question);
    if (!route.nutrientSpecific) return candidates;
    if (!route.supported.length) return [];
    return candidates.filter(function (item) {
      return route.supported.some(function (nutrient) {
        return supplementItemMatchesNutrient(item, nutrient);
      });
    });
  }

  function isSupplementQuestion(question) {
    var text = String(question || "").toLowerCase();
    var route = supplementQuestionRoute(question);
    return route.nutrientSpecific || /supplement|pill|capsule|dose|dosage|should i take/.test(text);
  }

  if (originalAnswer) {
    answer = function (question) {
      if (!serverMode || !isSupplementQuestion(question)) {
        return originalAnswer(question);
      }
      var plan = serverRecommendations && serverRecommendations.supplements;
      var items = supplementPlanItems(plan);
      var route = supplementQuestionRoute(question);
      var answerItems = supplementItemsForQuestion(question, items);
      var approvalLead = "<b>Do not start any supplement from this report without recorded practitioner approval.</b>";
      if (route.nutrientSpecific && !answerItems.length) {
        var unavailableName = route.unsupported.length ? route.unsupported.join(", ") : route.supported.join(", ");
        return {
          t: approvalLead + "<br><br>No approved supplement recommendation for <b>" + safe(unavailableName) + "</b> is active in this report. Do not infer one from another nutrient review or from DNA alone. Use symptoms, diet, medicines, examination and clinically appropriate measurement with a qualified practitioner.",
          src: "server supplement rules " + safe((plan && plan.rulesVersion) || serverRecommendations.rulesVersion)
        };
      }
      if (!items.length) {
        return {
          t: approvalLead + "<br><br>No supplement review reached the approved genetic convergence threshold in this report. Only completed, interpretable markers can contribute. If you suspect a deficiency, use the measurement list or speak to a qualified clinician rather than guessing from DNA.",
          src: "server supplement rules " + safe((plan && plan.rulesVersion) || serverRecommendations.rulesVersion)
        };
      }
      var unsupportedCopy = route.unsupported.length
        ? "<br><br><b>No approved supplement recommendation for " + safe(route.unsupported.join(", ")) + " is active in this report.</b> Do not infer one from the approved review candidates below."
        : "";
      return {
        t: approvalLead + unsupportedCopy + "<br><br>Your called markers raised " + safe(answerItems.length) + " relevant genetics-guided practitioner " + (answerItems.length === 1 ? "review" : "reviews") + ":<br><br>" +
          answerItems.map(function (item) {
            var guidance = item.measurementGuidance || {};
            var warnings = Array.isArray(item.interactionWarnings) ? item.interactionWarnings : [];
            var contraindications = Array.isArray(item.contraindications) ? item.contraindications : [];
            var checks = Array.isArray(item.checksBeforeStarting) ? item.checksBeforeStarting : [];
            var contexts = Array.isArray(item.clinicalContextChecklist) ? item.clinicalContextChecklist : [];
            var checklist = Array.isArray(item.practitionerChecklist) ? item.practitionerChecklist : [];
            return "<b>" + safe(item.name) + "</b> — " + safe(item.considerationLabel || "CONSIDER / PRACTITIONER REVIEW") + "; " + safe(supplementDecisionLabel(item.decision)) + "." +
              (item.decision === "clinician-only" ? " <b>Clinician-gated — do not initiate independently.</b>" : "") +
              "<br><b>Reason for practitioner review:</b> " + safe(item.plainReason) +
              "<br><b>Population nutrition context — not a prescribed dose:</b> " + safe(item.referenceAmount) +
              "<br><b>Form context — if approved:</b> " + safe(item.preferredForm || "No genotype-selected form") + " " + safe(item.formRationale || "") +
              "<br><b>Timing context — if approved:</b> " + safe(item.timing) + " " + safe(item.timingRationale || "") +
              "<br><b>Age considerations:</b> " + safe(supplementAgeConsiderations(item)) +
              "<br><b>Medication interaction check:</b> " + safe(item.medicationInteractionCheck || "Practitioner or pharmacist review required.") +
              "<br><b>Current supplement interaction check:</b> " + safe(item.currentSupplementInteractionCheck || "Review total intake from every current product.") +
              (warnings.length ? "<br><b>Important interaction warnings:</b> " + safe(warnings.join(" ")) : "") +
              (contraindications.length ? "<br><b>Contraindications and safety cautions:</b> " + safe(contraindications.join(" ")) : "") +
              "<br><b>Measurement status:</b> " + safe(supplementMeasurementStatusLabel(guidance)) +
              "<br><b>Baseline:</b> " + safe(guidance.baseline || item.whatRefinesDecision || item.whatConfirmsNeed) +
              "<br><b>Follow-up:</b> " + safe(guidance.followUp || item.review) +
              (checks.length ? "<br><b>Before implementation:</b> " + safe(checks.join(" ")) : "") +
              (contexts.length ? "<br><b>Clinical context to consider:</b> " + safe(contexts.join(" ")) : "") +
              (checklist.length ? "<br><b>Practitioner approval checklist:</b> " + safe(checklist.join(" ")) : "");
          }).join("<br><br>") +
          "<br><br>Open the Supplements tab for the primary and Additional Supplement Considerations, full rationale, SAM systems, safety checks and Practitioner Review Checklist. These are not proof of deficiency or doses calculated from DNA.",
        src: "server supplement rules " + safe(plan.rulesVersion || serverRecommendations.rulesVersion)
      };
    };
  }

  function addRoadmapNotice() {
    var host = document.getElementById("roadmap");
    if (!host || document.getElementById("samRoadmapPhase")) return;
    var note = document.createElement("div");
    note.id = "samRoadmapPhase";
    note.className = "notice sage sam-phase-note small";
    note.innerHTML = "<b>Phase 1.</b> If no wearable is connected, keep the same twelve-week sequence using a simple wake-time, sleep and energy log. Automated band comparisons start only after the consented JCVital connection is available.";
    host.prepend(note);
  }

  buildRoadmap = function () {
    originalBuildRoadmap();
    addRoadmapNotice();
  };

  function disableDatabaseSourceControls() {
    if (!serverMode) return;

    ["file", "annot", "manFile", "pathFile", "demoSport", "demoFull", "demoDummy", "clearAll"].forEach(function (id) {
      var control = document.getElementById(id);
      if (!control) return;
      control.disabled = true;
      control.setAttribute("aria-disabled", "true");
      control.classList.add("sam-integration-disabled");
      if (control.tagName === "INPUT") {
        var label = control.closest("label");
        if (label) label.hidden = true;
      } else {
        control.hidden = true;
      }
    });

    var manifest = document.getElementById("manifest");
    if (manifest) manifest.hidden = true;

    document.querySelectorAll('input[type="file"]').forEach(function (input) {
      input.disabled = true;
      input.setAttribute("aria-disabled", "true");
      var label = input.closest("label");
      if (label) label.hidden = true;
    });

    document.querySelectorAll("button").forEach(function (button) {
      var label = String(button.textContent || "").replace(/\s+/g, " ").trim();
      var action = button.getAttribute("onclick") || "";
      if (
        /worked example|load .*sample|fill an example/i.test(label) ||
        /makeDays\(|loadDemo\(/.test(action)
      ) {
        button.disabled = true;
        button.hidden = true;
        button.setAttribute("aria-disabled", "true");
      }
    });
  }

  function observeDatabaseSourceControls() {
    if (document.documentElement.dataset.samDbControlsObserved === "true") return;
    document.documentElement.dataset.samDbControlsObserved = "true";
    new MutationObserver(function (changes) {
      if (!serverMode) return;
      var added = changes.some(function (change) {
        return change.addedNodes && change.addedNodes.length;
      });
      if (added) disableDatabaseSourceControls();
    }).observe(document.body, { childList: true, subtree: true });
  }

  function renderDatabasePathologyPolicy() {
    var host = document.getElementById("pathology");
    if (!host) return;
    host.innerHTML =
      '<div class="notice sage"><b>Waiting for a verified Broker Day profile value.</b> These ranges are sex-specific, and the approved database report does not currently include sex at birth. SAM will not default it to male or female. Pathology remains unavailable here until that verified field is carried through the shared profile.</div>';
  }

  buildPathology = function () {
    if (serverMode && !verifiedSex()) {
      renderDatabasePathologyPolicy();
      disableDatabaseSourceControls();
      return;
    }
    originalBuildPathology();
    disableDatabaseSourceControls();
  };

  function addConvergeNotice() {
    var host = document.getElementById("converge");
    if (!host || document.getElementById("samConvergePhase")) return;
    var note = document.createElement("div");
    note.id = "samConvergePhase";
    note.className = "notice sage sam-phase-note small";
    note.innerHTML = verifiedSex()
      ? "<b>Phase 1.</b> Genetics and the verified Broker Day sex-at-birth profile value are live. Pathology values entered here remain local to this tab, and wearable comparisons stay empty until the consented JCVital service is connected."
      : "<b>Phase 1.</b> Genetics is live from the approved database report. Pathology stays unscored until verified sex at birth is available, and wearable comparisons stay empty until the consented JCVital service is connected.";
    host.prepend(note);
  }

  buildConverge = function () {
    if (!serverMode) {
      originalBuildConverge();
      return;
    }
    var labs = STATE.labs;
    var days = STATE.demoDays;
    if (!verifiedSex()) STATE.labs = {};
    STATE.demoDays = null;
    try {
      originalBuildConverge();
    } finally {
      STATE.labs = labs;
      STATE.demoDays = days;
    }
    addConvergeNotice();
  };

  function renderDatabaseWearablePolicy() {
    var host = document.getElementById("dash");
    if (!host) return;
    STATE.demoDays = null;
    host.innerHTML =
      '<div class="notice sage small"><b>No sample nights are mixed into a private member report.</b> The dashboard will remain empty until the authenticated, consented JCVital connection supplies this member\'s own data.</div>';
  }

  buildDashboard = function () {
    if (serverMode) {
      renderDatabaseWearablePolicy();
      buildConverge();
      return;
    }
    originalBuildDashboard();
  };

  function renderDatabaseSexPolicy() {
    var host = document.getElementById("sexPanel");
    if (!host) return;
    if (!verifiedSex()) {
      host.innerHTML = '<div class="notice sage"><b>Sex-dependent explanations stay generic.</b> Sex at birth is not present in this approved report record, so SAM does not infer it. X-linked and sex-context results remain held until a verified value is supplied through the Broker Day profile.</div>';
      return;
    }
    if (document.getElementById("samVerifiedSexPolicy")) return;
    var note = document.createElement("div");
    note.id = "samVerifiedSexPolicy";
    note.className = "notice sage";
    note.innerHTML = "<b>Verified profile context applied.</b> Sex-specific ranges and X-linked calls use the sex-at-birth value supplied by the protected Broker Day profile. This value cannot be edited in the report.";
    host.prepend(note);
  }

  buildSexPanel = function () {
    originalBuildSexPanel();
    renderDatabaseSexPolicy();
  };

  function renderReceipt(payload) {
    var summary = document.getElementById("summary");
    if (!summary) return;
    var receipt = document.getElementById("samDbReceipt");
    if (!receipt) {
      receipt = document.createElement("section");
      receipt.id = "samDbReceipt";
      summary.parentNode.insertBefore(receipt, summary);
    }

    var when = new Date(payload.receipt.processedAt);
    var processed = Number.isNaN(when.getTime())
      ? payload.receipt.processedAt
      : when.toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
    var readyMarkers = Math.max(0, Number(payload.receipt.calledMarkers) || 0);

    receipt.innerHTML =
      '<div class="sechead"><span class="eyebrow q">Approved private report</span><span class="rule"></span><span class="db-lock">Database matched</span></div>' +
      '<div class="grid g2" style="align-items:stretch">' +
        '<div class="card ink stack">' +
          '<span class="eyebrow">Your database result</span>' +
          '<h2 style="color:var(--bone);margin:0">Welcome, ' + safe(payload.profile.name) + '.</h2>' +
          '<p class="small" style="color:var(--bone-70);margin:0">Your encrypted Broker Day link matched this approved genetic report. No upload is needed and the access token has already been removed from the address.</p>' +
          '<span class="mono tiny" style="color:var(--bone-45)">PRIVATE · NO-STORE · SERVER PROCESSED</span>' +
        '</div>' +
        '<div class="card db-profile">' +
          '<span class="eyebrow q">Processing receipt</span>' +
          '<div class="db-meta">' +
            '<div><span class="tiny muted">Member</span><b>' + safe(payload.profile.memberNumber) + '</b></div>' +
            '<div><span class="tiny muted">Assay</span><b>' + safe(payload.profile.assayName) + '</b></div>' +
            '<div><span class="tiny muted">Markers ready</span><b>' + safe(readyMarkers) + '/' + safe(readyMarkers) + ' · 100%</b></div>' +
            '<div><span class="tiny muted">Processed</span><b>' + safe(processed) + '</b></div>' +
          '</div>' +
          '<p class="tiny muted" style="margin:16px 0 0">' + safe(payload.receipt.sourceLabel) + ' · rules ' + safe(payload.receipt.rulesVersion) + '</p>' +
        '</div>' +
      '</div>';
  }

  function configureTabs() {
    var tablist = document.querySelector(".tabrow");
    if (!tablist) return;

    function allPanelTabs() {
      return Array.prototype.slice.call(tablist.querySelectorAll(".tab[data-p]"));
    }

    function visiblePanelTabs() {
      return allPanelTabs().filter(function (tab) {
        return !tab.hidden && !tab.classList.contains("hidden-tab") && tab.style.display !== "none";
      });
    }

    function syncTabs() {
      var tabs = allPanelTabs();
      var visible = visiblePanelTabs();
      var selected = visible.find(function (tab) {
        return tab.getAttribute("aria-selected") === "true";
      }) || visible[0] || null;

      tabs.forEach(function (tab) {
        var panel = document.getElementById("p-" + tab.dataset.p);
        tab.id = "tab-" + tab.dataset.p;
        tab.setAttribute("aria-controls", panel ? panel.id : "");
        tab.tabIndex = tab === selected ? 0 : -1;
        if (panel) {
          panel.setAttribute("role", "tabpanel");
          panel.setAttribute("aria-labelledby", tab.id);
        }
      });
    }

    if (tablist.dataset.samKeyboardReady !== "true") {
      tablist.dataset.samKeyboardReady = "true";
      tablist.addEventListener("keydown", function (event) {
        var tab = event.target.closest && event.target.closest(".tab[data-p]");
        if (!tab || !tablist.contains(tab)) return;
        var tabs = visiblePanelTabs();
        var index = tabs.indexOf(tab);
        if (index < 0 || !tabs.length) return;
        var next = null;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        tabs[next].click();
        tabs[next].focus();
      });
      tablist.addEventListener("click", function (event) {
        var tab = event.target.closest && event.target.closest(".tab[data-p]");
        if (!tab || !tablist.contains(tab)) return;
        syncTabs();
      });
      new MutationObserver(syncTabs).observe(tablist, {
        childList: true,
        subtree: false,
        attributes: true,
        attributeFilter: ["class", "aria-selected"]
      });
    }

    syncTabs();
  }

  function configurePhaseOneIntegrations(payload) {
    var rawTab = document.querySelector('.tab[data-p="raw"]');
    if (rawTab) {
      rawTab.hidden = true;
      rawTab.classList.add("hidden-tab");
      rawTab.setAttribute("aria-hidden", "true");
    }
    var rawPanel = document.getElementById("p-raw");
    if (rawPanel) rawPanel.hidden = true;
    document.querySelectorAll('button[onclick*="doPrint(\'doc\')"],button[onclick*="doPrint(\'raw\')"]').forEach(function (button) {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
      var card = button.closest(".card");
      if (card) {
        card.hidden = true;
        card.setAttribute("aria-hidden", "true");
      }
    });

    var agentPanel = document.getElementById("p-agent");
    var agentLead = agentPanel && agentPanel.querySelector(".lead");
    if (agentLead && !document.getElementById("samAgentPhase")) {
      var agentNote = document.createElement("div");
      agentNote.id = "samAgentPhase";
      agentNote.className = "notice sage small";
      agentNote.style.marginTop = "18px";
      agentNote.innerHTML = "<b>Phase 1 architecture preview.</b> The deterministic, rules-only report questions work now. Model-assisted agents, messaging, device ingestion and durable audit records are not connected yet.";
      agentLead.after(agentNote);
    }

    var endpoint = document.getElementById("apiEP");
    var endpointCard = endpoint && endpoint.closest(".card");
    if (endpointCard) {
      endpointCard.innerHTML =
        '<span class="eyebrow q">Phase 1</span>' +
        '<h4>Rules-only SAM agent</h4>' +
        '<p class="small muted" style="margin:0">Answers stay inside the versioned report rules. External model endpoints are disabled for private reports.</p>' +
        '<span class="mono tiny muted">NO GENOTYPE DATA LEAVES THIS REPORT</span>';
    }

    ["dlIos", "dlAnd"].forEach(function (id) {
      var button = document.getElementById(id);
      if (!button) return;
      button.disabled = true;
      button.classList.add("sam-integration-disabled");
    });
    var downloadNote = document.getElementById("dlNote");
    if (downloadNote) downloadNote.textContent = "JCVital connection is planned after Phase 1.";

    var pairBox = document.getElementById("pairBox");
    if (pairBox) {
      pairBox.innerHTML =
        '<div class="notice sage small"><b>Not connected yet.</b> This section previews the approved data streams and safeguards. Account pairing will appear here only after the server-side consent flow is available.</div>';
    }

    renderDatabaseWearablePolicy();
    if (!verifiedSex()) renderDatabasePathologyPolicy();
    addConvergeNotice();

    var dashboard = document.getElementById("dash");
    var dashboardLead = dashboard && dashboard.previousElementSibling;
    if (dashboardLead && dashboardLead.matches("p.lead")) {
      dashboardLead.textContent = "The layout is ready, but private reports never load sample nights. It will fill only from this member's consented JCVital stream.";
    }
    var connectPanel = document.getElementById("p-connect");
    if (connectPanel) {
      connectPanel.querySelectorAll("details").forEach(function (details) {
        var summary = details.querySelector("summary");
        if (/what is in this sample/i.test((summary && summary.textContent) || "")) {
          details.hidden = true;
        }
      });
    }

    document.querySelectorAll('button[onclick*="setFlip"]').forEach(function (button) {
      button.disabled = true;
      button.classList.add("sam-integration-disabled");
      button.title = "The approved server interpretation is fixed for this report.";
    });

    var messages = document.getElementById("msgs");
    if (messages) messages.innerHTML = "";
    say(
      "s",
      "Welcome, " + safe(payload.profile.name) + ". I can explain the results in this approved database report and show which versioned rule each answer came from.",
      "approved database report · rules " + safe(payload.receipt.rulesVersion)
    );
    disableDatabaseSourceControls();
    observeDatabaseSourceControls();
  }

  function loadDatabaseReport(payload) {
    if (
      !payload ||
      payload.type !== "${REFERENCE_REPORT_MESSAGE}" ||
      payload.version !== 1 ||
      !payload.profile ||
      !payload.receipt ||
      !payload.results
    ) return;

    var nextReportKey = String(
      payload.reportKey ||
      [
        payload.profile.memberNumber,
        payload.receipt.processedAt,
        payload.receipt.rulesVersion,
        payload.recommendations && payload.recommendations.rulesVersion,
        payload.recommendations && payload.recommendations.supplements && payload.recommendations.supplements.rulesVersion
      ].join(":")
    );
    if (activeReportKey === nextReportKey) return;

    serverResults = payload.results || Object.create(null);
    serverLedger = payload.ledger || null;
    serverDomains = Object.create(null);
    (payload.domains || []).forEach(function (domain) {
      if (domain && domain.id) serverDomains[domain.id] = domain;
    });
    serverPriorities = Array.isArray(payload.priorities) ? payload.priorities : [];
    serverRecommendations = payload.recommendations || null;
    window.SAM_ACTIVE_SUPPLEMENTS = serverRecommendations && serverRecommendations.supplements
      ? supplementPlanItems(serverRecommendations.supplements)
      : [];
    serverMode = true;
    appendSourceOnlyMarkers(payload);
    REPORT_CATALOGUE_COUNT = Number(payload.receipt.catalogueMarkers) || MARKERS.length;
    STATE.calls = Object.assign({}, payload.calls || {});
    STATE.labs = {};
    STATE.demoDays = null;
    STATE.intake = {};
    STATE.unlocked = [];
    STATE.started = false;
    STATE.unlockTouched = false;
    STATE.showAll = false;
    STATE.override = {};
    STATE.person = {
      name: payload.profile.name || "Your report",
      sex: payload.profile.sexAtBirth === "female" ? "f" : payload.profile.sexAtBirth === "male" ? "m" : "",
      mode: "member"
    };
    STATE.loaded = true;
    STATE.src = "approved database · " + (payload.profile.assayName || "gene panel");
    document.documentElement.classList.add("sam-db-mode");

    var nameInput = document.getElementById("pname");
    if (nameInput) nameInput.value = STATE.person.name;
    var ageInput = document.getElementById("page");
    if (ageInput) ageInput.value = "";
    var sexInput = document.getElementById("psex");
    if (sexInput) sexInput.value = STATE.person.sex;
    var modeInput = document.getElementById("pmode");
    if (modeInput) modeInput.value = "member";

    render();
    renderReceipt(payload);
    renderDatabaseSupplements();
    addRoadmapNotice();
    renderDatabaseSexPolicy();
    configurePhaseOneIntegrations(payload);
    if (typeof buildIntake === "function") buildIntake();
    if (typeof applyUnlock === "function") applyUnlock();
    configureTabs();
    activeReportKey = nextReportKey;
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    loadDatabaseReport(event.data);
  });

  configureTabs();
  window.parent.postMessage({ type: "${REFERENCE_READY_MESSAGE}" }, "*");
})();
</script>`;

const REFERENCE_HTML = referenceSource.replace(
  /<\/body>\s*<\/html>\s*$/i,
  `${DATABASE_ADAPTER}\n</body></html>`,
);

function isReadyMessage(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === REFERENCE_READY_MESSAGE
  );
}

export function ReferenceReport({ report }: { report: GeneReport }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const payload = useMemo(() => buildReferenceReportPayload(report), [report]);

  const sendReport = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(payload, "*");
  }, [payload]);

  useEffect(() => {
    const receiveReady = (event: MessageEvent<unknown>) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        !isReadyMessage(event.data)
      ) {
        return;
      }
      sendReport();
    };

    window.addEventListener("message", receiveReady);
    return () => window.removeEventListener("message", receiveReady);
  }, [sendReport]);

  return (
    <main className="reference-report-shell">
      <iframe
        ref={frameRef}
        className="reference-report-frame"
        title={`${payload.profile.name}'s SAM gene report`}
        srcDoc={REFERENCE_HTML}
        sandbox="allow-downloads allow-modals allow-scripts"
        allow="clipboard-write"
        referrerPolicy="no-referrer"
        onLoad={sendReport}
      />
    </main>
  );
}
