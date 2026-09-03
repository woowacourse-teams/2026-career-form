import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { resolveValueBinding } from "./value-binding";

describe("resolveValueBinding", () => {
  it("converts a backend-selected boolean profile field to Y", () => {
    const profile = createEmptyProfile();
    profile.disability.disabilityStatus = "대상";

    expect(
      resolveValueBinding(profile, {
        type: "DERIVED",
        recipe: "BOOLEAN_YN",
        profileFieldKey: "disability.disability.disabilityStatus",
      }),
    ).toMatchObject({ status: "resolved", value: "Y" });
  });
});
