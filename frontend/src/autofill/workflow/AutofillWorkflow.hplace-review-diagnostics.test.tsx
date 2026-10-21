import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mountLive } from "./hplace-run2.test-fixtures";
import { createEmptyProfile } from "../../profile/model";
import { basicAnalysis } from "../adapters/hplace/basic.test-fixtures";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
  setAutofillDebugEnabled(false);
  vi.restoreAllMocks();
});
it.each(["gender", "nationality"] as const)(
  "reports final adapter promotion of conditional %s without a misleading unselected diagnostic",
  async (key) => {
    const { policy } = mountLive();
    document
      .querySelector('section[data-code="13"]')!
      .insertAdjacentHTML(
        "beforeend",
        '<div class="subject"><select name="nationality"><option value="">선택</option><option value="KR">대한민국</option></select></div>',
      );
    const p = createEmptyProfile();
    p.personal[key] = key === "gender" ? "남성" : "대한민국";
    const gender = [
      ...document.querySelectorAll<HTMLInputElement>('[name="genderFlag"]'),
    ];
    const nationality = document.querySelector<HTMLSelectElement>(
      '[name="nationality"]',
    )!;
    gender.forEach((e) => (e.checked = false));
    nationality.value = "";
    for (const method of [
      "log",
      "table",
      "groupCollapsed",
      "groupEnd",
      "debug",
      "warn",
    ] as const)
      vi.spyOn(console, method).mockImplementation(() => {});
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    render(
      <AutofillWorkflow
        pageDocument={document}
        onExit={() => {}}
        repository={{ load: async () => p }}
        apiClient={{
          loadExecutionPolicy: async () => policy,
          analyzePreparation: async (r) => ({
            snapshotId: r.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            preparationPlans: [],
          }),
          analyzeFields: async (r) => ({
            ...basicAnalysis(r),
            executionPolicy: policy,
          }),
        }}
      />,
    );
    await screen.findByRole("heading", { name: "기입 결과" });
    expect(gender.map((e) => e.checked)).toEqual(
      key === "gender" ? [true, false] : [false, false],
    );
    expect(nationality.value).toBe(key === "nationality" ? "KR" : "");
    expect(log.mock.calls.flat()).not.toContain(
      `[CareerForm] skip stage=result key=hplace.detail.${key} reason=unselected detail=review-decision`,
    );
  },
);
