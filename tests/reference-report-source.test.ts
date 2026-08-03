import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(`${projectRoot}sam_report-7.html`, "utf8");
const bridge = readFileSync(
  `${projectRoot}app/reference-report.tsx`,
  "utf8",
);

test("uses report 7 with the ledger as the second of 17 matched tabs", () => {
  assert.match(bridge, /sam_report-7\.html\?raw/);
  assert.doesNotMatch(bridge, /sam_report-new\.html\?raw/);

  const tabs = [...source.matchAll(/<button class="tab"[^>]+data-p="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const panels = [
    ...source.matchAll(
      /<section class="[^"]*\bpanel\b[^"]*" id="p-([^"]+)"/g,
    ),
  ].map((match) => match[1]);

  assert.equal(tabs.length, 17);
  assert.equal(tabs[1], "ledger");
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
});
