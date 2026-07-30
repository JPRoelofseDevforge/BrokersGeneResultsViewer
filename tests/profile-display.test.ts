import assert from "node:assert/strict";
import test from "node:test";

import type { GeneReportProfile } from "../lib/gene-processing/types";
import {
  GENERIC_BROKER_DAY_PROFILE_NAME,
  reportDisplayName,
  reportInitials,
} from "../lib/reports/profile-display";

const baseProfile: GeneReportProfile = {
  memberNumber: "SAM-1",
  firstName: "Amina",
  lastName: "Ndlovu",
  assayName: "Test assay",
};

test("uses the canonical Broker Day name for both greeting and initials", () => {
  const profile = {
    ...baseProfile,
    displayName: "Dr Amina Ndlovu",
    firstName: "Different",
    lastName: "Preorder",
  };

  assert.equal(reportDisplayName(profile), "Dr Amina Ndlovu");
  assert.equal(reportInitials(profile), "DN");
});

test("keeps a nameless Broker Day identity generic", () => {
  const profile = {
    ...baseProfile,
    displayName: GENERIC_BROKER_DAY_PROFILE_NAME,
    firstName: "",
    lastName: "",
  };

  assert.equal(reportDisplayName(profile), null);
  assert.equal(reportInitials(profile), "SAM");
});

test("uses validated gene-profile names for the local demonstration", () => {
  assert.equal(reportDisplayName(baseProfile), "Amina Ndlovu");
  assert.equal(reportInitials(baseProfile), "AN");
});
