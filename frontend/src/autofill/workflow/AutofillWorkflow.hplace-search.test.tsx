import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { createEmptyProfile } from "../../profile/model";
import { setHplacePage, resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import {
  onSiteEnter,
  mountSearch,
  showResults,
  widget,
} from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
import type { FieldsAnalyzeRequest, FieldsAnalyzeResponse } from "../api/types";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
});
it("searches once then recollects replaced exam detail before writing only the new score", async () => {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountSearch("foreignExam", (s) =>
    s.fields.push({
      name: "synthetic.exam.score",
      rawName: "entry.score",
      type: "number",
      label: "시험 점수",
      min: 0,
      max: 9999,
      binding: {
        type: "DIRECT",
        profileFieldKey: "languages.languageTest.grade",
      },
      gate: { search: "synthetic.search.name", mode: "SCORE_ONLY" },
    }),
  );
  const profile = createEmptyProfile();
  profile.languages = [
    {
      id: "synthetic-exam",
      sectionId: "languageTest",
      values: { testName: "가상 어학시험", grade: "150" },
    },
  ];
  const query = document.querySelector<HTMLInputElement>(
    'input[type="search"]',
  )!;
  let searches = 0,
    clicks = 0;
  query.addEventListener(
    "keypress",
    onSiteEnter(() => {
      searches++;
      showResults(
        query,
        ["가상 어학시험"],
        () => {
          clicks++;
          document.querySelector('[data-template="detail"]')!.innerHTML =
            '<input type="number" name="entry.score" min="0" max="9999"><input type="number" name="entry.perfectScore"><input name="entry.examDate"><input type="hidden" name="entry.languageExamSn">';
        },
        "123",
        {
          "data-gradeflag": "false",
          "data-scoreflag": "true",
          "data-setupcode": "",
          "data-setupvalue": "",
          "data-perfactgrade": "200",
        },
      );
    }),
  );
  const analyzeFields = vi.fn(
    async (r: FieldsAnalyzeRequest): Promise<FieldsAnalyzeResponse> => ({
      snapshotId: r.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      executionPolicy: policy,
      fields: r.sections
        .flatMap((s) => s.fields)
        .map((f) => ({
          candidateId: f.candidateId,
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy: "CONDITIONAL",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: f.domName?.endsWith("score")
              ? "languages.languageTest.grade"
              : "languages.languageTest.testName",
          },
          writePlan: { command: "SET_TEXT" },
        })),
    }),
  );
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => {}}
      repository={{ load: async () => profile }}
      apiClient={{
        loadExecutionPolicy: async () => policy,
        analyzePreparation: async (r) => ({
          snapshotId: r.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [],
        }),
        analyzeFields,
      }}
    />,
  );
  expect(await screen.findByLabelText("입력 완료 2개")).toBeVisible();
  expect(widget().code.value).toBe("123");
  expect(
    document.querySelector<HTMLInputElement>('[name="entry.score"]')!.value,
  ).toBe("150");
  expect(
    document.querySelector<HTMLInputElement>('[name="entry.perfectScore"]')!
      .value,
  ).toBe("");
  expect(
    document.querySelector<HTMLInputElement>('[name="entry.examDate"]')!.value,
  ).toBe("");
  expect(searches).toBe(1);
  expect(clicks).toBe(1);
  expect(analyzeFields.mock.calls.length).toBeLessThanOrEqual(3);
});
