import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const deckPath = fileURLToPath(new URL("./deck.js", import.meta.url));
const indexPath = fileURLToPath(new URL("./index.html", import.meta.url));
const stylesPath = fileURLToPath(new URL("./styles.css", import.meta.url));

function loadDeck() {
  assert.ok(existsSync(deckPath), "발표 자료 모듈이 존재해야 한다");
  return require(deckPath);
}

test("네 발표자 구간이 정해진 순서로 이어진다", () => {
  const { slides } = loadDeck();
  const sections = slides
    .map((slide) => slide.section)
    .filter((section, index, values) => section !== values[index - 1]);

  assert.deepEqual(sections, ["product", "backend", "client", "team"]);
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
    "backend",
    "client",
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

  assert.equal(slides.length, 17);
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

test("슬라이드 이동은 덱 범위를 벗어나지 않는다", () => {
  const { clampSlideIndex } = loadDeck();

  assert.equal(clampSlideIndex(-1, 17), 0);
  assert.equal(clampSlideIndex(0, 17), 0);
  assert.equal(clampSlideIndex(8, 17), 8);
  assert.equal(clampSlideIndex(17, 17), 16);
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
