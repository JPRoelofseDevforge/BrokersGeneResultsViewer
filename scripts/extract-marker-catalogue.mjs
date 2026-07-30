import { readFile, writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";

const sourceUrl = new URL("../sam_report-3.html", import.meta.url);
const outputUrl = new URL("../data/marker-catalogue.json", import.meta.url);
const profilesOutputUrl = new URL(
  "../data/phase-1-gene-records.json",
  import.meta.url,
);
const source = await readFile(sourceUrl, "utf8");

function findBalanced(text, start, open, close) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === open) depth += 1;
    if (character === close) depth -= 1;
    if (depth === 0) return index;
  }

  throw new Error(`No matching ${close} found for ${open} at ${start}.`);
}

function extractAssignmentExpression(name, opener, closer) {
  const assignment = source.indexOf(`const ${name}`);
  if (assignment < 0) throw new Error(`Could not find ${name}.`);
  const start = source.indexOf(opener, assignment);
  const end = findBalanced(source, start, opener, closer);
  return source.slice(start, end + 1);
}

function evaluate(expression) {
  return vm.runInNewContext(`(${expression})`, Object.create(null), {
    timeout: 1_000,
  });
}

const domains = evaluate(extractAssignmentExpression("DOMAINS", "{", "}"));
const bands = evaluate(extractAssignmentExpression("BANDS", "[", "]"));
const markers = evaluate(extractAssignmentExpression("MARKERS", "[", "]"));
const demoSport = evaluate(
  extractAssignmentExpression("DEMO_SPORT", "{", "}"),
);
const demoExtra = evaluate(
  extractAssignmentExpression("DEMO_EXTRA", "{", "}"),
);

function DESIGN(gene, domainIds, impact, assayNote) {
  return {
    g: gene,
    rs: "design item",
    al: "—",
    d: domainIds,
    gr: "D",
    w: impact,
    gt: {},
    as:
      assayNote ??
      "Carried at gene level. The rsID is not printed because the array probe has not been confirmed.",
  };
}

let searchFrom = 0;
while (true) {
  const callStart = source.indexOf("MARKERS.push(", searchFrom);
  if (callStart < 0) break;

  const open = source.indexOf("(", callStart);
  const close = findBalanced(source, open, "(", ")");
  const argumentsSource = source.slice(open + 1, close);
  const additions = vm.runInNewContext(
    `[${argumentsSource}]`,
    { DESIGN },
    { timeout: 1_000 },
  );

  markers.push(...additions);
  searchFrom = close + 1;
}

const xLinkedVariants = new Set(["rs1137070", "rs1799836", "rs6318"]);
const catalogue = {
  version: "2026.07.29",
  domains: Object.fromEntries(
    Object.entries(domains).map(([id, domain]) => [
      id,
      {
        id,
        name: domain.n,
        group: domain.grp,
        description: domain.blurb,
      },
    ]),
  ),
  bands: bands.filter(Boolean).map((band) => ({
    level: band.k,
    name: band.n,
    summary: band.say,
  })),
  markers: markers.map((marker, index) => ({
    id: `${marker.g}-${marker.rs}-${index + 1}`,
    gene: marker.g,
    variantId: marker.rs,
    expectedAlleles: marker.al,
    domainIds: marker.d ?? [],
    evidenceGrade: marker.gr,
    impact: marker.w,
    interpretations: marker.gt ?? {},
    namedVariants: marker.nm ?? {},
    assayNote: marker.as ?? null,
    palindromic: Boolean(marker.pal),
    xLinked: xLinkedVariants.has(marker.rs),
  })),
};

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(outputUrl, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");

const phaseOneRecords = {
  profiles: [
    {
      id: "sam-240184",
      memberNumber: "SAM-240184",
      firstName: "Sam",
      lastName: "Carter",
      dateOfBirth: "1988-04-17",
      sexAtBirth: "male",
      sampleId: "GNS-8810-24",
      assayName: "Pangenomix Whole Health Array",
      assayVersion: "v3.2",
      consentStatus: "active",
      processedAt: "2026-07-30T06:42:00.000Z",
    },
  ],
  genotypeCalls: Object.entries({ ...demoSport, ...demoExtra }).map(
    ([variantId, genotype]) => ({
      profileId: "sam-240184",
      variantId,
      genotype,
      quality: 0.99,
    }),
  ),
};

await writeFile(
  profilesOutputUrl,
  `${JSON.stringify(phaseOneRecords, null, 2)}\n`,
  "utf8",
);

console.log(
  `Extracted ${catalogue.markers.length} marker definitions and ${phaseOneRecords.genotypeCalls.length} seeded genotype rows.`,
);
