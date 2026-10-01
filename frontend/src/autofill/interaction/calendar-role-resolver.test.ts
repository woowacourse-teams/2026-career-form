import { afterEach, describe, expect, it, vi } from "vitest";
import type { InteractionDecisionProvider } from "../api/interaction-types";
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
