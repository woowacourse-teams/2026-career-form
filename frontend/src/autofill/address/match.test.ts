import { describe, expect, it } from "vitest";
import { selectAddress } from "./match";
describe("address result selection", () => {
  const expected = { address: "제주특별자치도 제주시 첨단로 242", postalCode: "63309" };
  const first = { address: "제주시 첨단로 242", postalCode: "63309", id: "result-1" };
  it("selects the first result even when a later result is an exact textual match", () => {
    expect(selectAddress(expected, [first, {...expected, id: "result-2"}])).toBe(first);
  });
  it("does not impose input-address or postcode matching before selection", () => {
    expect(selectAddress({...expected, address: "다른 표시 주소", postalCode: "00000"}, [first])).toBe(first);
  });
  it("does not invent a result when the list is empty", () => {
    expect(selectAddress(expected, [])).toBeUndefined();
  });
});
