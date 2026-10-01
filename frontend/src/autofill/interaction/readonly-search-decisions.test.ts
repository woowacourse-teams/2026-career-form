import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractionDecisionBudgetError } from "../api/interaction-decision-session";
import type {
  InteractionCandidate,
  InteractionDecisionRequest,
  InteractionDecisionResponse,
  InteractionRole,
} from "../api/interaction-types";
import {
  MAX_CANDIDATES,
  MAX_CANDIDATES_PER_DECISION,
  MAX_DECISIONS,
  bindCandidates,
  decide,
  decision,
  elementSignature,
  hasIndistinguishableCandidates,
  requestFor,
  selectedCandidate,
  type DecisionBinding,
  type ElementBinding,
} from "./readonly-search";

const ROLE: InteractionRole = "SEARCH_POPUP_OPENER";

afterEach(() => {
  document.body.innerHTML = "";
});

function manualBinding(
  candidateId: string,
  label: string,
): ElementBinding<HTMLButtonElement> {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  document.body.append(element);
  const candidate: InteractionCandidate = {
    candidateId,
    element: "button",
    control: "button",
    visibility: "visible",
    relationToTarget: "SAME_FIELD_GROUP",
    semanticContext: { labels: [{ source: "aria-label", text: label }] },
  };
  return {
    candidateId,
    element,
    candidate,
    signature: elementSignature(element),
  };
}

function manualDecision(
  decisionId: string,
  candidates: readonly ElementBinding<HTMLButtonElement>[],
): DecisionBinding<HTMLButtonElement> {
  return decision(decisionId, ROLE, candidates);
}

function completeResponse(
  request: InteractionDecisionRequest,
  overrides: Partial<InteractionDecisionResponse> = {},
): InteractionDecisionResponse {
  return {
    schemaVersion: 2,
    snapshotId: request.snapshotId,
    status: "COMPLETE",
    mode: "GENERIC",
    decisions: request.decisions.map((item) => ({
      decisionId: item.decisionId,
      role: item.role,
      selection: "SELECTED" as const,
      candidateId: item.candidates[0]?.candidateId,
    })),
    ...overrides,
  };
}

function requestForPair(
  leftLabel = "전공 검색",
  rightLabel = "학교 검색",
): {
  request: InteractionDecisionRequest;
  binding: DecisionBinding<HTMLButtonElement>;
} {
  document.body.innerHTML = "";
  const left = manualBinding("left", leftLabel);
  const right = manualBinding("right", rightLabel);
  const binding = manualDecision("search-opener", [left, right]);
  const request = requestFor(document, "education.university.majorName", [
    binding as DecisionBinding<HTMLElement>,
  ])!;
  return { request, binding };
}

describe("readonly search decision descriptors", () => {
  it("binds semantic candidates without exposing query, target, or profile values", () => {
    document.body.innerHTML = `
      <section aria-label="전공 검색 영역">
        <label for="query">전공 입력</label>
        <input id="query" type="text" value="가상전공학과" placeholder="프로필 비밀값" />
        <button type="button" title="전공 검색">검색</button>
        <button type="button" title="학교 검색">검색</button>
      </section>`;
    const query = document.querySelector<HTMLInputElement>("#query")!;
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    );
    const bound = bindCandidates(
      "opener",
      buttons,
      "SAME_FIELD_GROUP",
      document.querySelector("section"),
    );
    const binding = manualDecision("opener", bound);
    const request = requestFor(document, "education.university.majorName", [
      binding as DecisionBinding<HTMLElement>,
    ])!;
    const serialized = JSON.stringify(request);

    expect(query.value).toBe("가상전공학과");
    expect(serialized).not.toContain("가상전공학과");
    expect(serialized).not.toContain("프로필 비밀값");
    expect(serialized).not.toMatch(/"value"\s*:/);
    expect(request.decisions[0]?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationToTarget: "SAME_FIELD_GROUP" }),
      ]),
    );
  });

  it("retains only semantic role data when a candidate has a current DOM value", () => {
    document.body.innerHTML = `<input id="query" type="text" value="현재 검색어" aria-label="학교소재지 입력" />`;
    const input = document.querySelector<HTMLInputElement>("#query")!;
    const bound = bindCandidates(
      "query",
      [input],
      "DIALOG_CONTROL",
      document.body,
    );
    expect(bound).toHaveLength(1);
    expect(bound[0]?.candidate).not.toHaveProperty("value");
    expect(JSON.stringify(bound[0]?.candidate)).not.toContain("현재 검색어");
  });

  it("detects indistinguishable descriptors instead of allowing an opaque tie break", () => {
    const first = manualBinding("first", "검색");
    const second = manualBinding("second", "검색");
    expect(hasIndistinguishableCandidates([first, second])).toBe(true);
    expect(
      hasIndistinguishableCandidates([
        manualBinding("first", "전공 검색"),
        manualBinding("second", "학교 검색"),
      ]),
    ).toBe(false);
  });
});

describe("readonly search decision request bounds", () => {
  it("omits a request when every role is already a singleton", () => {
    const singleton = manualDecision("singleton", [
      manualBinding("one", "검색"),
    ]);
    expect(
      requestFor(document, "education.university.schoolName", [
        singleton as DecisionBinding<HTMLElement>,
      ]),
    ).toBeUndefined();
  });

  it("enforces the decision count bound before creating a provider request", () => {
    const bindings = Array.from({ length: MAX_DECISIONS + 1 }, (_, index) =>
      manualDecision(`decision-${index}`, [
        manualBinding(`left-${index}`, `검색 왼쪽 ${index}`),
        manualBinding(`right-${index}`, `검색 오른쪽 ${index}`),
      ]),
    );
    expect(
      requestFor(document, "education.university.schoolName", bindings),
    ).toBeUndefined();
  });

  it("enforces the aggregate candidate count while keeping each role within its own bound", () => {
    const bindings = Array.from(
      { length: Math.floor(MAX_CANDIDATES / 20) + 1 },
      (_, index) =>
        manualDecision(
          `decision-${index}`,
          Array.from({ length: 20 }, (_, candidateIndex) =>
            manualBinding(
              `candidate-${index}-${candidateIndex}`,
              `검색 ${index}-${candidateIndex}`,
            ),
          ),
        ),
    );
    expect(
      requestFor(document, "education.university.schoolName", bindings),
    ).toBeUndefined();
  });

  it("rejects a single oversized role even when the total candidate count is bounded", () => {
    const candidates = Array.from(
      { length: MAX_CANDIDATES_PER_DECISION + 1 },
      (_, index) => manualBinding(`candidate-${index}`, `검색 ${index}`),
    );
    const oversized = manualDecision("oversized", candidates);
    expect(
      requestFor(document, "education.university.schoolName", [
        oversized as DecisionBinding<HTMLElement>,
      ]),
    ).toBeUndefined();
  });

  it("keeps bounded requests free of profile values while preserving the canonical field key", () => {
    const pair = requestForPair();
    expect(pair.request.decisions).toHaveLength(1);
    expect(pair.request.decisions[0]?.canonicalFieldKey).toBe(
      "education.university.majorName",
    );
    expect(JSON.stringify(pair.request)).not.toContain("가상");
  });
});

describe("selectedCandidate validation", () => {
  it("retains a singleton locally without asking a provider to choose", () => {
    const binding = manualDecision("singleton", [
      manualBinding("only", "검색"),
    ]);
    expect(selectedCandidate(binding, undefined, undefined)).toBe(
      binding.candidates[0],
    );
  });

  it.each([
    ["wrong schema", { schemaVersion: 1 }],
    ["wrong snapshot", { snapshotId: "different" }],
    ["wrong status", { status: "LLM_UNAVAILABLE" }],
    ["wrong mode", { mode: null }],
  ] as const)("rejects %s responses", (_name, override) => {
    const { request, binding } = requestForPair();
    const response = completeResponse(
      request,
      override as unknown as Partial<InteractionDecisionResponse>,
    );
    expect(selectedCandidate(binding, request, response)).toBe("invalid");
  });

  it("rejects missing, duplicate, and unknown decision entries", () => {
    const { request, binding } = requestForPair();
    expect(
      selectedCandidate(
        binding,
        request,
        completeResponse(request, { decisions: [] }),
      ),
    ).toBe("invalid");
    expect(
      selectedCandidate(
        binding,
        request,
        completeResponse(request, {
          decisions: [...request.decisions, ...request.decisions].map(
            (item) => ({
              decisionId: item.decisionId,
              role: item.role,
              selection: "SELECTED" as const,
              candidateId: item.candidates[0]?.candidateId,
            }),
          ),
        }),
      ),
    ).toBe("invalid");
    expect(
      selectedCandidate(
        binding,
        request,
        completeResponse(request, {
          decisions: [
            {
              decisionId: "search-opener",
              role: ROLE,
              selection: "SELECTED",
              candidateId: "missing",
            },
          ],
        }),
      ),
    ).toBe("invalid");
  });

  it("preserves explicit abstention and accepts exactly one valid selection", () => {
    const { request, binding } = requestForPair();
    expect(
      selectedCandidate(
        binding,
        request,
        completeResponse(request, {
          decisions: [
            {
              decisionId: "search-opener",
              role: ROLE,
              selection: "ABSTAINED",
              candidateId: null,
            },
          ],
        }),
      ),
    ).toBe("abstain");
    const selected = selectedCandidate(
      binding,
      request,
      completeResponse(request, {
        decisions: [
          {
            decisionId: "search-opener",
            role: ROLE,
            selection: "SELECTED",
            candidateId: "right",
          },
        ],
      }),
    );
    expect(selected).toBe(binding.candidates[1]);
  });
});

describe("decide provider and budget behavior", () => {
  it("does not invoke a provider for a singleton or for an absent request", async () => {
    const provider = vi.fn();
    const singleton = manualDecision("singleton", [
      manualBinding("only", "검색"),
    ]);
    expect(await decide(singleton, undefined, provider)).toBe(
      singleton.candidates[0],
    );
    expect(provider).not.toHaveBeenCalled();

    const ambiguous = manualDecision("ambiguous", [
      manualBinding("left", "전공 검색"),
      manualBinding("right", "학교 검색"),
    ]);
    expect(await decide(ambiguous, undefined, provider)).toBe("abstain");
    expect(provider).not.toHaveBeenCalled();
  });

  it("returns the locally validated provider selection without exposing expected values", async () => {
    const { request, binding } = requestForPair();
    const provider = vi.fn(async (received: InteractionDecisionRequest) => {
      expect(JSON.stringify(received)).not.toContain("가상전공학과");
      return completeResponse(received, {
        decisions: [
          {
            decisionId: "search-opener",
            role: ROLE,
            selection: "SELECTED",
            candidateId: "right",
          },
        ],
      });
    });
    expect(await decide(binding, request, provider)).toBe(
      binding.candidates[1],
    );
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("abstains on provider failures and reports the bounded budget error distinctly", async () => {
    const { request, binding } = requestForPair();
    const failed = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    expect(await decide(binding, request, failed)).toBe("abstain");

    const exhausted = vi.fn(async () => {
      throw new InteractionDecisionBudgetError(0);
    });
    expect(await decide(binding, request, exhausted)).toBe(
      "decision_budget_exhausted",
    );
  });

  it("returns invalid for a malformed provider response instead of selecting by position", async () => {
    const { request, binding } = requestForPair();
    const malformed = vi.fn(
      async () =>
        ({
          schemaVersion: 2,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          mode: "GENERIC",
          decisions: [
            {
              decisionId: "search-opener",
              role: ROLE,
              selection: "SELECTED",
              candidateId: "not-a-candidate",
            },
          ],
        }) as InteractionDecisionResponse,
    );
    expect(await decide(binding, request, malformed)).toBe("invalid");
  });
});
