import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const bridge = readFileSync(`${projectRoot}app/reference-report.tsx`, "utf8");

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
  assert.match(bridge, /Supplements remain locked/);
  assert.match(bridge, /Supplements are locked in Phase 1/);
  assert.match(bridge, /if \(!serverMode\) return originalSuppState\(item\)/);
  assert.match(bridge, /if \(serverMode\) \{[\s\S]*?renderDatabaseSupplementPolicy\(\);[\s\S]*?return;[\s\S]*?\}\s*originalBuildSupps\(\)/);
  assert.match(bridge, /if \(!Number\.isFinite\(leverage\) \|\| leverage < 0 \|\| leverage > 3\)/);
  assert.doesNotMatch(bridge, /lev: result\.leverage[\s\S]*?entry \? entry\[0\]/);
});

test("database reports retain authoritative full catalogue counts", () => {
  assert.match(
    bridge,
    /REPORT_CATALOGUE_COUNT = Number\(payload\.receipt\.catalogueMarkers\) \|\| MARKERS\.length/,
  );
  assert.match(
    bridge,
    /safe\(payload\.receipt\.calledMarkers\) \+ ' \/ ' \+ safe\(payload\.receipt\.callableMarkers\)/,
  );
});
