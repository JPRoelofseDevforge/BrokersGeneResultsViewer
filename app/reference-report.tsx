"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import referenceSource from "@/sam_report-7.html?raw";
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
  var originalBuildSupps = buildSupps;
  var originalBuildRoadmap = buildRoadmap;
  var originalBuildSexPanel = buildSexPanel;
  var originalBuildLedger = buildLedger;
  var originalFindMarker = findM;

  function safe(value) {
    return esc(String(value == null ? "" : value));
  }

  function serverMarkerResult(marker) {
    var result = serverResults[marker.g + ":" + marker.rs];
    if (!result) return { state: "nocall" };

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

    var entry = null;
    try {
      entry = gtEntry(marker, result.genotype);
    } catch (_) {
      entry = null;
    }
    if (!entry && marker.gt) entry = marker.gt[result.genotype] || null;

    return {
      state: "ok",
      gt: result.genotype,
      lev: entry ? entry[0] : result.leverage,
      txt: entry ? entry[1] : result.interpretation,
      flip: !!result.strandFlipped,
      amb: !!result.strandAmbiguous
    };
  }

  markerResult = serverMarkerResult;

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

  function addSupplementNotice() {
    var host = document.getElementById("supps");
    if (!host || document.getElementById("samSupplementPhase")) return;
    var note = document.createElement("div");
    note.id = "samSupplementPhase";
    note.className = "notice sage sam-phase-note small";
    note.innerHTML = "<b>Phase 1.</b> Pathology values entered here stay in this tab and are not written to the Broker Day database. Practitioner overrides require the audited clinical workflow and are not available yet.";
    host.prepend(note);

    host.querySelectorAll("button").forEach(function (button) {
      if (/override the gate|withdraw the override/i.test(button.textContent || "")) {
        button.disabled = true;
        button.classList.add("sam-integration-disabled");
        button.title = "Available after the audited practitioner workflow is connected.";
      }
    });
  }

  buildSupps = function () {
    originalBuildSupps();
    addSupplementNotice();
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

  function renderDatabaseSexPolicy() {
    var host = document.getElementById("sexPanel");
    if (!host) return;
    host.innerHTML =
      '<div class="notice sage">' +
        '<b>Sex-dependent explanations stay generic.</b> Sex at birth is not present in this approved report record, so SAM does not infer it. X-linked and sex-context results remain held or neutral until a verified value is supplied through the Broker Day profile.' +
      '</div>';
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
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
    tabs.forEach(function (tab, index) {
      var panel = document.getElementById("p-" + tab.dataset.p);
      tab.id = "tab-" + tab.dataset.p;
      tab.setAttribute("aria-controls", panel ? panel.id : "");
      tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
      if (panel) {
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
      }
      tab.addEventListener("keydown", function (event) {
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
      tab.addEventListener("click", function () {
        tabs.forEach(function (item) {
          item.tabIndex = item === tab ? 0 : -1;
        });
      });
    });
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

    var rawPanel = document.getElementById("p-raw");
    if (rawPanel) {
      rawPanel.querySelectorAll("th").forEach(function (heading) {
        if (/as reported in your file/i.test(heading.textContent || "")) {
          heading.textContent = "As stored in your report";
        }
      });
    }

    var messages = document.getElementById("msgs");
    if (messages) messages.innerHTML = "";
    say(
      "s",
      "Welcome, " + safe(payload.profile.name) + ". I can explain the results in this approved database report and show which versioned rule each answer came from.",
      "approved database report · rules " + safe(payload.receipt.rulesVersion)
    );
  }

  function loadDatabaseReport(payload) {
    if (!payload || payload.type !== "${REFERENCE_REPORT_MESSAGE}" || payload.version !== 1) return;

    serverResults = payload.results || Object.create(null);
    serverLedger = payload.ledger || null;
    STATE.calls = Object.assign({}, payload.calls || {});
    STATE.person = {
      name: payload.profile.name || "Your report",
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
    if (sexInput) sexInput.value = "";
    var modeInput = document.getElementById("pmode");
    if (modeInput) modeInput.value = "member";

    render();
    renderReceipt(payload);
    addSupplementNotice();
    addRoadmapNotice();
    renderDatabaseSexPolicy();
    configurePhaseOneIntegrations(payload);
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
