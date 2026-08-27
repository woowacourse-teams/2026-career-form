import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const deckPath = fileURLToPath(new URL("./deck.js", import.meta.url));
const reportPath = fileURLToPath(
  new URL("./experiment-report.js", import.meta.url),
);
const indexPath = fileURLToPath(new URL("./index.html", import.meta.url));
const stylesPath = fileURLToPath(new URL("./styles.css", import.meta.url));

function loadDeck() {
  assert.ok(existsSync(deckPath), "발표 자료 모듈이 존재해야 한다");
  return require(deckPath);
}

function loadExperimentReport() {
  assert.ok(existsSync(reportPath), "비식별 실험 집계 모듈이 존재해야 한다");
  return require(reportPath);
}

test("비식별 실험 원자료에서 발표 수치를 재현한다", () => {
  const { experimentSummary, sessions } = loadExperimentReport();

  assert.equal(experimentSummary.sessionCount, 10);
  assert.equal(experimentSummary.fieldCount, 108);
  assert.deepEqual(experimentSummary.averageSeconds, {
    A: 135.2,
    B: 47.4,
    C: 70.2,
    D: 20.1,
  });
  assert.equal(experimentSummary.reductionFromA.D, 85.1);
  assert.equal(experimentSummary.averageProfileTabSeconds, 18.8);
  assert.deepEqual(experimentSummary.accurateFields, {
    B: 101,
    C: 100,
    D: 106,
  });

  const ids = sessions.map((session) => session.id);
  assert.equal(new Set(ids).size, 10);
  assert.ok(ids.every((id) => /^S\d{2}$/.test(id)));
});

test("실험 집계는 잘못된 세션 원자료를 거부한다", () => {
  const { summarizeExperiment } = loadExperimentReport();
  const valid = {
    id: "S01",
    fieldCount: 1,
    A: { seconds: 10, omissions: 0, mismatches: 0 },
    B: { seconds: 5, omissions: 0, mismatches: 0 },
    C: { seconds: 6, profileTabSeconds: 1, omissions: 0, mismatches: 0 },
    D: { seconds: 2, omissions: 0, mismatches: 0 },
  };

  assert.throws(() => summarizeExperiment([]), /세션이 필요합니다/);
  assert.throws(
    () => summarizeExperiment([valid, { ...valid }]),
    /세션 ID가 중복됐습니다/,
  );
  assert.throws(
    () => summarizeExperiment([{ ...valid, fieldCount: 0 }]),
    /필드 수는 양수여야 합니다/,
  );
  assert.throws(
    () =>
      summarizeExperiment([
        { ...valid, D: { ...valid.D, omissions: -1 } },
      ]),
    /측정값은 음수일 수 없습니다/,
  );
});

test("네 발표자 구간이 제품, 클라이언트, 백엔드, 팀 순서로 이어진다", () => {
  const { slides } = loadDeck();
  const sections = slides
    .map((slide) => slide.section)
    .filter((section, index, values) => section !== values[index - 1]);

  assert.deepEqual(sections, ["product", "client", "backend", "team"]);
});

test("전체 발표는 20분 안이며 각 발표자는 약 5분을 담당한다", () => {
  const { slides } = loadDeck();
  const grouped = slides.reduce((sections, slide) => ({
    ...sections,
    [slide.section]: [...(sections[slide.section] ?? []), slide],
  }), {});
  const secondsBySection = Object.fromEntries(
    Object.entries(grouped).map(([section, items]) => [
      section,
      items.reduce((sum, slide) => sum + slide.notes.seconds, 0),
    ]),
  );
  const totalSeconds = Object.values(secondsBySection).reduce(
    (sum, seconds) => sum + seconds,
    0,
  );

  assert.deepEqual(Object.keys(secondsBySection), [
    "product",
    "client",
    "backend",
    "team",
  ]);
  assert.ok(
    Object.values(secondsBySection).every(
      (seconds) => seconds >= 240 && seconds <= 330,
    ),
  );
  assert.ok(totalSeconds <= 1200);
});

test("모든 슬라이드는 발표자 노트와 하나 이상의 근거를 제공한다", () => {
  const { slides } = loadDeck();

  assert.equal(slides.length, 20);
  for (const slide of slides) {
    assert.match(slide.notes.speaker, /발표자$/);
    assert.ok(slide.notes.seconds > 0);
    assert.ok(slide.notes.text.length > 0);
    assert.ok(slide.notes.sources.length > 0);
  }
});

test("책임 범위와 협업 방식은 문구와 분리된 주제로 추적된다", () => {
  const { slides } = loadDeck();
  const topics = new Set(slides.flatMap((slide) => slide.topics ?? []));

  for (const topic of [
    "product-problem",
    "client-executes",
    "backend-validates",
    "llm-classifies",
    "human-approval",
    "agent-experience",
  ]) {
    assert.ok(topics.has(topic), `${topic} 주제가 필요하다`);
  }
});

test("제목 다음 서비스 소개에서 사용자 흐름을 설명하고 실험 한계를 추적한다", () => {
  const { slides } = loadDeck();
  const opening = slides[0];
  const introduction = slides[1];
  const productRoadmap = slides.find(
    (slide) => slide.storyRole === "product-roadmap",
  );

  assert.equal(opening.storyRole, "project-title");
  assert.equal(opening.productFlow, undefined);
  assert.equal(introduction.storyRole, "service-introduction");
  assert.deepEqual(introduction.productFlow, [
    "profile-register",
    "sidepanel-review",
    "approved-fill",
  ]);
  assert.deepEqual(new Set(productRoadmap.limitations), new Set([
    "fixed-order",
    "small-sample",
    "field-count-variation",
    "controlled-screen",
  ]));
});

test("질문 전용 화면 대신 현재 상태에서 이어지는 로드맵을 제공한다", () => {
  const { slides } = loadDeck();

  assert.equal(
    slides.some((slide) => slide.evidenceType === "open-question"),
    false,
  );
  for (const section of ["product", "client", "backend"]) {
    const roadmap = slides.find(
      (slide) => slide.section === section && slide.evidenceType === "roadmap",
    );
    assert.ok(roadmap, `${section} 파트에 개선 로드맵이 필요하다`);
    assert.ok(roadmap.roadmapSteps.length >= 3);
  }

  assert.ok(
    slides
      .filter((slide) => slide.storyRole !== "project-title")
      .every((slide) => slide.implementationState?.length > 0),
    "제목을 제외한 슬라이드는 구현 상태를 구분해야 한다",
  );
});

test("20장 서사가 서비스 소개부터 자동 기입과 이해 정렬까지 이어진다", () => {
  const { slides } = loadDeck();

  assert.deepEqual(slides.map((slide) => slide.storyRole), [
    "project-title",
    "service-introduction",
    "experiment-artifact",
    "experiment-speed",
    "experiment-accuracy",
    "product-roadmap",
    "client-decision",
    "client-current-ui",
    "responsibility-boundary",
    "autofill-flow",
    "client-roadmap",
    "backend-decision",
    "backend-artifact",
    "backend-current-state",
    "backend-roadmap",
    "team-decision",
    "team-artifact",
    "team-current-state",
    "knowledge-alignment",
    "closing",
  ]);
});

test("실험 방식, 실행 책임과 사용자 통제가 구조로 구분된다", () => {
  const { slides } = loadDeck();
  const experiment = slides.find(
    (slide) => slide.storyRole === "experiment-speed",
  );
  const boundary = slides.find(
    (slide) => slide.storyRole === "responsibility-boundary",
  );
  const autofill = slides.find(
    (slide) => slide.storyRole === "autofill-flow",
  );
  const backendContract = slides.find(
    (slide) => slide.storyRole === "backend-current-state",
  );

  assert.deepEqual(experiment.comparisonMethods.map(({ id }) => id), [
    "A", "B", "C", "D",
  ]);
  assert.ok(experiment.comparisonMethods.every(({ label }) => label.length > 6));
  assert.deepEqual(Object.keys(boundary.responsibilityBoundary), [
    "browser",
    "backend",
  ]);
  assert.deepEqual(autofill.autofillFlow, [
    "collect-minimum-context",
    "analyze-field-meaning",
    "connect-local-values",
    "review-and-approve",
    "fill-and-verify",
  ]);
  assert.deepEqual(autofill.userActions, [
    "review",
    "select",
    "approve",
    "verify-result",
  ]);
  assert.equal(backendContract.providerContract, "omission-to-no-match");
});

test("LLM Wiki가 결정 근거를 전달해 팀의 이해를 맞추는 흐름을 제공한다", () => {
  const { slides } = loadDeck();
  const alignment = slides.find(
    (slide) => slide.storyRole === "knowledge-alignment",
  );
  const closing = slides.at(-1);

  assert.deepEqual(alignment.knowledgeFlow, [
    "human-decision",
    "approved-knowledge",
    "agent-context",
    "team-alignment",
  ]);
  assert.equal(closing.storyRole, "closing");
  assert.ok(closing.closingMessage.length > 0);
});

test("덱에서 사용하는 실제 자료 캡처는 유효한 PNG다", () => {
  const { slides } = loadDeck();
  const assetNames = slides.flatMap((slide) =>
    [...slide.body.matchAll(/\.\/assets\/([^"']+\.png)/g)].map(
      (match) => match[1],
    ),
  );

  assert.deepEqual(new Set(assetNames), new Set([
    "experiment-screen.png",
    "project-board.png",
    "extension-screen.png",
  ]));
  for (const assetName of assetNames) {
    const assetPath = fileURLToPath(
      new URL(`./assets/${assetName}`, import.meta.url),
    );
    const signature = readFileSync(assetPath).subarray(0, 8);
    assert.deepEqual(
      signature,
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }
});

test("슬라이드 이동은 덱 범위를 벗어나지 않는다", () => {
  const { clampSlideIndex } = loadDeck();

  assert.equal(clampSlideIndex(-1, 20), 0);
  assert.equal(clampSlideIndex(0, 20), 0);
  assert.equal(clampSlideIndex(10, 20), 10);
  assert.equal(clampSlideIndex(20, 20), 19);
});

test("발표 캔버스와 제어 요소가 브라우저 계약에 포함된다", () => {
  const index = readFileSync(indexPath, "utf8");
  const styles = readFileSync(stylesPath, "utf8");

  for (const action of ["prev", "next", "notes", "fullscreen"]) {
    assert.match(index, new RegExp(`data-action=["']${action}["']`));
  }
  assert.match(styles, /--w:\s*1920px;/);
  assert.match(styles, /--h:\s*1080px;/);
});
