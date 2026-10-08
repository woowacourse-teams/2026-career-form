import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { QualityObservation } from "./observation";

function fixture(input: HTMLInputElement, id = "c1") {
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: id,
    sectionId: "s1",
    signature: createStructuralSignature([input]),
    candidate: {
      candidateId: id,
      element: "input",
      control: "text",
      visibility: "visible",
    },
    elements: [input],
    optionElements: new Map(),
  });
  return registry;
}
const item = {
  candidateId: "c1",
  profileValue: "synthetic-private-value",
  currentValue: "",
  status: "available",
  selected: true,
  analysis: { matchType: "MATCH", interactionStatus: "READY" },
} as ReviewPlanItem;

describe("품질 관측의 로컬 값 검증과 비식별 보고", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("안전한 난수 API까지 없으면 입력은 유지하고 관측 보고만 비활성화한다", async () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("unavailable");
    });
    const send = vi.fn(async () => undefined);
    const quality = new QualityObservation(send);
    quality.begin();
    await quality.finish("COMPLETED");
    expect(send).not.toHaveBeenCalled();
    expect(quality.runKey).toBe("");
  });

  it.each([
    "EXECUTION_FAILED",
    "NOT_APPROVED",
    "CONFLICT",
    "STALE_TARGET",
    "UNSUPPORTED_FORMAT",
    "UNSUPPORTED_CONTROL",
    "RETAINED_VALUE_UNCONFIRMED",
    undefined,
  ] as const)(
    "쓰기 실패 %s는 실제 값 없이 유한 사유로 보고한다",
    async (code) => {
      const reports: unknown[] = [];
      const quality = new QualityObservation(async (message) => {
        reports.push(message);
      });
      const input = document.createElement("input");
      document.body.append(input);
      const registry = fixture(input);
      quality.snapshot("snapshot", registry, ["c1"]);
      quality.write(
        item,
        {
          candidateId: "c1",
          status: "skipped",
          code,
          reason: "synthetic-private-value",
        },
        registry,
      );
      await quality.finish("COMPLETED");
      expect(JSON.stringify(reports)).not.toContain("synthetic-private-value");
      expect(reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            payload: expect.objectContaining({
              fields: {
                c1: expect.objectContaining({
                  written: false,
                  retained: false,
                }),
              },
            }),
          }),
        ]),
      );
    },
  );

  it("취소와 새 실행은 이전 쓰기의 유지 관측을 성공으로 표시하지 않는다", async () => {
    vi.useFakeTimers();
    const reports: unknown[] = [];
    const quality = new QualityObservation(async (message) => {
      reports.push(message);
    });
    const input = document.createElement("input");
    document.body.append(input);
    const registry = fixture(input);
    quality.snapshot("snapshot", registry, ["c1"]);
    quality.write(item, { candidateId: "c1", status: "written" }, registry);
    const previous = quality.runKey;
    const finished = quality.finish("CANCELLED");
    quality.begin();
    await finished;
    expect(quality.runKey).not.toBe(previous);
    expect(JSON.stringify(reports)).toContain("CANCELLED");
    expect(JSON.stringify(reports)).toContain("RETENTION_UNOBSERVED");
  });

  it.each([
    { ...item, analysis: undefined },
    { ...item, profileValue: undefined },
    { ...item, status: "conflict" as const },
    { ...item, disabled: true },
  ])(
    "매핑 및 프로필 누락과 보호된 제어는 입력 시도로 보고하지 않는다 (%#)",
    async (review) => {
      const reports: unknown[] = [];
      const quality = new QualityObservation(async (message) => {
        reports.push(message);
      });
      quality.review("snapshot", [review]);
      await quality.finish("COMPLETED");
      expect(JSON.stringify(reports)).not.toContain('"attempted":true');
      expect(JSON.stringify(reports)).not.toContain("synthetic-private-value");
    },
  );

  it("randomUUID가 없는 문서에서도 관측 초기화가 입력을 막지 않는다", () => {
    const uuid = vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(
      () => new QualityObservation(vi.fn(async () => ({ ok: true }))),
    ).not.toThrow();
    uuid.mockRestore();
  });

  it("같은 DOM은 재수집 ID가 달라도 같고 교체된 DOM은 다른 로컬 식별자를 받는다", () => {
    const quality = new QualityObservation(vi.fn(async () => ({ ok: true })));
    const first = document.createElement("input");
    document.body.append(first);
    const original = quality.snapshot("s1", fixture(first), ["c1"]);
    const recollected = quality.snapshot("s2", fixture(first, "c2"), ["c2"]);
    expect(original.c1).toBe(recollected.c2);
    const replacement = document.createElement("input");
    first.replaceWith(replacement);
    expect(quality.snapshot("s3", fixture(replacement), ["c1"]).c1).not.toBe(
      original.c1,
    );
  });

  it.each([false, true])(
    "1초 후 값 소실 여부 %s를 관측하고 실제 값을 보고하지 않는다",
    async (lost) => {
      vi.useFakeTimers();
      const messages: unknown[] = [];
      const quality = new QualityObservation(async (message) => {
        messages.push(message);
        return { ok: true };
      });
      const input = document.createElement("input");
      document.body.append(input);
      input.value = "synthetic-private-value";
      const registry = fixture(input);
      quality.snapshot("snapshot", registry, ["c1"]);
      quality.review("snapshot", [item]);
      quality.write(item, { candidateId: "c1", status: "written" }, registry);
      if (lost) input.value = "";
      await vi.advanceTimersByTimeAsync(1000);
      await quality.finish("COMPLETED");
      expect(JSON.stringify(messages)).not.toContain("synthetic-private-value");
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            payload: expect.objectContaining({
              fields: {
                c1: {
                  bound: true,
                  attempted: true,
                  written: true,
                  retained: !lost,
                  reason: lost ? "RETENTION_LOST" : null,
                },
              },
            }),
          }),
        ]),
      );
      expect(input.value).toBe(lost ? "" : "synthetic-private-value");
    },
  );

  it("DOM 교체와 보고 연결 실패는 입력 성공이나 유지 성공으로 꾸미지 않는다", async () => {
    vi.useFakeTimers();
    const messages: unknown[] = [];
    const quality = new QualityObservation(async (message) => {
      messages.push(message);
      throw new Error("synthetic offline");
    });
    const input = document.createElement("input");
    document.body.append(input);
    const registry = fixture(input);
    quality.snapshot("snapshot", registry, ["c1"]);
    quality.write(item, { candidateId: "c1", status: "written" }, registry);
    input.replaceWith(document.createElement("input"));
    await vi.advanceTimersByTimeAsync(1000);
    await expect(quality.finish("COMPLETED")).resolves.toBeUndefined();
    expect(JSON.stringify(messages)).toContain("RETENTION_UNOBSERVED");
    expect(JSON.stringify(messages)).not.toContain('"retained":true');
  });

  it("여러 칸의 쓰기와 유지 결과를 묶어 실행 보고 횟수를 부풀리지 않는다", async () => {
    vi.useFakeTimers();
    const messages: unknown[] = [];
    const quality = new QualityObservation(async (message) => {
      messages.push(message);
      return { ok: true };
    });
    const registry = new CandidateRegistry();
    const ids = Array.from({ length: 50 }, (_, index) => `c${index}`);
    ids.forEach((id) => {
      const input = document.createElement("input");
      document.body.append(input);
      registry.registerField({
        kind: "field",
        candidateId: id,
        sectionId: "s1",
        signature: createStructuralSignature([input]),
        candidate: {
          candidateId: id,
          element: "input",
          control: "text",
          visibility: "visible",
        },
        elements: [input],
        optionElements: new Map(),
      });
    });
    quality.snapshot("snapshot", registry, ids);
    ids.forEach((id) =>
      quality.write(
        { ...item, candidateId: id },
        { candidateId: id, status: "written" },
        registry,
      ),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await quality.finish("COMPLETED");
    expect(messages.length).toBeLessThanOrEqual(3);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            fields: expect.objectContaining({
              c49: expect.objectContaining({ retained: true }),
            }),
          }),
        }),
      ]),
    );
  });

  it("유지 확인 전에 제어가 잠기면 관측 범위 변경으로 남긴다", async () => {
    vi.useFakeTimers();
    const messages: unknown[] = [];
    const quality = new QualityObservation(async (message) => {
      messages.push(message);
      return { ok: true };
    });
    const input = document.createElement("input");
    document.body.append(input);
    const registry = fixture(input);
    quality.snapshot("snapshot", registry, ["c1"]);
    quality.write(item, { candidateId: "c1", status: "written" }, registry);
    input.disabled = true;
    await vi.advanceTimersByTimeAsync(1000);
    await quality.finish("COMPLETED");
    expect(JSON.stringify(messages)).toContain("RETENTION_UNOBSERVED");
    expect(JSON.stringify(messages)).not.toContain('"retained":true');
  });
});
