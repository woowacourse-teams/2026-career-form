import { describe, expect, it, vi } from "vitest";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import { resolveCalendarRole } from "./calendar-role-resolver";

describe("resolveCalendarRole request safety", () => {
  it("uses field-group relation for opener and a safe path pattern", async () => {
    window.history.pushState({}, "", "/applications/2026-03/current-session");
    const element = document.createElement("button");
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
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 1000,
    });

    expect(requestBody).toContain('"pathPattern":"/"');
    expect(requestBody).toContain('"relationToTarget":"DIALOG_CONTROL"');
    expect(requestBody).not.toMatch(
      /2026|03|session-id|March|<button|approval|currentValue/,
    );
  });
});
