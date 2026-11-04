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
  failedAttempts: 0,
  failedAttemptMs: null,
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
  repetitions: [0.79, 0.8, 0.81].map((total, index) => ({
    repetition: index + 1,
    accuracy: 0.8,
    scores: { TOTAL: total, PREPARATION: 0.7, MAPPING: 0.89 + index * 0.01 },
  })),
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
  repetitions: 3,
  requestedAt: "2026-11-03T00:00:00Z",
  comparisonId: null,
  versions: {
    provider: "jev",
    model: "jev-latest",
    datasetVersion: 4,
    promptVersion: "baseline",
    promptDigest: "d".repeat(64),
    codeVersion: "abc1234",
    settings: { "field-batch-size": "5", "section-concurrency": "3" },
  },
};
// 이전 실행: 같은 데이터셋 버전의 이전 실행. 전체 점수 0.75(반복 범위가 이번과 겹치지 않음), 매핑 점수 0.88(범위가
// 이번과 겹침), 자동기입 시간 2.0초다.
const baseRun = {
  ...run,
  id: "run-0",
  requestedAt: "2026-11-02T00:00:00Z",
  versions: {
    ...run.versions,
    promptVersion: "before",
    codeVersion: "old0000",
  },
};
const baseReport = {
  ...report,
  repetitions: [0.74, 0.75, 0.76].map((total, index) => ({
    repetition: index + 1,
    accuracy: 0.75,
    scores: { TOTAL: total, PREPARATION: 0.7, MAPPING: 0.87 + index * 0.01 },
  })),
  scores: { ...report.scores, TOTAL: score(0.75), MAPPING: score(0.88) },
  flows: { ...report.flows, time: { ...report.flows.time, meanMs: 2000 } },
};
const dataset = {
  usable: true,
  profiles: {},
  cases: [
    ...["initial", "high-school"].map((state) => ({
      state,
      siteId: "woowahan-recruitment",
      split: state === "initial" ? "tuning" : "final",
      profileId: "p",
      calls: [],
      sections: [],
      review: {},
    })),
    {
      state: "nhn-initial",
      siteId: "nhn-careers",
      split: "final",
      profileId: "p",
      calls: [],
      sections: [],
      review: {},
    },
  ],
};

// 서버가 기록 삭제를 허용하는지. 개발서버처럼 함께 쓰는 서버는 꺼져 있다.
const capabilities = { recordDelete: false };

// 항목별 비교의 칸 하나. 반복 2회에서 한 번은 맞게 넣고 한 번은 놓쳤다.
const fieldItem = {
  caseId: "c",
  stage: "MAPPING",
  kind: "GENERIC_FIELDS",
  itemId: "field-1",
  state: "initial",
  label: "학교명",
  group: "학력",
  control: "text",
  expected: "education.university.schoolName",
  answers: [
    { repetition: 1, value: "x", confidence: 0.9, outcome: "FILLED_CORRECT" },
    { repetition: 2, value: null, confidence: null, outcome: "MISSED" },
  ],
};

// 같은 비교에 모델을 더할 때 쓰는 실행 목록.
const extraRuns: { run: typeof run; report: typeof report }[] = [];

function respond(url: string) {
  const body = url.includes("/capabilities")
    ? capabilities
    : url.includes("/runs?")
      ? [...extraRuns, { run, report }, { run: baseRun, report: baseReport }]
      : url.includes("/datasets/")
        ? dataset
        : url.includes("/items")
          ? [fieldItem]
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
const openCompare = async () => {
  (
    document.querySelector('[data-page="compare"]') as HTMLButtonElement
  ).click();
  await Promise.resolve();
};
// 전후 비교 표에서 지표 행의 첫 모델 변화 칸(글자:클래스).
const changeOf = (label: string) => {
  const row = [...document.querySelectorAll("#cf-compare tbody tr")].find(
    (tr) => tr.querySelector("th")?.textContent === label,
  );
  const delta = row?.querySelector(".delta");
  return delta && `${delta.textContent}:${delta.className}`;
};
const pick = async (stageName: string) => {
  (
    document.querySelector(
      `#cf-overview-stage [data-stage=${stageName}]`,
    ) as HTMLButtonElement
  ).click();
  await Promise.resolve();
};

beforeAll(async () => {
  // jsdom에는 대화상자 열기·닫기가 없어 open 속성만 바꾼다.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
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

  it("준비 결과와 섹션 분류 결과는 칸별 결과처럼 판정별로 나뉜 막대다", async () => {
    const card = (title: string) =>
      [...document.querySelectorAll("#cf-quality .metric")].find(
        (metric) => metric.querySelector("h3")?.textContent === title,
      )!;
    await pick("prepare");
    const prepare = card("준비 결과");
    expect(prepare.querySelector(".bar-row")).toBeNull();
    expect(prepare.querySelectorAll(".item-track > span")).toHaveLength(4);
    expect(prepare.textContent).toContain("맞힌 비율");
    expect(prepare.textContent).toContain("버튼·선택 결정");
    await pick("mapping");
    const mapping = card("섹션 분류 결과");
    expect(mapping.querySelector(".bar-row")).toBeNull();
    expect(mapping.querySelectorAll(".item-track > span")).toHaveLength(4);
  });

  it("점수 카드는 점수만 크게 보이고 설명은 아래에 적지 않고 제목에 커서를 올리면 보인다", async () => {
    await pick("total");
    const card = document.querySelector("#cf-quality .metric")!;
    expect(card.querySelector(".metric-foot")).toBeNull();
    expect(card.querySelector("h3")?.getAttribute("data-help")).toContain(
      "2배",
    );
  });

  it("휴지통은 서버가 기록 삭제를 허용할 때만 보인다", async () => {
    const button = () =>
      document.querySelector("#record-delete") as HTMLButtonElement;
    expect(button().hidden).toBe(true);
    capabilities.recordDelete = true;
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(button().hidden).toBe(false);
    capabilities.recordDelete = false;
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(button().hidden).toBe(true);
  });

  it("자동기입 흐름 창은 네 참여자를 그리고 창 안의 단계 탭에 맞춰 다른 단계 줄을 흐린다", async () => {
    await pick("total");
    expect(document.querySelector("#cf-flow")).toBeNull();
    (
      document.querySelector(
        '[data-source="자동기입 흐름"]',
      ) as HTMLAnchorElement
    ).click();
    await Promise.resolve();
    // 흐름도는 탭을 누를 때마다 새로 그리므로 매번 다시 찾는다.
    const flow = () => document.querySelector("#source-content svg")!;
    expect(
      [...flow().querySelectorAll(".flow-actor")].map(
        (actor) => actor.textContent,
      ),
    ).toEqual(["지원자", "확장프로그램", "서버", "AI 모델"]);
    const dimmed = () =>
      new Set(
        [...flow().querySelectorAll(".flow-row.dim")].map((row) =>
          row.getAttribute("data-flow-stage"),
        ),
      );
    const tab = (key: string) =>
      (
        document.querySelector(
          `#source-content [data-flow="${key}"]`,
        ) as HTMLButtonElement
      ).click();
    expect(dimmed()).toEqual(new Set());
    tab("prepare");
    expect(dimmed()).toEqual(new Set(["START", "MAPPING", "END"]));
    tab("mapping");
    expect(dimmed()).toEqual(new Set(["START", "PREPARATION", "END"]));
    (document.querySelector("#cf-source") as HTMLDialogElement).close();
  });

  it("항목별 비교는 체크한 모델만 보이고, 모델이 하나면 모델끼리 다른 항목 필터를 뺀다", async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
    const refresh = async () => {
      (document.querySelector("#refresh") as HTMLButtonElement).click();
      await wait();
    };
    const boxes = () => [
      ...document.querySelectorAll<HTMLInputElement>(
        '#cf-fields .fields-model input[type="checkbox"]',
      ),
    ];
    const toggle = async (index: number) => {
      boxes()[index].click();
      await wait();
    };
    const columns = () =>
      [...document.querySelectorAll("#cf-fields thead .model-col")].map(
        (column) => column.textContent,
      );
    const listed = () =>
      [...document.querySelectorAll("#cf-fields .fields-model")].map(
        (row) =>
          `${row.querySelector("label")?.textContent}:${row.classList.contains("off")}`,
      );
    const chips = () =>
      [...document.querySelectorAll("#cf-fields .fields-chips button")]
        .map((chip) => chip.textContent)
        .join();
    const original = run.comparisonId;
    (run as { comparisonId: string | null }).comparisonId = "both";
    extraRuns.push({
      run: {
        ...run,
        id: "run-2",
        versions: { ...run.versions, provider: "openai", model: "gpt" },
      },
      report,
    });
    await refresh();
    (
      document.querySelector('[data-page="fields"]') as HTMLButtonElement
    ).click();
    await wait();
    expect(
      document.querySelector('#cf-fields select[aria-label="모델"]'),
    ).toBeNull();
    expect(boxes().map((box) => box.checked)).toEqual([true, true]);
    expect(columns()).toEqual(["jev/jev-latest", "openai/gpt"]);
    expect(chips()).toContain("모델끼리 다른");
    // 모델 목록 상자 안에 체크박스와 판정 막대·수가 함께 있고, 따로 떠 있는 체크박스는 없다.
    expect(
      document.querySelector("#cf-fields .fields-controls input"),
    ).toBeNull();
    const row = document.querySelector(
      "#cf-fields .fields-summary .fields-model",
    )!;
    expect(row.querySelectorAll(".item-track > span")).toHaveLength(4);
    expect(row.textContent).toContain("1 맞게 넣음");
    expect(row.textContent).toContain("1 놓침");

    await toggle(0);
    expect(boxes().map((box) => box.checked)).toEqual([false, true]);
    // 체크를 푼 모델도 다시 켤 수 있게 목록에 흐리게 남고, 표에서만 빠진다.
    expect(listed()).toEqual(["jev/jev-latest:true", "openai/gpt:false"]);
    expect(columns()).toEqual(["openai/gpt"]);
    expect(chips()).not.toContain("모델끼리 다른");
    // 이 탭의 체크는 위쪽 모델 체크와 품질·성능 화면에 영향을 주지 않는다.
    expect(
      [...document.querySelectorAll<HTMLInputElement>("#models input")].map(
        (box) => box.checked,
      ),
    ).toEqual([true, true]);

    await toggle(1);
    expect(boxes()).toHaveLength(2);
    expect(columns()).toEqual([]);
    expect(document.querySelector("#cf-fields")?.textContent).toContain(
      "볼 모델을 체크",
    );

    await toggle(0);
    await toggle(1);
    expect(columns()).toEqual(["jev/jev-latest", "openai/gpt"]);
    extraRuns.length = 0;
    (run as { comparisonId: string | null }).comparisonId = original;
    (
      document.querySelector('[data-page="overview"]') as HTMLButtonElement
    ).click();
    await refresh();
  });

  it("항목별 비교의 화면 선택은 공고별로 묶이고 공고 전체를 고를 수 있다", async () => {
    (
      document.querySelector('[data-page="fields"]') as HTMLButtonElement
    ).click();
    await Promise.resolve();
    const select = document.querySelector(
      '#cf-fields select[aria-label="화면"]',
    ) as HTMLSelectElement;
    expect(
      [...select.querySelectorAll("optgroup")].map((group) => [
        group.label,
        [...group.querySelectorAll("option")].map(
          (option) => option.textContent,
        ),
      ]),
    ).toEqual([
      ["우아한형제들 · R2605009", ["공고 전체", "처음 화면", "고등학교"]],
      ["NHN Careers · 프리세일즈", ["공고 전체", "NHN 지원서"]],
    ]);
    expect(select.options[0].textContent).toBe("모든 공고");
    (
      document.querySelector('[data-page="overview"]') as HTMLButtonElement
    ).click();
  });

  it("데이터셋 창은 공고별 탭으로 나뉘고 탭을 고르면 그 공고의 화면만 보인다", async () => {
    (
      document.querySelector('[data-source="데이터셋"]') as HTMLAnchorElement
    ).click();
    await Promise.resolve();
    const postings = () => [
      ...document.querySelectorAll("#source-content .posting-tabs button"),
    ];
    const screens = () =>
      [
        ...document.querySelectorAll(
          "#source-content .screen-list button:not(.profile-entry) strong",
        ),
      ].map((name) => name.textContent);
    expect(postings().map((tab) => tab.textContent)).toEqual([
      "우아한형제들 · R2605009화면 2개",
      "NHN Careers · 프리세일즈화면 1개",
    ]);
    expect(screens()).toEqual(["처음 화면", "고등학교"]);
    (postings()[1] as HTMLButtonElement).click();
    expect(postings()[1].getAttribute("aria-pressed")).toBe("true");
    expect(screens()).toEqual(["NHN 지원서"]);
    (document.querySelector("#cf-source") as HTMLDialogElement).close();
  });

  it("사용 가이드는 로컬·개발서버 탭으로 나뉘고 지금 서버에 맞는 탭이 먼저 열린다", async () => {
    (document.querySelector("#guide-open") as HTMLButtonElement).click();
    await Promise.resolve();
    const tabs = [
      ...document.querySelectorAll("#source-content .guide-tabs button"),
    ];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["로컬", "개발서버"]);
    // 테스트 환경 주소는 localhost라 로컬 탭이 먼저 열린다.
    expect(tabs.map((tab) => tab.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
    ]);
    expect(document.querySelector("#source-content")?.textContent).toContain(
      "scripts/evaluation_local.py",
    );
    (tabs[1] as HTMLButtonElement).click();
    expect(document.querySelector("#source-content")?.textContent).toContain(
      "prompt-391fbd8",
    );
    (document.querySelector("#cf-source") as HTMLDialogElement).close();
  });

  it("메인 화면은 실행 하나만 보이고 이전 실행과의 변화는 붙이지 않는다", async () => {
    await pick("total");
    expect(document.querySelector("#baseline")).toBeNull();
    expect(document.querySelectorAll("#cf-overview .delta")).toHaveLength(0);
  });

  it("전후 비교 탭은 이전·이후 실행을 같은 모델끼리 지표마다 비교하고 좋음·나쁨 색을 붙인다", async () => {
    await openCompare();
    expect(
      (document.querySelector("#compare-before") as HTMLSelectElement).value,
    ).toBe("run-0");
    expect(changeOf("자동기입 점수")).toBe("+5.0%p:delta good");
    expect(changeOf("자동기입 시간")).toBe("−0.50초:delta good");
  });

  it("반복별 범위가 겹치는 점수 변화는 좋음·나쁨 대신 구분 불가로 보인다", async () => {
    await openCompare();
    expect(changeOf("매핑 점수")).toBe("+2.0%p 구분 불가:delta unclear");
  });

  it("이전 실행이 반복 1회면 점수·시간 변화를 모두 구분 불가로 보인다", async () => {
    baseRun.repetitions = 1;
    baseReport.repetitions = baseReport.repetitions.slice(0, 1);
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await openCompare();
    expect(changeOf("자동기입 점수")).toBe("+5.0%p 구분 불가:delta unclear");
    expect(changeOf("자동기입 시간")).toBe("−0.50초 구분 불가:delta unclear");
  });
});
