import type {
  BandDefinition,
  DomainBand,
  DomainScore,
  GeneProfile,
  GeneReport,
  GenotypeRecord,
  MarkerCatalogue,
  MarkerDefinition,
  ProcessingContext,
  ProcessedMarker,
  ReportAction,
} from "./types";

const COMPLEMENT: Record<string, string> = {
  A: "T",
  T: "A",
  C: "G",
  G: "C",
};

const GROUPS = [
  { id: "movement", name: "Movement" },
  { id: "recovery", name: "Recovery" },
  { id: "sleep", name: "Sleep" },
  { id: "exec", name: "Executive fitness" },
  { id: "systems", name: "Core systems" },
];

const DOMAIN_ACTIONS: Record<
  string,
  { title: string; description: string }
> = {
  power: {
    title: "Protect quality in strength work",
    description:
      "Keep hard sets crisp, leave full recovery between efforts, and progress load in measured steps.",
  },
  endurance: {
    title: "Build the quiet aerobic base",
    description:
      "Frequent easy aerobic work is the dependable lever. Consistency matters more than heroic sessions.",
  },
  energy: {
    title: "Train mitochondrial consistency",
    description:
      "Repeat manageable aerobic sessions across the week and let volume accumulate before intensity.",
  },
  oxygen: {
    title: "Support blood-flow demand",
    description:
      "Use a real warm-up, include nitrate-rich greens, and measure resting blood pressure routinely.",
  },
  fuel: {
    title: "Match fuel to the work",
    description:
      "Put carbohydrate around demanding sessions and finish the last substantial meal well before sleep.",
  },
  inflam: {
    title: "Create room for recovery",
    description:
      "Protect sleep duration, keep easy aerobic work frequent, and separate maximal training days.",
  },
  oxstress: {
    title: "Use food, not megadoses",
    description:
      "Build colour and variety into daily meals; avoid high-dose antioxidant capsules around training.",
  },
  histamine: {
    title: "Test freshness and timing",
    description:
      "Prefer freshly cooked food and track whether late meals, alcohol, or tightly stacked sessions affect sleep.",
  },
  structure: {
    title: "Load connective tissue slowly",
    description:
      "Use slow heavy strength work twice weekly and progress tendons in steps rather than jumps.",
  },
  bone: {
    title: "Make bone respond",
    description:
      "Combine resistance and impact work with daylight, then measure vitamin D when clinically appropriate.",
  },
  circadian: {
    title: "Anchor the body clock",
    description:
      "Get outdoor light soon after waking, dim evenings, and keep the wake time steadier than the bedtime.",
  },
  sleeppress: {
    title: "Move the caffeine boundary",
    description:
      "Run a two-week earlier cut-off experiment and judge it by sleep onset and next-morning clarity.",
  },
  depth: {
    title: "Protect deep sleep",
    description:
      "Keep timing consistent, make the room cool and dark, and keep alcohol away from the sleep window.",
  },
  rem: {
    title: "Guard the second half",
    description:
      "Give the final sleep cycles enough time and keep late caffeine and alcohol from fragmenting them.",
  },
  arousal: {
    title: "Build a real downshift",
    description:
      "Create a repeatable wind-down hour and a hard boundary between high-output work and bed.",
  },
  focus: {
    title: "Use the right pressure window",
    description:
      "Put demanding thinking into your strongest time of day and shape stimulation to the task.",
  },
  drive: {
    title: "Make progress visible",
    description:
      "Use short feedback loops, clear milestones, and external structure instead of waiting for motivation.",
  },
  emotion: {
    title: "Stabilise the inputs",
    description:
      "Keep sleep timing regular, get daylight, and use the social or quiet recovery that reliably steadies you.",
  },
  resilience: {
    title: "Shorten the stress tail",
    description:
      "Use aerobic work, a protected wind-down, and recovery days before pressure becomes cumulative.",
  },
  vigilance: {
    title: "Time alertness deliberately",
    description:
      "Match caffeine to clearance, protect breaks, and reserve the longest focus blocks for your best window.",
  },
  methyl: {
    title: "Cover the food foundations",
    description:
      "Prioritise greens, legumes, eggs, and beetroot; use a measured homocysteine result instead of guessing.",
  },
  detox: {
    title: "Feed clearance pathways",
    description:
      "Make brassicas and alliums routine and reduce avoidable load rather than reaching for a cleanse.",
  },
};

interface ResolvedCall {
  genotype: string;
  rawGenotype: string;
  quality: number | null;
  strandFlipped: boolean;
  strandAmbiguous: boolean;
}

const NO_CALL_PATTERN = /^(--|NC|NN|UND|\.\/\.|0)$/i;

function isNoCall(value: string) {
  return NO_CALL_PATTERN.test(value.trim());
}

function canonicalVariantId(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRecord(record: GenotypeRecord): GenotypeRecord {
  return {
    profileId: record.profileId.trim(),
    ...(record.gene?.trim()
      ? { gene: record.gene.trim().toUpperCase() }
      : {}),
    variantId: canonicalVariantId(record.variantId),
    genotype: record.genotype.trim().toUpperCase(),
    quality: record.quality,
  };
}

function recordFingerprint(record: GenotypeRecord) {
  return JSON.stringify([
    record.profileId,
    record.gene ?? null,
    record.variantId,
    record.genotype,
    record.quality,
  ]);
}

export class GenotypeRecordIntegrityError extends Error {
  readonly variantId: string;

  constructor(
    variantId: string,
    reason = "Conflicting duplicate genotype records",
  ) {
    super(`${reason} for ${variantId || "an unknown variant"}.`);
    this.name = "GenotypeRecordIntegrityError";
    this.variantId = variantId;
  }
}

function indexGenotypeRecords(genotypeRecords: GenotypeRecord[]) {
  const uniqueByVariant = new Map<string, GenotypeRecord>();
  const fingerprints = new Map<string, string>();

  for (const sourceRecord of genotypeRecords) {
    const record = normalizeRecord(sourceRecord);
    const key = record.variantId;
    if (!key) {
      throw new GenotypeRecordIntegrityError(
        key,
        "A genotype record is missing its variant identifier",
      );
    }

    const fingerprint = recordFingerprint(record);
    const previousFingerprint = fingerprints.get(key);
    if (previousFingerprint !== undefined) {
      if (previousFingerprint !== fingerprint) {
        throw new GenotypeRecordIntegrityError(key);
      }
      continue;
    }

    fingerprints.set(key, fingerprint);
    uniqueByVariant.set(key, record);
  }

  const uniqueRecords = [...uniqueByVariant.values()].sort((left, right) =>
    left.variantId.localeCompare(right.variantId),
  );

  return {
    records: new Map(
      uniqueRecords.map((record) => [record.variantId, record]),
    ),
    uniqueRecords,
  };
}

function normalizePair(first: string, second: string) {
  return [first, second].sort().join("");
}

function expectedAlleles(marker: MarkerDefinition) {
  return marker.expectedAlleles
    .split("/")
    .filter((allele) => allele.length === 1);
}

function isPalindromic(marker: MarkerDefinition) {
  const alleles = expectedAlleles(marker);
  return (
    marker.palindromic ||
    (alleles.length === 2 &&
      ((alleles.includes("A") && alleles.includes("T")) ||
        (alleles.includes("C") && alleles.includes("G"))))
  );
}

function resolveSimpleCall(
  marker: MarkerDefinition,
  record: GenotypeRecord,
  assayStrand: GeneProfile["assayStrand"],
): ResolvedCall | null {
  const raw = record.genotype.trim();
  const rawUpper = raw.toUpperCase();

  if (isNoCall(raw)) return null;

  if (marker.expectedAlleles === "CNV") {
    const compact = rawUpper.replace(/[\s_-]+/g, " ").trim();
    const genotype =
      /^(NULL|DEL|DELETED|ABSENT)$/.test(compact)
        ? "NULL"
        : /^(HET|HETEROZYGOUS|1 COPY|ONE COPY)$/.test(compact)
          ? "HET"
          : /^(PRESENT|2 COPIES|TWO COPIES)$/.test(compact)
            ? "PRESENT"
            : rawUpper;

    return {
      genotype,
      rawGenotype: raw,
      quality: record.quality,
      strandFlipped: false,
      strandAmbiguous: false,
    };
  }

  if (
    ["COMPOSITE", "REPEAT", "INDEL", "—"].includes(
      marker.expectedAlleles,
    )
  ) {
    return {
      genotype: rawUpper,
      rawGenotype: raw,
      quality: record.quality,
      strandFlipped: false,
      strandAmbiguous: false,
    };
  }

  let alleles = rawUpper
    .replace(/[^ACGT]/g, "")
    .split("")
    .slice(0, 2);
  const expected = expectedAlleles(marker);

  if (!alleles.length || !expected.length) return null;

  let strandFlipped = false;
  if (assayStrand === "reverse") {
    alleles = alleles.map((allele) => COMPLEMENT[allele] ?? allele);
    strandFlipped = true;
  }

  const ambiguous =
    isPalindromic(marker) &&
    (assayStrand === "unknown" ||
      alleles.length === 1 ||
      alleles[0] === alleles[1]);
  const genotype =
    alleles.length === 1
      ? alleles[0]
      : normalizePair(alleles[0], alleles[1]);

  if (alleles.every((allele) => expected.includes(allele))) {
    return {
      genotype,
      rawGenotype: raw,
      quality: record.quality,
      strandFlipped,
      strandAmbiguous: ambiguous,
    };
  }

  if (assayStrand === "reverse") {
    return {
      genotype,
      rawGenotype: raw,
      quality: record.quality,
      strandFlipped,
      strandAmbiguous: true,
    };
  }

  const flipped = alleles.map((allele) => COMPLEMENT[allele] ?? allele);
  if (flipped.every((allele) => expected.includes(allele))) {
    return {
      genotype:
        flipped.length === 1
          ? flipped[0]
          : normalizePair(flipped[0], flipped[1]),
      rawGenotype: raw,
      quality: record.quality,
      strandFlipped: true,
      strandAmbiguous: ambiguous,
    };
  }

  return {
    genotype,
    rawGenotype: raw,
    quality: record.quality,
    strandFlipped: false,
    strandAmbiguous: true,
  };
}

function ageAt(dateOfBirth: string | null, at: string) {
  if (!dateOfBirth) return null;

  const birth = new Date(dateOfBirth);
  const date = new Date(at);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(date.getTime())) {
    return null;
  }

  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() &&
      date.getUTCDate() < birth.getUTCDate());

  if (beforeBirthday) age -= 1;
  return age;
}

function findRecord(
  marker: MarkerDefinition,
  records: Map<string, GenotypeRecord>,
) {
  return (
    records.get(marker.variantId.toLowerCase()) ??
    records.get(`${marker.gene}:${marker.variantId}`.toLowerCase()) ??
    null
  );
}

function resolveApoe(
  marker: MarkerDefinition,
  records: Map<string, GenotypeRecord>,
): ResolvedCall | null {
  const first =
    records.get("rs429358") ?? records.get("apoe:rs429358");
  const second = records.get("rs7412") ?? records.get("apoe:rs7412");
  if (!first || !second) return null;
  if (isNoCall(first.genotype) || isNoCall(second.genotype)) return null;

  const firstAlleles = first.genotype.toUpperCase().replace(/[^ACGT]/g, "");
  const secondAlleles = second.genotype.toUpperCase().replace(/[^ACGT]/g, "");
  if (firstAlleles.length !== 2 || secondAlleles.length !== 2) return null;
  const cCount = (firstAlleles.match(/C/g) ?? []).length;
  const tCount = (secondAlleles.match(/T/g) ?? []).length;

  let alleles: string[];
  if (tCount === 2) alleles = ["E2", "E2"];
  else if (tCount === 1 && cCount === 0) alleles = ["E2", "E3"];
  else if (tCount === 1 && cCount === 1) alleles = ["E2", "E4"];
  else if (cCount === 2) alleles = ["E4", "E4"];
  else if (cCount === 1) alleles = ["E3", "E4"];
  else alleles = ["E3", "E3"];

  return {
    genotype: alleles.join("/"),
    rawGenotype: `${first.genotype} · ${second.genotype}`,
    quality:
      first.quality === null || second.quality === null
        ? null
        : Math.min(first.quality, second.quality),
    strandFlipped: false,
    strandAmbiguous: false,
  };
}

function markerResult(
  marker: MarkerDefinition,
  records: Map<string, GenotypeRecord>,
  profile: GeneProfile,
  domains: MarkerCatalogue["domains"],
): ProcessedMarker {
  const base = {
    id: marker.id,
    gene: marker.gene,
    variantId: marker.variantId,
    expectedAlleles: marker.expectedAlleles,
    domainIds: marker.domainIds,
    domainNames: marker.domainIds.map(
      (domainId) => domains[domainId]?.name ?? domainId,
    ),
    evidenceGrade: marker.evidenceGrade,
    impact: marker.impact,
    assayNote: marker.assayNote,
  };
  const profileAge = ageAt(profile.dateOfBirth, profile.processedAt);

  if (
    marker.variantId === "rs429358+rs7412" &&
    (profileAge === null || profileAge < 18)
  ) {
    return {
      ...base,
      state: "withheld",
      rawGenotype: null,
      genotype: null,
      namedVariant: null,
      leverage: null,
      interpretation:
        "This adult-only result is withheld until adult eligibility is verified.",
      strandFlipped: false,
      strandAmbiguous: false,
      quality: null,
    };
  }

  const resolved =
    marker.variantId === "rs429358+rs7412"
      ? resolveApoe(marker, records)
      : (() => {
          const record = findRecord(marker, records);
          return record
            ? resolveSimpleCall(marker, record, profile.assayStrand)
            : null;
        })();

  if (!resolved) {
    return {
      ...base,
      state: "not-called",
      rawGenotype: null,
      genotype: null,
      namedVariant: null,
      leverage: null,
      interpretation:
        marker.variantId === "design item"
          ? "This pathway item is retained for coverage but has no confirmed assay call."
          : "No matching genotype record was available, so this marker is excluded from scoring.",
      strandFlipped: false,
      strandAmbiguous: false,
      quality: null,
    };
  }

  let genotype = resolved.genotype;
  const singleAlleleCall = /^[ACGT]$/i.test(genotype);
  if (
    singleAlleleCall &&
    !(marker.xLinked && profile.sexAtBirth === "male")
  ) {
    return {
      ...base,
      state: "unreadable",
      rawGenotype: resolved.rawGenotype,
      genotype,
      namedVariant: marker.namedVariants[genotype] ?? null,
      leverage: null,
      interpretation:
        "A single-allele call requires an X-linked marker and verified male sex, so this result is excluded from scoring.",
      strandFlipped: resolved.strandFlipped,
      strandAmbiguous: resolved.strandAmbiguous,
      quality: resolved.quality,
    };
  }

  if (isPalindromic(marker) && profile.assayStrand === "unknown") {
    return {
      ...base,
      state: "unreadable",
      rawGenotype: resolved.rawGenotype,
      genotype,
      namedVariant: marker.namedVariants[genotype] ?? null,
      leverage: null,
      interpretation:
        "The assay strand is unknown for this palindromic marker, so the result is excluded from scoring.",
      strandFlipped: resolved.strandFlipped,
      strandAmbiguous: true,
      quality: resolved.quality,
    };
  }

  if (
    marker.xLinked &&
    profile.sexAtBirth === "male" &&
    genotype.length === 2 &&
    genotype[0] === genotype[1] &&
    marker.interpretations[genotype[0]]
  ) {
    genotype = genotype[0];
  }

  const interpretation = marker.interpretations[genotype];
  if (!interpretation) {
    return {
      ...base,
      state: "unreadable",
      rawGenotype: resolved.rawGenotype,
      genotype,
      namedVariant: marker.namedVariants[genotype] ?? null,
      leverage: null,
      interpretation:
        "The stored call does not match a supported interpretation and has not been guessed.",
      strandFlipped: resolved.strandFlipped,
      strandAmbiguous: resolved.strandAmbiguous,
      quality: resolved.quality,
    };
  }

  return {
    ...base,
    state: "called",
    rawGenotype: resolved.rawGenotype,
    genotype,
    namedVariant: marker.namedVariants[genotype] ?? null,
    leverage: interpretation[0],
    interpretation: interpretation[1],
    strandFlipped: resolved.strandFlipped,
    strandAmbiguous: resolved.strandAmbiguous,
    quality: resolved.quality,
  };
}

function catalogueSourceKeys(catalogue: MarkerCatalogue) {
  const keys = new Set<string>();

  for (const marker of catalogue.markers) {
    const variantId = canonicalVariantId(marker.variantId);
    keys.add(variantId);
    keys.add(`${marker.gene.trim().toLowerCase()}:${variantId}`);

    if (variantId.includes("+")) {
      for (const component of variantId.split("+")) {
        if (component) {
          keys.add(component);
          keys.add(`${marker.gene.trim().toLowerCase()}:${component}`);
        }
      }
    }
  }

  return keys;
}

function unmappedMarker(record: GenotypeRecord): ProcessedMarker {
  const noCall = isNoCall(record.genotype);

  return {
    id: `UNMAPPED:${record.variantId}`,
    gene: record.gene ?? "Unmapped",
    variantId: record.variantId,
    expectedAlleles: "unknown",
    domainIds: [],
    domainNames: [],
    evidenceGrade: "ungraded",
    impact:
      "This source marker has no definition in the current catalogue.",
    assayNote:
      "Retained for source visibility and excluded from all domain scoring.",
    state: noCall ? "not-called" : "unmapped",
    rawGenotype: record.genotype,
    genotype: noCall ? null : record.genotype,
    namedVariant: null,
    leverage: null,
    interpretation: noCall
      ? "The source reported no call for this uncatalogued marker."
      : "No catalogue interpretation exists, so this source marker is not scored.",
    strandFlipped: false,
    strandAmbiguous: false,
    quality: record.quality,
  };
}

function bandForAverage(average: number): DomainBand {
  return Math.max(
    1,
    Math.min(5, Math.round(((average - 1) / 2) * 4 + 1)),
  ) as DomainBand;
}

function bandDefinition(
  bands: BandDefinition[],
  level: DomainBand | null,
) {
  return bands.find((band) => band.level === level) ?? null;
}

function buildDomains(
  catalogue: MarkerCatalogue,
  markers: ProcessedMarker[],
): DomainScore[] {
  return Object.values(catalogue.domains)
    .map((domain) => {
      const domainMarkers = catalogue.markers.filter(
        (marker) =>
          marker.domainIds.includes(domain.id) &&
          Object.keys(marker.interpretations).length > 0,
      );
      const markerIds = new Set(domainMarkers.map((marker) => marker.id));
      const called = markers.filter(
        (marker) => markerIds.has(marker.id) && marker.state === "called",
      );
      const sum = called.reduce(
        (total, marker) => total + (marker.leverage ?? 0),
        0,
      );
      const average = called.length ? sum / called.length : null;
      const band = average === null ? null : bandForAverage(average);
      const definition = bandDefinition(catalogue.bands, band);
      const total = domainMarkers.length;

      return {
        id: domain.id,
        name: domain.name,
        group: domain.group,
        description: domain.description,
        band,
        bandName: definition?.name ?? "Unevaluated",
        bandSummary:
          definition?.summary ??
          "No called markers were available, so the system remains unevaluated.",
        averageLeverage: average,
        calledMarkers: called.length,
        totalMarkers: total,
        coverage: total ? called.length / total : 0,
        topMarkerIds: called
          .filter((marker) => marker.leverage === 3)
          .map((marker) => marker.id),
      };
    })
    .sort((left, right) => {
      if (left.group !== right.group) {
        return (
          GROUPS.findIndex((group) => group.id === left.group) -
          GROUPS.findIndex((group) => group.id === right.group)
        );
      }
      return (right.band ?? 0) - (left.band ?? 0);
    });
}

function buildPriorities(domains: DomainScore[]): ReportAction[] {
  return [...domains]
    .filter((domain): domain is DomainScore & { band: DomainBand } =>
      Boolean(domain.band),
    )
    .sort((left, right) => {
      if (right.band !== left.band) return right.band - left.band;
      if (right.averageLeverage !== left.averageLeverage) {
        return (
          (right.averageLeverage ?? 0) - (left.averageLeverage ?? 0)
        );
      }
      if (right.coverage !== left.coverage) return right.coverage - left.coverage;
      return right.calledMarkers - left.calledMarkers;
    })
    .slice(0, 3)
    .map((domain) => {
      const action = DOMAIN_ACTIONS[domain.id] ?? {
        title: `Pay attention to ${domain.name.toLowerCase()}`,
        description:
          "Use a small, measurable habit experiment and review it against your own baseline.",
      };

      return {
        domainId: domain.id,
        domainName: domain.name,
        title: action.title,
        description: action.description,
        rationale: `${domain.calledMarkers} of ${domain.totalMarkers} callable markers contributed to a ${domain.bandName.toLowerCase()} result.`,
        band: domain.band,
      };
    });
}

export function processGeneReport(
  profile: GeneProfile,
  genotypeRecords: GenotypeRecord[],
  catalogue: MarkerCatalogue,
  context: ProcessingContext = {},
): GeneReport {
  const startedAt = Date.now();
  const indexedRecords = indexGenotypeRecords(genotypeRecords);
  const records = indexedRecords.records;
  const sourceKeys = catalogueSourceKeys(catalogue);
  const unmapped = indexedRecords.uniqueRecords
    .filter((record) => !sourceKeys.has(record.variantId))
    .map(unmappedMarker);
  const markers = [
    ...catalogue.markers.map((marker) =>
      markerResult(marker, records, profile, catalogue.domains),
    ),
    ...unmapped,
  ];
  const source = context.source ?? "seeded-repository";
  const sourceLabel =
    context.sourceLabel ??
    (source === "azure-sql"
      ? "Azure SQL gene result repository"
      : "Phase 1 member repository");
  const domains = buildDomains(catalogue, markers);
  const callableMarkers = catalogue.markers.filter(
    (marker) => Object.keys(marker.interpretations).length > 0,
  ).length;
  const calledMarkers = markers.filter(
    (marker) => marker.state === "called",
  ).length;
  const unreadableMarkers = markers.filter(
    (marker) => marker.state === "unreadable",
  ).length;
  const withheldMarkers = markers.filter(
    (marker) => marker.state === "withheld",
  ).length;

  return {
    id: `report-${profile.id}-${catalogue.version}`,
    profile: {
      memberNumber: profile.memberNumber,
      firstName: profile.firstName,
      lastName: profile.lastName,
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      assayName: profile.assayName,
    },
    receipt: {
      status: "complete",
      source,
      sourceLabel,
      profileRows: 1,
      genotypeRows: indexedRecords.uniqueRecords.length,
      catalogueMarkers: catalogue.markers.length,
      callableMarkers,
      calledMarkers,
      unreadableMarkers,
      withheldMarkers,
      unmappedMarkers: unmapped.length,
      strandFlips: markers.filter((marker) => marker.strandFlipped).length,
      overallCoverage: callableMarkers ? calledMarkers / callableMarkers : 0,
      rulesVersion: catalogue.version,
      processedAt: profile.processedAt,
      durationMs: Date.now() - startedAt,
    },
    domains,
    markers,
    priorities: buildPriorities(domains),
    groups: GROUPS.map((group) => ({
      ...group,
      domainIds: domains
        .filter((domain) => domain.group === group.id)
        .map((domain) => domain.id),
    })),
  };
}
