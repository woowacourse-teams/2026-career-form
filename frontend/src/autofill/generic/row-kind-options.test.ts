import { describe, expect, it, vi } from "vitest";

import type {
  InteractionDecisionRequest,
  InteractionDecisionResponse,
  TargetKind,
} from "../api/interaction-types";
import { decideRowKindOptions } from "./row-kind-options";

const KINDS: TargetKind[] = [
  "HIGH_SCHOOL",
  "ASSOCIATE",
  "BACHELOR",
  "MASTER",
  "DOCTOR",
];
const OPTION_TEXT = ["고등학교", "전문학사", "학사", "석사", "박사"];
const PROFILE_VALUE = "SYNTHETIC_PROFILE_VALUE_4417";
const CURRENT_VALUE = "SYNTHETIC_CURRENT_VALUE_9023";

const options = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    optionId: `row-kind-select:option:${index}`,
    visibility: "visible" as const,
    semanticContext: {
      labels: [
        { source: "label" as const, text: OPTION_TEXT[index % 5] ?? "기타" },
      ],
    },
  }));

const input = (count = 5) => ({
  snapshotId: "row-kind-snapshot",
  site: { host: "example.test", pathPattern: "/apply" },
  canonicalFieldKey: "education.university.schoolName",
  relationToTarget: "SAME_REPEAT_ROW" as const,
  options: options(count),
});

function answering(
  choose: (request: InteractionDecisionRequest) => InteractionDecisionResponse,
) {
  const requests: InteractionDecisionRequest[] = [];
  const decideInteractions = vi.fn(
    async (request: InteractionDecisionRequest) => {
      requests.push(request);
      return choose(request);
    },
  );
  return { client: { decideInteractions }, requests, decideInteractions };
}

const allNull = new Map(KINDS.map((kind) => [kind, null]));

describe("decideRowKindOptions", () => {
  it("asks all five target kinds in one request and restores the selected option ids", async () => {
    const { client, requests } = answering((request) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: request.decisions.map((decision) =>
        decision.targetKind === "MASTER"
          ? {
              decisionId: decision.decisionId,
              role: decision.role,
              selection: "SELECTED" as const,
              candidateId: decision.candidates[3]?.candidateId,
            }
          : decision.targetKind === "BACHELOR"
            ? {
                decisionId: decision.decisionId,
                role: decision.role,
                selection: "SELECTED" as const,
                candidateId: decision.candidates[2]?.candidateId,
              }
            : {
                decisionId: decision.decisionId,
                role: decision.role,
                selection: "ABSTAINED" as const,
                candidateId: null,
              },
      ),
    }));

    const result = await decideRowKindOptions(client, input());

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request).toMatchObject({
      schemaVersion: 2,
      snapshotId: "row-kind-snapshot",
      site: { host: "example.test", pathPattern: "/apply" },
    });
    expect(request.decisions.map((decision) => decision.targetKind)).toEqual(
      KINDS,
    );
    expect(
      request.decisions.every(
        (decision) => decision.role === "ROW_KIND_OPTION",
      ),
    ).toBe(true);
    expect(
      request.decisions.every(
        (decision) =>
          decision.canonicalFieldKey === "education.university.schoolName",
      ),
    ).toBe(true);
    const ids = request.decisions.flatMap((decision) =>
      decision.candidates.map((candidate) => candidate.candidateId),
    );
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
    for (const id of [
      ...ids,
      ...request.decisions.map((decision) => decision.decisionId),
    ]) {
      expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
    }
    expect(request.decisions[0]!.candidates[0]).toEqual({
      candidateId: expect.any(String),
      element: "select",
      control: "option",
      visibility: "visible",
      relationToTarget: "SAME_REPEAT_ROW",
      semanticContext: { labels: [{ source: "label", text: "고등학교" }] },
    });
    expect(result).toEqual(
      new Map<TargetKind, string | null>([
        ["HIGH_SCHOOL", null],
        ["ASSOCIATE", null],
        ["BACHELOR", "row-kind-select:option:2"],
        ["MASTER", "row-kind-select:option:3"],
        ["DOCTOR", null],
      ]),
    );
  });

  it.each([
    "LLM_UNAVAILABLE",
    "STATIC_POLICY_PRESENT",
    "POLICY_UNAVAILABLE",
  ] as const)(
    "returns null for every kind when the response is %s",
    async (status) => {
      const { client } = answering((request) => ({
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status,
        mode: status === "LLM_UNAVAILABLE" ? "GENERIC" : null,
        decisions: [],
      }));

      await expect(decideRowKindOptions(client, input())).resolves.toEqual(
        allNull,
      );
    },
  );

  it.each([
    ["no options", 0],
    ["25 options per decision", 25],
    ["more than 96 candidates in total", 20],
  ])("does not call the provider for %s", async (_name, count) => {
    const { client, decideInteractions } = answering(() => {
      throw new Error("must not be called");
    });

    await expect(decideRowKindOptions(client, input(count))).resolves.toEqual(
      allNull,
    );
    expect(decideInteractions).not.toHaveBeenCalled();
  });

  it("still asks when the 96 candidate total is not exceeded", async () => {
    const { client, requests } = answering((request) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "LLM_UNAVAILABLE",
      mode: "GENERIC",
      decisions: [],
    }));

    await decideRowKindOptions(client, input(19));

    expect(
      requests[0]!.decisions.flatMap((decision) => decision.candidates),
    ).toHaveLength(95);
  });

  it("never sends profile values, current input values, or profile counts", async () => {
    const { client, requests } = answering((request) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "LLM_UNAVAILABLE",
      mode: "GENERIC",
      decisions: [],
    }));
    const document = { value: CURRENT_VALUE };
    const profile = {
      education: { university: [{ schoolName: PROFILE_VALUE }] },
    };

    await decideRowKindOptions(client, {
      ...input(),
      ...{ document, profile },
    } as never);

    const serialized = JSON.stringify(requests[0]);
    expect(serialized).not.toContain(PROFILE_VALUE);
    expect(serialized).not.toContain(CURRENT_VALUE);
    expect(serialized).not.toMatch(/"(value|currentValue|profile)"/);
    expect(serialized).not.toMatch(/count/i);
  });
});
