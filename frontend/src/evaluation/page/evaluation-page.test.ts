import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// 백엔드 평가 화면(static/evaluations/app.js)을 실제로 그려 전체 흐름·준비·매핑 탭마다 맞는 카드와 그 단계 값만
// 보이는지 확인한다. 로그인 모듈은 빈 헤더로 바꾸고 API는 고정 응답으로 대신한다.
const STATIC = join(process.cwd(), "../backend/src/main/resources/static");

const score = (value: number) => ({
  counts: {
    filledCorrect: 8,
    filledWrongKey: 1,
    filledUnneeded: 0,
    blankCorrect: 1,
    missed: 1,
    unobserved: 0,
  },
  precision: 0.9,
  fillRate: 0.8,
  score: value,
});
const stage = (calls: number, attempts: number) => ({
  calls,
  failureRate: 0,
  throughputPerSecond: 2,
  productCall: {
    count: calls,
    meanMs: 500,
    p50Ms: 500,
    p95Ms: 900,
    totalMs: 500 * calls,
  },
  modelAttempt: {
    count: attempts,
    meanMs: 200,
    p50Ms: 200,
    p95Ms: 300,
    totalMs: 200 * attempts,
  },
  retriedAttempts: 0,
  retriedAttemptMs: null,
});
const tokens = {
  observedAttempts: 10,
  unobservedAttempts: 0,
  inputTotal: 1000,
  outputTotal: 100,
  inputMean: 100,
  outputMean: 10,
};
const items = (correct: number) => ({
  correct,
  wrongKey: 1,
  missing: 1,
  unnecessary: 0,
  excluded: 0,
});
const report = {
  quality: {
    accuracy: 0.8,
    preparationAccuracy: 0.6,
    mappingAccuracy: 0.85,
    failureRate: 0,
    items: items(10),
  },
  performance: {
    TOTAL: stage(11, 50),
    PREPARATION: stage(5, 5),
    MAPPING: stage(6, 45),
  },
  tokens: { TOTAL: tokens, PREPARATION: tokens, MAPPING: tokens },
  flows: {
    count: 3,
    failureRate: 0,
    time: { count: 3, meanMs: 1500, p50Ms: 1500, p95Ms: 2000, totalMs: 4500 },
    inputTokensMean: 300,
    outputTokensMean: 30,
  },
  timing: {
    queueWaitMs: 0,
    elapsedMs: 5000,
    firstRepetitionMeanMs: 500,
    laterRepetitionsMeanMs: 500,
  },
  scoringVersion: "item-weighted-exact-v2",
  repetitions: [
    {
      repetition: 1,
      accuracy: 0.8,
      scores: { TOTAL: 0.8, PREPARATION: 0.7, MAPPING: 0.9 },
    },
  ],
  autofill: score(0.9),
  scores: { TOTAL: score(0.8), PREPARATION: score(0.7), MAPPING: score(0.9) },
  itemsByCall: {
    "PREPARATION/SECTION_CLASSIFY": items(4),
    "PREPARATION/INTERACTION_DECISION": items(2),
    "MAPPING/SECTION_CLASSIFY": items(3),
    "MAPPING/GENERIC_FIELDS": items(9),
  },
};
const run = {
  id: "run-1",
  status: "COMPLETED",
  processedCalls: 11,
  plannedCalls: 11,
  repetitions: 1,
  requestedAt: "2026-11-03T00:00:00Z",
  comparisonId: null,
  versions: {
    provider: "jev",
    model: "jev-latest",
    datasetVersion: 3,
    promptVersion: "baseline",
    promptDigest: "d".repeat(64),
    codeVersion: "abc1234",
    settings: { "field-batch-size": "5", "section-concurrency": "3" },
  },
};
const dataset = {
  usable: true,
  profiles: {},
  cases: [
    {
      state: "initial",
      siteId: "s",
      profileId: "p",
      calls: [],
      sections: [],
      review: {},
    },
  ],
};

function respond(url: string) {
  const body = url.includes("/runs?")
    ? [{ run, report }]
    : url.includes("/datasets/")
      ? dataset
      : [];
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => body,
  };
}

const titles = (selector: string) =>
  [...document.querySelectorAll(`${selector} .metric h3`)].map(
    (heading) => heading.textContent,
  );
const headline = () =>
  document.querySelector("#cf-quality .metric .number")?.textContent;
const pick = async (stageName: string) => {
  (
    document.querySelector(
      `#cf-overview-stage [data-stage=${stageName}]`,
    ) as HTMLButtonElement
  ).click();
  await Promise.resolve();
};

beforeAll(async () => {
  const html = readFileSync(join(STATIC, "evaluations/index.html"), "utf8");
  document.body.innerHTML = html.replace(
    /^[\s\S]*<body[^>]*>|<\/body>[\s\S]*$/g,
    "",
  );
  // Vite가 읽을 수 있게 프로젝트 안의 무시 폴더(node_modules/.cache)에 바꾼 사본을 둔다.
  const dir = join(process.cwd(), "node_modules/.cache/cf-evaluation-page");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "access.js"),
    "export const accessHeaders = () => ({});\nexport const clearAccess = () => {};\n",
  );
  copyFileSync(join(STATIC, "evaluations/pricing.js"), join(dir, "pricing.js"));
  const app = readFileSync(join(STATIC, "evaluations/app.js"), "utf8")
    .replace('"/quality/access.js"', '"./access.js"')
    .replace('"/evaluations/pricing.js"', '"./pricing.js"');
  writeFileSync(join(dir, "app.js"), app);
  (globalThis as unknown as { fetch: (url: string) => unknown }).fetch = async (
    url: string,
  ) => respond(url);
  await import(/* @vite-ignore */ join(dir, "app.js"));
});

describe("AI 평가 화면의 단계 탭", () => {
  it("전체 흐름은 합친 자동기입 점수와 단계별 점수, 자동기입 단위 성능만 보인다", async () => {
    await pick("total");
    expect(titles("#cf-quality")).toEqual(["자동기입 점수", "단계별 점수"]);
    expect(headline()).toBe("80.0%");
    expect(titles("#cf-performance")).toEqual([
      "자동기입 시간",
      "처리량",
      "자동기입 실패율",
    ]);
  });

  it("준비는 준비 점수와 준비 결과, 요청·AI 질문 단위 성능만 보인다", async () => {
    await pick("prepare");
    expect(titles("#cf-quality")).toEqual(["준비 점수", "준비 결과"]);
    expect(headline()).toBe("70.0%");
    expect(titles("#cf-performance")).toEqual([
      "AI 응답 시간",
      "요청 처리 시간",
      "요청 실패율",
    ]);
  });

  it("매핑은 매핑 점수와 칸별 결과·섹션 분류 결과, 요청·AI 질문 단위 성능만 보인다", async () => {
    await pick("mapping");
    expect(titles("#cf-quality")).toEqual([
      "매핑 점수",
      "칸별 결과",
      "섹션 분류 결과",
    ]);
    expect(headline()).toBe("90.0%");
    expect(titles("#cf-performance")).toEqual([
      "AI 응답 시간",
      "요청 처리 시간",
      "요청 실패율",
    ]);
  });
});
