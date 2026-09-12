import { expect, it } from "vitest";
import type { Profile, ProfileEnvelope } from "./model";
import { parseProfileImport, serializeProfileExport } from "./profile-transfer";

const fixtures = import.meta.glob<ProfileEnvelope>("../../fixtures/**/*.json", {
  eager: true,
  import: "default",
});
const cases = Object.entries(fixtures).map(([file, envelope]) => ({
  file,
  envelope,
}));

it.each(cases)(
  "imports and roundtrips disability test values from $file",
  ({ envelope }) => {
    const profile = parseProfileImport(JSON.stringify(envelope));
    expect(profile.disability).toEqual({
      disabilityStatus: "대상",
      disabilityType: "지체장애",
      disabilityGrade: "중증",
      disabilityRegistrationNumber: "DIS-DEMO-001",
      disabilityRegistrationDate: "2020-01-01",
    });
    expect(parseProfileImport(serializeProfileExport(profile))).toEqual(
      profile,
    );
  },
);

it.each(cases)(
  "keeps applicable veteran values in $file",
  ({ file, envelope }) => {
    const { veteran } = parseProfileImport(JSON.stringify(envelope));
    if (file.includes("veteran-not-eligible")) {
      expect(veteran).toEqual({ veteranStatus: "비대상" });
    } else {
      expect(veteran).toMatchObject({
        veteranStatus: "대상",
        veteranRelation: "본인",
        veteranNumber: "1234567890",
      });
      expect(veteran.veteranNumber).toMatch(/^\d{10}$/);
    }
  },
);

const base =
  fixtures["../../fixtures/profile-export.hyundai.example.json"].profile;
const withoutScenarios = (profile: Profile) =>
  Object.fromEntries(
    Object.entries(profile).filter(
      ([key]) => key !== "military" && key !== "veteran",
    ),
  );
it.each(
  cases.filter(({ file }) => file.includes("/hyundai-military-veteran/")),
)(
  "preserves the shared base outside military/veteran in $file",
  ({ envelope }) => {
    expect(withoutScenarios(envelope.profile)).toEqual(withoutScenarios(base));
  },
);

it("preserves the military-completed alias fixture as a single-value variant", () => {
  const alias =
    fixtures[
      "../../fixtures/profile-export.hyundai.military-completed.example.json"
    ].profile;
  expect(alias).toEqual({
    ...base,
    military: { ...base.military, militaryStatus: "만기전역" },
  });
});
