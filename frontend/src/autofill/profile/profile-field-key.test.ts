import { describe, expect, it } from "vitest";

import { isAutofillProfileFieldKey } from "./profile-field-key";

describe("isAutofillProfileFieldKey", () => {
  it("accepts an education top-level field used by the SK adapter", () => {
    expect(
      isAutofillProfileFieldKey(
        "education.university.latestEducationType",
      ),
    ).toBe(true);
  });

  it("continues to reject excluded evidence document fields", () => {
    expect(
      isAutofillProfileFieldKey(
        "certifications.certificate.evidenceDocumentPath",
      ),
    ).toBe(false);
  });
});
