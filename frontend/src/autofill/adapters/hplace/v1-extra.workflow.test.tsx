import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";
import type {
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
} from "../../api/types";
import type { Profile } from "../../../profile/model";
import {
  appendSubRow,
  certChip,
  certInput,
  languageTrigger,
  mountV1Step3,
  pickCertificate,
  resetHplacePage,
  subRows,
  v1ExtraAnalysis,
  v1ExtraPreparation,
  v1ExtraProfile,
} from "./v1-extra.test-fixtures";

afterEach(resetHplacePage);

function run(profile: Profile) {
  const fields: FieldsAnalyzeRequest[] = [];
  const preparations: PreparationAnalyzeRequest[] = [];
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => undefined}
      repository={{ load: async () => profile }}
      apiClient={{
        loadExecutionPolicy: async () => undefined,
        analyzePreparation: async (request) => {
          preparations.push(request);
          return v1ExtraPreparation(request);
        },
        analyzeFields: async (request) => {
          fields.push(request);
          return v1ExtraAnalysis(request);
        },
      }}
    />,
  );
  return { fields, preparations };
}

const resultScreen = () =>
  screen.findByText("기입 결과", {}, { timeout: 100_000 });

it("adds one row per profile entry, picks or registers each certificate and fills the revealed inputs", async () => {
  const page = mountV1Step3();
  const { fields, preparations } = run(v1ExtraProfile());
  expect(await resultScreen()).toBeVisible();

  expect(preparations[0].sections[0].sectionId).toBe("hplace-v1-extra");
  expect(page.addClicks()).toEqual([
    "자격증",
    "자격증",
    "외국어활용능력",
    "외국어활용능력",
  ]);
  expect(fields.length).toBeGreaterThanOrEqual(2);
  expect(fields.length).toBeLessThanOrEqual(3);

  // Exact catalog row, then the lone register row for a name not listed.
  expect(certChip(0)).toEqual(["정보처리기사"]);
  expect(certChip(1)).toEqual(["목록에없는자격"]);
  expect(page.registerClicks()).toBe(1);
  expect(certInput(0, "발급기관을 입력해주세요.")!.value).toBe("합성기관");
  expect(certInput(0, "취득일")!.value).toBe("2020.05.01");
  expect(certInput(0, "등록번호를 입력해주세요.")!.value).toBe("A-1234");
  expect(certInput(1, "발급기관을 입력해주세요.")!.value).toBe("두번째기관");
  // A month-only profile date has no page form: never invented.
  expect(certInput(1, "취득일")!.value).toBe("");
  expect(certInput(1, "등록번호를 입력해주세요.")!.value).toBe("B-5678");
  expect(languageTrigger(0).textContent).toBe("영어");
  expect(languageTrigger(1).textContent).toBe("일본어");

  // 공인외국어시험 and 컴퓨터활용능력 stay untouched.
  expect(subRows("공인외국어시험")).toHaveLength(0);
  expect(subRows("컴퓨터활용능력")).toHaveLength(0);
  expect(document.querySelector("#dropdown-body")).toBeNull();
  expect(page.forbiddenClicks()).toEqual([]);
});

it("adds only missing rows, keeps an existing chip and leaves a group with extra rows alone", async () => {
  const page = mountV1Step3();
  pickCertificate(0, "정보처리기사");
  for (let i = 0; i < 3; i++) appendSubRow("외국어활용능력");
  const { fields } = run(v1ExtraProfile());
  expect(await resultScreen()).toBeVisible();

  expect(page.addClicks()).toEqual(["자격증"]);
  expect(subRows("자격증")).toHaveLength(2);
  expect(certChip(0)).toEqual(["정보처리기사"]);
  expect(certInput(0, "발급기관을 입력해주세요.")!.value).toBe("합성기관");
  // 3 language rows for 2 entries: that group is not written.
  for (let k = 0; k < 3; k++)
    expect(languageTrigger(k).textContent).toBe(
      "활용가능한 외국어를 선택해주세요.",
    );
  expect(fields.length).toBeLessThanOrEqual(3);
  expect(page.forbiddenClicks()).toEqual([]);
});

it("keeps going past a certificate search that cannot pick", async () => {
  const page = mountV1Step3();
  const profile = v1ExtraProfile();
  profile.certifications[0].values.name = "합성자격";
  run(profile);
  expect(await resultScreen()).toBeVisible();
  expect(certChip(0)).toEqual([]);
  expect(certInput(0, "자격증명을 검색해주세요.")!.value).toBe("");
  expect(certChip(1)).toEqual(["목록에없는자격"]);
  expect(certInput(1, "등록번호를 입력해주세요.")!.value).toBe("B-5678");
  expect(languageTrigger(0).textContent).toBe("영어");
  expect(document.querySelector("#dropdown-body")).toBeNull();
  expect(page.forbiddenClicks()).toEqual([]);
  expect(vi.isFakeTimers()).toBe(false);
});
