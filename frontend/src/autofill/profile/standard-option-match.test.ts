import { describe, expect, it } from "vitest";

import {
  matchCompositeMilitaryOption,
  matchStandardOption,
} from "./standard-option-match";

const militaryOptions = [
  "병역구분",
  "병역필_현역(병)",
  "병역필_현역(장교)",
  "병역필_현역(부사관)",
  "병역필_사회복무요원",
  "병역필_전문연구요원",
  "병역필_산업기능요원",
  "병역면제",
  "미필",
  "해당없음",
].map((displayName, index) => ({ optionId: `m-${index}`, displayName }));

describe("matchCompositeMilitaryOption", () => {
  it("maps a served enlisted profile to the single active-duty enlisted option", () => {
    expect(
      matchCompositeMilitaryOption(
        "military-status:served",
        "military-rank:byeongjang",
        militaryOptions,
      ),
    ).toEqual({ status: "unique", option: militaryOptions[1] });
  });

  it("stays ambiguous for a served profile without a rank", () => {
    expect(
      matchCompositeMilitaryOption(
        "military-status:served",
        undefined,
        militaryOptions,
      ).status,
    ).toBe("ambiguous");
  });

  it.each([
    ["military-status:exempt", "병역면제"],
    ["military-status:not-served", "미필"],
    ["military-status:not-applicable", "해당없음"],
  ])("maps %s to its composite label", (status, label) => {
    expect(
      matchCompositeMilitaryOption(status, undefined, militaryOptions),
    ).toEqual({
      status: "unique",
      option: militaryOptions.find((option) => option.displayName === label),
    });
  });

  it.each([
    ["현역병", "병역필_현역(병)"],
    ["전문연구요원", "병역필_전문연구요원"],
    ["공익근무요원", "병역필_사회복무요원"],
  ])("narrows a served profile by service type %s", (type, label) => {
    expect(
      matchCompositeMilitaryOption(
        "military-status:served",
        undefined,
        militaryOptions,
        type,
      ),
    ).toEqual({
      status: "unique",
      option: militaryOptions.find((option) => option.displayName === label),
    });
  });

  it("ignores values that are not military statuses", () => {
    expect(
      matchCompositeMilitaryOption("region:seoul", undefined, militaryOptions),
    ).toEqual({ status: "not-standard" });
  });
});

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

  it("matches every SK official region label uniquely", () => {
    const regions = [
      ["region:seoul", "서울특별시"],
      ["region:busan", "부산광역시"],
      ["region:daegu", "대구광역시"],
      ["region:incheon", "인천광역시"],
      ["region:gwangju", "광주광역시"],
      ["region:daejeon", "대전광역시"],
      ["region:ulsan", "울산광역시"],
      ["region:sejong", "세종특별자치시"],
      ["region:gyeonggi", "경기도"],
      ["region:gangwon", "강원도"],
      ["region:chungbuk", "충청북도"],
      ["region:chungnam", "충청남도"],
      ["region:jeonbuk", "전라북도"],
      ["region:jeonnam", "전라남도"],
      ["region:gyeongbuk", "경상북도"],
      ["region:gyeongnam", "경상남도"],
      ["region:jeju", "제주특별자치도"],
      ["region:overseas", "해외"],
    ] as const;
    for (const [value, displayName] of regions) {
      expect(
        matchStandardOption(value, [{ optionId: value, displayName }]),
      ).toEqual({ status: "unique", option: { optionId: value, displayName } });
    }
  });

  it("rejects duplicate official region labels instead of choosing", () => {
    expect(
      matchStandardOption("region:seoul", [
        { optionId: "first", displayName: "서울특별시" },
        { optionId: "second", displayName: "서울특별시" },
      ]),
    ).toMatchObject({ status: "ambiguous" });
  });

  it("keeps legacy region display labels supported", () => {
    expect(
      matchStandardOption("region:seoul", [
        { optionId: "legacy", displayName: "서울" },
      ]),
    ).toEqual({
      status: "unique",
      option: { optionId: "legacy", displayName: "서울" },
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
