import { readFile, writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";

const sourceUrl = new URL("../sam_report-15.html", import.meta.url);
const outputUrl = new URL("../data/marker-catalogue.json", import.meta.url);
const profilesOutputUrl = new URL(
  "../data/phase-1-gene-records.json",
  import.meta.url,
);
const source = await readFile(sourceUrl, "utf8");
const checkOnly = process.argv.includes("--check");

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

function stripLeadingTrivia(value) {
  let remaining = value.trimStart();
  while (true) {
    if (remaining.startsWith("/*")) {
      const end = remaining.indexOf("*/", 2);
      if (end < 0) throw new Error("Unterminated marker declaration comment.");
      remaining = remaining.slice(end + 2).trimStart();
      continue;
    }
    if (remaining.startsWith("//")) {
      const end = remaining.indexOf("\n", 2);
      remaining = end < 0 ? "" : remaining.slice(end + 1).trimStart();
      continue;
    }
    return remaining;
  }
}

const domains = evaluate(extractAssignmentExpression("DOMAINS", "{", "}"));
const bands = evaluate(extractAssignmentExpression("BANDS", "[", "]"));
const markers = evaluate(extractAssignmentExpression("MARKERS", "[", "]"));
const taxonomyMap = evaluate(
  extractAssignmentExpression("TAXMAP", "{", "}"),
);
const legacyDomains = evaluate(
  extractAssignmentExpression("LEGACY", "{", "}"),
);
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
  const argumentsSource = source.slice(open + 1, close).trim();

  // Only collect declarations whose arguments are literal objects, DESIGN
  // calls, or a spread literal. The applyTaxonomy runtime loop also contains
  // MARKERS.push(m); evaluating that identifier here would execute source
  // behaviour instead of extracting source declarations.
  const declarationStart = stripLeadingTrivia(argumentsSource);
  const isStaticDeclaration =
    declarationStart.startsWith("{") ||
    declarationStart.startsWith("DESIGN(") ||
    declarationStart.startsWith("...");
  if (!isStaticDeclaration) {
    searchFrom = close + 1;
    continue;
  }

  const additions = vm.runInNewContext(
    `[${argumentsSource}]`,
    { DESIGN },
    { timeout: 1_000 },
  );

  markers.push(...additions);
  searchFrom = close + 1;
}

// Mirror applyTaxonomy from the active report source. The report's reference
// list is authoritative; legacy domains are used only for the two retained
// composites, exactly as they are in the source.
const retainedCompositeIds = new Set([
  "rs429358+rs7412",
  "acetylator status",
]);
const taxonomyMarkers = markers.flatMap((marker) => {
  const mapped = taxonomyMap[marker.rs];
  if (mapped) {
    return [{ ...marker, d: [...mapped], ref: true }];
  }

  if (!retainedCompositeIds.has(marker.rs)) return [];

  const mappedLegacyDomains =
    marker.rs === "rs429358+rs7412"
      ? ["rc_vitd"]
      : [
          ...new Set(
            (marker.d ?? [])
              .map((domainId) =>
                Object.hasOwn(domains, domainId)
                  ? domainId
                  : legacyDomains[domainId],
              )
              .filter(Boolean),
          ),
        ];
  return [
    {
      ...marker,
      d: mappedLegacyDomains.length
        ? mappedLegacyDomains
        : [marker.rs === "acetylator status" ? "rc_detox" : "rc_vitd"],
      ref: true,
    },
  ];
});

const markerKeys = taxonomyMarkers.map(
  (marker) => `${marker.g.trim().toUpperCase()}|${marker.rs.trim().toLowerCase()}`,
);
if (new Set(markerKeys).size !== markerKeys.length) {
  throw new Error("The active report source contains duplicate marker definitions.");
}

for (const marker of taxonomyMarkers) {
  for (const [genotype, interpretation] of Object.entries(marker.gt ?? {})) {
    const leverage = interpretation?.[0];
    if (![0, 1, 2, 3].includes(leverage)) {
      throw new Error(`${marker.g} ${marker.rs} ${genotype} has invalid leverage.`);
    }
    if (leverage === 0 && !marker.refer) {
      throw new Error(
        `${marker.g} ${marker.rs} uses referral-only leverage 0 without refer:true.`,
      );
    }
    if (marker.refer && leverage !== 0) {
      throw new Error(
        `${marker.g} ${marker.rs} is a referral marker with a scored leverage.`,
      );
    }
  }
}

const xLinkedVariants = new Set(["rs1137070", "rs1799836", "rs6318"]);
const nat2ComponentVariants = new Set(
  taxonomyMarkers.find(
    (marker) =>
      marker.g === "NAT2" && marker.rs === "acetylator status",
  )?.nat2 ?? [],
);
const catalogue = {
  version: "2026.08.16",
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
  markers: taxonomyMarkers.map((marker, index) => ({
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
    clinicalReferral: Boolean(marker.refer),
    componentVariants: [...(marker.nat2 ?? [])],
    sourceOnly:
      marker.g === "NAT2" &&
      marker.rs !== "acetylator status" &&
      nat2ComponentVariants.has(marker.rs),
  })),
};

if (Object.keys(catalogue.domains).length !== 18) {
  throw new Error(
    `Expected 18 report domains, found ${Object.keys(catalogue.domains).length}.`,
  );
}
if (catalogue.markers.length !== 161) {
  throw new Error(
    `Expected 161 report markers, found ${catalogue.markers.length}.`,
  );
}

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
      assayStrand: "forward",
      reportAccessStatus: "enabled",
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

const catalogueJson = `${JSON.stringify(catalogue, null, 2)}\n`;
const phaseOneRecordsJson = `${JSON.stringify(phaseOneRecords, null, 2)}\n`;

if (checkOnly) {
  const [storedCatalogue, storedProfiles] = await Promise.all([
    readFile(outputUrl, "utf8"),
    readFile(profilesOutputUrl, "utf8"),
  ]);
  if (storedCatalogue !== catalogueJson || storedProfiles !== phaseOneRecordsJson) {
    throw new Error(
      "The active report source has drifted from the checked-in marker catalogue or seeded records.",
    );
  }
} else {
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await Promise.all([
    writeFile(outputUrl, catalogueJson, "utf8"),
    writeFile(profilesOutputUrl, phaseOneRecordsJson, "utf8"),
  ]);
}

console.log(
  `${checkOnly ? "Verified" : "Extracted"} ${catalogue.markers.length} marker definitions and ${phaseOneRecords.genotypeCalls.length} seeded genotype rows.`,
);
