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
  var originalSuppState = typeof suppState === "function" ? suppState : null;
  var originalBuildRaw = buildRaw;
  var originalBuildTable = buildTable;
  var originalRawRow = rawRow;
  var originalFindMarker = findM;
  var originalSetFlip = typeof setFlip === "function" ? setFlip : null;
  var originalOpenOverride = typeof openOverride === "function" ? openOverride : null;
  var originalCommitOverride = typeof commitOverride === "function" ? commitOverride : null;
  var activeReportKey = null;
  var sourceOnlyMarkerCount = 0;

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

  rawRow = function (marker) {
    var row = originalRawRow(marker);
    if (row.r && row.r.state === "unmapped") {
      row.ref = "—";
      row.flags = [["stored / unscored", "var(--copper)"]];
    }
    return row;
  };

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

  buildLedger = function () {
    originalBuildLedger();
    applyServerLedgerCounts();
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
      '<div class="notice" style="margin-top:34px"><b>Supplements remain locked.</b> Genetics supplies context, not a diagnosis, measured deficiency or dose. The Supplements tab is an ephemeral food-and-measurement preview; iron and vitamin B12 remain clinician-gated.</div>' +
      (near.length ? '<details class="how" style="margin-top:28px"><summary>What nearly reached a threshold</summary><div class="howbody">' + near.map(function (item) {
        return '<div class="kv"><span><b>' + safe(item.title) + '</b><br><span class="tiny muted">' + safe(item.contributorCount) + ' contributors across ' + safe(item.domainCount) + ' systems</span></span><span class="pill">' + safe(item.reason) + '</span></div>';
      }).join("") + '</div></details>' : '') +
      priorityCopy;
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
        why: "Supplement products and doses are locked until an audited server-side intake, pathology and contraindication workflow is connected."
      };
    };
  }

  function renderDatabaseSupplementPolicy() {
    var host = document.getElementById("supps");
    if (!host) return;
    host.innerHTML =
      '<div class="notice sage"><b>Supplements are locked in Phase 1.</b> This private report does not name a product, dose or duration from genetics or self-reported intake. An audited server-side workflow must first combine verified pathology, medicines, kidney function, pregnancy context, contraindications and clinician governance.</div>' +
      '<div class="grid g2" style="margin-top:20px">' +
        '<div class="card stack"><span class="eyebrow q">Available now</span><h4 style="margin:0">Food-first context</h4><p class="small muted" style="margin:0">Use the report to discuss ordinary food patterns, sleep, movement and the short measurement list. Genetics can explain context; it cannot establish a deficiency.</p></div>' +
        '<div class="card stack"><span class="eyebrow q">Required before release</span><h4 style="margin:0">Measured and reviewed</h4><p class="small muted" style="margin:0">A clinician or governed service must review current results and safety context before any supplement recommendation appears. Iron and vitamin B12 remain clinician-gated.</p></div>' +
      '</div>';
  }

  buildSupps = function () {
    if (serverMode) {
      renderDatabaseSupplementPolicy();
      return;
    }
    originalBuildSupps();
  };

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
    var coverage = Math.round(Number(payload.receipt.overallCoverage || 0) * 100);

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
            '<div><span class="tiny muted">Approved calls</span><b>' + safe(payload.receipt.calledMarkers) + ' / ' + safe(payload.receipt.callableMarkers) + ' · ' + safe(coverage) + '%</b></div>' +
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

    var rawPanel = document.getElementById("p-raw");
    if (rawPanel) {
      rawPanel.querySelectorAll("th").forEach(function (heading) {
        if (/as reported in your file/i.test(heading.textContent || "")) {
          heading.textContent = "As stored in your report";
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
      [payload.profile.memberNumber, payload.receipt.processedAt, payload.receipt.rulesVersion].join(":")
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
    renderDatabaseSupplementPolicy();
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
