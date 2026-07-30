import rawCatalogue from "@/data/marker-catalogue.json";

import type { MarkerCatalogue } from "./types";

export const markerCatalogue = rawCatalogue as unknown as MarkerCatalogue;
