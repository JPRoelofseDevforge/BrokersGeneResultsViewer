import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportDashboard } from "../app/report-dashboard";
import { getGeneReport } from "../lib/reports/get-gene-report";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const bridge = readFileSync(`${projectRoot}app/reference-report.tsx`, "utf8");
const dashboard = readFileSync(`${projectRoot}app/report-dashboard.tsx`, "utf8");

test("database adapter remains valid JavaScript", () => {
  const adapter = bridge.match(
    /const DATABASE_ADAPTER = String\.raw`([\s\S]*?)`;\s*\n\s*const REFERENCE_HTML/,
  );
  assert.ok(adapter, "database adapter source should be present");
  const script = adapter[1]
    .match(/<script>([\s\S]*?)<\/script>/i)?.[1]
    .replaceAll("${REFERENCE_REPORT_MESSAGE}", "sam-reference-report")
    .replaceAll("${REFERENCE_READY_MESSAGE}", "sam-reference-ready");
  assert.ok(script, "database adapter script should be present");
  assert.doesNotThrow(() => new Function(script));
});

test("database adapter uses report 15 and keeps source controls server-only", () => {
  assert.match(bridge, /sam_report-15\.html\?raw/);
  assert.match(bridge, /#manifest,/);
  assert.match(bridge, /querySelectorAll\('input\[type="file"\]'\)/);
  assert.match(bridge, /\["file", "annot", "manFile", "pathFile"/);
  assert.match(bridge, /worked example\|load \.\*sample\|fill an example/i);
  assert.match(bridge, /payload\.profile\.sexAtBirth === "female"/);
  assert.match(bridge, /sexInput\.value = STATE\.person\.sex/);
});

test("keyboard navigation follows only visible panel tabs in current DOM order", () => {
  assert.match(bridge, /querySelectorAll\("\.tab\[data-p\]"\)/);
  assert.match(bridge, /!tab\.classList\.contains\("hidden-tab"\)/);
  assert.match(bridge, /var tabs = visiblePanelTabs\(\)/);
  assert.match(bridge, /tablist\.dataset\.samKeyboardReady/);
  assert.doesNotMatch(
    bridge,
    /var tabs = Array\.prototype\.slice\.call\(document\.querySelectorAll\("\.tab"\)\)/,
  );
});

test("duplicate report delivery returns before mutable intake state is reset", () => {
  const duplicateGuard = bridge.indexOf(
    "if (activeReportKey === nextReportKey) return;",
  );
  const intakeReset = bridge.indexOf("STATE.intake = {};", duplicateGuard);
  const activeCommit = bridge.indexOf(
    "activeReportKey = nextReportKey;",
    duplicateGuard,
  );

  assert.ok(duplicateGuard >= 0);
  assert.ok(intakeReset > duplicateGuard);
  assert.ok(activeCommit > intakeReset);
  assert.match(bridge, /STATE\.unlocked = \[\]/);
  assert.match(bridge, /STATE\.started = false/);
  assert.match(bridge, /STATE\.showAll = false/);
});

test("unmapped database calls are appended as unscored source rows", () => {
  assert.match(bridge, /result\.state === "unmapped"/);
  assert.match(bridge, /state: "unmapped"/);
  assert.match(bridge, /result\.state !== "called" \|\| !result\.genotype/);
  assert.match(bridge, /appendSourceOnlyMarkers\(payload\)/);
  assert.match(bridge, /sourceMarker\.state !== "unmapped"/);
  assert.doesNotMatch(
    bridge,
    /sourceMarker\.state !== "unmapped" && sourceMarker\.state !== "not-called"/,
  );
  assert.match(
    bridge,
    /if \(existing\[markerKey\(sourceMarker\.gene, sourceMarker\.variantId\)\]\) return;[\s\S]*?MARKERS\.push/,
  );
  assert.match(bridge, /d: \[\]/);
  assert.match(bridge, /gt: \{\}/);
  assert.match(bridge, /_samSourceOnly: true/);
  assert.match(bridge, /stored \/ unscored/i);
  assert.match(bridge, /annotateSourceOnlyMarkerTable/);
  assert.match(bridge, /result\.interpretation \|\| "Source call retained verbatim/);
});

test("database domains and recommendations remain server authoritative", () => {
  assert.match(bridge, /var originalComputeDomains = computeDomains/);
  assert.match(bridge, /target\.tot = authoritative\.totalMarkers/);
  assert.match(bridge, /target\.band = authoritative\.band/);
  assert.match(bridge, /target\.score = authoritative\.bandScore/);
  assert.match(bridge, /serverRecommendations = payload\.recommendations/);
  assert.match(bridge, /function renderServerNecessary\(\)/);
  assert.match(bridge, /Server-authoritative recommendations/);
  assert.match(bridge, /function renderDatabaseSupplements\(\)/);
  assert.match(bridge, /Your marker-selected shortlist/);
  assert.match(bridge, /General adult amount/);
  assert.match(bridge, /What confirms a need/);
  assert.match(bridge, /window\.SAM_ACTIVE_SUPPLEMENTS/);
  assert.match(bridge, /injectServerSupplementPrint/);
  assert.match(bridge, /server supplement rules/);
  assert.match(bridge, /if \(!serverMode\) return originalSuppState\(item\)/);
  assert.match(bridge, /if \(serverMode\) \{[\s\S]*?renderDatabaseSupplements\(\);[\s\S]*?return;[\s\S]*?\}\s*originalBuildSupps\(\)/);
  assert.doesNotMatch(bridge, /renderDatabaseSupplementPolicy/);
  assert.match(bridge, /if \(!Number\.isFinite\(leverage\) \|\| leverage < 0 \|\| leverage > 3\)/);
  assert.doesNotMatch(bridge, /lev: result\.leverage[\s\S]*?entry \? entry\[0\]/);
});

test("natural supplement questions stay on the server-authoritative answer path", () => {
  const matcher = bridge.match(
    /function isSupplementQuestion\(question\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(matcher, "supplement intent matcher should be present");
  const isSupplementQuestion = new Function(
    `${matcher[0]}; return isSupplementQuestion;`,
  )() as (question: string) => boolean;

  assert.equal(isSupplementQuestion("Do I need omega-3?"), true);
  assert.equal(isSupplementQuestion("Can I use iron?"), true);
  assert.equal(isSupplementQuestion("What about folate/B12/choline/D3?"), true);
  assert.equal(isSupplementQuestion("Is omega-3 safe with warfarin?"), true);
  assert.equal(
    isSupplementQuestion("Does iron interact with my thyroid medicine?"),
    true,
  );
  assert.equal(isSupplementQuestion("What does my HFE marker mean?"), false);
  assert.match(bridge, /!serverMode \|\| !isSupplementQuestion\(question\)/);
});

test("recommendation-only changes invalidate the iframe report key", () => {
  assert.match(bridge, /payload\.recommendations && payload\.recommendations\.rulesVersion/);
  assert.match(
    bridge,
    /payload\.recommendations && payload\.recommendations\.supplements && payload\.recommendations\.supplements\.rulesVersion/,
  );
});

test("database reports retain authoritative counts but present the member-ready set", () => {
  assert.match(
    bridge,
    /REPORT_CATALOGUE_COUNT = Number\(payload\.receipt\.catalogueMarkers\) \|\| MARKERS\.length/,
  );
  assert.match(
    bridge,
    /safe\(readyMarkers\) \+ '\/' \+ safe\(readyMarkers\) \+ ' · 100%<\/b>/,
  );
  assert.match(bridge, /var readyMarkers = Math\.max\(0, Number\(payload\.receipt\.calledMarkers\) \|\| 0\)/);
  assert.match(bridge, /rawTab\.classList\.add\("hidden-tab"\)/);
  assert.match(bridge, /if \(rawPanel\) rawPanel\.hidden = true/);
  assert.match(bridge, /html\.sam-db-mode \[data-audit-export\]/);
  assert.match(bridge, /var card = button\.closest\("\.card"\)/);
  assert.match(bridge, /function presentMemberLedger\(\)/);
  assert.match(bridge, /cell\.style\.display = "none"/);
  assert.match(bridge, /target\.tot = authoritative\.totalMarkers/);
});

test("the React fallback dashboard uses the same member-ready presentation", () => {
  assert.match(dashboard, /function readyRatio\(count: number\)/);
  assert.match(dashboard, /function readyPercentage\(count: number\)/);
  assert.match(dashboard, /readyRatio\(report\.receipt\.calledMarkers\)/);
  assert.match(dashboard, /readyPercentage\(activeDomain\.calledMarkers\)/);
  assert.match(dashboard, /domain\.group === activeGroup && domain\.calledMarkers > 0/);
  assert.match(dashboard, /if \(marker\.state !== "called"\) return false/);
  assert.doesNotMatch(dashboard, /Marker coverage|Evidence coverage/);
  assert.doesNotMatch(
    dashboard,
    /report\.receipt\.calledMarkers\}\s*(?:of|\/)\s*\{report\.receipt\.callableMarkers/,
  );
  assert.doesNotMatch(dashboard, /incomplete calls|not enough readable data/i);
  assert.match(dashboard, /domain\.group === group\.id && domain\.calledMarkers > 0/);
});

test("a rendered partial member report exposes only the ready set", async () => {
  const report = await getGeneReport("sam-240184");
  assert.ok(report);
  report.receipt.calledMarkers = 134;
  report.receipt.callableMarkers = 159;
  report.receipt.overallCoverage = 134 / 159;

  const html = renderToStaticMarkup(
    createElement(ReportDashboard, { report }),
  );

  assert.match(html, /134\/134/);
  assert.match(html, /100%/);
  assert.doesNotMatch(html, /134\/159/);
  assert.doesNotMatch(
    html,
    /not read|not called|incomplete calls|not enough readable|full counts|0\/0/i,
  );
});
