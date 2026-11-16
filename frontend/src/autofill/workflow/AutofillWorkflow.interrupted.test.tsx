import { usePolicyFixture } from "../../test/fixtures/execution-policy";
usePolicyFixture("sk");
import { fixturePolicy } from "../../test/fixtures/execution-policy";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { AnalysisServiceError } from "../api/runtime-client";
import { AnalysisContractError } from "../api/validate-response";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

const developerMode = vi.hoisted(() => ({ on: false }));
vi.mock("../debug/developer-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../debug/developer-mode")>()),
  useDeveloperMode: () => [developerMode.on, vi.fn()] as const,
}));

const RAW = "SYNTHETIC_RAW_ANALYSIS_FAILURE_9c1d";

function setUrl(url: string) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

afterEach(() => {
  cleanup();
  developerMode.on = false;
  document.body.replaceChildren();
  setUrl("http://localhost:3000");
});

// The first analysis asks for one preparation action; the analysis that follows
// it fails with a server-style message, which ends the run in the workflow's
// catch block rather than at a hand-written stop reason.
function renderRunThatFailsAfterPreparation(
  failure: unknown = new AnalysisServiceError(RAW),
) {
  setUrl("https://www.skcareers.com/Application/Index/synthetic");
  document.body.innerHTML = `<section aria-label="보훈">
    <label><input type="radio" name="prsVeteranBenefitYN" value="0">비대상</label>
    <label><input type="radio" name="prsVeteranBenefitYN" value="1">대상</label>
  </section>`;
  const target = document.querySelector<HTMLInputElement>(
    "[name=prsVeteranBenefitYN][value='1']",
  )!;
  target.addEventListener("change", () => {
    if (target.checked && !document.querySelector("#prsVeteranBenefitNumber"))
      target
        .closest("section")!
        .insertAdjacentHTML(
          "beforeend",
          '<input id="prsVeteranBenefitNumber" name="prsVeteranBenefitNumber" aria-label="보훈 번호">',
        );
  });
  const profile = createEmptyProfile();
  profile.veteran = {
    veteranStatus: "veteran-status:eligible",
    veteranNumber: "100001",
  };
  let preparations = 0;
  const client: AnalysisApiClient = {
    loadExecutionPolicy: async () => fixturePolicy("sk"),
    analyzePreparation: async (request) => {
      preparations++;
      const section = request.sections.find((s) =>
        s.actionCandidates.some(
          (a) =>
            a.domName === "prsVeteranBenefitYN" && a.displayName === "대상",
        ),
      );
      const action = section?.actionCandidates.find(
        (a) => a.domName === "prsVeteranBenefitYN" && a.displayName === "대상",
      );
      return {
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans:
          preparations === 1 && action && section
            ? [
                {
                  actionCandidateId: action.candidateId,
                  command: "SELECT_OPTION_TO_REVEAL",
                  profileFieldKey: "veteran.veteran.veteranStatus",
                  optionDisplayName: "대상",
                  selectableProfileValues: ["대상"],
                  targetSectionId: section.sectionId,
                  expectedEffect: "TARGET_FIELDS_VISIBLE",
                  expectedFieldNames: ["prsVeteranBenefitNumber"],
                },
              ]
            : [],
      };
    },
    analyzeFields: async () => {
      throw failure;
    },
  };
  render(
    <AutofillWorkflow
      apiClient={client}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
}

it("keeps a service message out of the interrupted screen in normal mode", async () => {
  renderRunThatFailsAfterPreparation();

  await screen.findByRole("heading", { name: "자동 기입을 멈췄어요" });

  // The stop is told on the fill result screen, not on a separate error page.
  expect(screen.getByRole("heading", { name: "기입 결과" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "서버가 지원서 분석을 완료하지 못해 멈췄어요.",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "이미 입력한 값은 그대로 있어요.",
  );
  expect(document.body.textContent).not.toContain(RAW);
  expect(document.querySelector("details")).toBeNull();
  expect(screen.queryByText(/예외/)).toBeNull();
});

it("shows that service message only in the developer-mode details", async () => {
  developerMode.on = true;
  renderRunThatFailsAfterPreparation();

  await screen.findByRole("heading", { name: "자동 기입을 멈췄어요" });

  const details = document.querySelector("details")!;
  expect(details).not.toHaveAttribute("open");
  expect(details.querySelector("summary")).toHaveTextContent("오류 정보");
  expect(details).toHaveTextContent(RAW);
});

it.each([
  [
    "a network failure",
    new AnalysisServiceError(RAW, undefined, undefined, "NETWORK"),
    "서버에 연결하지 못해 멈췄어요.",
  ],
  [
    "a timeout",
    new AnalysisServiceError(RAW, undefined, undefined, "TIMEOUT"),
    "서버 응답이 늦어 멈췄어요.",
  ],
  [
    "a rate limit",
    new AnalysisServiceError(RAW, undefined, "RATE_LIMITED"),
    "요청이 많아 멈췄어요. 잠시 후 다시 시도해 주세요.",
  ],
  [
    "an incompatible policy",
    new AnalysisServiceError(RAW, 404, "POLICY_INCOMPATIBLE"),
    "확장 프로그램 업데이트가 필요해 멈췄어요.",
  ],
  [
    "a malformed analysis response",
    new AnalysisContractError(RAW),
    "서버 응답 형식을 확인할 수 없어 멈췄어요.",
  ],
  [
    "an unexpected local error",
    new Error(RAW),
    "문제가 생겨 안전하게 멈췄어요.",
  ],
])(
  "names %s as the stop reason after values were written",
  async (_name, failure, reason) => {
    renderRunThatFailsAfterPreparation(failure);

    await screen.findByRole("heading", { name: "자동 기입을 멈췄어요" });

    expect(screen.getByRole("heading", { name: "기입 결과" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(reason);
    expect(document.body.textContent).not.toContain(RAW);
  },
);
