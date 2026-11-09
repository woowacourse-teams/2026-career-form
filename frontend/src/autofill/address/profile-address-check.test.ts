import { describe, expect, it } from "vitest";
import { writtenAddressMatchesProfile } from "./profile-address-check";

const profile = {
  postalCode: "63309",
  address: "제주특별자치도 제주시 첨단로 242",
};

describe("writtenAddressMatchesProfile", () => {
  it.each([
    ["the same address", "63309", "제주특별자치도 제주시 첨단로 242"],
    [
      "an added road reference",
      "63309",
      "제주특별자치도 제주시 첨단로 242 (영평동)",
    ],
    ["a shortened province", "63309", "제주 제주시 첨단로 242"],
    ["folded whitespace", "63309", "제주특별자치도  제주시 첨단로  242"],
  ])("accepts %s", (_name, postalCode, address) => {
    expect(writtenAddressMatchesProfile({ postalCode, address }, profile)).toBe(
      true,
    );
  });

  it.each([
    ["another postal code", "63310", "제주특별자치도 제주시 첨단로 242"],
    ["another building number", "63309", "제주특별자치도 제주시 첨단로 243"],
    ["another city", "63309", "제주특별자치도 서귀포시 첨단로 242"],
    [
      "trailing text that is not a reference",
      "63309",
      "제주특별자치도 제주시 첨단로 242 2층",
    ],
    ["an empty address", "63309", ""],
  ])("rejects %s", (_name, postalCode, address) => {
    expect(writtenAddressMatchesProfile({ postalCode, address }, profile)).toBe(
      false,
    );
  });

  it("ignores a reference stored in the profile", () => {
    expect(
      writtenAddressMatchesProfile(
        { postalCode: "63309", address: "제주특별자치도 제주시 첨단로 242" },
        { ...profile, address: "제주특별자치도 제주시 첨단로 242 (영평동)" },
      ),
    ).toBe(true);
  });

  it("removes the profile detail a site appended to the written address", () => {
    expect(
      writtenAddressMatchesProfile(
        {
          postalCode: "63309",
          address: "제주특별자치도 제주시 첨단로 242 (영평동) 공개 예시",
        },
        profile,
        "공개 예시",
      ),
    ).toBe(true);
    expect(
      writtenAddressMatchesProfile(
        {
          postalCode: "63309",
          address: "제주특별자치도 제주시 첨단로 243 공개 예시",
        },
        profile,
        "공개 예시",
      ),
    ).toBe(false);
  });
});
