import { describe, it, expect } from "vitest";
import { createAnalysisMessageHandler } from "../api/background-handler";
import { executeApprovedPreparationPlans } from "../preparation/executor";
import { CandidateRegistry } from "../dom/candidate-registry";
describe("address command routing", () => {
  it("negotiates support through the existing preparation endpoint", async () => {
    let captured: Request | undefined;
    const handle = createAnalysisMessageHandler({
      baseUrl: "http://localhost:8080",
      fetcher: async (input, init) => {
        captured = new Request(input, init);
        return new Response("{}");
      },
    });
    await handle({
      type: "AUTOFILL_ANALYZE_PREPARATION",
      payload: {
        schemaVersion: 2,
        snapshotId: "p",
        site: {
          host: "www.skcareers.com",
          pathPattern: "/Application/Index/:id",
        },
        sections: [{ sectionId: "s", actionCandidates: [] }],
      },
    });
    expect(captured?.url).toBe(
      "http://localhost:8080/api/v1/preparation/analyze",
    );
    expect(captured?.headers.get("X-Career-Form-Capabilities")).toBe(
      "address-search-v1",
    );
  });
  it("does not execute address search through the synchronous preparation executor", async () => {
    const snapshot = {
      registry: new CandidateRegistry(),
      isTargetSectionVisible: () => false,
    };
    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          approved: true,
          plan: {
            actionCandidateId: "a",
            command: "SEARCH_ADDRESS",
            expectedEffect: "ADDRESS_SELECTED",
          },
        },
      ],
      initialSnapshot: snapshot,
      refreshSnapshot: async () => snapshot,
      countRepeatableGroups: () => 0,
    });
    expect(result).toMatchObject({
      status: "failed",
      reason: "action-not-executable",
      executedPlanCount: 0,
    });
  });
});
