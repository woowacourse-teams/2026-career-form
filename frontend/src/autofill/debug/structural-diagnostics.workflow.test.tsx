import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { AutofillWorkflow } from "../workflow/AutofillWorkflow";
import { mountLive } from "../workflow/hplace-run2.test-fixtures";
import { createEmptyProfile } from "../../profile/model";
import { resetHplacePage } from "../workflow/test-utils/hplace.fixture";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { setAutofillDebugEnabled } from "./autofill-debug";
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
        "[CareerForm] stage name=preparation collected=0 accepted=0 rejected=0 planned=0 executed=0",
      );
    } else expect(log).not.toHaveBeenCalled();
  },
);
