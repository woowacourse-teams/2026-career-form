import { describe, expect, it } from "vitest";
import { selectAddress } from "./match";

describe("address result selection", () => {
  const address = {
    address: "제주특별자치도 제주시 첨단로 242",
    postalCode: "63309",
  };
  const result = { ...address, id: "result-1" };
  it("selects the sole full address and postcode match", () => {
    expect(selectAddress(address, [result])).toBe(result);
  });
  it("normalizes whitespace but not building numbers or regional aliases", () => {
    expect(
      selectAddress(
        { ...address, address: "  제주특별자치도  제주시 첨단로 242 " },
        [result],
      ),
    ).toBe(result);
    expect(
      selectAddress({ ...address, address: "제주시 첨단로 242" }, [result]),
    ).toBeUndefined();
    expect(
      selectAddress(
        { ...address, address: "제주특별자치도 제주시 첨단로 242-1" },
        [result],
      ),
    ).toBeUndefined();
  });
  it("never chooses an empty, ambiguous, or postcode-mismatched result", () => {
    expect(selectAddress(address, [])).toBeUndefined();
    expect(
      selectAddress(address, [result, { ...result, id: "result-2" }]),
    ).toBeUndefined();
    expect(
      selectAddress({ ...address, postalCode: "00000" }, [result]),
    ).toBeUndefined();
    expect(
      selectAddress({ ...address, postalCode: "" }, [result]),
    ).toBeUndefined();
  });
});
