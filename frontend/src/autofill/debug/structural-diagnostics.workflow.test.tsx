import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { AutofillWorkflow } from "../workflow/AutofillWorkflow";
import { mountLive } from "../workflow/hplace-run2.test-fixtures";
import { createEmptyProfile } from "../../profile/model";
import { resetHplacePage } from "../workflow/test-utils/hplace.fixture";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { setAutofillDebugEnabled } from "./autofill-debug";
import {
  educationProfile,
  mountEducation,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import { setHplacePage } from "../workflow/test-utils/hplace.fixture";
import {
  catalogResponder,
  exactTitleCatalog,
  renderNativeWorkflow,
} from "../workflow/test-utils/hplace-native-workflow";
import { expectHarnessLine } from "../workflow/test-utils/harness-diagnostic-line";
const { send } = vi.hoisted(() => ({ send: vi.fn<() => Promise<unknown>>() }));
vi.mock("wxt/browser", () => ({
  browser: { runtime: { sendMessage: send } },
}));
afterEach(() => {
  cleanup();
  setAutofillDebugEnabled(false);
  resetHplacePage();
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});
it.each([false, true])(
  "queries and prints the installed build only for a debug-enabled real run: %s",
  async (debug) => {
    const { policy } = mountLive();
    send
      .mockReset()
      .mockResolvedValue({ revision: "a".repeat(40), source_state: "CLEAN" });
    for (const method of [
      "log",
      "table",
      "groupCollapsed",
      "groupEnd",
      "debug",
      "warn",
    ] as const)
      vi.spyOn(console, method).mockImplementation(() => {});
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    setAutofillDebugEnabled(debug);
    render(
      <AutofillWorkflow
        pageDocument={document}
        onExit={() => {}}
        repository={{ load: async () => createEmptyProfile() }}
        apiClient={{
          loadExecutionPolicy: async () => policy,
          analyzePreparation: async (r) => ({
            snapshotId: r.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            preparationPlans: [],
          }),
          analyzeFields: async (r) => ({
            snapshotId: r.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            executionPolicy: policy,
            fields: r.sections
              .flatMap((s) => s.fields)
              .map((f) => ({
                candidateId: f.candidateId,
                matchType: "NO_MATCH",
                mappingStatus: "ADAPTER_VERIFIED",
                interactionStatus: "BLOCKED",
                reasonCodes: ["NO_MATCH"],
              })),
          }),
        }}
      />,
    );
    await screen.findByText("기입 결과");
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(debug ? 1 : 0);
    if (debug) {
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        type: "AUTOFILL_GET_INSTALLED_BUILD",
      });
      expect(log).toHaveBeenCalledWith(
        `[CareerForm] build revision=${"a".repeat(40)} source_state=CLEAN`,
      );
      expect(log).toHaveBeenCalledWith(
        "[CareerForm] stage name=preparation-plan collected=0 accepted=0 rejected=0 planned=0 executed=0",
      );
    } else expect(log).not.toHaveBeenCalled();
  },
);

it("names each preparation stage line by its caller", async () => {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  send.mockReset().mockResolvedValue(undefined);
  for (const method of [
    "log",
    "table",
    "groupCollapsed",
    "groupEnd",
    "debug",
    "warn",
  ] as const)
    vi.spyOn(console, method).mockImplementation(() => {});
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  setAutofillDebugEnabled(true);
  const policy = mountEducation(1, 1, true);
  renderNativeWorkflow({
    policy,
    profile: educationProfile(),
    searchResponder: catalogResponder(exactTitleCatalog()),
  });
  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  await waitFor(() =>
    expect(
      document.querySelector<HTMLInputElement>(
        '[name="college[0].academyName"]',
      )!.value,
    ).toBe("합성대학 A"),
  );
  const lines = log.mock.calls.map(([line]) => line as string);
  for (const line of lines)
    expectHarnessLine(line, ["합성대학", "가상복수전공", "가상부전공"]);
  const stages = lines
    .filter((line) => line.startsWith("[CareerForm] stage name=preparation"))
    .map((line) => /stage name=([a-z-]+)/.exec(line)![1]);
  expect(stages).toContain("preparation-plan");
  expect(stages).toContain("preparation-initial");
  expect(stages).toContain("preparation-majors");
}, 30000);
