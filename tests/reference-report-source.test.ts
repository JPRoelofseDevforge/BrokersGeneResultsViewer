import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(`${projectRoot}sam_report-12.html`, "utf8");
const bridge = readFileSync(
  `${projectRoot}app/reference-report.tsx`,
  "utf8",
);
const extractor = readFileSync(
  `${projectRoot}scripts/extract-marker-catalogue.mjs`,
  "utf8",
);
const inlineScripts = [
  ...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi),
].map((match) => match[1]);

test("uses report 12 with the ledger as the second of 19 matched tabs", () => {
  assert.match(bridge, /sam_report-12\.html\?raw/);
  assert.doesNotMatch(bridge, /sam_report-11\.html\?raw/);
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

  tabs.forEach((tab, index) => {
    const section = source.match(
      new RegExp(
        `<section class="[^"]*\\bpanel\\b[^"]*" id="p-${tab}"[\\s\\S]*?<span class="eyebrow[^"]*">(\\d{2})`,
      ),
    );
    assert.ok(section, `missing numbered heading for ${tab}`);
    assert.equal(Number(section[1]), index + 1, `wrong visible number for ${tab}`);
  });
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
  assert.match(source, /const REPORT_VERSION = "2026\.08\.14-r12"/);
});

test("keeps database-only Phase 1 boundaries around the new layers", () => {
  assert.match(bridge, /No sample nights are mixed into a private member report/);
  assert.match(bridge, /Waiting for a verified Broker Day profile value/);
  assert.match(bridge, /STATE\.demoDays = null/);
  assert.match(bridge, /STATE\.labs = \{\}/);
  assert.match(bridge, /Pathology stays unscored until verified sex at birth/);
  assert.match(bridge, /function verifiedSex\(\)/);
  assert.match(bridge, /result\.leverage != null/);
  assert.match(bridge, /approved server interpretation is fixed/i);
  assert.match(extractor, /sam_report-12\.html/);
});

test("all embedded report scripts remain syntactically valid", () => {
  assert.equal(inlineScripts.length, 23);
  inlineScripts.forEach((script, index) => {
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

test("keeps standalone calls, supplement gates, and pathology units fail-closed", () => {
  const engineIndex = inlineScripts.findIndex((script) =>
    script.includes("function resolveCall(m,raw)"),
  );
  assert.ok(engineIndex >= 0, "gene engine script should be present");
  const engineScript = inlineScripts.slice(0, engineIndex + 1).join("\n");
  const engine = new Function(
    `${engineScript}\nreturn {resolveCall,apoeCall,STATE};`,
  )() as {
    resolveCall: (marker: { al: string }, raw: string) => { bad?: boolean; gt?: string } | null;
    apoeCall: () => string | null;
    STATE: { calls: Record<string, string> };
  };
  assert.equal(engine.resolveCall({ al: "A/G" }, "0/1")?.bad, true);
  assert.equal(engine.resolveCall({ al: "A/G" }, "AA (het)")?.bad, true);
  assert.equal(engine.resolveCall({ al: "A/G" }, "A|G")?.gt, "AG");
  engine.STATE.calls = { rs429358: "CT", rs7412: "CC" };
  assert.equal(engine.apoeCall(), "E3/E4");
  engine.STATE.calls = { rs429358: "CC", rs7412: "TT" };
  assert.equal(engine.apoeCall(), null);

  const supplementScript = inlineScripts.find((script) =>
    script.includes("const SUPPS=["),
  );
  assert.ok(supplementScript, "supplement script should be present");
  const supplementState = { labs: {}, intake: {}, override: {} };
  const supplements = new Function(
    "STATE",
    `${supplementScript}\nreturn {SUPPS,suppState};`,
  )(supplementState) as {
    SUPPS: Array<{
      k: string;
      clin?: boolean;
      low?: (value: number) => boolean;
    }>;
    suppState: (item: { k: string; lab: string | null }) => { st: string };
  };
  const supplement = (key: string) => {
    const item = supplements.SUPPS.find((entry) => entry.k === key);
    assert.ok(item, `missing supplement ${key}`);
    return item;
  };
  assert.equal(
    supplements.suppState(supplement("vitd") as { k: string; lab: string }).st,
    "unknown",
  );
  assert.equal(supplement("iron").clin, true);
  assert.equal(supplement("b12").clin, true);
  assert.equal(supplement("vitd").low?.(29), true);
  assert.equal(supplement("vitd").low?.(30), false);
  assert.equal(supplement("mag").low?.(2.06), true);
  assert.equal(supplement("mag").low?.(2.07), false);

  const pathologyCatalogueScript = inlineScripts.find((script) =>
    script.includes("const PANEL=["),
  );
  assert.ok(pathologyCatalogueScript, "pathology catalogue script should be present");
  const pathologyState: {
    person: Record<string, string>;
    labs: Record<string, string>;
  } = { person: {}, labs: {} };
  const pathology = new Function(
    "STATE",
    `${pathologyCatalogueScript}\nreturn {labSex,derive};`,
  )(pathologyState) as { labSex: () => string | null; derive: () => void };
  assert.equal(pathology.labSex(), null);
  pathologyState.labs = { gluc: "90", ins: "9" };
  pathology.derive();
  assert.ok("homa" in pathologyState.labs);
  delete pathologyState.labs.ins;
  pathology.derive();
  assert.ok(!("homa" in pathologyState.labs));

  const pathologyParserScript = inlineScripts.find((script) =>
    script.includes("function toPanelUnits"),
  );
  assert.ok(pathologyParserScript, "pathology parser script should be present");
  const units = new Function(
    "STATE",
    `${pathologyParserScript}\nreturn {toPanelUnits};`,
  )({ lab: "ampath", labs: {} }) as {
    toPanelUnits: (
      item: { u: string; si?: [number, string] },
      value: number,
      unit: string,
      labSI?: boolean,
    ) => { v?: number; error?: string };
  };
  assert.equal(
    units.toPanelUnits({ u: "ng/mL", si: [2.496, "nmol/L"] }, 60, "nmol/L").v,
    24,
  );
  assert.match(
    units.toPanelUnits({ u: "%" }, 42, "mmol/mol").error || "",
    /unsupported unit/,
  );
  assert.match(units.toPanelUnits({ u: "%" }, 5.4, "").error || "", /missing unit/);

  const printScript = inlineScripts.find((script) =>
    script.includes("function buildPrint(mode)"),
  );
  assert.ok(printScript, "print script should be present");
  assert.doesNotMatch(printScript, /x\.st==="(?:released|indicated|waiting|trial)"/);
  assert.match(source, /function displayStatus\(m,r\)/);
  assert.match(source, /function displayStatusLabel\(status\)/);
});

test("three-layer verdicts do not claim a missing genetics layer", () => {
  const convergenceScript = inlineScripts.find((script) =>
    script.includes("const CONVERGE=["),
  );
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

  const falseGeneticClaim = /all three|genetics? (?:and|make|made|said|say|predict|predicted|agree)|genotypes? (?:said|say|look|are)|genetically|carrier and receptor results|clearance routes are slow/i;
  assert.doesNotMatch(verdict("iron", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("inflam", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("caff", false, false, true, false, true), falseGeneticClaim);
  assert.doesNotMatch(verdict("vitd", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("stress", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("methyl", false, true, false, true, false), falseGeneticClaim);
  assert.doesNotMatch(verdict("histamine", false, false, true, false, true), falseGeneticClaim);
  assert.doesNotMatch(convergenceScript, /\b130 markers\b/);
});
