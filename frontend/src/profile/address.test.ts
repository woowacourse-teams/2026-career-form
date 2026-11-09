import { describe, expect, it } from "vitest";
import { isAutofillProfileFieldKey } from "../autofill/profile/profile-field-key";
import {
  addressVerification,
  contactWithSelectedAddress,
  withoutStaleAddressVerification,
} from "./address";

const selected = {
  postalCode: "63309",
  roadAddress: "제주특별자치도 제주시 첨단로 242",
  jibunAddress: "제주특별자치도 제주시 영평동 2181",
  buildingManagementNumber: "5011010400121810000000001",
};

describe("structured profile address", () => {
  it("fills the stored address from a selection and leaves the detail line alone", () => {
    expect(
      contactWithSelectedAddress(
        { email: "a@example.test", postalCode: "00000", addressLine2: "101호" },
        selected,
      ),
    ).toEqual({
      email: "a@example.test",
      postalCode: "63309",
      addressLine1: "제주특별자치도 제주시 첨단로 242",
      addressLine2: "101호",
      jibunAddress: "제주특별자치도 제주시 영평동 2181",
      buildingManagementNumber: "5011010400121810000000001",
      addressVerified: "true",
    });
  });

  it("treats only a selected address as verified", () => {
    expect(addressVerification({})).toBe("empty");
    expect(addressVerification({ email: "a@example.test" })).toBe("empty");
    expect(addressVerification({ addressLine1: "직접 입력" })).toBe(
      "unverified",
    );
    expect(addressVerification({ postalCode: "12345" })).toBe("unverified");
    expect(addressVerification({ addressLine2: "101호" })).toBe("unverified");
    expect(addressVerification(contactWithSelectedAddress({}, selected))).toBe(
      "verified",
    );
  });

  it.each(["postalCode", "addressLine1"])(
    "drops the selection when %s no longer holds the selected value",
    (fieldId) => {
      const contact = contactWithSelectedAddress({}, selected);
      expect(
        withoutStaleAddressVerification(contact, {
          ...contact,
          [fieldId]: "직접 수정",
        }),
      ).toEqual({
        postalCode: fieldId === "postalCode" ? "직접 수정" : "63309",
        addressLine1:
          fieldId === "addressLine1"
            ? "직접 수정"
            : "제주특별자치도 제주시 첨단로 242",
      });
    },
  );

  it("keeps the selection when only the detail line or another field changes", () => {
    const contact = contactWithSelectedAddress({}, selected);
    const next = { ...contact, addressLine2: "101호", email: "a@example.test" };
    expect(withoutStaleAddressVerification(contact, next)).toEqual(next);
  });

  it("does not expose the stored selection as autofill mapping keys", () => {
    expect(isAutofillProfileFieldKey("contact.contact.addressLine1")).toBe(
      true,
    );
    for (const field of [
      "jibunAddress",
      "buildingManagementNumber",
      "addressVerified",
    ])
      expect(isAutofillProfileFieldKey(`contact.contact.${field}`)).toBe(false);
  });
});
