import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(`${projectRoot}sam_report-11.html`, "utf8");
const bridge = readFileSync(
  `${projectRoot}app/reference-report.tsx`,
  "utf8",
);
const extractor = readFileSync(
  `${projectRoot}scripts/extract-marker-catalogue.mjs`,
  "utf8",
);

test("uses report 11 with the ledger as the second of 19 matched tabs", () => {
  assert.match(bridge, /sam_report-11\.html\?raw/);
  assert.doesNotMatch(bridge, /sam_report-7\.html\?raw/);
  assert.doesNotMatch(bridge, /sam_report-new\.html\?raw/);

  const tabs = [...source.matchAll(/<button class="tab"[^>]+data-p="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const panels = [
    ...source.matchAll(
      /<section class="[^"]*\bpanel\b[^"]*" id="p-([^"]+)"/g,
    ),
  ].map((match) => match[1]);

  assert.equal(tabs.length, 19);
  assert.equal(tabs[1], "ledger");
  assert.ok(tabs.includes("converge"));
  assert.ok(tabs.includes("pathology"));
  assert.deepEqual([...tabs].sort(), [...panels].sort());
});

test("keeps the revised result states and adult APOE release visible", () => {
  for (const label of [
    "No call from the lab",
    "Unreadable call",
    "Not on this panel yet",
    "Withheld by policy",
  ]) {
    assert.match(source, new RegExp(label, "i"));
  }

  assert.match(source, /function buildLedger\(\)/);
  assert.match(source, /<b>Released\.<\/b>/);
  assert.match(source, /age&&age<18/);
  assert.match(source, /const REPORT_VERSION = "2026\.08\.07-r11"/);
});

test("keeps database-only Phase 1 boundaries around the new layers", () => {
  assert.match(bridge, /No sample nights are mixed into a private member report/);
  assert.match(bridge, /Waiting for a verified Broker Day profile value/);
  assert.match(bridge, /STATE\.demoDays = null/);
  assert.match(bridge, /STATE\.labs = \{\}/);
  assert.match(bridge, /Pathology stays unscored until verified sex at birth/);
  assert.match(extractor, /sam_report-11\.html/);
});

test("all embedded report scripts remain syntactically valid", () => {
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1],
  );

  assert.equal(scripts.length, 23);
  scripts.forEach((script, index) => {
    assert.doesNotThrow(
      () => new Function(script),
      `inline script ${index + 1} should parse`,
    );
  });

  const adapter = bridge.match(
    /const DATABASE_ADAPTER = String\.raw`([\s\S]*?)`;\s*\n\s*const REFERENCE_HTML/,
  );
  assert.ok(adapter, "database adapter source should be present");
  const adapterScript = adapter[1]
    .match(/<script>([\s\S]*?)<\/script>/i)?.[1]
    .replaceAll("${REFERENCE_REPORT_MESSAGE}", "sam-reference-report")
    .replaceAll("${REFERENCE_READY_MESSAGE}", "sam-reference-ready");
  assert.ok(adapterScript, "database adapter script should be present");
  assert.doesNotThrow(() => new Function(adapterScript));
});

test("three-layer verdicts do not claim a missing genetics layer", () => {
  const convergenceScript = [
    ...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi),
  ].map((match) => match[1]).find((script) => script.includes("const CONVERGE=["));
  assert.ok(convergenceScript, "convergence script should be present");

  const definitions = new Function(`${convergenceScript}\nreturn CONVERGE;`)() as Array<{
    k: string;
    verdict: (...layers: boolean[]) => string;
  }>;
  const verdict = (key: string, ...layers: boolean[]) => {
    const definition = definitions.find((item) => item.k === key);
    assert.ok(definition, `missing convergence definition ${key}`);
    return definition.verdict(...layers);
  };

  const falseGeneticClaim = /all three|genetics and .*agree|genetics (?:make|made|said|predicted)/i;
  assert.doesNotMatch(verdict("iron", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("inflam", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("caff", false, false, true, false, true), falseGeneticClaim);
  assert.doesNotMatch(verdict("vitd", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("stress", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("histamine", false, false, true, false, true), falseGeneticClaim);
});
