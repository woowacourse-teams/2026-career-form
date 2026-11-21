import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";
import type {
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
} from "../../api/types";
import type { Profile } from "../../../profile/model";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import {
  appendCard,
  card,
  cardDropdown,
  cardInput,
  cardNamed,
  cardSelected,
  cardToggle,
  cards,
  mountV1Step2,
  nextYear,
  v1HistoryAnalysis,
  v1HistoryPreparation,
  v1HistoryProfile,
} from "./v1-history.test-fixtures";

afterEach(resetHplacePage);

function run(profile: Profile) {
  const fields: FieldsAnalyzeRequest[] = [];
  const preparations: PreparationAnalyzeRequest[] = [];
  const analyzeFields = vi.fn(async (request: FieldsAnalyzeRequest) => {
    fields.push(request);
    return v1HistoryAnalysis(request);
  });
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => undefined}
      repository={{ load: async () => profile }}
      apiClient={{
        loadExecutionPolicy: async () => undefined,
        analyzePreparation: async (request) => {
          preparations.push(request);
          return v1HistoryPreparation(request);
        },
        analyzeFields,
      }}
    />,
  );
  return { fields, preparations, analyzeFields };
}

// About 50 controls with live-budget waits: bounded well inside the 120 s
// Hplace test timeout instead of the global 30 s findBy limit.
const resultScreen = () =>
  screen.findByText("기입 결과", {}, { timeout: 100_000 });

const sentNames = (request: FieldsAnalyzeRequest) =>
  request.sections.flatMap((s) => s.fields.map((f) => f.domName));

it("adds one card per profile entry and writes every in-scope control within the budget", async () => {
  const page = mountV1Step2();
  const { fields, preparations } = run(v1HistoryProfile());
  expect(await resultScreen()).toBeVisible();

  expect(page.addClicks()).toEqual([
    "고등학교",
    "대학교",
    "대학교",
    "대학원",
    "직장경력",
    "직장경력",
  ]);
  expect(preparations[0].sections[0].sectionId).toBe("hplace-v1-history");
  expect(fields.length).toBeGreaterThanOrEqual(2);
  expect(fields.length).toBeLessThanOrEqual(3);

  const hs = card("고등학교", 0);
  expect(cardSelected(hs, "졸업구분")).toEqual(["졸업"]);
  expect(cardDropdown(hs, "region").textContent).toBe("서울");
  expect(cardSelected(hs, "학교정보")).toEqual(["주간"]);
  expect(cardInput(hs, "입학일").value).toBe("2006.03.02");
  expect(cardInput(hs, "졸업일").value).toBe("2009.02.10");

  const [u0, u1] = cards("대학교");
  expect(cardSelected(u0, "학위구분")).toEqual(["학사"]);
  expect(cardSelected(u0, "졸업구분")).toEqual(["졸업"]);
  expect(cardSelected(u0, "입학구분")).toEqual(["입학"]);
  expect(cardInput(u0, "입학일").value).toBe("2009.03.02");
  expect(cardInput(u0, "졸업일").value).toBe("2013.02.20");
  expect(cardNamed(u0, "collegeGrade.score").value).toBe("3.8");
  expect(cardDropdown(u0, "scale").textContent).toBe("4.5");
  expect(cardSelected(u1, "학위구분")).toEqual(["전문학사"]);
  expect(cardSelected(u1, "졸업구분")).toEqual(["졸업예정"]);
  expect(cardSelected(u1, "입학구분")).toEqual(["편입"]);
  expect(cardInput(u1, "졸업일").value).toBe(`${nextYear()}.02.20`);
  // No GPA in the profile entry: neither half is touched.
  expect(cardNamed(u1, "collegeGrade.score").value).toBe("");
  expect(cardDropdown(u1, "scale").textContent).toBe("만점기준");

  const grad = card("대학원", 0);
  expect(cardSelected(grad, "학위구분")).toEqual(["석사"]);
  expect(cardNamed(grad, "graduateSchoolGrade.score").value).toBe("4.2");
  expect(cardDropdown(grad, "scale").textContent).toBe("4.5");

  const [c0, c1] = cards("직장경력");
  expect(cardDropdown(c0, "employment").textContent).toBe("정규직");
  expect(cardSelected(c0, "근무기간")).toEqual(["퇴사"]);
  expect(cardInput(c0, "입사일").value).toBe("2018.03.02");
  expect(cardInput(c0, "퇴사일").value).toBe("2020.12.31");
  expect(cardInput(c0, "회사명을 입력해주세요.").value).toBe("합성회사");
  expect(cardNamed(c0, "department").value).toBe("합성부서");
  expect(cardNamed(c0, "position").value).toBe("사원");
  expect(cardNamed(c0, "assignedTask").value).toBe("합성 업무");
  expect(cardDropdown(c1, "employment").textContent).toBe("계약직");
  expect(cardSelected(c1, "근무기간")).toEqual(["재직중"]);
  expect(cardInput(c1, "퇴사일").disabled).toBe(true);
  expect(cardInput(c1, "퇴사일").value).toBe("");
  expect(cardNamed(c1, "assignedTask").value).toBe("개발 업무");

  // 퇴사일 is sent only after its driver ran.
  expect(sentNames(fields[0])).not.toContain("hplace.v1.career.0.leavingDate");
  expect(sentNames(fields.at(-1)!)).toContain("hplace.v1.career.0.leavingDate");
  // Phase 2 (school/major search) inputs are never typed into.
  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[placeholder="학교명을 검색해주세요."]',
  ))
    expect(input.value).toBe("");
  expect(document.querySelector("#dropdown-body")).toBeNull();
  expect(page.forbiddenClicks()).toEqual([]);
});

it("adds only missing cards, keeps existing values and skips a level with extra cards", async () => {
  const page = mountV1Step2();
  const existing = appendCard("대학교");
  cardToggle(existing, "학위구분", "전문학사").click();
  for (let i = 0; i < 3; i++) appendCard("직장경력");
  const { analyzeFields } = run(v1HistoryProfile());
  expect(await resultScreen()).toBeVisible();

  expect(page.addClicks()).toEqual(["고등학교", "대학교", "대학원"]);
  expect(cards("대학교")).toHaveLength(2);
  expect(cards("직장경력")).toHaveLength(3);
  // The existing card keeps its own value; its other controls are filled.
  expect(cardSelected(existing, "학위구분")).toEqual(["전문학사"]);
  expect(cardInput(existing, "입학일").value).toBe("2009.03.02");
  expect(cardSelected(card("대학교", 1), "학위구분")).toEqual(["전문학사"]);
  // 3 career cards for 2 entries: that level is not written.
  for (const c of cards("직장경력")) {
    expect(cardNamed(c, "department").value).toBe("");
    expect(cardSelected(c, "근무기간")).toEqual([]);
  }
  expect(analyzeFields.mock.calls.length).toBeLessThanOrEqual(3);
  expect(page.forbiddenClicks()).toEqual([]);
});
