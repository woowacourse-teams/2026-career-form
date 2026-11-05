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
  tokenLimitAttempts: 0,
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
  confidence: [
    { threshold: 0.5, counts: { filledCorrect: 90, filledWrongKey: 30, filledUnneeded: 8 }, precision: 0.7, fillRate: 0.9, score: 0.73 },
    { threshold: 0.8, counts: { filledCorrect: 60, filledWrongKey: 6, filledUnneeded: 1 }, precision: 0.9, fillRate: 0.6, score: 0.82 },
    { threshold: 0.9, counts: { filledCorrect: 30, filledWrongKey: 0, filledUnneeded: 0 }, precision: 1, fillRate: 0.3, score: 0.68 },
  ],
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

// 대상 이름이 없는 행 추가 결정. 내부 ID(structure) 대신 역할 이름이 보여야 한다.
const decisionItem = {
  caseId: "n",
  stage: "PREPARATION",
  kind: "INTERACTION_DECISION",
  itemId: "structure",
  state: "nhn-initial",
  label: null,
  group: "REPEAT_ADD",
  control: null,
  expected: "+",
  answers: [
    { repetition: 1, value: "+", confidence: null, outcome: "CORRECT" },
  ],
};

// 데이터셋 목록 파일(catalog.json). 공고·화면 이름과 현재 버전은 화면 코드가 아니라 여기서 온다.
const catalog = {
  currentVersion: 4,
  sites: {
    "woowahan-recruitment": { name: "우아한형제들 · R2605009" },
    "nhn-careers": { name: "NHN Careers · 프리세일즈" },
  },
  states: {
    initial: { name: "처음 화면", note: "처음 연 상태." },
    "high-school": { name: "고등학교", note: "고등학교를 고른 상태." },
    "nhn-initial": { name: "NHN 지원서", note: "NHN 처음 화면." },
  },
};

// 이전 데이터셋 버전. 화면 하나, 공고 하나다.
const datasetV3 = { ...dataset, cases: dataset.cases.slice(0, 1) };

// 같은 비교에 모델을 더할 때 쓰는 실행 목록.
const extraRuns: { run: typeof run; report: typeof report }[] = [];

function respond(url: string) {
  const body = url.includes("/capabilities")
    ? capabilities
    : url.includes("/runs?")
      ? [...extraRuns, { run, report }, { run: baseRun, report: baseReport }]
      : url.endsWith("/catalog")
        ? catalog
        : url.includes("/datasets/")
          ? url.includes("/v3")
            ? datasetV3
            : dataset
          : url.includes("/items")
            ? [fieldItem, decisionItem]
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
      "자동기입 실패율", "입력 토큰 초과",
    ]);
  });

  it("준비는 준비 점수와 준비 결과, 요청·AI 질문 단위 성능만 보인다", async () => {
    await pick("prepare");
    expect(titles("#cf-quality")).toEqual(["준비 점수", "준비 결과"]);
    expect(headline()).toBe("70.0%");
    expect(titles("#cf-performance")).toEqual([
      "AI 응답 시간",
      "요청 처리 시간",
      "요청 실패율", "입력 토큰 초과",
    ]);
  });

  it("매핑은 매핑 점수와 칸별 결과·섹션 분류 결과, 요청·AI 질문 단위 성능만 보인다", async () => {
    await pick("mapping");
    expect(titles("#cf-quality")).toEqual([
      "매핑 점수",
      "칸별 결과",
      "확신도 기준별 칸 매핑",
      "섹션 분류 결과",
    ]);
    expect(headline()).toBe("90.0%");
    expect(titles("#cf-performance")).toEqual([
      "AI 응답 시간",
      "요청 처리 시간",
      "요청 실패율", "입력 토큰 초과",
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

  it("이전 데이터셋 버전의 실행을 고르면 화면 수·공고 수·화면 선택이 그 버전 기준이다", async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
    const pickRun = async (id: string) => {
      const select = document.querySelector("#comparison") as HTMLSelectElement;
      select.value = id;
      select.dispatchEvent(new Event("change"));
      await wait();
    };
    const chip = () =>
      document.querySelector(".condition-chip")?.getAttribute("data-help-rows");
    const sites = () => document.querySelector("#site-count")?.textContent;
    extraRuns.push({
      run: {
        ...run,
        id: "run-v3",
        versions: { ...run.versions, datasetVersion: 3, promptVersion: "old" },
      },
      report,
    });
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await wait();
    await pickRun("run-v3");
    expect(chip()).toContain("v3 · 화면 1개");
    expect(sites()).toBe("사이트 1개");
    (
      document.querySelector('[data-page="fields"]') as HTMLButtonElement
    ).click();
    await wait();
    const options = () =>
      [
        ...document.querySelectorAll(
          '#cf-fields select[aria-label="화면"] optgroup',
        ),
      ].map((group) => (group as HTMLOptGroupElement).label);
    expect(options()).toEqual(["우아한형제들 · R2605009"]);
    await pickRun("run-1");
    expect(chip()).toContain("v4 · 화면 3개");
    expect(sites()).toBe("사이트 2개");
    expect(options()).toHaveLength(2);
    (
      document.querySelector('[data-page="overview"]') as HTMLButtonElement
    ).click();
    extraRuns.length = 0;
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await wait();
  });

  it("항목별 비교에서 대상 이름이 없는 결정은 내부 ID 대신 역할 이름을 보인다", async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
    (
      document.querySelector('[data-page="fields"]') as HTMLButtonElement
    ).click();
    await wait();
    const button = (name: string) =>
      [
        ...document.querySelectorAll<HTMLButtonElement>("#cf-fields button"),
      ].find((item) => item.textContent === name)!;
    button("버튼·선택 결정").click();
    await wait();
    button("전체").click();
    await wait();
    const text = document.querySelector("#cf-fields .fields-row")?.textContent;
    expect(text).toContain("행 추가");
    expect(text).not.toContain("structure");
    button("칸 매핑").click();
    (
      document.querySelector('[data-page="overview"]') as HTMLButtonElement
    ).click();
  });

  it("공고·화면 이름은 목록 파일에서 오고, 이름을 바꾸면 코드 수정 없이 모든 곳에 반영된다", async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
    const before = catalog.sites["nhn-careers"].name;
    catalog.sites["nhn-careers"].name = "새 회사 · 새 공고";
    catalog.states["nhn-initial"].name = "새 화면";
    catalog.states["nhn-initial"].note = "새 설명.";
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await wait();
    (
      document.querySelector('[data-source="데이터셋"]') as HTMLAnchorElement
    ).click();
    await wait();
    const tabs = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "#source-content .posting-tabs button",
      ),
    ];
    expect(tabs[1].textContent).toContain("새 회사 · 새 공고");
    tabs[1].click();
    await wait();
    const content = document.querySelector("#source-content")?.textContent;
    expect(content).toContain("새 화면");
    expect(content).toContain("새 설명.");
    (document.querySelector("#cf-source") as HTMLDialogElement).close();
    (
      document.querySelector('[data-page="fields"]') as HTMLButtonElement
    ).click();
    await wait();
    expect(
      [
        ...document.querySelectorAll(
          '#cf-fields select[aria-label="화면"] optgroup',
        ),
      ].map((group) => (group as HTMLOptGroupElement).label),
    ).toContain("새 회사 · 새 공고");
    (
      document.querySelector('[data-page="overview"]') as HTMLButtonElement
    ).click();
    catalog.sites["nhn-careers"].name = before;
    catalog.states["nhn-initial"].name = "NHN 지원서";
    catalog.states["nhn-initial"].note = "NHN 처음 화면.";
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await wait();
  });

  it("평가 등록과 전후 비교는 목록 파일의 현재 버전을 쓴다", async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
    catalog.currentVersion = 3;
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await wait();
    (
      document.querySelector('[data-page="compare"]') as HTMLButtonElement
    ).click();
    await wait();
    // 실행은 모두 v4라 현재 버전이 v3이면 비교할 실행이 없다.
    expect(document.querySelectorAll("#compare-before option")).toHaveLength(0);
    (
      document.querySelector('[data-page="overview"]') as HTMLButtonElement
    ).click();
    catalog.currentVersion = 4;
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await wait();
  });

  it("흐름도의 공고별 요청 수는 데이터셋에서 계산한다", async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
    const [initial, branch, nhn] = dataset.cases as {
      calls: unknown[];
    }[];
    const call = (stage: string) => ({
      order: 1,
      stage,
      kind: "SECTION_CLASSIFY",
      items: 1,
      estimatedModelCalls: 1,
    });
    initial.calls = [call("PREPARATION"), call("PREPARATION")];
    branch.calls = [call("PREPARATION"), call("MAPPING"), call("MAPPING")];
    nhn.calls = [call("PREPARATION"), call("MAPPING")];
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await wait();
    (
      document.querySelector(
        '[data-source="자동기입 흐름"]',
      ) as HTMLAnchorElement
    ).click();
    await wait();
    const text = document.querySelector("#source-content")?.textContent;
    expect(text).toContain("우아한형제들 · R2605009 5개");
    expect(text).toContain("NHN Careers · 프리세일즈 2개");
    (document.querySelector("#cf-source") as HTMLDialogElement).close();
    initial.calls = [];
    branch.calls = [];
    nhn.calls = [];
    (document.querySelector("#refresh") as HTMLButtonElement).click();
    await wait();
  });

  it("흐름도 설명은 공고마다 다른 요청 수를 적지 않는다", async () => {
    (
      document.querySelector(
        '[data-source="자동기입 흐름"]',
      ) as HTMLAnchorElement
    ).click();
    await Promise.resolve();
    const text = document.querySelector("#source-content")?.textContent;
    expect(text).not.toContain("요청 4개");
    expect(text).toContain("서버 요청 처리 시간의 합");
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
        '#cf-fields .fields-summary input[type="checkbox"]',
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
    // 상자에는 체크박스만 있어 모델이 늘어도 세로로 쌓이지 않고, 판정은 표의 모델 칸 머리에 막대로 있고 수는 커서를 올리면 보인다.
    const box = document.querySelector("#cf-fields .fields-summary")!;
    expect(box.querySelector(".item-track")).toBeNull();
    expect(box.querySelector(".count-line")).toBeNull();
    const head = document.querySelector("#cf-fields thead .model-col")!;
    expect(head.querySelectorAll(".item-track > span")).toHaveLength(4);
    expect(head.getAttribute("data-help")).toContain("맞게 넣음 1");
    expect(head.getAttribute("data-help")).toContain("놓침 1");

    await toggle(0);
    expect(boxes().map((box) => box.checked)).toEqual([false, true]);
    // 체크를 푼 모델도 상자에 남아 다시 켤 수 있고, 표에서만 빠진다.
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

  it("모델을 바꾼 전후도 같은 공급자끼리 비교하고 모델 변경을 달라진 조건에 보인다", async () => {
    const model = baseRun.versions.model;
    baseRun.versions.model = "older-model";
    try {
      (document.querySelector("#refresh") as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await openCompare();
      expect(changeOf("자동기입 점수")).toContain("+5.0%p");
      const page = document.querySelector("#cf-compare")?.textContent;
      expect(page).toContain(`older-model → ${model}`);
      expect(page).toContain(`모델 older-model → ${model}`);
    } finally {
      baseRun.versions.model = model;
    }
  });

  it("매핑 탭의 확신도 카드는 결론을 문장으로 말하고 기준별 칸 수 증감을 현재 기준과 비교해 보인다", async () => {
    await pick("mapping");
    const card = document.querySelector("#cf-confidence") as Element;
    expect(card.querySelector(".confidence-verdict")?.textContent).toContain("0.8 유지가 가장 좋습니다");
    const rows = [...card.querySelectorAll(".confidence-row:not(.confidence-labels)")];
    expect(rows.map((row) => row.querySelector(".confidence-threshold")?.textContent)).toEqual(["0.5", "0.8 현재", "0.9"]);
    // 0.5는 맞은 칸 +30, 잘못 넣은 칸 +31. 0.9는 맞은 칸 −30, 잘못 넣은 칸 −7. 현재 기준은 칸 수 그대로다.
    const values = (row: Element) => [...row.querySelectorAll(".confidence-value")].map((value) => value.textContent);
    expect(values(rows[0])).toEqual(["+30", "+31"]);
    expect(values(rows[1])).toEqual(["60", "7"]);
    expect(values(rows[2])).toEqual(["−30", "−7"]);
    expect(rows[0].querySelector(".confidence-bar")).not.toBeNull();
    // 맞은 칸이 늘면 좋음, 잘못 넣은 칸이 늘면 나쁨이다.
    expect(rows[0].querySelectorAll(".up")).toHaveLength(1);
    expect(rows[0].querySelectorAll(".down")).toHaveLength(1);
    expect(card.querySelector("details summary")?.textContent).toBe("표로 보기");
  });

  it("매핑 탭의 확신도 표는 기준별 값을 모델마다 보이고 현재 기준과 모델별 최고 점수를 표시한다", async () => {
    await pick("mapping");
    const table = document.querySelector("#cf-confidence table");
    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])];
    expect(rows.map((row) => row.querySelector("th")?.textContent)).toEqual([
      "0.5",
      "0.8 현재",
      "0.9",
    ]);
    expect(rows[1].textContent).toContain("82.0%");
    expect(rows[1].querySelector(".best")?.textContent).toBe("82.0%");
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
