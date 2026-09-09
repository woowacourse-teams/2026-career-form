import { describe, expect, it } from "vitest";

import { matchStandardOption } from "./standard-option-match";

describe("matchStandardOption", () => {
  it("matches one current option through a standard-value alias", () => {
    expect(
      matchStandardOption("opic:al", [
        { optionId: "sk-60", displayName: "Advanced Low" },
      ]),
    ).toEqual({
      status: "unique",
      option: { optionId: "sk-60", displayName: "Advanced Low" },
    });
  });

  it("does not choose when multiple current options match aliases", () => {
    expect(
      matchStandardOption("opic:al", [
        { optionId: "first", displayName: "AL" },
        { optionId: "second", displayName: "Advanced Low" },
      ]),
    ).toMatchObject({ status: "ambiguous" });
  });

  it("does not treat a non-standard value as a catalog option", () => {
    expect(
      matchStandardOption("Advanced Low", [
        { optionId: "sk-60", displayName: "Advanced Low" },
      ]),
    ).toEqual({ status: "not-standard" });
  });
});
