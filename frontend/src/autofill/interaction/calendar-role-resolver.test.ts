import { afterEach, describe, expect, it, vi } from "vitest";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import { AnalysisServiceError } from "../api/runtime-client";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import {
  createCalendarRoleResolver,
  resolveCalendarRole,
} from "./calendar-role-resolver";

afterEach(() => {
  setAutofillDebugEnabled(false);
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("resolveCalendarRole request safety", () => {
  it("uses field-group relation for opener and a safe path pattern", async () => {
    window.history.pushState({}, "", "/applications/2026-03/current-session");
    const element = document.createElement("button");
    document.body.append(element);
    const provider = vi.fn<InteractionDecisionProvider>(async (request) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: [
        {
          decisionId: "calendar-role",
          role: request.decisions[0]!.role,
          selection: "SELECTED",
          candidateId: "opener-1",
        },
      ],
    }));

    await resolveCalendarRole({
      role: "CALENDAR_OPENER",
      candidates: [{ candidateId: "opener-1", element }],
      provider,
      evidence: {
        unit: "month",
        unitEvidence: "month-options",
        ownership: "single-field",
      },
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 1000,
    });

    expect(
      provider.mock.calls[0]![0].decisions[0]!.candidates[0]!.relationToTarget,
    ).toBe("SAME_FIELD_GROUP");
    expect(provider.mock.calls[0]![0].site.pathPattern).toBe("/");
  });

  it("serializes only opaque, non-identifying candidate data", async () => {
    window.history.pushState({}, "", "/application/2026-03/session-id");
    const element = document.createElement("button");
    document.body.append(element);
    let requestBody = "";
    const provider: InteractionDecisionProvider = async (request) => {
      requestBody = JSON.stringify(request);
      return {
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        mode: "GENERIC",
        decisions: [
          {
            decisionId: "calendar-role",
            role: request.decisions[0]!.role,
            selection: "ABSTAINED",
            candidateId: null,
          },
        ],
      };
    };

    await resolveCalendarRole({
      role: "CALENDAR_YEAR_TRIGGER",
      candidates: [{ candidateId: "year-1", element }],
      provider,
      evidence: {
        unit: "month",
        unitEvidence: "month-options",
        ownership: "single-field",
      },
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 1000,
    });

    expect(requestBody).toContain('"pathPattern":"/"');
    expect(requestBody).toContain('"relationToTarget":"DIALOG_CONTROL"');
    const serialized = JSON.parse(requestBody) as Record<string, unknown>;
    expect(serialized.snapshotId).toMatch(/^calendar-[a-f0-9-]{36}$/);
    delete serialized.snapshotId;
    expect(JSON.stringify(serialized)).not.toMatch(
      /2026|03|session-id|March|<button|approval|currentValue/,
    );
  });
});

it("does not invoke the provider beyond the per-calendar call cap", async () => {
  const element = document.createElement("button");
  document.body.append(element);
  let calls = 0;
  const resolve = createCalendarRoleResolver();
  const outcomes = [];
  for (let index = 0; index < 5; index++)
    outcomes.push(
      await resolve({
        role: "CALENDAR_OPENER",
        candidates: [{ candidateId: "c1", element }],
        evidence: {
          unit: "month",
          unitEvidence: "month-options",
          ownership: "single-field",
        },
        canonicalFieldKey: "calendar-month",
        deadline: Date.now() + 1000,
        provider: async (request) => {
          calls++;
          return {
            schemaVersion: 2,
            snapshotId: request.snapshotId,
            status: "COMPLETE",
            mode: "GENERIC",
            decisions: [
              {
                decisionId: "calendar-role",
                role: "CALENDAR_OPENER",
                selection: "SELECTED",
                candidateId: "c1",
              },
            ],
          };
        },
      }),
    );
  expect(calls).toBe(4);
  expect(outcomes[3]?.element).toBe(element);
  expect(outcomes[4]).toBeUndefined();
});

it("settles a hung provider at the deadline and removes its timer", async () => {
  vi.useFakeTimers();
  const element = document.createElement("button");
  document.body.append(element);
  const pending = resolveCalendarRole({
    role: "CALENDAR_OPENER",
    candidates: [{ candidateId: "c1", element }],
    evidence: {
      unit: "month",
      unitEvidence: "month-options",
      ownership: "single-field",
    },
    canonicalFieldKey: "calendar-month",
    deadline: Date.now() + 1000,
    provider: () => new Promise(() => {}),
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(await pending).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects detached evidence after a provider response and clears its timer", async () => {
  vi.useFakeTimers();
  const element = document.createElement("button");
  document.body.append(element);
  const result = await resolveCalendarRole({
    role: "CALENDAR_OPENER",
    candidates: [{ candidateId: "c1", element }],
    evidence: {
      unit: "month",
      unitEvidence: "month-options",
      ownership: "single-field",
    },
    canonicalFieldKey: "calendar-month",
    deadline: Date.now() + 1000,
    provider: async (request) => {
      element.remove();
      return {
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        mode: "GENERIC",
        decisions: [
          {
            decisionId: "calendar-role",
            role: "CALENDAR_OPENER",
            selection: "SELECTED",
            candidateId: "c1",
          },
        ],
      };
    },
  });
  expect(result).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["selected", "abstained", "provider-error", "stale"])(
  "emits only finite diagnostic fields for %s",
  async (reason) => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "debug").mockImplementation(() => {});
    const element = document.createElement("button");
    element.textContent = "private DOM label 2026-03";
    document.body.append(element);
    await resolveCalendarRole({
      role: "CALENDAR_OPENER",
      candidates: [{ candidateId: "c1", element }],
      evidence: {
        unit: "month",
        unitEvidence: "month-options",
        ownership: "single-field",
      },
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 1000,
      provider: async (request) => {
        if (reason === "provider-error")
          throw new Error("private provider payload 2026-03");
        if (reason === "stale") element.remove();
        return {
          schemaVersion: 2,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          mode: "GENERIC",
          decisions: [
            {
              decisionId: "calendar-role",
              role: "CALENDAR_OPENER",
              selection: reason === "abstained" ? "ABSTAINED" : "SELECTED",
              candidateId: reason === "abstained" ? null : "c1",
            },
          ],
        };
      },
    });
    expect(log).toHaveBeenCalledWith("[CareerForm] calendar-role", {
      reason,
      role: "CALENDAR_OPENER",
      candidateCount: 1,
      ...(reason === "selected" ? { candidateId: "c1" } : {}),
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private|2026-03|DOM label|provider payload/,
    );
  },
);

describe("transient provider failure before the first calendar gesture", () => {
  const evidence = {
    unit: "month" as const,
    unitEvidence: "month-options" as const,
    ownership: "single-field" as const,
  };
  const transient = (code: "TIMEOUT" | "NETWORK") =>
    new AnalysisServiceError("transient", undefined, undefined, code);
  const selected =
    (role: "CALENDAR_OPENER" | "CALENDAR_YEAR_TRIGGER"): InteractionDecisionProvider =>
    async (request) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: [
        {
          decisionId: "calendar-role",
          role,
          selection: "SELECTED",
          candidateId: "c1",
        },
      ],
    });
  const button = () => {
    const element = document.createElement("button");
    element.type = "button";
    document.body.append(element);
    return element;
  };

  it.each(["TIMEOUT", "NETWORK"] as const)(
    "retries the opener decision once after a %s and uses the answer",
    async (code) => {
      const element = button();
      const provider = vi
        .fn<InteractionDecisionProvider>()
        .mockRejectedValueOnce(transient(code))
        .mockImplementation(selected("CALENDAR_OPENER"));
      const result = await resolveCalendarRole({
        role: "CALENDAR_OPENER",
        candidates: [{ candidateId: "c1", element }],
        evidence,
        provider,
        canonicalFieldKey: "calendar-month",
        deadline: Date.now() + 10_000,
      });
      expect(provider).toHaveBeenCalledTimes(2);
      expect(result?.element).toBe(element);
    },
  );

  it("keeps today's stop when the retried opener decision fails again", async () => {
    const element = button();
    const provider = vi
      .fn<InteractionDecisionProvider>()
      .mockRejectedValue(transient("TIMEOUT"));
    const result = await resolveCalendarRole({
      role: "CALENDAR_OPENER",
      candidates: [{ candidateId: "c1", element }],
      evidence,
      provider,
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 10_000,
    });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(result).toBeUndefined();
  });

  it.each([
    ["a non-transport provider error", () => new Error("contract")],
    [
      "a server error",
      () => new AnalysisServiceError("server", undefined, undefined),
    ],
  ])("does not retry %s", async (_case, error) => {
    const element = button();
    const provider = vi
      .fn<InteractionDecisionProvider>()
      .mockRejectedValueOnce(error())
      .mockImplementation(selected("CALENDAR_OPENER"));
    const result = await resolveCalendarRole({
      role: "CALENDAR_OPENER",
      candidates: [{ candidateId: "c1", element }],
      evidence,
      provider,
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 10_000,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });

  it("does not retry a role resolved after the calendar was already operated", async () => {
    const element = button();
    const provider = vi
      .fn<InteractionDecisionProvider>()
      .mockRejectedValueOnce(transient("TIMEOUT"))
      .mockImplementation(selected("CALENDAR_YEAR_TRIGGER"));
    const result = await resolveCalendarRole({
      role: "CALENDAR_YEAR_TRIGGER",
      candidates: [{ candidateId: "c1", element }],
      evidence,
      provider,
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 10_000,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });

  it("does not retry when the field budget is spent", async () => {
    const element = button();
    let clock = 0;
    const provider = vi
      .fn<InteractionDecisionProvider>()
      .mockImplementationOnce(async () => {
        clock = 10_000;
        throw transient("TIMEOUT");
      })
      .mockImplementation(selected("CALENDAR_OPENER"));
    const result = await resolveCalendarRole({
      role: "CALENDAR_OPENER",
      candidates: [{ candidateId: "c1", element }],
      evidence,
      provider,
      canonicalFieldKey: "calendar-month",
      deadline: 10_000,
      now: () => clock,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });

  it.each([
    ["the opener changed", (element: HTMLElement) => element.setAttribute("data-x", "1")],
    ["the field was revalidated as stale", () => undefined],
  ])("does not retry when %s while the request failed", async (name, mutate) => {
    const element = button();
    let current = true;
    const provider = vi
      .fn<InteractionDecisionProvider>()
      .mockImplementationOnce(async () => {
        mutate(element);
        if (name.includes("stale")) current = false;
        throw transient("NETWORK");
      })
      .mockImplementation(selected("CALENDAR_OPENER"));
    const result = await resolveCalendarRole({
      role: "CALENDAR_OPENER",
      candidates: [{ candidateId: "c1", element }],
      evidence,
      provider,
      revalidate: () => current,
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 10_000,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });

  it("does not retry after the run was aborted", async () => {
    const element = button();
    const controller = new AbortController();
    const provider = vi
      .fn<InteractionDecisionProvider>()
      .mockImplementationOnce(async () => {
        controller.abort();
        throw transient("TIMEOUT");
      })
      .mockImplementation(selected("CALENDAR_OPENER"));
    const result = await resolveCalendarRole({
      role: "CALENDAR_OPENER",
      candidates: [{ candidateId: "c1", element }],
      evidence,
      provider,
      signal: controller.signal,
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 10_000,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });
});
