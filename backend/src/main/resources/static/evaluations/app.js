// AI 평가 화면. 평가 실행 API의 결과만 표시한다. 예시 데이터나 추정값을 만들지 않으며 미관측 값은 "—"로 둔다.
import { accessHeaders, clearAccess } from "/quality/access.js";
import { estimateCost, formatUsd, validRate } from "/evaluations/pricing.js";

// 평가는 항상 현재 데이터셋의 모든 화면으로 한다. 전후 비교는 같은 데이터셋으로 개선 전·후 코드를 각각 돌려 비교한다.
const DATASET = { id: "generic-matching", version: 2 };
const COLORS = ["#4e6d90", "#688b7c", "#ac8d68", "#8a6f9e", "#6f8f9e"];
const PRICE_KEY = "cf-evaluation-model-prices-v1";
const root = document.getElementById("cf-eval-preview");
const $ = (selector) => root.querySelector(selector);
const state = { runs: [], dataset: null, models: [], selected: [], group: null, stage: "total", page: "overview" };
let prices = {};
try { prices = JSON.parse(localStorage.getItem(PRICE_KEY) || "{}") ?? {}; } catch { prices = {}; }

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function api(path, method = "GET", payload) {
  const response = await fetch("/api/v1/evaluations" + path, {
    method, credentials: "omit",
    headers: { ...accessHeaders(), ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (response.status === 401) { clearAccess(); location.reload(); throw new Error("로그인이 만료되었습니다."); }
  const body = (response.headers.get("Content-Type") ?? "").includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const reasons = {
      RUN_ACTIVE: `이미 진행 중인 평가가 있습니다(실행 ${body?.activeRunId ?? "미확인"}).`,
      BUDGET_EXCEEDED: "예상 모델 호출 수가 실행 한도를 넘습니다. 반복 수를 줄여 주세요.",
      UNKNOWN_DATASET: "검토를 마친 데이터셋이 아닙니다. 데이터셋의 검토 상태를 확인해 주세요.",
      INVALID_REPETITIONS: "반복 수는 1 이상 20 이하입니다.",
      INVALID_PROMPT_VERSION: "프롬프트 이름은 영문·숫자·.-_ 32자 이하입니다.",
      UNKNOWN_PROVIDER: "이 서버에 연결되지 않았거나 등록되지 않은 공급자입니다.",
      UNKNOWN_MODEL: "이 공급자가 허용하지 않은 모델입니다.",
      INVALID_TARGETS: "모델은 1~5개를 중복 없이 골라 주세요.",
      INVALID: "입력값을 확인해 주세요. 이름은 영문 소문자·숫자·-(2~32자), 모델은 1~10개, 시간 제한은 1,000~120,000ms입니다.",
      RESERVED_NAME: "jev, openai는 서버 설정 공급자 이름이라 쓸 수 없습니다.",
      UNKNOWN_KEY: "서버에 없는 키 이름입니다.",
      INVALID_URL: "기준 주소 형식이 올바르지 않습니다. 사용자 정보·질의·조각 없이 https 주소(호스트와 경로)로 넣어 주세요.",
      INSECURE_URL: "https 주소만 쓸 수 있습니다. 로컬 자체 서빙은 서버에서 allow-local을 켜고 키 없이 등록해야 합니다.",
      HOST_NOT_ALLOWED_FOR_KEY: "이 키는 고른 주소의 호스트로 보낼 수 없습니다. 키에 허용된 호스트를 확인해 주세요.",
      UNRESOLVABLE_HOST: "주소의 호스트를 찾을 수 없습니다.",
      INTERNAL_ADDRESS: "내부망·사설 주소로는 보낼 수 없습니다.",
    };
    throw new Error(reasons[body?.code] ?? (response.status === 404 ? "평가 기능이 꺼져 있거나 대상이 없습니다." : "지금 처리할 수 없습니다."));
  }
  return body;
}

const modelKey = (run) => `${run.versions.provider}/${run.versions.model}`;
const promptKey = (run) => run.versions.promptVersion ?? run.versions.promptDigest.slice(0, 8);
const done = (run) => ["COMPLETED", "PARTIAL"].includes(run.status);

/** 함께 비교할 실행 묶음. 비교 등록은 comparisonId로, 단독 실행은 실행 하나로 묶는다. */
const groupKey = (run) => run.comparisonId ?? run.id;
const groupRuns = (key) => state.runs.filter(({ run }) => groupKey(run) === key).reverse();
const SPLIT = { tuning: "튜닝용", final: "최종 평가용", all: "전체 화면" };
function groupLabel(key) {
  const runs = groupRuns(key).map(({ run }) => run);
  const first = runs[0];
  const at = new Date(first.requestedAt);
  const time = `${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${promptKey(first)} · ${time}`;
}

/** 고른 비교 묶음의 조건. 목록 이름은 짧게 두고 조건은 여기서 한 줄로 보인다. */
function comparisonDetail(key) {
  const runs = groupRuns(key).map(({ run }) => run);
  const first = runs[0];
  if (!first) return "";
  return `데이터 v${first.versions.datasetVersion} · ${SPLIT[first.versions.split] ?? first.versions.split} · 반복 ${first.repetitions}회 · 모델 ${runs.length}개`;
}

/** 선택한 묶음에서 그 모델의 실행. 끝난 실행만 보고를 쓴다. */
function latest(model) {
  return groupRuns(state.group).find(({ run }) => done(run) && modelKey(run) === model);
}

const percent = (value) => value == null ? null : value * 100;
const stageKey = () => ({ total: "TOTAL", prepare: "PREPARATION", mapping: "MAPPING" })[state.stage];

function bars(title, sub, values, max, format, foot) {
  const card = element("div", undefined, "metric");
  const head = element("div", undefined, "metric-head");
  head.append(element("h3", title), element("span", sub, "muted"));
  card.append(head);
  if (!state.selected.length) card.append(element("div", "비교할 모델을 선택하세요.", "empty"));
  for (const model of state.selected) {
    const value = values(model);
    const row = element("div", undefined, "bar-row");
    row.style.setProperty("--model", color(model));
    const track = element("div", undefined, "track");
    const fill = element("div", undefined, "fill");
    fill.style.width = `${value == null ? 0 : Math.max(0, Math.min(100, value / max * 100))}%`;
    track.append(fill);
    row.append(element("span", model), track, element("span", value == null ? "—" : format(value), "number"));
    card.append(row);
  }
  if (foot) card.append(element("p", foot, "muted metric-foot"));
  return card;
}

const color = (model) => COLORS[state.models.indexOf(model) % COLORS.length];
const report = (model) => latest(model)?.report;

function renderOverview() {
  const quality = $("#cf-quality");
  quality.replaceChildren(
    accuracyCard(),
    renderAutofill(),
    bars("준비 정확도", "%", (m) => percent(report(m)?.quality.preparationAccuracy), 100, (v) => `${v.toFixed(1)}%`),
    bars("필드 매핑 정확도", "%", (m) => percent(report(m)?.quality.mappingAccuracy), 100, (v) => `${v.toFixed(1)}%`),
    renderItemBreakdown());
  const total = state.stage === "total";
  const perf = (m) => report(m)?.performance[stageKey()];
  const seconds = (m) => {
    const value = total ? report(m)?.flows.time.meanMs : perf(m)?.productCall.meanMs;
    return value == null ? null : value / 1000;
  };
  const failure = (m) => percent(total ? report(m)?.flows.failureRate : perf(m)?.failureRate);
  $("#cf-performance").replaceChildren(
    bars("응답시간", "평균 · 초 ↓", seconds, Math.max(1, ...state.selected.map((m) => seconds(m) ?? 0)), (v) => `${v.toFixed(2)}초`,
      total ? "사례 하나의 준비·매핑 호출 시간 합. 서버 관측, 실제 페이지 조작 제외."
        : "제품 서비스 호출부터 반환까지. 서버 내부 배치·모델 대기 포함."),
    bars("처리량", "완료 호출/초 ↑", (m) => perf(m)?.throughputPerSecond, Math.max(0.1, ...state.selected.map((m) => perf(m)?.throughputPerSecond ?? 0)),
      (v) => `${v.toFixed(2)}/초`, "완료 호출 수 ÷ 실행 경과 시간"),
    bars("실패율", "% ↓", failure, 100, (v) => `${v.toFixed(1)}%`,
      total ? "호출이 하나라도 실패한 사례의 비율" : "타임아웃 · API 오류 · 응답 형식 오류 · 채점 불가"));
}

function renderTokens() {
  const caption = { total: "자동기입 1회 · 준비 + 매핑", prepare: "준비", mapping: "필드 매핑" }[state.stage];
  $("#cf-token-caption").textContent = `${caption} · 모델 HTTP 시도 1건당 평균. 미관측 시도는 평균에서 뺀다.`;
  const body = $("#cf-token-body");
  body.replaceChildren();
  const chart = $("#cf-token-chart");
  chart.replaceChildren();
  const heading = element("div", undefined, "token-chart-heading");
  const pricing = element("button", "모델 단가 설정", "pricing-trigger");
  pricing.type = "button";
  pricing.addEventListener("click", openPricing);
  heading.append(element("h4", "시도당 평균 토큰"), pricing);
  chart.append(heading);
  for (const model of state.selected) {
    const tokens = report(model)?.tokens[stageKey()];
    const cost = tokens?.inputMean == null ? null : estimateCost(tokens.inputMean, tokens.outputMean, prices[model]);
    const totalCost = tokens?.inputTotal == null ? null : estimateCost(tokens.inputTotal, tokens.outputTotal, prices[model]);
    const row = element("tr");
    const name = element("td", model);
    name.style.setProperty("--model", color(model));
    row.append(name, element("td", count(tokens?.inputMean)), element("td", count(tokens?.outputMean)),
      element("td", count(tokens?.inputMean == null ? null : tokens.inputMean + tokens.outputMean)),
      element("td", count(tokens?.inputTotal == null ? null : tokens.inputTotal + tokens.outputTotal)),
      element("td", tokens ? String(tokens.unobservedAttempts) : "—"),
      element("td", tokens ? formatUsd(cost) : "—", "cost-cell"), element("td", tokens ? formatUsd(totalCost) : "—", "cost-cell"));
    body.append(row);
  }
  chart.append(renderTokenBars());
}

const count = (value) => value == null ? "—" : Math.round(value).toLocaleString();

/** 눈금이 깔끔하게 끝나는 축 최댓값(1·2·2.5·5 × 10ⁿ). */
function niceMax(value) {
  if (!(value > 0)) return 1;
  const unit = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((step) => step * unit).find((step) => step >= value);
}

/**
 * 모델별 시도당 평균 토큰을 입력·출력을 이어 붙인 가로 막대로 그린다. 끝나지 않은 실행은 분석 중,
 * 끝났지만 토큰을 받지 못한 실행은 미관측으로 표시하고 값을 지어내지 않는다.
 */
function renderTokenBars() {
  const box = element("div", undefined, "token-bars");
  const legend = element("div", undefined, "token-legend");
  legend.append(element("span", "입력 토큰(모델 색)", "legend-input"), element("span", "출력 토큰", "legend-output"));
  box.append(legend);
  if (!state.selected.length) {
    box.append(element("div", "비교할 모델을 선택하세요.", "empty"));
    return box;
  }
  const rows = state.selected.map((model) => {
    const run = groupRuns(state.group).find(({ run: candidate }) => modelKey(candidate) === model)?.run;
    return { model, run, tokens: report(model)?.tokens[stageKey()] };
  });
  const totals = rows.map(({ tokens }) => tokens?.inputMean == null ? null : tokens.inputMean + tokens.outputMean);
  const max = niceMax(Math.max(0, ...totals.filter((value) => value != null)));
  const costs = rows.map(({ model, tokens }) => ({
    mean: tokens?.inputMean == null ? null : estimateCost(tokens.inputMean, tokens.outputMean, prices[model]),
    total: tokens?.inputTotal == null ? null : estimateCost(tokens.inputTotal, tokens.outputTotal, prices[model]),
  }));
  rows.forEach(({ model, run, tokens }, index) => {
    const row = element("div", undefined, "token-bar-row");
    row.style.setProperty("--model", color(model));
    const [provider, ...rest] = model.split("/");
    const name = element("div", undefined, "token-bar-name");
    name.append(element("strong", rest.join("/")), element("span", provider, "muted"));
    const track = element("div", undefined, "token-bar-track");
    const value = element("div", undefined, "token-bar-value");
    if (totals[index] != null) {
      const input = element("span", undefined, "token-input");
      input.style.width = `${tokens.inputMean / max * 100}%`;
      const output = element("span", undefined, "token-output");
      output.style.width = `${tokens.outputMean / max * 100}%`;
      track.append(input, output);
      track.setAttribute("aria-label", `${model} 입력 ${count(tokens.inputMean)}, 출력 ${count(tokens.outputMean)} 토큰`);
      value.append(element("b", `${count(totals[index])} 토큰`));
      const stats = element("dl", undefined, "token-stats");
      const stat = (label, text) => {
        const item = element("div");
        item.append(element("dt", label), element("dd", text));
        stats.append(item);
      };
      stat("입력", count(tokens.inputMean));
      stat("출력", count(tokens.outputMean));
      stat("시도당 비용", costs[index].mean == null ? "단가 미설정" : formatUsd(costs[index].mean));
      stat("실행 전체 비용", costs[index].total == null ? "단가 미설정" : formatUsd(costs[index].total));
      row.append(name, track, value, stats);
      box.append(row);
      return;
    } else if (run && ACTIVE.includes(run.status)) {
      track.classList.add("pending");
      value.append(element("b", RUN_STATUS[run.status]), element("span", `${run.processedCalls}/${run.plannedCalls} 호출`, "muted"));
    } else {
      track.classList.add("missing");
      value.append(element("b", run ? RUN_STATUS[run.status] ?? run.status : "—"), element("span", "토큰 미관측", "muted"));
    }
    row.append(name, track, value);
    box.append(row);
  });
  const observed = rows.filter((_, index) => totals[index] != null);
  if (observed.length) {
    const axis = element("div", undefined, "token-axis");
    const ticks = element("div", undefined, "token-ticks");
    for (let tick = 0; tick <= 4; tick += 1) ticks.append(element("span", count(max * tick / 4)));
    axis.append(element("span"), ticks, element("span", "토큰 / 시도", "muted"));
    box.append(axis);
  }
  // 실행 하나는 자동기입 몇 회뿐이라 금액이 작다. 자동기입 1회 비용(실행 비용 ÷ 실행 안의 자동기입 수)을
  // 1,000회 기준으로 키우고, 가장 저렴한 모델 대비 배수로 비교한다.
  const priced = rows.map((row, index) => {
    const flows = report(row.model)?.flows.count;
    const perThousand = costs[index].total == null || !flows ? null : costs[index].total / flows * 1000;
    return { ...row, flows, total: costs[index].total, perThousand };
  }).filter((_, index) => totals[index] != null);
  const known = priced.filter(({ perThousand }) => perThousand != null);
  if (known.length) {
    const cheapest = Math.min(...known.map(({ perThousand }) => perThousand));
    const highest = Math.max(...known.map(({ perThousand }) => perThousand));
    const summary = element("div", undefined, "token-cost-summary");
    const heading = element("div", undefined, "cost-heading");
    heading.append(element("h4", "예상 비용 비교"), element("span", "자동기입 1,000회당 · USD", "muted"));
    summary.append(heading);
    priced.forEach(({ model, run, flows, total, perThousand }) => {
      const line = element("div", undefined, "cost-row");
      line.style.setProperty("--model", color(model));
      const track = element("div", undefined, "cost-track");
      const fill = element("span");
      fill.style.width = `${perThousand == null || !highest ? 0 : perThousand / highest * 100}%`;
      track.append(fill);
      const amount = element("div", undefined, "cost-amount");
      if (perThousand == null) {
        amount.append(element("b", "단가 미설정"));
      } else {
        const ratio = cheapest > 0 ? perThousand / cheapest : null;
        amount.append(element("b", perThousand >= 1 ? `$${perThousand.toFixed(2)}` : formatUsd(perThousand)),
          element("span", known.length < 2 ? "비교할 모델 없음"
            : ratio != null && ratio < 1.005 ? "가장 저렴" : `가장 저렴한 모델의 ${ratio?.toFixed(1) ?? "—"}배`,
          ratio != null && ratio < 1.005 ? "cost-badge cheapest" : "cost-badge"));
      }
      line.append(element("span", model, "cost-model"), track, amount,
        element("span", total == null ? "" : `이번 실행 ${formatUsd(total)} · 자동기입 ${flows}회`, "muted cost-detail"));
      summary.append(line);
    });
    summary.append(element("p", "자동기입 1회 = 사례 하나의 준비·매핑 호출 전체. 비용 = 입력·출력 토큰 × 모델 단가 설정의 USD 단가(100만 토큰당). 서버는 비용을 계산하지 않는다.", "muted"));
    box.append(summary);
  } else if (observed.length) {
    box.append(element("p", "비용을 보려면 모델 단가 설정에서 입력·출력 단가를 넣어 주세요.", "muted"));
  }
  return box;
}

/**
 * 최종 정확도와 반복별 범위(최소~최대)를 한 카드에 보이고, 가장 높은 두 모델의 범위가 겹치면 차이 구분 불가로 알린다.
 * 자세한 설명은 정답 기준 창에 있다.
 */
function accuracyCard() {
  const card = bars("자동기입 최종 정확도", "%", (m) => percent(report(m)?.quality.accuracy), 100,
    (v) => `${v.toFixed(1)}%`);
  const ranges = state.selected.map((model) => {
    const values = (report(model)?.repetitions ?? []).map((item) => item.accuracy).filter((value) => value != null)
      .map((value) => value * 100);
    return { model, values, min: Math.min(...values), max: Math.max(...values),
      mean: values.reduce((sum, value) => sum + value, 0) / (values.length || 1) };
  });
  card.querySelectorAll(".bar-row").forEach((row, index) => {
    const range = ranges[index];
    if (!range?.values.length) return;
    row.after(element("span", range.values.length > 1
      ? `반복 ${range.values.length}회 범위 ${range.min.toFixed(1)}~${range.max.toFixed(1)}%` : "반복 1회", "range-note"));
  });
  const measured = ranges.filter(({ values }) => values.length);
  if (measured.length) {
    const [first, second] = [...measured].sort((a, b) => b.mean - a.mean);
    const verdict = measured.some(({ values }) => values.length < 2) ? "반복 1회라 흔들림을 알 수 없음"
      : !second ? `반복 사이 ${(first.max - first.min).toFixed(1)}%p 흔들림`
        : first.min <= second.max ? "차이 구분 불가 · 반복별 범위가 겹침" : `${first.model} 우세 · 반복별 범위가 겹치지 않음`;
    card.append(element("p", verdict, "variation-verdict"));
  }
  card.append(element("p", `맞힌 항목 ÷ 채점 항목 · 채점식 ${report(state.selected[0])?.scoringVersion ?? "—"}`, "muted metric-foot"));
  return card;
}

const AUTOFILL_KINDS = [
  { key: "autoCorrect", label: "자동기입 정답", className: "item-correct" },
  { key: "autoWrong", label: "자동기입 오답", className: "item-wrong" },
  { key: "review", label: "확인 필요", className: "item-missing" },
  { key: "blocked", label: "막음", className: "item-unnecessary" },
  { key: "empty", label: "비움", className: "item-empty" },
];

/**
 * 필드 매핑 답을 제품과 같은 확신도 구간(자동기입 0.8, 확인 0.5)으로 나눈 결과. 사용자 화면에 실제로 자동으로 들어갈
 * 칸이 얼마나 맞는지 보인다. 확신도를 기록하기 전 실행은 측정 불가다.
 */
function renderAutofill() {
  const card = element("div", undefined, "metric");
  const head = element("div", undefined, "metric-head");
  head.append(element("h3", "실제 자동기입 결과"), element("span", "제품 기준 · 칸 매핑", "muted"));
  card.append(head);
  const legend = element("div", undefined, "item-legend");
  AUTOFILL_KINDS.forEach(({ label, className }) => legend.append(element("span", label, className)));
  card.append(legend);
  for (const model of state.selected) {
    const counts = report(model)?.autofill;
    const row = element("div", undefined, "item-row");
    row.style.setProperty("--model", color(model));
    const track = element("div", undefined, "item-track");
    const total = counts ? AUTOFILL_KINDS.reduce((sum, { key }) => sum + counts[key], 0) : 0;
    let text = "확신도를 기록하기 전 실행이라 측정 불가";
    if (counts && total) {
      AUTOFILL_KINDS.forEach(({ key, label, className }) => {
        const part = element("span", undefined, className);
        part.style.width = `${counts[key] / total * 100}%`;
        part.title = `${label} ${counts[key]}`;
        track.append(part);
      });
      const auto = counts.autoCorrect + counts.autoWrong;
      text = `자동기입 정확도 ${auto ? (counts.autoCorrect / auto * 100).toFixed(1) + "%" : "—"} (자동 ${auto}칸 중 오답 ${counts.autoWrong})`
        + ` · 확인 필요 ${counts.review} · 막음 ${counts.blocked} · 비움 ${counts.empty}`;
    }
    row.append(element("span", model), track, element("span", text, "item-numbers"));
    card.append(row);
  }
  card.append(element("p", "확신도 0.8 이상은 자동으로 입력, 0.5~0.8은 사용자 확인, 0.5 미만은 막음(확장프로그램과 같은 기준).", "muted metric-foot"));
  return card;
}

const ITEM_KINDS = [
  { key: "correct", label: "정답", className: "item-correct" },
  { key: "wrongKey", label: "오답(다른 항목)", className: "item-wrong" },
  { key: "missing", label: "누락(판단 보류)", className: "item-missing" },
  { key: "unnecessary", label: "불필요 제안", className: "item-unnecessary" },
];

/**
 * 모델별 항목 판정 수(quality.items)를 정답·오답·누락·불필요 제안으로 나눈 100% 막대로 그린다. 정확도가 같아도
 * 다른 항목을 고른 오답(잘못 기입)과 판단 보류(직접 입력)는 위험이 달라 따로 보인다.
 */
function renderItemBreakdown() {
  const card = element("div", undefined, "metric");
  const head = element("div", undefined, "metric-head");
  head.append(element("h3", "항목 판정"), element("span", "실행 전체 · 항목 수", "muted"));
  card.append(head);
  const legend = element("div", undefined, "item-legend");
  ITEM_KINDS.forEach(({ label, className }) => legend.append(element("span", label, className)));
  card.append(legend);
  if (!state.selected.length) card.append(element("div", "비교할 모델을 선택하세요.", "empty"));
  for (const model of state.selected) {
    const items = report(model)?.quality.items;
    const scored = items ? ITEM_KINDS.reduce((sum, { key }) => sum + (items[key] ?? 0), 0) : 0;
    const row = element("div", undefined, "item-row");
    row.style.setProperty("--model", color(model));
    const track = element("div", undefined, "item-track");
    if (scored) {
      ITEM_KINDS.forEach(({ key, label, className }) => {
        const part = element("span", undefined, className);
        part.style.width = `${(items[key] ?? 0) / scored * 100}%`;
        part.title = `${label} ${items[key] ?? 0}`;
        track.append(part);
      });
    }
    const numbers = element("span", scored
      ? ITEM_KINDS.slice(1).map(({ key, label }) => `${label.split("(")[0]} ${items[key] ?? 0}`).join(" · ") + ` / ${scored}`
      : "—", "item-numbers");
    row.append(element("span", model), track, numbers);
    card.append(row);
  }
  card.append(element("p", "채점 제외(공급자 사용 불가) 항목은 빠진다. 오답은 틀린 값이 들어갈 위험, 누락은 사용자가 직접 입력해야 하는 칸이다.", "muted metric-foot"));
  return card;
}

const RUN_STATUS = { WAITING: "차례 대기", QUEUED: "대기 중", RUNNING: "분석 중", COMPLETED: "완료", PARTIAL: "일부 완료", FAILED: "실패", CANCELLED: "취소됨" };
const ACTIVE = ["WAITING", "QUEUED", "RUNNING"];

/** 선택한 묶음의 모델별 진행. 하나라도 끝나지 않았을 때만 보인다. 값은 서버가 센 처리 호출 수다. */
function renderProgress() {
  const panel = $("#cf-progress");
  const runs = groupRuns(state.group).map(({ run }) => run);
  panel.hidden = !runs.some((run) => ACTIVE.includes(run.status));
  panel.replaceChildren();
  if (panel.hidden) return;
  const head = element("div", undefined, "progress-head");
  const finished = runs.filter((run) => !ACTIVE.includes(run.status)).length;
  head.append(element("h3", "모델 분석 진행"), element("span", `${finished}/${runs.length}개 모델 완료 · 한 모델씩 차례로 실행`, "muted"));
  panel.append(head);
  for (const run of runs) {
    const model = modelKey(run);
    const row = element("div", undefined, `progress-row status-${run.status.toLowerCase()}`);
    row.style.setProperty("--model", color(model));
    const ratio = run.plannedCalls ? Math.min(1, run.processedCalls / run.plannedCalls) : 0;
    const bar = element("div", undefined, "progress-track");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", `${model} 분석 진행`);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(run.plannedCalls));
    bar.setAttribute("aria-valuenow", String(run.processedCalls));
    const fill = element("div", undefined, "progress-fill");
    fill.style.width = `${(run.status === "COMPLETED" ? 1 : ratio) * 100}%`;
    bar.append(fill);
    const label = element("div", undefined, "progress-label");
    label.append(element("span", model, "progress-model"), element("span", RUN_STATUS[run.status] ?? run.status, "progress-state"));
    row.append(label, bar, element("span", `${run.processedCalls}/${run.plannedCalls} 호출`, "number progress-count"));
    panel.append(row);
  }
}

function render() {
  $("#cf-overview").hidden = state.page === "tokens";
  $("#cf-tokens").hidden = state.page !== "tokens";
  root.querySelectorAll("[data-page]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.page === state.page)));
  root.querySelectorAll("[data-stage]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stage === state.stage)));
  renderProgress();
  renderOverview();
  renderTokens();
  const cases = state.dataset?.cases ?? [];
  $("#profile-count").textContent = `프로필 ${new Set(cases.map((c) => c.profileId)).size}개`;
  $("#site-count").textContent = `사이트 ${new Set(cases.map((c) => c.siteId)).size}개`;
  const active = state.runs.find(({ run }) => ["QUEUED", "RUNNING"].includes(run.status))?.run;
  const waiting = state.runs.filter(({ run }) => run.status === "WAITING").length;
  const STATUS = RUN_STATUS;
  const last = state.runs[0]?.run;
  $("#cf-status").textContent = active
    ? `${STATUS[active.status]} · ${modelKey(active)} · ${active.processedCalls}/${active.plannedCalls} 호출 처리${waiting ? ` · 다음 모델 ${waiting}개 차례 대기` : ""} (자동 갱신 중)`
    : last ? `최근 실행: ${STATUS[last.status] ?? last.status} · ${last.processedCalls}/${last.plannedCalls} 호출 · 총 ${state.runs.length}건`
      : "측정 결과 없음";
}

function renderFilters() {
  const groups = [...new Set(state.runs.map(({ run }) => groupKey(run)))];
  if (!groups.includes(state.group)) {
    state.group = groups[0] ?? null;
    state.selected = [];
  }
  const select = $("#comparison");
  select.replaceChildren(...groups.map((key) => Object.assign(element("option", groupLabel(key)), { value: key })));
  select.value = state.group ?? "";
  $("#comparison-detail").textContent = state.group ? comparisonDetail(state.group) : "";
  state.models = [...new Set(groupRuns(state.group).map(({ run }) => modelKey(run)))];
  state.selected = state.selected.filter((model) => state.models.includes(model));
  if (!state.selected.length) state.selected = [...state.models];
  const models = $("#models");
  models.replaceChildren();
  for (const model of state.models) {
    const label = element("label");
    label.style.setProperty("--model", color(model));
    const input = element("input");
    input.type = "checkbox";
    input.checked = state.selected.includes(model);
    input.addEventListener("change", () => {
      state.selected = state.models.filter((m) => (m === model ? input.checked : state.selected.includes(m)));
      render();
    });
    label.append(input, document.createTextNode(model));
    models.append(label);
  }
  if (!state.models.length) models.append(element("span", "실행 결과가 있는 모델이 없습니다.", "muted"));
}

function dialog(title, content, className) {
  const box = $("#cf-source");
  box.className = `detail ${className ?? ""}`;
  $("#cf-source-title").textContent = title;
  $("#source-content").replaceChildren(content);
  if (!box.open) box.showModal();
}

const STATE_NAMES = { initial: "처음 화면", "high-school": "고등학교", university: "대학교", ged: "검정고시" };
const CONTROL_NAMES = { text: "글자", select: "선택", radio: "라디오", checkbox: "체크", textarea: "긴 글", custom: "직접 구현" };
const CALL_NAMES = { SECTION_CLASSIFY: "섹션 분류", INTERACTION_DECISION: "학력 구분 선택", GENERIC_FIELDS: "칸 매핑" };
const REVIEW_NAMES = { privacy: "개인정보", structure: "구조", mappingTruth: "칸 정답", preparationTruth: "준비 정답",
  inputIdentity: "입력 동일성" };
const REVIEW_OK = new Set(["PASSED", "HUMAN_REVIEWED", "SOURCE_PIPELINE_VERIFIED", "INSTALLED_VERIFIED"]);

/** 데이터셋 대화상자. 요약, 화면별 탭, 채점 순서, 섹션별 칸 표, 검토 상태, 합성 프로필을 보인다. */
function datasetView(selected = 0) {
  const data = state.dataset;
  if (!data) return element("p", "데이터셋을 불러오지 못했습니다.", "muted");
  const wrap = element("div", undefined, "dataset-view");
  const fieldCount = data.cases.reduce((sum, item) => sum + item.sections.reduce((n, group) => n + group.fields.length, 0), 0);
  const summary = element("div", undefined, "dataset-summary");
  [[`${data.cases.length}개`, "화면"], [`${fieldCount}칸`, "채점하는 입력 칸"],
    [`${Object.keys(data.profiles).length}명`, "합성 프로필"],
    [data.usable ? "사용 가능" : "검토 필요", "평가 상태"]].forEach(([value, label]) => {
    const tile = element("div", undefined, "summary-tile");
    tile.append(element("strong", value), element("span", label, "muted"));
    summary.append(tile);
  });
  wrap.append(summary);
  if (!data.usable && data.rejection) wrap.append(element("p", `미완료 검토: ${data.rejection}`, "muted"));
  const tabs = element("div", undefined, "dataset-tabs");
  data.cases.forEach((item, index) => {
    const tab = element("button", STATE_NAMES[item.state] ?? item.state);
    tab.type = "button";
    tab.setAttribute("aria-pressed", String(index === selected));
    tab.addEventListener("click", () => dialog("데이터셋", datasetView(index), "dataset-dialog"));
    tabs.append(tab);
  });
  wrap.append(tabs);
  const item = data.cases[selected];
  const steps = element("ol", undefined, "call-steps");
  item.calls.forEach((call) => {
    const step = element("li");
    step.append(element("span", call.stage === "PREPARATION" ? "준비" : "매핑", "step-stage"),
      element("strong", CALL_NAMES[call.kind] ?? call.kind), element("span", `${call.items}항목`, "muted"));
    steps.append(step);
  });
  wrap.append(element("h4", "채점 순서"), steps);
  const badges = element("div", undefined, "review-badges");
  Object.entries(item.review).filter(([key]) => REVIEW_NAMES[key]).forEach(([key, value]) =>
    badges.append(element("span", `${REVIEW_NAMES[key]} ${REVIEW_OK.has(value) ? "확인" : value}`,
      REVIEW_OK.has(value) ? "badge ok" : "badge")));
  wrap.append(badges);
  const table = element("table", undefined, "field-table");
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(element("th", "칸 이름"), element("th", "종류"));
  head.append(headRow);
  const body = element("tbody");
  item.sections.forEach((group) => {
    const title = !group.title ? "제목 없음" : group.title === "[비식별]" ? "기본정보 (제목 비식별)" : group.title;
    const sectionRow = element("tr", undefined, "section-row");
    const cell = element("th", `${title} · ${group.fields.length}칸`);
    cell.colSpan = 2;
    sectionRow.append(cell);
    body.append(sectionRow);
    group.fields.forEach((field) => {
      const row = element("tr");
      row.append(element("td", field.label ?? "이름 없음"), element("td", CONTROL_NAMES[field.control] ?? field.control));
      body.append(row);
    });
  });
  table.append(head, body);
  wrap.append(element("h4", `입력 칸 · ${item.sections.reduce((n, group) => n + group.fields.length, 0)}칸`), table);
  const profiles = element("details", undefined, "profile-details");
  profiles.append(element("summary", "합성 프로필 보기 (가상 인물, 실제 지원자 아님)"));
  Object.entries(data.profiles).forEach(([id, profile]) => profiles.append(element("h5", id), profileTable(profile)));
  wrap.append(profiles);
  return wrap;
}

/** 합성 프로필을 항목별 표로. 반복 기록은 기록마다 한 줄씩 값을 이어 붙인다. */
function profileTable(profile) {
  const table = element("table", undefined, "field-table");
  const body = element("tbody");
  const add = (name, value) => {
    const row = element("tr");
    row.append(element("td", name), element("td", value));
    body.append(row);
  };
  Object.entries(profile.profile ?? profile).forEach(([category, value]) => {
    const head = element("tr", undefined, "section-row");
    const cell = element("th", category);
    cell.colSpan = 2;
    head.append(cell);
    body.append(head);
    const entries = Array.isArray(value) ? value : [value];
    entries.forEach((entry) => {
      const values = entry?.values ?? entry;
      if (values && typeof values === "object")
        Object.entries(values).forEach(([key, item]) => add(`${entry?.sectionId ? `${entry.sectionId} · ` : ""}${key}`, String(item)));
      else add(category, String(values));
    });
  });
  table.append(body);
  return table;
}

function criteriaView() {
  const list = element("div", undefined, "criteria-list");
  const lines = [
    ["항목 판정", "항목마다 정답·오답만 판정한다(매핑 불가·기권 정답 포함, 부분 점수 없음). 호출별 점수는 참고용으로만 남는다."],
    ["오답의 종류", "다른 키, 누락(정답이 있는데 답 없음), 불필요 제안(정답이 매핑 불가인데 답함)은 모두 그 항목의 오답이며 별도 감점은 없다."],
    ["채점 제외", "공급자 사용 불가 항목은 빼고, 모든 항목이 빠진 호출은 채점 불가로 실패율에 넣는다."],
    ["최종 정확도", "채점 가능한 호출의 맞힌 항목 수 합 ÷ 채점한 항목 수 합(항목 단위). 칸이 많은 호출이 그만큼 비중을 가진다. 준비·매핑 정확도도 같은 방식으로 단계별로 계산한다."],
    ["실패", "타임아웃, API 오류, 응답 형식 오류는 정확도에서 빼고 실패율에 넣는다. 채점 가능한 호출이 없으면 측정 불가."],
    ["실제 자동기입 결과", "칸 매핑 답을 제품과 같은 확신도 구간으로 나눈다. 0.8 이상은 자동기입이라 정답·오답을 따지고, 0.5~0.8은 사용자 확인, 0.5 미만은 막음이다. 확장프로그램의 이름 칸 보정과 정확히 일치하는 값 올림 규칙은 반영하지 않는다. OpenAI 확신도는 모델 자기 보고 값이다."],
    ["반복별 범위", "같은 입력을 반복마다 따로 채점한 정확도의 최소~최대. 가장 높은 두 모델의 범위가 겹치면 차이를 구분할 수 없다고 본다. 반복 수가 적으면 범위가 실제보다 좁게 잡혀, 같은 입력을 새로 실행하면 범위 밖으로 움직일 수 있다."],
  ];
  for (const [title, text] of lines) {
    const section = element("section");
    section.append(element("h4", title), element("p", text));
    list.append(section);
  }
  return list;
}

const PROMPT_GROUPS = [
  { prefix: "section-classification", name: "섹션 분류", note: "섹션이 어느 프로필 범주인지 고르는 질문" },
  { prefix: "generic-fields", name: "칸 매핑", note: "칸마다 어떤 프로필 항목을 넣을지 고르는 질문" },
  { prefix: "interaction-decisions", name: "버튼·선택지 결정", note: "학력 구분처럼 화면을 바꾸는 선택" },
  { prefix: "", name: "공급자 고정 문구", note: "공급자 연결부가 따로 보내는 시스템 문구" },
];

/** 프롬프트 조각을 용도별로 묶어 보인다. 지시 문구는 펼치고 선택지 설명(criterion.*)은 검색 가능한 표로 접는다. */
function renderPromptGroups(parts) {
  const wrap = element("div");
  const names = Object.keys(parts);
  const used = new Set();
  for (const group of PROMPT_GROUPS) {
    const own = names.filter((name) => !used.has(name) && (group.prefix ? name.startsWith(`${group.prefix}/`) : true));
    own.forEach((name) => used.add(name));
    if (!own.length) continue;
    const box = element("details", undefined, "prompt-group");
    box.open = true;
    const summary = element("summary");
    summary.append(element("strong", group.name), element("span", `${group.note} · ${own.length}개`, "muted"));
    box.append(summary);
    const criteria = own.filter((name) => name.split("/").slice(1).join("/").startsWith("criterion."));
    own.filter((name) => !criteria.includes(name)).forEach((name) => {
      const part = element("section", undefined, "prompt-part");
      part.append(element("h5", name.split("/").slice(1).join("/") || name), element("p", parts[name], "prompt-text"));
      box.append(part);
    });
    if (criteria.length) {
      const list = element("details", undefined, "criteria-fold");
      list.append(element("summary", `선택지 설명 ${criteria.length}개`));
      const table = element("table", undefined, "criteria-table");
      const body = element("tbody");
      criteria.forEach((name) => {
        const row = element("tr");
        row.append(element("td", name.split("criterion.").slice(1).join("criterion.")), element("td", parts[name]));
        body.append(row);
      });
      table.append(body);
      const search = Object.assign(element("input"), { type: "search", placeholder: "선택지 이름이나 설명으로 찾기" });
      search.className = "criteria-search";
      search.addEventListener("input", () => {
        const word = search.value.trim().toLowerCase();
        body.querySelectorAll("tr").forEach((row) => { row.hidden = Boolean(word) && !row.textContent.toLowerCase().includes(word); });
      });
      list.append(search, table);
      box.append(list);
    }
    wrap.append(box);
  }
  return wrap;
}

/**
 * 두 프롬프트 버전의 조각 차이. 문구가 같고 이름만 다른 조각은 같은 조각으로 본다(내부 이름표 변경은 프롬프트 변경이
 * 아니다). 이름이 같은데 문구가 다르면 변경이다.
 */
function diffPromptParts(before, after) {
  const renamed = new Map();
  const gone = Object.keys(before).filter((name) => !(name in after));
  for (const name of Object.keys(after).filter((name) => !(name in before))) {
    const match = gone.find((old) => !renamed.has(old) && before[old] === after[name]);
    if (match) renamed.set(match, name);
  }
  const renamedTo = new Set(renamed.values());
  return {
    added: Object.keys(after).filter((name) => !(name in before) && !renamedTo.has(name)),
    removed: gone.filter((name) => !renamed.has(name)),
    changed: Object.keys(after).filter((name) => name in before && before[name] !== after[name]),
  };
}

/** 줄 단위 차이(최장 공통 부분열). 각 줄은 " "(같음), "-"(삭제), "+"(추가)다. */
function lineDiff(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { rows.push([" ", a[i]]); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) { rows.push(["-", a[i]]); i += 1; }
    else { rows.push(["+", b[j]]); j += 1; }
  }
  while (i < a.length) rows.push(["-", a[i++]]);
  while (j < b.length) rows.push(["+", b[j++]]);
  return rows;
}

function diffCard(name, kind, before, after) {
  const card = element("section", undefined, "diff-card");
  const head = element("div", undefined, "diff-head");
  head.append(element("span", { added: "추가", removed: "삭제", changed: "변경" }[kind], `diff-badge ${kind}`), element("code", name));
  card.append(head);
  const table = element("table", undefined, "diff-table");
  const body = element("tbody");
  const rows = kind === "added" ? after.split("\n").map((line) => ["+", line])
    : kind === "removed" ? before.split("\n").map((line) => ["-", line]) : lineDiff(before, after);
  // 바로 붙은 삭제·추가 줄은 같은 앞뒤를 빼고 달라진 가운데만 강조한다.
  const marked = (text, start, end) => {
    const cell = element("td", undefined, "diff-text");
    cell.append(document.createTextNode(text.slice(0, start)), element("mark", text.slice(start, text.length - end)),
      document.createTextNode(text.slice(text.length - end)));
    return cell;
  };
  rows.forEach(([sign, text], index) => {
    const row = element("tr", undefined, sign === "+" ? "diff-add" : sign === "-" ? "diff-del" : "diff-ctx");
    const pair = sign === "-" && rows[index + 1]?.[0] === "+" ? rows[index + 1][1]
      : sign === "+" && rows[index - 1]?.[0] === "-" ? rows[index - 1][1] : null;
    let cell = element("td", text, "diff-text");
    if (pair !== null) {
      let start = 0;
      while (start < text.length && start < pair.length && text[start] === pair[start]) start += 1;
      let end = 0;
      while (end < text.length - start && end < pair.length - start
        && text[text.length - 1 - end] === pair[pair.length - 1 - end]) end += 1;
      if (start + end < text.length) cell = marked(text, start, end);
    }
    row.append(element("td", sign, "diff-sign"), cell);
    body.append(row);
  });
  table.append(body);
  card.append(table);
  return card;
}

/**
 * 프롬프트 대화상자. 공급자별로 버전을 커밋 목록처럼 최신순으로 보이고, 고른 버전이 첫 버전이면 전체 프롬프트를,
 * 아니면 이전 버전 대비 바뀐 조각만 줄 단위로 보인다. 문구가 완전히 같은 연속 버전은 하나로 합친다.
 */
async function promptView(selected = null) {
  const history = await api("/prompts");
  if (!history.length) return element("p", "실행 기록이 없어 프롬프트 버전이 없습니다.", "muted");
  const parts = new Map(await Promise.all(history.map(async (entry) =>
    [entry.digest, (await api(`/prompts/${entry.digest}`)).parts])));
  const textKey = (value) => Object.values(value).sort().join("\u0000");
  const byProvider = new Map();
  for (const entry of history) {
    const list = byProvider.get(entry.provider) ?? [];
    byProvider.set(entry.provider, list);
    const own = parts.get(entry.digest);
    const last = list[list.length - 1];
    // 문구가 같으면 같은 버전이다. 이름표는 최신 것을 써서 다음 버전과 이름으로 맞춰 비교한다.
    if (last && last.key === textKey(own)) {
      last.entries.push(entry);
      last.parts = own;
    }
    else list.push({ key: textKey(own), parts: own, entries: [entry] });
  }
  const providers = [...byProvider.keys()];
  const groupProvider = groupRuns(state.group)[0]?.run.versions.provider;
  const provider = selected?.provider ?? (providers.includes(groupProvider) ? groupProvider : providers[0]);
  const versions = byProvider.get(provider);
  const index = selected?.index ?? versions.length - 1;
  const wrap = element("div", undefined, "prompt-history");
  const tabs = element("div", undefined, "dataset-tabs");
  providers.forEach((name) => {
    const tab = element("button", name);
    tab.type = "button";
    tab.setAttribute("aria-pressed", String(name === provider));
    tab.addEventListener("click", async () => dialog("프롬프트", await promptView({ provider: name }), "criteria-dialog"));
    tabs.append(tab);
  });
  wrap.append(tabs);
  const label = (i) => i === 0 ? "초기 버전" : `v${i + 1}`;
  const when = (iso) => {
    const at = new Date(iso);
    return `${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  };
  const commits = element("ol", undefined, "commit-list");
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const version = versions[i];
    const diff = i > 0 ? diffPromptParts(versions[i - 1].parts, version.parts) : null;
    const item = element("li", undefined, i === index ? "selected" : undefined);
    const button = element("button");
    button.type = "button";
    const names = [...new Set(version.entries.flatMap((entry) => entry.names))];
    button.append(element("strong", label(i)), element("span", `${when(version.entries[0].firstUsedAt)} · ${names.join(", ") || "이름 없음"}`, "muted"));
    const stats = element("span", undefined, "commit-stats");
    if (diff) stats.append(element("span", `+${diff.added.length}`, "stat-add"), element("span", `−${diff.removed.length}`, "stat-del"),
      element("span", `~${diff.changed.length}`, "stat-chg"));
    else stats.append(element("span", `조각 ${Object.keys(version.parts).length}개`, "muted"));
    button.append(stats);
    button.addEventListener("click", async () => dialog("프롬프트", await promptView({ provider, index: i }), "criteria-dialog"));
    item.append(button);
    commits.append(item);
  }
  wrap.append(commits);
  const version = versions[index];
  const detail = element("div", undefined, "commit-detail");
  if (index === 0) {
    detail.append(element("h4", `초기 버전 · 조각 ${Object.keys(version.parts).length}개`), renderPromptGroups(version.parts));
  }
  else {
    const before = versions[index - 1].parts;
    const diff = diffPromptParts(before, version.parts);
    const unchanged = Object.keys(version.parts).length - diff.added.length - diff.changed.length;
    detail.append(element("h4", `${label(index)} · ${label(index - 1)} 대비 추가 ${diff.added.length} · 삭제 ${diff.removed.length} · 변경 ${diff.changed.length} · 변경 없는 조각 ${unchanged}개`));
    diff.changed.forEach((name) => detail.append(diffCard(name, "changed", before[name], version.parts[name])));
    diff.added.forEach((name) => detail.append(diffCard(name, "added", "", version.parts[name])));
    diff.removed.forEach((name) => detail.append(diffCard(name, "removed", before[name], "")));
    const full = element("details", undefined, "profile-details");
    full.append(element("summary", "이 버전 전체 프롬프트 보기"), renderPromptGroups(version.parts));
    detail.append(full);
  }
  wrap.append(detail);
  return wrap;
}

function openPricing() {
  const form = element("form");
  for (const model of state.models) {
    const row = element("div", undefined, "pricing-grid pricing-row");
    row.append(element("strong", model));
    for (const kind of ["input", "output"]) {
      const input = element("input");
      Object.assign(input, { type: "number", min: "0", step: "any", placeholder: "미설정", name: `${model}|${kind}` });
      input.value = prices[model]?.[kind] ?? "";
      input.setAttribute("aria-label", `${model} ${kind === "input" ? "입력" : "출력"} 100만 토큰당 USD`);
      row.append(input);
    }
    form.append(row);
  }
  const message = element("p", "", "muted");
  const apply = element("button", "적용", "apply-pricing");
  apply.type = "submit";
  form.append(element("p", "100만 토큰당 USD 단가. 이 브라우저에만 저장한다.", "pricing-explanation"), message, apply);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const next = {};
      for (const input of form.querySelectorAll("input")) {
        const [model, kind] = input.name.split("|");
        next[model] = { ...(next[model] ?? {}), [kind]: validRate(input.value) };
      }
      prices = next;
      try { localStorage.setItem(PRICE_KEY, JSON.stringify(prices)); } catch { /* 이번 화면에서만 쓴다. */ }
      $("#cf-source").close();
      render();
    } catch (error) { message.textContent = error.message; }
  });
  dialog("모델 단가 설정", form, "pricing-dialog");
}

const FORMATS = { JSON_OBJECT: "json_object (대부분의 호환 서버)", JSON_SCHEMA: "json_schema 엄격 스키마 (OpenAI 등)" };

/**
 * OpenAI 호환 평가 공급자 등록·수정·비활성화. 키 원문은 받지 않고 서버 키 묶음의 이름만 고른다. 저장하면 바로 평가
 * 실행의 모델 목록에 나온다.
 */
async function openProviders(editing) {
  let data;
  try { data = await api("/provider-registrations"); } catch (error) { $("#cf-status").textContent = error.message; return; }
  const wrap = element("div", undefined, "provider-admin");
  const keys = element("section", undefined, "provider-keys");
  keys.append(element("h4", "서버 키"));
  if (!data.keys.length) keys.append(element("p", "서버에 등록된 키가 없습니다. 키가 필요한 공급자는 CAREER_FORM_EVALUATION_PROVIDER_KEYS에 이름·키·허용 호스트를 넣고 서버를 다시 배포해야 합니다.", "muted"));
  data.keys.forEach((key) => keys.append(element("div", `${key.name} → ${key.hosts.join(", ")}`, "provider-key")));
  keys.append(element("p", "키 원문은 이 화면에 입력하지 않습니다. 키는 허용 호스트로만 보내집니다.", "muted"));
  const list = element("section", undefined, "provider-list");
  list.append(element("h4", "등록한 공급자"));
  if (!data.registrations.length) list.append(element("p", "아직 등록한 공급자가 없습니다.", "muted"));
  for (const item of data.registrations) {
    const row = element("div", undefined, `provider-row${item.enabled ? "" : " disabled"}`);
    const info = element("div", undefined, "provider-info");
    info.append(element("strong", `${item.name}${item.enabled ? "" : " (꺼짐)"}`),
      element("span", item.baseUrl, "muted"),
      element("span", `모델 ${item.models.join(", ")} · 키 ${item.keyName ?? "없음"} · ${item.format === "JSON_SCHEMA" ? "json_schema" : "json_object"} · 확신도 ${item.minConfidence}`, "muted"));
    const actions = element("div", undefined, "provider-actions");
    const edit = element("button", "수정", "pricing-trigger");
    edit.type = "button";
    edit.addEventListener("click", () => openProviders(item));
    actions.append(edit);
    if (item.enabled) {
      const off = element("button", "끄기", "pricing-trigger");
      off.type = "button";
      off.addEventListener("click", async () => {
        try { await api(`/provider-registrations/${encodeURIComponent(item.name)}/disable`, "POST"); await openProviders(); }
        catch (error) { message.textContent = error.message; }
      });
      actions.append(off);
    }
    row.append(info, actions);
    list.append(row);
  }
  const form = element("form", undefined, "criteria-list run-form");
  const field = (label, input, hint) => {
    const box = element("label", undefined, "field");
    box.append(element("span", label), input, element("span", hint, "hint"));
    return box;
  };
  const text = (value, attrs = {}) => Object.assign(element("input"), { type: "text", value: value ?? "", ...attrs });
  const name = text(editing?.name, { maxLength: 32, placeholder: "deepseek", readOnly: Boolean(editing) });
  const baseUrl = text(editing?.baseUrl, { maxLength: 300, placeholder: "https 주소, 예: api.deepseek.com/v1" });
  const keyName = element("select");
  keyName.append(Object.assign(element("option", "키 없음 (자체 서빙)"), { value: "" }));
  data.keys.forEach((key) => keyName.append(Object.assign(element("option", key.name), { value: key.name })));
  keyName.value = editing?.keyName ?? "";
  const models = text(editing?.models?.join(", "), { placeholder: "deepseek-chat, deepseek-reasoner" });
  const format = element("select");
  Object.entries(FORMATS).forEach(([value, label]) => format.append(Object.assign(element("option", label), { value })));
  format.value = editing?.format ?? "JSON_OBJECT";
  const reasoning = text(editing?.reasoningEffort, { maxLength: 16, placeholder: "비워 두면 보내지 않음" });
  const timeout = Object.assign(element("input"), { type: "number", min: "1000", max: "120000", step: "1000", value: String(editing?.timeoutMs ?? 30000) });
  const confidence = Object.assign(element("input"), { type: "number", min: "0", max: "1", step: "0.05", value: String(editing?.minConfidence ?? 0.8) });
  const message = element("p", "저장하면 바로 평가 실행의 모델 목록에 나옵니다. 주소·설정을 바꾸면 이미 대기 중인 실행은 실행하지 않고 실패로 끝납니다.", "muted");
  const submit = element("button", editing ? "수정 저장" : "등록", "apply-pricing");
  submit.type = "submit";
  form.append(element("h4", editing ? `${editing.name} 수정` : "새 공급자"),
    field("이름", name, "결과에 남는 공급자 이름. 영문 소문자·숫자·-"),
    field("기준 주소", baseUrl, "끝에 /chat/completions를 붙여 보냅니다. https만 가능"),
    field("키", keyName, "서버 키 묶음에서 고릅니다"),
    field("모델", models, "쉼표로 구분, 첫 모델이 기본값"),
    field("응답 형식", format, "엄격 스키마를 지원하지 않는 서버는 json_object"),
    field("추론 옵션", reasoning, "reasoning_effort 값. 지원하는 서버만"),
    field("시간 제한(ms)", timeout, "호출 한 번의 최대 대기"),
    field("확신도 기준", confidence, "버튼·선택지 결정에 쓰는 최소 확신도(0~1)"),
    message, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await api("/provider-registrations", "POST", {
        name: name.value.trim(), baseUrl: baseUrl.value.trim(), keyName: keyName.value || null,
        models: models.value.split(",").map((value) => value.trim()).filter(Boolean),
        format: format.value, reasoningEffort: reasoning.value.trim() || null,
        timeoutMs: Number(timeout.value), minConfidence: Number(confidence.value),
      });
      $("#cf-status").textContent = `공급자 ${name.value.trim()}을(를) 저장했습니다.`;
      await openProviders();
    } catch (error) { message.textContent = error.message; } finally { submit.disabled = false; }
  });
  if (editing) {
    const cancel = element("button", "새로 등록하기", "pricing-trigger");
    cancel.type = "button";
    cancel.addEventListener("click", () => openProviders());
    form.append(cancel);
  }
  wrap.append(keys, list, form);
  dialog("공급자 관리", wrap, "criteria-dialog");
}

async function openRun() {
  let providers = [];
  try { providers = await api("/providers"); } catch (error) { $("#cf-status").textContent = error.message; return; }
  const form = element("form", undefined, "criteria-list run-form");
  const field = (label, input, hint, tag = "label") => {
    const wrap = element(tag, undefined, "field");
    wrap.append(element("span", label), input, element("span", hint, "hint"));
    return wrap;
  };
  const targets = element("div", undefined, "target-list");
  providers.forEach((item, providerIndex) => item.models.forEach((name) => {
    const option = element("label", undefined, "target");
    const box = Object.assign(element("input"), { type: "checkbox", value: `${item.provider}/${name}` });
    box.checked = providerIndex === 0 && name === item.defaultModel;
    option.append(box, document.createTextNode(`${item.provider} / ${name}`));
    targets.append(option);
  }));
  const repetitions = Object.assign(element("input"), { type: "number", min: "1", max: "20", value: "1" });
  const prompt = Object.assign(element("input"), { type: "text", maxLength: 32, placeholder: "비워 두면 이름 없음" });
  const message = element("p", "실제 모델을 호출하며 비용이 발생합니다. 진행 중인 평가가 있으면 등록되지 않습니다.", "muted");
  const submit = element("button", "등록", "apply-pricing");
  submit.type = "submit";
  form.append(
    field("모델", targets, providers.length
      ? "비교할 모델을 고릅니다(최대 5개). 같은 조건으로 한 모델씩 차례로 돌고, 결과는 한 화면에 나란히 나옵니다."
      : "이 서버에 연결된 공급자가 없습니다.", "div"),
    field("반복 수", repetitions, "같은 입력을 몇 번 돌릴지(1~20). 응답시간 편차를 보려면 3 이상을 권장합니다."),
    field("프롬프트 이름", prompt, "결과를 구분할 이름표(선택). 예: baseline. 실제 프롬프트 내용은 서버가 자동으로 기록합니다."),
    message, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const chosen = [...targets.querySelectorAll("input:checked")].map((box) => {
      const [provider, ...rest] = box.value.split("/");
      return { provider, model: rest.join("/") };
    });
    if (!chosen.length || chosen.length > 5) { message.textContent = "모델을 1~5개 골라 주세요."; return; }
    submit.disabled = true;
    try {
      const result = await api("/runs", "POST", {
        datasetId: DATASET.id, datasetVersion: DATASET.version, split: "all",
        repetitions: Number(repetitions.value), promptVersion: prompt.value.trim() || null, overrides: {},
        targets: chosen,
      });
      $("#cf-source").close();
      $("#cf-status").textContent = `등록했습니다(모델 ${chosen.length}개). 진행 상황을 자동으로 갱신합니다.`;
      state.group = result.comparisonId ?? result.runId;
      state.selected = [];
      await load();
    } catch (error) { message.textContent = error.message; } finally { submit.disabled = false; }
  });
  dialog("평가 실행", form, "criteria-dialog");
}

const POLL_MS = 3000;
let pollTimer = null;

async function load() {
  clearTimeout(pollTimer);
  let failed = null;
  try {
    state.runs = await api("/runs?limit=50");
  } catch (error) {
    state.runs = [];
    failed = error.message;
  }
  try { state.dataset = await api(`/datasets/${DATASET.id}/v${DATASET.version}`); } catch { state.dataset = null; }
  renderFilters();
  render();
  if (failed) $("#cf-status").textContent = failed;
  // 대기·실행 중인 평가가 있으면 끝날 때까지 결과를 다시 불러온다.
  if (state.runs.some(({ run }) => ["WAITING", "QUEUED", "RUNNING"].includes(run.status))) pollTimer = setTimeout(load, POLL_MS);
}

root.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => { state.page = b.dataset.page; render(); }));
root.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => { state.stage = b.dataset.stage; render(); }));
$("#comparison").addEventListener("change", (e) => { state.group = e.target.value; state.selected = []; renderFilters(); render(); });
$("#cf-source-close").addEventListener("click", () => $("#cf-source").close());
$("#run-open").addEventListener("click", openRun);
$("#provider-open").addEventListener("click", () => openProviders());
$("#refresh").addEventListener("click", load);
document.getElementById("logout").addEventListener("click", () => { clearAccess(); location.reload(); });
root.querySelectorAll("[data-source]").forEach((link) => link.addEventListener("click", async (event) => {
  event.preventDefault();
  const kind = link.dataset.source;
  try {
    if (kind === "데이터셋") dialog(kind, datasetView(), "dataset-dialog");
    else if (kind === "정답 기준") dialog(kind, criteriaView(), "criteria-dialog");
    else dialog(kind, await promptView(), "criteria-dialog");
  } catch (error) { dialog(kind, element("p", error.message, "muted"), "criteria-dialog"); }
}));
await load();
