import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(`${projectRoot}sam_report-15.html`, "utf8");
const bridge = readFileSync(
  `${projectRoot}app/reference-report.tsx`,
  "utf8",
);
const extractor = readFileSync(
  `${projectRoot}scripts/extract-marker-catalogue.mjs`,
  "utf8",
);
const catalogue = JSON.parse(
  readFileSync(`${projectRoot}data/marker-catalogue.json`, "utf8"),
) as {
  version: string;
  domains: Record<string, unknown>;
  markers: Array<{
    gene: string;
    variantId: string;
    domainIds: string[];
    clinicalReferral: boolean;
    sourceOnly: boolean;
  }>;
};
const inlineScripts = [
  ...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi),
].map((match) => match[1]);

test("uses report 15 with 21 matched and sequentially numbered panels", () => {
  assert.match(bridge, /sam_report-15\.html\?raw/);
  assert.doesNotMatch(bridge, /sam_report-(?:12|11|7)\.html\?raw/);

  const tabs = [
    ...source.matchAll(/<button class="tab"[^>]+data-p="([^"]+)"/g),
  ].map((match) => match[1]);
  const panels = [
    ...source.matchAll(
      /<section class="[^"]*\bpanel\b[^"]*" id="p-([^"]+)"/g,
    ),
  ].map((match) => match[1]);

  assert.equal(tabs.length, 21);
  assert.equal(tabs[1], "brief");
  assert.equal(tabs[2], "ledger");
  assert.ok(tabs.includes("refer"));
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

  assert.match(source, /const REPORT_VERSION = "2026\.08\.17-r15\.2"/);
  assert.match(source, /const KB_VERSION = "2026\.08\.16"/);
  assert.match(extractor, /sam_report-15\.html/);
});

test("keeps result states and Phase 1 database boundaries explicit", () => {
  for (const label of [
    "No call from the lab",
    "Unreadable call",
    "Stored, not interpreted",
    "Withheld by policy",
  ]) {
    assert.match(source, new RegExp(label, "i"));
  }

  assert.match(source, /function displayStatus\(m,r\)/);
  assert.match(source, /function displayStatusLabel\(status\)/);
  assert.match(source, /<b>Released\.<\/b>/);
  assert.match(source, /age&&age<18/);
  assert.match(bridge, /No sample nights are mixed into a private member report/);
  assert.match(bridge, /Waiting for a verified Broker Day profile value/);
  assert.match(bridge, /STATE\.demoDays = null/);
  assert.match(bridge, /STATE\.labs = \{\}/);
  assert.match(bridge, /function verifiedSex\(\)/);
  assert.match(bridge, /Number\.isFinite\(leverage\)/);
  assert.match(bridge, /approved server interpretation is fixed/i);
  assert.match(bridge, /#manifest,/);
  assert.match(bridge, /querySelectorAll\("\.tab\[data-p\]"\)/);
  assert.match(bridge, /result\.state === "unmapped"/);
});

test("hides missing marker details while retaining full panel denominators and status counts", () => {
  const rawIndex = inlineScripts.findIndex((script) =>
    script.includes("function rawCSV()"),
  );
  assert.ok(rawIndex >= 0, "raw result script should be present");

  const report = new Function(
    "window",
    `${inlineScripts.slice(0, rawIndex + 1).join("\n")}\nreturn {MARKERS,STATE,applyTaxonomy,computeDomains,markerResult,markerRow,rawCSV,memberMarkerVisible,reportMarkerCounts};`,
  )({}) as {
    MARKERS: Array<{
      g: string;
      rs: string;
      d: string[];
      _r?: { state: string };
    }>;
    STATE: {
      calls: Record<string, string>;
      person: Record<string, string>;
    };
    applyTaxonomy: () => void;
    computeDomains: () => Record<string, { n: number; tot: number }>;
    markerResult: (marker: unknown) => { state: string };
    markerRow: (marker: unknown) => string;
    rawCSV: () => string;
    memberMarkerVisible: (marker: unknown, result: { state: string }) => boolean;
    reportMarkerCounts: () => {
      catalogue: number;
      callable: number;
      called: number;
    };
  };
  report.applyTaxonomy();
  const comt = report.MARKERS.find((marker) => marker.rs === "rs4680");
  assert.ok(comt, "COMT marker should be present");

  report.STATE.calls = {};
  report.STATE.person = {};
  const missing = report.markerResult(comt);
  assert.equal(missing.state, "nocall");
  assert.equal(report.memberMarkerVisible(comt, missing), false);
  assert.equal(report.memberMarkerVisible(comt, { state: "unreadable" }), true);
  assert.equal(report.memberMarkerVisible(comt, { state: "unmapped" }), true);
  assert.equal(report.memberMarkerVisible(comt, { state: "withheld" }), true);
  assert.equal(report.markerRow(comt), "");
  assert.equal(report.rawCSV().split("\n").length, 1, "no-call rows stay out of CSV");
  assert.deepEqual(report.reportMarkerCounts(), {
    catalogue: 159,
    callable: 159,
    called: 0,
  });

  report.MARKERS.forEach((marker) => delete marker._r);
  report.STATE.calls = { rs4680: "A/G" };
  const domains = report.computeDomains();
  assert.match(report.markerRow(comt), /COMT/);
  assert.equal(report.rawCSV().split("\n").length, 2);
  assert.ok(domains[comt.d[0]].tot > domains[comt.d[0]].n);
  assert.equal(report.reportMarkerCounts().called, 1);

  assert.match(source, /function memberMarkerVisible\(m,r\)\{return displayStatus\(m,r\)!=="nocall";\}/);
  assert.match(source, /const visible=rows\.filter\(x=>memberMarkerVisible\(x\.m,x\.r\)\)/);
  assert.match(source, /if\(!memberMarkerVisible\(x\.m,x\.r\)\) return false;/);
  assert.match(source, /if\(!memberMarkerVisible\(m,r\)\) return;/);
  assert.match(source, /MARKERS\.forEach\(m=>\{const r=m\._r\|\|markerResult\(m\);/);
  assert.match(source, /\$\("#mCount"\)\.textContent=`\$\{filtered\.length\} results shown · \$\{visible\.length\} returned rows · \$\{markerCounts\.catalogue\} markers in the full catalogue`/);
  assert.match(source, /\["Markers matched",`\$\{called\}\/\$\{total\}`/);
  assert.match(source, /\$\{called\}\/\$\{total\} markers read · knowledge base/);
  assert.match(source, /STATE\.loaded&&!memberMarkerVisible\(m,m\._r\|\|markerResult\(m\)\)\) return;/);
  assert.match(source, /if\(!c\|\|!memberMarkerVisible\(c,r\)\)\{host\.innerHTML="";return;\}/);
  assert.match(source, /m\.as&&memberMarkerVisible\(m,m\._r\|\|markerResult\(m\)\)/);
  assert.match(source, /if\(!live\) return "";/);
  assert.match(source, /if\(!st\.n\) return "";/);
  assert.match(source, /REPORT_CATALOGUE_COUNT=MARKERS\.length/);
  assert.doesNotMatch(source, /<option value="nocall">/);
  assert.doesNotMatch(source, /Not read: \$\{esc\([^}]*missing\.join/);
});

test("matches the report-15 catalogue and Executive Fitness taxonomy", () => {
  assert.equal(catalogue.version, "2026.08.16");
  assert.equal(Object.keys(catalogue.domains).length, 18);
  assert.equal(catalogue.markers.length, 161);
  assert.equal(
    catalogue.markers.filter((marker) => marker.clinicalReferral).length,
    5,
  );
  assert.equal(
    catalogue.markers.filter((marker) => marker.sourceOnly).length,
    2,
  );

  const engineIndex = inlineScripts.findIndex((script) =>
    script.includes("function resolveCall(m,raw)"),
  );
  assert.ok(engineIndex >= 0, "gene engine script should be present");
  const engine = new Function(
    `${inlineScripts.slice(0, engineIndex + 1).join("\n")}\nreturn {EFCATS,MOVECATS,MARKERS};`,
  )() as {
    EFCATS: Array<{ n: string; f: string; prim: string[]; shared: string[] }>;
    MOVECATS: Array<{ n: string; f: string; prim: string[]; shared: string[] }>;
    MARKERS: Array<{ rs: string; d: string[]; refer?: boolean }>;
  };
  assert.equal(engine.EFCATS.length, 9);
  assert.deepEqual(
    engine.EFCATS.map((category) => category.n.match(/^EF-(\d)/)?.[1]),
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  );

  const catalogueVariants = new Set(
    catalogue.markers.map((marker) => marker.variantId),
  );
  for (const category of engine.EFCATS) {
    for (const reference of [...category.prim, ...category.shared]) {
      assert.ok(
        catalogueVariants.has(reference),
        `${category.n} references missing catalogue marker ${reference}`,
      );
    }
  }
  assert.ok(engine.EFCATS[7].shared.includes("rs429358+rs7412"));
  assert.ok(engine.EFCATS[8].shared.includes("rs762551"));
  assert.match(engine.EFCATS[1].f, /tendency|liability/i);
  assert.match(engine.EFCATS[1].f, /never.*diagnosis/i);

  assert.equal(engine.MOVECATS.length, 6);
  assert.deepEqual(
    engine.MOVECATS.map((category) => category.n.match(/^(\d)/)?.[1]),
    ["1", "2", "3", "4", "5", "6"],
  );
  assert.deepEqual(
    engine.MOVECATS.map((category) => category.prim.length),
    [5, 12, 4, 1, 2, 11],
  );
  assert.deepEqual(
    engine.MOVECATS.flatMap((category) => category.shared).sort(),
    [
      "rs1137101",
      "rs17782313",
      "rs2943641",
      "rs5219",
      "rs6234",
      "rs6235",
      "rs7923837",
      "rs7903146",
      "rs9939609",
    ].sort(),
  );
  for (const category of engine.MOVECATS) {
    assert.ok(category.f.length > 20, `${category.n} needs focus copy`);
    for (const reference of [...category.prim, ...category.shared]) {
      assert.ok(
        catalogueVariants.has(reference),
        `${category.n} references missing catalogue marker ${reference}`,
      );
    }
  }
  assert.match(source, /id="movecats"/);
  assert.match(source, /function buildMoveCats\(\)/);
  assert.match(source, /buildMoveCats\(\)/);
  assert.match(source, /const scored=all\.filter\(m=>!m\.refer/);

  const apoe = catalogue.markers.find(
    (marker) => marker.variantId === "rs429358+rs7412",
  );
  assert.ok(apoe);
  assert.deepEqual(apoe.domainIds, ["rc_vitd"]);
  assert.deepEqual(
    engine.MARKERS.find((marker) => marker.rs === "rs429358+rs7412")?.d,
    ["rc_vitd"],
  );
});

test("Executive Fitness cards open an accessible plain-language detail modal", () => {
  assert.match(source, /<dialog class="ef-dialog" id="efDetailDialog"/);
  assert.match(source, /aria-labelledby="efDetailTitle"/);
  assert.match(source, /id="efDetailClose"[^>]+aria-label="Close executive fitness details"/);
  assert.match(source, /class="card stack ef-card" role="button" tabindex="0"/);
  assert.match(source, /aria-haspopup="dialog" aria-controls="efDetailDialog"/);
  assert.match(source, /event\.key==="Enter"\|\|event\.key===" "/);
  assert.match(source, /function openEFDetail\(index,trigger\)/);
  assert.match(source, /function closeEFDetail\(restoreFocus=true\)/);
  assert.match(source, /What this can look like/);
  assert.match(source, /Three useful next steps/);
  assert.match(source, /What shaped this result/);
  assert.match(source, /Missing and no-call markers stay hidden/);
  assert.match(source, /window\.SAM_ACTIVE_SUPPLEMENTS/);
  assert.match(source, /function goToSupplement\(id\)/);
  assert.match(source, /go\("supplements"\)/);
  assert.match(source, /document\.getElementById\("supplement-"\+id\)/);
  assert.match(bridge, /id="supplement-' \+ safe\(item\.id\)/);
  assert.match(bridge, /tabindex="-1"/);
  assert.doesNotMatch(source, /Only established gaps appear above/);
  assert.doesNotMatch(source, /any established supplement gaps/);
  assert.match(source, /genetics-guided supplement review priorities/);
  assert.equal(
    [...source.matchAll(/actions:\[(.*?)\]/g)].filter((match) =>
      /Protect|Choose|After|Shrink|Get outdoor|Create|Pause|Know your|caffeine cut-off/i.test(
        match[1],
      ),
    ).length,
    9,
  );
});

test("all embedded report and database adapter scripts remain valid", () => {
  assert.equal(inlineScripts.length, 27);
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

  assert.doesNotMatch(source, /fonts\.(?:googleapis|gstatic)\.com/i);
});

test("keeps standalone genotype, APOE, and NAT2 calls fail-closed", () => {
  const engineIndex = inlineScripts.findIndex((script) =>
    script.includes("function resolveCall(m,raw)"),
  );
  const engine = new Function(
    `${inlineScripts.slice(0, engineIndex + 1).join("\n")}\nreturn {resolveCall,apoeCall,nat2Status,markerResult,STATE};`,
  )() as {
    resolveCall: (marker: { al: string }, raw: string) => {
      bad?: boolean;
      gt?: string;
    } | null;
    apoeCall: () => string | null;
    nat2Status: (marker?: unknown) => { gt: string } | null;
    markerResult: (marker: {
      g: string;
      rs: string;
      al: string;
      d: string[];
      xl?: boolean;
      gt: Record<string, [number, string]>;
    }) => { state: string; gt?: string };
    STATE: { calls: Record<string, string>; person: Record<string, string> };
  };

  assert.equal(engine.resolveCall({ al: "A/G" }, "0/1")?.bad, true);
  assert.equal(engine.resolveCall({ al: "A/G" }, "AA (het)")?.bad, true);
  assert.equal(engine.resolveCall({ al: "A/G" }, "A|G")?.gt, "AG");
  engine.STATE.calls = { rs429358: "CT", rs7412: "CC" };
  assert.equal(engine.apoeCall(), "E3/E4");
  engine.STATE.calls = { rs429358: "CC", rs7412: "TT" };
  assert.equal(engine.apoeCall(), null);

  for (const [raw, expected] of [
    ["*4/*4", "RAPID"],
    ["*4/*6J", "INTERMEDIATE"],
    ["*5E/*12K", "INTERMEDIATE"],
    ["*6/*6P", "SLOW"],
  ]) {
    engine.STATE.calls = { "NAT2:various": raw };
    assert.equal(engine.nat2Status()?.gt, expected, raw);
  }
  for (const raw of [
    "*4/*6J EXTRA",
    "*4/*6ZZ",
    "*4/*6J2",
    "*4/*99",
    "UND",
    "*4",
  ] as const) {
    engine.STATE.calls = { "NAT2:various": raw };
    assert.equal(engine.nat2Status(), null, `${raw} must fail closed`);
  }

  engine.STATE.calls = { rsTest: "---" };
  engine.STATE.person = {};
  assert.equal(
    engine.markerResult({
      g: "TEST",
      rs: "rsTest",
      al: "A/G",
      d: [],
      gt: { AA: [1, "Test"] },
    }).state,
    "nocall",
  );
  engine.STATE.calls = { rsTest: "UND" };
  assert.equal(
    engine.markerResult({
      g: "TEST",
      rs: "rsTest",
      al: "A/G",
      d: [],
      gt: { AA: [1, "Test"] },
    }).state,
    "nocall",
  );

  const xLinked: Parameters<typeof engine.markerResult>[0] = {
    g: "MAOA",
    rs: "rsX",
    al: "A/G",
    d: [],
    xl: true,
    gt: {
      A: [1, "A"],
      G: [3, "G"],
      AA: [1, "AA"],
      AG: [2, "AG"],
      GG: [3, "GG"],
    },
  };
  const dosageIndex = inlineScripts.findIndex((script) =>
    script.includes("X-linked dosage check"),
  );
  assert.ok(dosageIndex > engineIndex, "X-linked dosage wrapper should be present");
  const dosageEngine = new Function(
    `${inlineScripts.slice(0, dosageIndex + 1).join("\n")}\nreturn {markerResult,STATE};`,
  )() as typeof engine;
  dosageEngine.STATE.person = {};
  dosageEngine.STATE.calls = { rsX: "A/G" };
  assert.equal(dosageEngine.markerResult(xLinked).state, "unreadable");
  dosageEngine.STATE.person = { sex: "m" };
  assert.equal(dosageEngine.markerResult(xLinked).state, "unreadable");
  dosageEngine.STATE.calls = { rsX: "A/A" };
  assert.equal(dosageEngine.markerResult(xLinked).state, "ok");
  assert.equal(dosageEngine.markerResult(xLinked).gt, "A");
  dosageEngine.STATE.person = { sex: "f" };
  dosageEngine.STATE.calls = { rsX: "A" };
  assert.equal(dosageEngine.markerResult(xLinked).state, "unreadable");
});

test("keeps supplements, pathology, and imported units fail-closed", () => {
  const supplementScript = inlineScripts.find((script) =>
    script.includes("const SUPPS=["),
  );
  assert.ok(supplementScript, "supplement script should be present");
  const supplements = new Function(
    "STATE",
    `${supplementScript}\nreturn {SUPPS,suppState};`,
  )({ labs: {}, intake: {}, override: {} }) as {
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
    "$",
    `${pathologyParserScript}\nreturn {toPanelUnits};`,
  )({ lab: "ampath", labs: {} }, () => ({})) as {
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
  assert.match(
    units.toPanelUnits({ u: "%" }, 5.4, "").error || "",
    /missing unit/,
  );

  const printScript = inlineScripts.find((script) =>
    script.includes("function buildPrint(mode)"),
  );
  assert.ok(printScript, "print script should be present");
  assert.doesNotMatch(
    printScript,
    /x\.st==="(?:released|indicated|waiting|trial)"/,
  );
});

test("three-layer verdicts do not claim a missing genetics layer", () => {
  const convergenceScript = inlineScripts.find((script) =>
    script.includes("const CONVERGE=["),
  );
  assert.ok(convergenceScript, "convergence script should be present");

  const definitions = new Function(
    `${convergenceScript}\nreturn CONVERGE;`,
  )() as Array<{
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

test("member-facing copy does not claim unsupported Phase 1 capabilities", () => {
  assert.doesNotMatch(source, /reads lab reports through LOINC codes/i);
  assert.doesNotMatch(source, /bloods .* are not permission/i);
  assert.doesNotMatch(source, /your genotype sets how much you need/i);
  assert.doesNotMatch(
    source,
    /the .* unread are design items: genes SAM carries without a confirmed probe/i,
  );
});
