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
import { buildRecommendationSynthesis } from "./recommendations";

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
  mv_muscle: {
    title: "Build a versatile movement base",
    description:
      "Combine progressive strength with repeatable aerobic work, then adjust fuel and recovery to the sessions you actually do.",
  },
  mv_oxygen: {
    title: "Confirm oxygen-carrying capacity",
    description:
      "Use measured blood values and clinician context for oxygen or haemoglobin questions; do not infer them from performance alone.",
  },
  mv_cardio: {
    title: "Measure the cardiovascular basics",
    description:
      "Keep aerobic movement frequent and make resting blood pressure and a proper lipid panel part of routine care.",
  },
  rc_inflam: {
    title: "Create room for recovery",
    description:
      "Protect sleep duration, keep easy aerobic work frequent, and separate maximal training days.",
  },
  rc_antiox: {
    title: "Use food, not megadoses",
    description:
      "Build colour, protein, and plant variety into daily meals; avoid high-dose antioxidant capsules around training.",
  },
  rc_detox: {
    title: "Feed ordinary clearance pathways",
    description:
      "Make brassicas, alliums, adequate protein, and fresh food routine while reducing avoidable exposure.",
  },
  rc_tissue: {
    title: "Load connective tissue slowly",
    description:
      "Use slow, progressive strength work and increase tendon and joint load in steps rather than jumps.",
  },
  rc_vitd: {
    title: "Measure before deciding",
    description:
      "Combine resistance and impact work with daylight, and use measured vitamin D or clinician context instead of guessing.",
  },
  sl_circ: {
    title: "Anchor the body clock",
    description:
      "Get outdoor light soon after waking, dim evenings, and keep the wake time steadier than the bedtime.",
  },
  sl_aden: {
    title: "Move the caffeine boundary",
    description:
      "Run a two-week earlier cut-off experiment and judge it by sleep onset and next-morning clarity.",
  },
  sl_gaba: {
    title: "Build a dependable downshift",
    description:
      "Use a repeatable wind-down, a cool dark room, and a firm boundary between high-output work and bed.",
  },
  sl_sero: {
    title: "Stabilise the mood-to-sleep inputs",
    description:
      "Prioritise morning daylight, regular movement, adequate protein, and enough time for the final sleep cycles.",
  },
  sl_stress: {
    title: "Shorten the stress tail",
    description:
      "Protect a real transition out of work and use aerobic movement before pressure becomes cumulative.",
  },
  sl_qual: {
    title: "Protect sleep continuity",
    description:
      "Keep timing consistent and test late caffeine, alcohol, temperature, or iron status against your own nights.",
  },
  ef_primary: {
    title: "Design the conditions for good decisions",
    description:
      "Put demanding thinking into your strongest window, make progress visible, and protect sleep under pressure.",
  },
  sy_methyl: {
    title: "Cover the one-carbon food foundations",
    description:
      "Prioritise greens, legumes, eggs, and beetroot; use measured homocysteine instead of guessing from a genotype.",
  },
  sy_metab: {
    title: "Shape the meal and movement environment",
    description:
      "Use protein and fibre early in meals, regular ordinary movement, and walking after meals before considering products.",
  },
  sy_renal: {
    title: "Keep kidney checks measurable",
    description:
      "Use blood pressure, eGFR, and urine protein when a clinician says they are relevant; genetics is context, not the measurement.",
  },
};

interface ResolvedCall {
  genotype: string;
  rawGenotype: string;
  quality: number | null;
  strandFlipped: boolean;
  strandAmbiguous: boolean;
}

const NO_CALL_PATTERN = /^(?:-{2,}|NC|NN|UND|\.\/\.|0)$/i;

const APOE_DIPLOTYPES: Record<string, string> = {
  "TT|TT": "E2/E2",
  "TT|CT": "E2/E3",
  "CT|CT": "E2/E4",
  "TT|CC": "E3/E3",
  "CT|CC": "E3/E4",
  "CC|CC": "E4/E4",
};
const APOE_DIRECT_DIPLOTYPES = new Set(Object.values(APOE_DIPLOTYPES));
const NAT2_RAPID_ALLELES = new Set(["4", "11", "12", "13"]);
const NAT2_SLOW_ALLELES = new Set(["5", "6", "7", "14"]);

function isNoCall(value: string) {
  return NO_CALL_PATTERN.test(value.trim());
}

function canonicalVariantId(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "rs429358,rs7412"
    ? "rs429358+rs7412"
    : normalized;
}

function normalizeRecord(record: GenotypeRecord): GenotypeRecord {
  return {
    profileId: record.profileId.trim(),
    ...(record.gene?.trim()
      ? { gene: record.gene.trim().toUpperCase() }
      : {}),
    variantId: canonicalVariantId(record.variantId),
    genotype: record.genotype.trim(),
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

  const simpleCall = /^(?:([ACGT])|([ACGT])([ACGT])|([ACGT])\s*[|/]\s*([ACGT]))$/.exec(
    rawUpper,
  );
  if (!simpleCall) return null;

  let alleles: string[];
  if (simpleCall[1]) {
    alleles = [simpleCall[1]];
  } else if (simpleCall[2] && simpleCall[3]) {
    alleles = [simpleCall[2], simpleCall[3]];
  } else if (simpleCall[4] && simpleCall[5]) {
    alleles = [simpleCall[4], simpleCall[5]];
  } else {
    return null;
  }
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

function normalizeApoeComponent(record: GenotypeRecord) {
  const raw = record.genotype.trim().toUpperCase();
  const match = /^(?:([ACGT])([ACGT])|([ACGT])\s*[|/]\s*([ACGT]))$/.exec(
    raw,
  );
  if (!match) return null;
  const first = match[1] ?? match[3];
  const second = match[2] ?? match[4];
  return first && second ? normalizePair(first, second) : null;
}

function resolveApoe(
  first: GenotypeRecord,
  second: GenotypeRecord,
): ResolvedCall | null {
  const firstGenotype = normalizeApoeComponent(first);
  const secondGenotype = normalizeApoeComponent(second);
  if (!firstGenotype || !secondGenotype) return null;

  const genotype = APOE_DIPLOTYPES[`${firstGenotype}|${secondGenotype}`];
  if (!genotype) return null;

  return {
    genotype,
    rawGenotype: `${first.genotype} · ${second.genotype}`,
    quality:
      first.quality === null || second.quality === null
        ? null
        : Math.min(first.quality, second.quality),
    strandFlipped: false,
    strandAmbiguous: false,
  };
}

function resolveDirectApoe(record: GenotypeRecord): ResolvedCall | null {
  const genotype = record.genotype.toUpperCase().replace(/\s+/g, "");
  if (!APOE_DIRECT_DIPLOTYPES.has(genotype)) return null;

  return {
    genotype,
    rawGenotype: record.genotype,
    quality: record.quality,
    strandFlipped: false,
    strandAmbiguous: false,
  };
}

function nat2AlleleClass(allele: string): "rapid" | "slow" | null {
  const match = /^\*(4|5|6|7|11|12|13|14)[A-Z]?$/.exec(allele);
  if (!match) return null;
  const family = match[1];
  if (NAT2_RAPID_ALLELES.has(family)) return "rapid";
  if (NAT2_SLOW_ALLELES.has(family)) return "slow";
  return null;
}

function resolveNat2Summary(record: GenotypeRecord): ResolvedCall | null {
  const raw = record.genotype.trim();
  const match = /^(\*(?:4|5|6|7|11|12|13|14)[A-Z]?)\s*\/\s*(\*(?:4|5|6|7|11|12|13|14)[A-Z]?)$/i.exec(
    raw,
  );
  if (!match) return null;
  const alleles = [match[1].toUpperCase(), match[2].toUpperCase()];

  const classes = alleles.map(nat2AlleleClass);
  if (classes.some((value) => value === null)) return null;

  const slowAlleles = classes.filter((value) => value === "slow").length;
  const genotype =
    slowAlleles === 0
      ? "RAPID"
      : slowAlleles === 1
        ? "INTERMEDIATE"
        : "SLOW";

  return {
    genotype,
    rawGenotype: raw,
    quality: record.quality,
    strandFlipped: false,
    strandAmbiguous: false,
  };
}

function markerResult(
  marker: MarkerDefinition,
  records: Map<string, GenotypeRecord>,
  profile: GeneProfile,
  domains: MarkerCatalogue["domains"],
  asOf: string,
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
    clinicalReferral: Boolean(marker.clinicalReferral),
    componentVariants: [...(marker.componentVariants ?? [])],
    sourceOnly: Boolean(marker.sourceOnly),
  };
  const profileAge = ageAt(profile.dateOfBirth, asOf);
  let resolved: ResolvedCall | null = null;
  let unreadableRaw: string | null = null;

  if (marker.sourceOnly) {
    const record = findRecord(marker, records);
    if (!record || isNoCall(record.genotype)) {
      return {
        ...base,
        state: "not-called",
        rawGenotype: record?.genotype ?? null,
        genotype: null,
        namedVariant: null,
        leverage: null,
        interpretation:
          "This source-only component input was not called and is never scored independently.",
        strandFlipped: false,
        strandAmbiguous: false,
        quality: record?.quality ?? null,
      };
    }

    return {
      ...base,
      state: "unmapped",
      rawGenotype: record.genotype,
      genotype: record.genotype,
      namedVariant: null,
      leverage: null,
      interpretation:
        "This call is retained as a source-only component input and is not interpreted or scored independently.",
      strandFlipped: false,
      strandAmbiguous: false,
      quality: record.quality,
    };
  }

  if (marker.variantId === "acetylator status" && marker.gene === "NAT2") {
    const summary = records.get("various");
    if (
      !summary ||
      (summary.gene && summary.gene !== "NAT2") ||
      isNoCall(summary.genotype)
    ) {
      return {
        ...base,
        state: "not-called",
        rawGenotype: null,
        genotype: null,
        namedVariant: null,
        leverage: null,
        interpretation:
          "No validated NAT2 star-diplotype summary was available, so acetylator status is not inferred from unphased SNP calls.",
        strandFlipped: false,
        strandAmbiguous: false,
        quality: null,
      };
    }

    unreadableRaw = summary.genotype;
    resolved = resolveNat2Summary(summary);
  } else if (marker.variantId === "rs429358+rs7412") {
    const first =
      records.get("rs429358") ?? records.get("apoe:rs429358");
    const second = records.get("rs7412") ?? records.get("apoe:rs7412");
    const direct =
      records.get("rs429358+rs7412") ??
      records.get("apoe:rs429358+rs7412") ??
      records.get("rs429358,rs7412") ??
      records.get("apoe:rs429358,rs7412");
    const directAvailable = Boolean(direct && !isNoCall(direct.genotype));
    const directResolved =
      directAvailable && direct ? resolveDirectApoe(direct) : null;

    if (directAvailable && !directResolved) {
      throw new GenotypeRecordIntegrityError(
        marker.variantId,
        "Unsupported direct APOE diplotype",
      );
    }

    const componentsAvailable = Boolean(
      first &&
        second &&
        !isNoCall(first.genotype) &&
        !isNoCall(second.genotype),
    );

    if (componentsAvailable && first && second) {
      unreadableRaw = `${first.genotype} · ${second.genotype}`;
      resolved = resolveApoe(first, second);

      if (
        directResolved &&
        (!resolved || directResolved.genotype !== resolved.genotype)
      ) {
        throw new GenotypeRecordIntegrityError(
          marker.variantId,
          "Conflicting direct and component APOE diplotypes",
        );
      }
    } else if (directResolved) {
      unreadableRaw = direct?.genotype ?? null;
      resolved = directResolved;
    } else {
      return {
        ...base,
        state: "not-called",
        rawGenotype: null,
        genotype: null,
        namedVariant: null,
        leverage: null,
        interpretation:
          "No matching genotype record was available, so this marker is excluded from scoring.",
        strandFlipped: false,
        strandAmbiguous: false,
        quality: null,
      };
    }
  } else {
    const record = findRecord(marker, records);
    if (!record || isNoCall(record.genotype)) {
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

    unreadableRaw = record.genotype;
    resolved = resolveSimpleCall(marker, record, profile.assayStrand);
  }

  if (!resolved) {
    return {
      ...base,
      state: "unreadable",
      rawGenotype: unreadableRaw,
      genotype: null,
      namedVariant: null,
      leverage: null,
      interpretation:
        "The stored call does not match a supported genotype and has not been guessed.",
      strandFlipped: false,
      strandAmbiguous: false,
      quality: null,
    };
  }

  if (
    marker.variantId === "rs429358+rs7412" &&
    profileAge !== null &&
    profileAge < 18
  ) {
    return {
      ...base,
      state: "withheld",
      rawGenotype: null,
      genotype: null,
      namedVariant: null,
      leverage: null,
      interpretation:
        "This result is withheld because the processed profile confirms the reader is under 18.",
      strandFlipped: false,
      strandAmbiguous: false,
      quality: null,
    };
  }

  if (marker.xLinked && profile.sexAtBirth === "unspecified") {
    return {
      ...base,
      state: "unreadable",
      rawGenotype: resolved.rawGenotype,
      genotype: resolved.genotype,
      namedVariant: marker.namedVariants[resolved.genotype] ?? null,
      leverage: null,
      interpretation:
        "This X-linked result requires verified sex at birth and is excluded from scoring until that profile value is available.",
      strandFlipped: resolved.strandFlipped,
      strandAmbiguous: resolved.strandAmbiguous,
      quality: resolved.quality,
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
    genotype[0] !== genotype[1]
  ) {
    return {
      ...base,
      state: "unreadable",
      rawGenotype: resolved.rawGenotype,
      genotype,
      namedVariant: marker.namedVariants[genotype] ?? null,
      leverage: null,
      interpretation:
        "A heterozygous diploid call is not valid for this X-linked marker with verified male sex, so the result is excluded from scoring.",
      strandFlipped: resolved.strandFlipped,
      strandAmbiguous: resolved.strandAmbiguous,
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

  if ((interpretation[0] === 0) !== Boolean(marker.clinicalReferral)) {
    throw new GenotypeRecordIntegrityError(
      marker.variantId,
      "Marker leverage 0 is reserved for clinician-referral results",
    );
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

    if (marker.gene === "APOE" && variantId === "rs429358+rs7412") {
      keys.add("rs429358,rs7412");
      keys.add("apoe:rs429358,rs7412");
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
    clinicalReferral: false,
    componentVariants: [],
    sourceOnly: true,
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

function bandForScore(score: number, calledMarkers: number): DomainBand {
  let band: DomainBand =
    score >= 2.55
      ? 5
      : score >= 2.25
        ? 4
        : score >= 1.95
          ? 3
          : score >= 1.7
            ? 2
            : 1;

  if (calledMarkers < 5 && band === 5) band = 4;
  if (calledMarkers < 5 && band === 1) band = 2;
  if (calledMarkers < 3) band = 3;
  return band;
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
          !marker.clinicalReferral &&
          !marker.sourceOnly &&
          Object.keys(marker.interpretations).length > 0,
      );
      const markerIds = new Set(domainMarkers.map((marker) => marker.id));
      const called = markers.filter(
        (marker) => markerIds.has(marker.id) && marker.state === "called",
      );
      const evidenceWeights: Record<string, number> = {
        A: 1,
        B: 0.85,
        C: 0.55,
        D: 0.25,
      };
      const weighted = called.reduce(
        (result, marker) => {
          const weight = evidenceWeights[marker.evidenceGrade] ?? 0.5;
          result.sum += (marker.leverage ?? 0) * weight;
          result.weight += weight;
          if ((marker.leverage ?? 0) >= 3) result.high += 1;
          if ((marker.leverage ?? 0) <= 1) result.low += 1;
          return result;
        },
        { sum: 0, weight: 0, high: 0, low: 0 },
      );
      const average =
        called.length && weighted.weight
          ? weighted.sum / weighted.weight
          : null;
      const unshrunkScore =
        average === null
          ? null
          : average +
            0.75 * (weighted.high / called.length) -
            0.55 * (weighted.low / called.length);
      const shrinkK = 2;
      const score =
        unshrunkScore === null
          ? null
          : (unshrunkScore * called.length + 2 * shrinkK) /
            (called.length + shrinkK);
      const band =
        score === null ? null : bandForScore(score, called.length);
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
        bandScore: score,
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
  const asOf = context.asOf ?? profile.processedAt;
  const profileAge = ageAt(profile.dateOfBirth, asOf);
  const confirmedMinor = profileAge !== null && profileAge < 18;
  const unmapped = indexedRecords.uniqueRecords
    .filter((record) => !sourceKeys.has(record.variantId))
    // APOE is reported as an adult-only composite. Its two raw component
    // calls are sufficient to reconstruct that result, so they must not leak
    // through the source-only/raw path for a confirmed minor.
    .filter(
      (record) =>
        !confirmedMinor ||
        (record.variantId !== "rs429358" && record.variantId !== "rs7412"),
    )
    .map(unmappedMarker);
  const markers = [
    ...catalogue.markers.map((marker) =>
      markerResult(marker, records, profile, catalogue.domains, asOf),
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
    (marker) =>
      !marker.sourceOnly && Object.keys(marker.interpretations).length > 0,
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
      sexAtBirth: profile.sexAtBirth,
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
      unmappedMarkers: markers.filter((marker) => marker.state === "unmapped")
        .length,
      strandFlips: markers.filter((marker) => marker.strandFlipped).length,
      overallCoverage: callableMarkers ? calledMarkers / callableMarkers : 0,
      rulesVersion: catalogue.version,
      processedAt: profile.processedAt,
      durationMs: Date.now() - startedAt,
    },
    domains,
    markers,
    priorities: buildPriorities(domains),
    recommendations: buildRecommendationSynthesis(markers, {
      adultSupplementReferencesAllowed: !confirmedMinor,
    }),
    groups: GROUPS.map((group) => ({
      ...group,
      domainIds: domains
        .filter((domain) => domain.group === group.id)
        .map((domain) => domain.id),
    })),
  };
}
