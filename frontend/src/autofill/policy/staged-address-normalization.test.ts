import { afterEach, expect, it, vi } from "vitest";
import {
  addressExpected,
  mountAddress,
} from "./__fixtures__/hplace-mrs2-address.synthetic";
import { installExecutionPolicy } from "../workflow/execution-policy";
afterEach(() => {
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});
const provinces = [
  ["서울", "서울특별시"],
  ["부산", "부산광역시"],
  ["대구", "대구광역시"],
  ["인천", "인천광역시"],
  ["광주", "광주광역시"],
  ["대전", "대전광역시"],
  ["울산", "울산광역시"],
  ["세종", "세종특별자치시"],
  ["경기", "경기도"],
  ["강원", "강원특별자치도"],
  ["충북", "충청북도"],
  ["충남", "충청남도"],
  ["전북", "전북특별자치도"],
  ["전남", "전라남도"],
  ["경북", "경상북도"],
  ["경남", "경상남도"],
  ["제주", "제주특별자치도"],
  ["전남광주통합특별시", "전남광주통합특별시"],
];
it.each(
  provinces.flatMap(([short, full]) => [
    [short, full],
    [full, short],
  ]),
)(
  "accepts only the explicit province equivalence %s -> %s",
  async (profile, result) => {
    const expected = {
      ...addressExpected,
      address: `${profile} 가상구 가상새봄로 50`,
    };
    const s = mountAddress({
      results: [{ ...expected, address: `${result} 가상구 가상새봄로 50` }],
    });
    s.setCurrent(expected);
    expect(await s.run(expected)).toMatchObject({ status: "written" });
    expect(s.events).toContain("ok");
  },
);
it("accepts an exact Sejong road without an intermediate administrative district", async () => {
  const expected = { ...addressExpected, address: "세종 가상한누리대로 50" };
  const s = mountAddress({
    results: [{ ...expected, address: "세종특별자치시 가상한누리대로 50" }],
  });
  s.setCurrent(expected);
  expect(await s.run(expected)).toMatchObject({ status: "written" });
});
it.each([
  "미등록도 가상구 가상새봄로 50",
  "서울특별시 가상구 가상새봄로 지하 2",
])("explains unsupported road format without opening: %s", async (address) => {
  const expected = { ...addressExpected, address };
  const s = mountAddress({ results: [expected] });
  s.setCurrent(expected);
  expect(await s.run(expected)).toMatchObject({
    status: "manual",
    reason: expect.stringContaining("지원하지 않는 도로명주소 표기"),
  });
  expect(s.events).toEqual([]);
});
it("does not normalize an unlisted district abbreviation", async () => {
  const s = mountAddress({
    results: [{ ...addressExpected, address: "서울특별시 가상 가상새봄로 50" }],
  });
  expect(await s.run()).toMatchObject({ status: "manual" });
  expect(s.events).not.toContain("select");
});
