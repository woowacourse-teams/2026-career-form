import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { createEmptyProfile } from "../../profile/model";
import { setHplacePage, resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import {
  mountSearch,
  onSiteEnter,
  takeSiteEnters,
  widget,
} from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
import type { FieldsAnalyzeRequest, FieldsAnalyzeResponse } from "../api/types";

afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
});

it("shows a license search without results as no results, not as an unconfirmed pick", async () => {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  takeSiteEnters();
  const policy = mountSearch("license", (section) => {
    section.fields[0].search.timeoutMs = 1500;
    section.fields[0].driver.timeoutMs = 1500;
  });
  const profile = createEmptyProfile();
  profile.certifications = [
    {
      id: "synthetic-license",
      sectionId: "certificate",
      values: { name: "합성자격증 없는제목" },
    },
  ];
  const query = document.querySelector<HTMLInputElement>(
    'input[type="search"]',
  )!;
  query.addEventListener(
    "keypress",
    onSiteEnter(() => {
      query.closest("div.search")!.querySelector(".searchResult")!.innerHTML =
        '<div class="noResult"></div>';
    }),
  );
  let requests = 0;
  const analyzeFields = async (
    r: FieldsAnalyzeRequest,
  ): Promise<FieldsAnalyzeResponse> => {
    requests++;
    return {
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
          autofillPolicy: "ALLOWED",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "certifications.certificate.name",
          },
          writePlan: { command: "SET_TEXT" },
        })),
    };
  };
  const started = Date.now();
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
  await screen.findByText("기입 결과", {}, { timeout: 10000 });
  fireEvent.click(screen.getByRole("tab", { name: /확인 필요/ }));
  expect(
    screen.getByText("검색 결과가 없어요. 다른 이름으로 찾아 주세요."),
  ).toBeVisible();
  expect(
    screen.queryByText(
      "목록 선택을 확인하지 못했어요. 항목을 직접 골라 주세요.",
    ),
  ).not.toBeInTheDocument();
  expect(takeSiteEnters()).toBe(1);
  expect(widget().name.value).toBe("");
  expect(requests).toBeLessThanOrEqual(2);
  // The no-result box answers at once; the run does not wait out the search timeout.
  expect(Date.now() - started).toBeLessThan(5000);
});
