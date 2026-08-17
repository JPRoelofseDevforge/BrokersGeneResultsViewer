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
  assert.match(bridge, /Supplement Considerations — Practitioner Review Checklist/);
  assert.match(bridge, /Population nutrition context — not your prescribed dose/);
  assert.match(bridge, /What can refine the decision/);
  assert.match(bridge, /CONSIDER \/ PRACTITIONER REVIEW/);
  assert.match(bridge, /Primary Supplement Considerations/);
  assert.match(bridge, /Additional Supplement Considerations/);
  assert.match(bridge, /Form context — if approved/);
  assert.match(bridge, /Timing context — if approved/);
  assert.match(bridge, /Reason for practitioner review/);
  assert.match(bridge, /Supporting genetic markers \/ pathway/);
  assert.match(bridge, /Medication interaction check/);
  assert.match(bridge, /Current supplement interaction check/);
  assert.match(bridge, /Baseline and follow-up measurement/);
  assert.match(bridge, /Clinician-gated — do not initiate independently/);
  assert.match(bridge, /Important interaction warnings/);
  assert.match(bridge, /item\.practitionerChecklist/);
  assert.match(bridge, /item\.clinicalContextChecklist/);
  assert.match(bridge, /item\.interactionWarnings/);
  assert.match(bridge, /item\.ageConsiderations \|\| item\.ageContext/);
  assert.match(bridge, /supplementAgeConsiderations\(item\)/);
  assert.match(bridge, /supplementMeasurementStatusLabel\(guidance\)/);
  assert.match(bridge, /required-before-implementation/);
  assert.match(bridge, /clinically-indicated/);
  assert.match(bridge, /not-routinely-needed/);
  assert.match(
    bridge,
    /Only when clinically indicated, not routinely from DNA alone/,
  );
  assert.match(
    bridge,
    /Do not start any supplement from this report without recorded practitioner approval/,
  );
  assert.match(bridge, /supplementPlanItems/);
  assert.match(bridge, /supplementPrimaryItems/);
  assert.match(bridge, /supplementAdditionalItems/);
  assert.match(bridge, /Practitioner audit — supported candidates not displayed/);
  assert.match(bridge, /Ranking:/);
  assert.match(bridge, /clinical relevance/);
  assert.match(bridge, /safety priority/);
  assert.match(bridge, /actionability/);
  assert.match(bridge, /recommendationExclusionLabel/);
  assert.doesNotMatch(bridge, />What confirms a need</);
  assert.match(bridge, /window\.SAM_ACTIVE_SUPPLEMENTS/);
  assert.match(bridge, /injectServerSupplementPrint/);
  assert.match(bridge, /server supplement rules/);
  assert.match(bridge, /if \(!serverMode\) return originalSuppState\(item\)/);
  assert.match(bridge, /if \(serverMode\) \{[\s\S]*?renderDatabaseSupplements\(\);[\s\S]*?return;[\s\S]*?\}\s*originalBuildSupps\(\)/);
  assert.doesNotMatch(bridge, /renderDatabaseSupplementPolicy/);
  assert.match(bridge, /if \(!Number\.isFinite\(leverage\) \|\| leverage < 0 \|\| leverage > 3\)/);
  assert.doesNotMatch(bridge, /lev: result\.leverage[\s\S]*?entry \? entry\[0\]/);
});

test("natural supplement questions use nutrient-specific server-authoritative routing", () => {
  const routeStart = bridge.indexOf("  function supplementQuestionRoute(question)");
  const routeEnd = bridge.indexOf("\n\n  if (originalAnswer)", routeStart);
  assert.ok(routeStart >= 0, "supplement route helper should be present");
  assert.ok(routeEnd > routeStart, "supplement route helper block should be complete");
  const helpers = new Function(
    `${bridge.slice(routeStart, routeEnd)}; return { supplementQuestionRoute, supplementItemsForQuestion, isSupplementQuestion };`,
  )() as {
    supplementQuestionRoute: (question: string) => {
      supported: string[];
      unsupported: string[];
      nutrientSpecific: boolean;
    };
    supplementItemsForQuestion: <T extends { id: string }>(
      question: string,
      items: T[],
    ) => T[];
    isSupplementQuestion: (question: string) => boolean;
  };

  const candidates = [
    { id: "vitamin-d" },
    { id: "omega-3" },
    { id: "choline" },
    { id: "folate-b12" },
    { id: "vitamin-b12" },
    { id: "iron" },
  ];

  assert.equal(helpers.isSupplementQuestion("Do I need omega-3?"), true);
  assert.equal(helpers.isSupplementQuestion("Can I use iron?"), true);
  assert.equal(
    helpers.isSupplementQuestion("What about folate/B12/choline/D3?"),
    true,
  );
  assert.equal(
    helpers.isSupplementQuestion("Is omega-3 safe with warfarin?"),
    true,
  );
  assert.equal(
    helpers.isSupplementQuestion("Does iron interact with my thyroid medicine?"),
    true,
  );
  assert.equal(helpers.isSupplementQuestion("What does my HFE marker mean?"), false);

  assert.equal(
    helpers.supplementQuestionRoute("Can I use iron?").supported.join(","),
    "iron",
  );
  assert.equal(
    helpers
      .supplementItemsForQuestion("Can I use iron?", candidates)
      .map((item) => item.id)
      .join(","),
    "iron",
  );
  assert.equal(
    helpers
      .supplementItemsForQuestion("Should I take vitamin B12?", candidates)
      .map((item) => item.id)
      .join(","),
    "folate-b12,vitamin-b12",
  );
  assert.equal(
    helpers
      .supplementItemsForQuestion("Is omega-3 safe with warfarin?", candidates)
      .map((item) => item.id)
      .join(","),
    "omega-3",
  );
  assert.equal(
    helpers
      .supplementItemsForQuestion("What about choline?", candidates)
      .map((item) => item.id)
      .join(","),
    "choline",
  );
  assert.equal(
    helpers
      .supplementItemsForQuestion("Can we review vitamin D3?", candidates)
      .map((item) => item.id)
      .join(","),
    "vitamin-d",
  );
  assert.equal(
    helpers
      .supplementItemsForQuestion("Is folate relevant?", candidates)
      .map((item) => item.id)
      .join(","),
    "folate-b12",
  );
  const magnesiumRoute = helpers.supplementQuestionRoute(
    "Should I take magnesium?",
  );
  assert.equal(magnesiumRoute.supported.length, 0);
  assert.equal(magnesiumRoute.unsupported.join(","), "magnesium");
  assert.equal(
    helpers.supplementItemsForQuestion("Should I take magnesium?", candidates)
      .length,
    0,
  );
  assert.equal(helpers.isSupplementQuestion("Should I take magnesium?"), true);

  for (const question of [
    "Should I take calcium?",
    "Should I take vitamin A?",
    "Can I use vitamin C?",
    "What about vitamin E?",
  ]) {
    const route = helpers.supplementQuestionRoute(question);
    assert.equal(route.supported.length, 0, question);
    assert.equal(route.unsupported.length, 1, question);
    assert.equal(
      helpers.supplementItemsForQuestion(question, candidates).length,
      0,
      question,
    );
    assert.equal(helpers.isSupplementQuestion(question), true, question);
  }

  const unknownProductQuestion = "Should I take ashwagandha?";
  const unknownProductRoute = helpers.supplementQuestionRoute(
    unknownProductQuestion,
  );
  assert.equal(unknownProductRoute.supported.length, 0);
  assert.equal(
    unknownProductRoute.unsupported.join(","),
    "the requested nutrient or product",
  );
  assert.equal(
    helpers.supplementItemsForQuestion(unknownProductQuestion, candidates)
      .length,
    0,
  );

  const genericQuestion = "What supplements are recommended?";
  const genericRoute = helpers.supplementQuestionRoute(genericQuestion);
  assert.equal(genericRoute.nutrientSpecific, false);
  assert.equal(
    helpers
      .supplementItemsForQuestion(genericQuestion, candidates)
      .map((item) => item.id)
      .join(","),
    candidates.map((item) => item.id).join(","),
  );
  assert.equal(helpers.isSupplementQuestion(genericQuestion), true);

  assert.match(bridge, /!serverMode \|\| !isSupplementQuestion\(question\)/);
  assert.match(bridge, /whatRefinesDecision \|\| item\.whatConfirmsNeed/);
  assert.match(bridge, /Practitioner Review Checklist/);
  assert.match(bridge, /No approved supplement recommendation for/);
  assert.match(bridge, /item\.medicationInteractionCheck/);
  assert.match(bridge, /item\.currentSupplementInteractionCheck/);
  assert.match(bridge, /item\.contraindications/);
  assert.match(bridge, /item\.checksBeforeStarting/);
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
