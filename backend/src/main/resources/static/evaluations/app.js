// AI 평가 화면. 평가 실행 API의 결과만 표시한다. 예시 데이터나 추정값을 만들지 않으며 미관측 값은 "—"로 둔다.
import { accessHeaders, clearAccess } from "/quality/access.js";
import { estimateCost, formatUsd, validRate } from "/evaluations/pricing.js";

// 평가는 항상 현재 데이터셋의 모든 화면으로 한다. 전후 비교는 같은 데이터셋으로 개선 전·후 코드를 각각 돌려 비교한다.
const DATASET = { id: "generic-matching", version: 2 };
const COLORS = ["#4e6d90", "#688b7c", "#ac8d68", "#8a6f9e", "#6f8f9e"];
const PRICE_KEY = "cf-evaluation-model-prices-v1";
const root = document.getElementById("cf-eval-preview");
const $ = (selector) => root.querySelector(selector);
const state = { runs: [], dataset: null, models: [], selected: [], group: null, stage: "total", page: "overview", diagnosisOpen: false,
  fields: {}, baseline: "", fieldFilter: "diff", fieldScreen: "all", openField: null, itemKind: "GENERIC_FIELDS" };
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
      BUDGET_EXCEEDED: "예상 모델 호출 수가 실행 한도를 넘습니다. 반복 수를 줄여야 합니다.",
      UNKNOWN_DATASET: "검토를 마친 데이터셋이 아닙니다. 데이터셋 검토 상태 확인 필요.",
      INVALID_REPETITIONS: "반복 수는 1 이상 20 이하입니다.",
      INVALID_PROMPT_VERSION: "실행 이름은 영문·숫자·.-_ 32자 이하입니다.",
      UNKNOWN_PROVIDER: "이 서버에 연결되지 않았거나 등록되지 않은 공급자입니다.",
      UNKNOWN_MODEL: "이 공급자가 허용하지 않은 모델입니다.",
      INVALID_TARGETS: "모델은 중복 없이 1~5개만 고를 수 있습니다.",
      INVALID: "입력값 오류. 이름은 영문 소문자·숫자·-(2~32자), 모델은 1~10개, 시간 제한은 1,000~120,000ms입니다.",
      RESERVED_NAME: "jev, openai는 서버 설정 공급자 이름이라 쓸 수 없습니다.",
      UNKNOWN_KEY: "서버에 없는 키 이름입니다.",
      INVALID_URL: "기준 주소 형식이 올바르지 않습니다. 사용자 정보·질의·조각 없이 https 주소(호스트와 경로)만 허용합니다.",
      INSECURE_URL: "https 주소만 쓸 수 있습니다. 로컬 자체 서빙은 서버에서 allow-local을 켜고 키 없이 등록해야 합니다.",
      HOST_NOT_ALLOWED_FOR_KEY: "이 키는 고른 주소의 호스트로 보낼 수 없습니다. 키에 허용된 호스트 확인 필요.",
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
  return `데이터 v${first.versions.datasetVersion} · ${SPLIT[first.versions.split] ?? first.versions.split} · 반복 ${first.repetitions}회 · 모델 ${runs.length}개 · ${conditionText(first)}`;
}

// 결과에 영향을 주는 실행 조건. 코드 버전과 서버 설정(배치·병렬·재시도)이 바뀌면 프롬프트가 같아도 품질·성능이 달라질 수 있다.
const SETTING_NAMES = { "field-batch-size": "칸 묶음", "section-concurrency": "섹션 동시", "max-concurrent": "최대 동시 호출",
  "rate-limit-retries": "재시도", "timeout-ms": "시간 제한(ms)", "min-confidence": "확신도 기준", "reasoning-effort": "추론 강도" };
const conditionText = (run) => [`코드 ${run.versions.codeVersion ?? "—"}`,
  ...["field-batch-size", "section-concurrency"].filter((key) => run.versions.settings?.[key] != null)
    .map((key) => `${SETTING_NAMES[key]} ${run.versions.settings[key]}`)].join(" · ");

/** 기준 실행과 달라진 조건(코드, 프롬프트, 모델, 설정). 같으면 빈 목록이다. */
function changedConditions(run, base) {
  const changes = [];
  if (run.versions.codeVersion !== base.versions.codeVersion) changes.push(`코드 ${base.versions.codeVersion ?? "—"} → ${run.versions.codeVersion ?? "—"}`);
  if (run.versions.promptDigest !== base.versions.promptDigest) changes.push("프롬프트 바뀜");
  if (run.versions.model !== base.versions.model) changes.push(`모델 ${base.versions.model} → ${run.versions.model}`);
  const keys = new Set([...Object.keys(run.versions.settings ?? {}), ...Object.keys(base.versions.settings ?? {})]);
  [...keys].sort().forEach((key) => {
    const [before, after] = [base.versions.settings?.[key], run.versions.settings?.[key]];
    if (before !== after) changes.push(`${SETTING_NAMES[key] ?? key} ${before ?? "—"} → ${after ?? "—"}`);
  });
  return changes;
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
  if (!state.selected.length) card.append(element("div", "비교할 모델 선택 필요.", "empty"));
  for (const model of state.selected) {
    const value = values(model);
    const row = element("div", undefined, "bar-row");
    row.style.setProperty("--model", color(model));
    const track = element("div", undefined, "track");
    const fill = element("div", undefined, "fill");
    fill.style.width = `${value == null ? 0 : Math.max(0, Math.min(100, value / max * 100))}%`;
    track.append(fill);
    const name = element("span", model);
    name.title = model;
    row.append(name, track, element("span", value == null ? "—" : format(value), "number"));
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
    scoreCard(),
    renderAutofill(),
    diagnosis());
  const total = state.stage === "total";
  const perf = (m) => report(m)?.performance[stageKey()];
  const seconds = (m) => {
    const value = total ? report(m)?.flows.time.meanMs : perf(m)?.productCall.meanMs;
    return value == null ? null : value / 1000;
  };
  const failure = (m) => percent(total ? report(m)?.flows.failureRate : perf(m)?.failureRate);
  const timeCard = bars(total ? "자동기입 1번당 응답시간" : "API 1번당 응답시간",
    total ? "API 3~4번 합 · 평균 · 낮을수록 좋음" : "평균 · 낮을수록 좋음", seconds,
    Math.max(1, ...state.selected.map((m) => seconds(m) ?? 0)), (v) => `${v.toFixed(2)}초`,
    total ? "자동기입 버튼 1번(화면 하나)에 서버 API 3~4번을 처리한 시간의 합. 서버 처리·재시도 포함, 브라우저↔서버 네트워크와 화면 입력 시간 제외."
      : "서버 API 1번을 처리한 시간. 안의 모델 호출·서버 처리·재시도 포함, 브라우저↔서버 네트워크 제외.");
  if (total) {
    timeCard.querySelectorAll(".bar-row").forEach((row, index) => {
      const time = report(state.selected[index])?.flows.time;
      if (time?.p95Ms != null) row.after(element("span", `p95 ${(time.p95Ms / 1000).toFixed(2)}초 · 자동기입 ${time.count}번`, "range-note"));
    });
  }
  if (!total) {
    // API 1번 안에서 모델을 몇 번 불렀는지 보이면 모델 호출 1번당 시간과 이어서 읽을 수 있다.
    timeCard.querySelectorAll(".bar-row").forEach((row, index) => {
      const stage = perf(state.selected[index]);
      if (stage?.calls && stage.modelAttempt?.count) row.after(element("span",
        `API ${stage.calls}번 · 1번에 모델 호출 평균 ${(stage.modelAttempt.count / stage.calls).toFixed(1)}번`, "range-note"));
    });
  }
  // 전체 흐름은 자동기입 단위로 본다. 모델 호출 1번당 시간은 단계마다 섞이는 준비·매핑 탭에서만 보이고, 처리량은 실행 전체
  // 경과 시간으로 나누므로 전체 흐름에서만 뜻이 있다.
  $("#cf-performance").replaceChildren(...(total ? [
    timeCard,
    bars("처리량", "초당 끝낸 API 수 · 높을수록 좋음", (m) => perf(m)?.throughputPerSecond,
      Math.max(0.1, ...state.selected.map((m) => perf(m)?.throughputPerSecond ?? 0)), (v) => `${v.toFixed(2)}/초`,
      "실행 전체에서 끝낸 API 수 ÷ 실행 경과 시간. 평가는 API를 차례로 부르므로 API 1번당 응답시간이 짧을수록 높습니다."),
    bars("자동기입 실패율", "낮을수록 좋음", failure, 100, (v) => `${v.toFixed(1)}%`,
      "API가 하나라도 실패한 자동기입(화면 하나)의 비율"),
    costCard(),
  ] : [
    modelTimeCard(perf),
    timeCard,
    bars("API 실패율", "낮을수록 좋음", failure, 100, (v) => `${v.toFixed(1)}%`,
      "타임아웃 · API 오류 · 응답 형식 오류 · 채점 불가인 API의 비율"),
  ]));
}

/**
 * 자동기입 1,000번당 예상 비용. 실행의 입력·출력 토큰 합에 모델 단가 설정(사용자가 넣은 USD/100만 토큰)을 곱하고 실행 안의
 * 자동기입 수로 나눈다. 단가를 넣지 않은 모델은 계산하지 않는다.
 */
function costCard() {
  const perThousand = (model) => {
    const tokens = report(model)?.tokens.TOTAL;
    const flows = report(model)?.flows.count;
    const cost = tokens?.inputTotal == null ? null : estimateCost(tokens.inputTotal, tokens.outputTotal, prices[model]);
    return cost == null || !flows ? null : cost / flows * 1000;
  };
  const card = bars("자동기입 1,000번당 예상 비용", "USD · 낮을수록 좋음", perThousand,
    Math.max(0.01, ...state.selected.map((m) => perThousand(m) ?? 0)), (v) => formatUsd(v),
    "입력·출력 토큰 × 토큰 사용량 탭의 모델 단가 설정. 단가를 넣지 않은 모델은 —로 둡니다.");
  card.querySelectorAll(".bar-row").forEach((row, index) => {
    if (perThousand(state.selected[index]) == null && report(state.selected[index])) row.after(element("span", "단가 미설정 · 토큰 사용량 탭에서 입력", "range-note"));
  });
  return card;
}

/**
 * 모델 응답 시간: 서버가 모델 API에 요청을 보낸 직전부터 응답 전체를 받을 때까지, 시도 1건 평균. 네트워크와 공급자 대기가
 * 들어 있고 서버의 요청 만들기·해석·배치 대기는 빠진다. API 1번당 응답시간과 비교하면 서버 쪽 처리·대기를 가늠할 수 있다.
 */
function modelTimeCard(perf) {
  const attempt = (m) => perf(m)?.modelAttempt;
  const seconds = (m) => attempt(m)?.meanMs == null ? null : attempt(m).meanMs / 1000;
  const card = bars("모델 호출 1번당 응답시간", "모델 비교 기준 · 평균 · 낮을수록 좋음", seconds, Math.max(1, ...state.selected.map((m) => seconds(m) ?? 0)),
    (v) => `${v.toFixed(2)}초`, "모델 API를 1번 부를 때 보낸 직전부터 응답을 다 받을 때까지. 서버 API 1번 안에서 여러 번 부를 수 있습니다(칸 매핑은 칸 묶음마다). 모델 쪽 네트워크·대기 포함, 서버 처리 제외.");
  card.querySelectorAll(".bar-row").forEach((row, index) => {
    const value = attempt(state.selected[index]);
    if (!value?.count) return;
    row.after(element("span", `p95 ${(value.p95Ms / 1000).toFixed(2)}초 · 모델 호출 ${value.count}번`, "range-note"));
  });
  return card;
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
    box.append(element("div", "비교할 모델 선택 필요.", "empty"));
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
    box.append(element("p", "비용 표시에는 모델 단가 설정의 입력·출력 단가가 필요합니다.", "muted"));
  }
  return box;
}

/**
 * 대표 점수: 자동기입 점수(정밀도를 채움률보다 2배 중시하는 F0.5)와 반복별 범위. 막대 아래에 정밀도와 채움률을 보인다.
 * 자세한 설명은 정답 기준 창에 있다.
 */
function scoreCard() {
  const fill = (model) => report(model)?.autofill;
  const card = bars("자동기입 점수", "높을수록 좋음", (m) => percent(fill(m)?.score), 100, (v) => `${v.toFixed(1)}%`);
  card.querySelectorAll(".bar-row").forEach((row, index) => {
    const autofill = fill(state.selected[index]);
    if (!autofill) {
      row.after(element("span", "자동기입 결과 없음", "range-note"));
      return;
    }
    if (autofill.score == null) {
      row.after(element("span", "확신도 기록 전 실행이라 측정 불가", "range-note"));
      return;
    }
    const values = (report(state.selected[index])?.repetitions ?? []).map((item) => item.autofillScore)
      .filter((value) => value != null).map((value) => value * 100);
    const parts = [`정밀도 ${autofill.precision == null ? "—" : (autofill.precision * 100).toFixed(1) + "%"}`,
      `채움률 ${(autofill.fillRate * 100).toFixed(1)}%`];
    if (values.length > 1) parts.push(`반복 ${values.length}회 범위 ${Math.min(...values).toFixed(1)}~${Math.max(...values).toFixed(1)}%`);
    row.after(element("span", parts.join(" · "), "range-note"));
    // 평가는 다음 요청을 정답으로 만들어, 앞 단계(섹션 분류·학력 구분 선택) 오답은 이 점수에 반영되지 않는다.
    const upstream = report(state.selected[index])?.upstream;
    const upstreamWrong = upstream ? upstream.wrongKey + upstream.unnecessary : 0;
    if (upstreamWrong) row.nextSibling.after(element("span", `앞 단계 오답 ${upstreamWrong}개(섹션 분류·학력 구분) · 실제 제품에선 이보다 낮을 수 있음`, "range-note upstream-note"));
  });
  card.append(element("p", "정밀도 = 넣은 칸 중 맞은 비율 · 채움률 = 넣어야 할 칸 중 맞게 넣은 비율. 잘못 넣으면 놓칠 때보다 2배 크게 깎입니다.", "muted metric-foot"));
  return card;
}

const AUTOFILL_KINDS = [
  { key: "filledCorrect", label: "맞게 넣음", className: "item-correct" },
  { key: "blankCorrect", label: "맞게 비움", className: "item-blank" },
  { key: "missed", label: "놓침", className: "item-missing" },
  { key: "wrong", label: "잘못 넣음", className: "item-wrong" },
];

/**
 * 칸 매핑 답이 사용자 화면에서 어떻게 되는지. 제품처럼 확신도 0.8 이상만 넣은 것으로 보고, 넣지 않은 칸은 정답 유무로
 * 맞게 비움과 놓침을 나눈다. 잘못 넣음은 다른 항목을 넣은 칸과 넣지 말아야 할 칸에 넣은 칸의 합이다.
 */
function renderAutofill() {
  const card = element("div", undefined, "metric");
  const head = element("div", undefined, "metric-head");
  head.append(element("h3", "칸별 결과"), element("span", "사용자 화면 기준 · 칸 수", "muted"));
  card.append(head);
  const legend = element("div", undefined, "item-legend");
  AUTOFILL_KINDS.forEach(({ label, className }) => legend.append(element("span", label, className)));
  card.append(legend);
  if (!state.selected.length) card.append(element("div", "비교할 모델 선택 필요.", "empty"));
  for (const model of state.selected) {
    const autofill = report(model)?.autofill;
    const counts = autofill && { ...autofill.counts, wrong: autofill.counts.filledWrongKey + autofill.counts.filledUnneeded };
    const row = element("div", undefined, "item-row");
    row.style.setProperty("--model", color(model));
    const track = element("div", undefined, "item-track");
    const total = counts ? AUTOFILL_KINDS.reduce((sum, { key }) => sum + counts[key], 0) : 0;
    let text = "자동기입 결과 없음";
    if (counts?.unobserved) text = "확신도 기록 전 실행이라 측정 불가";
    else if (total) {
      AUTOFILL_KINDS.forEach(({ key, label, className }) => {
        const part = element("span", undefined, className);
        part.style.width = `${counts[key] / total * 100}%`;
        part.title = `${label} ${counts[key]}`;
        track.append(part);
      });
      text = `잘못 넣음 ${counts.wrong} (다른 항목 ${counts.filledWrongKey} · 넣지 말 칸 ${counts.filledUnneeded})`
        + ` · 놓침 ${counts.missed} / ${total}칸`;
    }
    row.append(Object.assign(element("span", model), { title: model }), track, element("span", text, "item-numbers"));
    card.append(row);
  }
  card.append(element("p", "놓침에는 확인 필요(0.5~0.8)·막음(0.5 미만)으로 넘긴 칸이 들어갑니다. 놓친 칸은 사용자가 직접 입력합니다.", "muted metric-foot"));
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
/**
 * 진단 구역. 확신도와 무관하게 모델 답 그대로 채점해 어느 단계에서 틀리는지 본다. 기본으로 접어 두고, 다시 그려도
 * 펼친 상태를 유지한다.
 */
function diagnosis() {
  const box = element("details", undefined, "diagnosis");
  box.open = state.diagnosisOpen === true;
  box.addEventListener("toggle", () => { state.diagnosisOpen = box.open; });
  const summary = element("summary");
  summary.append(element("strong", "진단"), element("span", "모델 답 그대로 채점 · 어느 단계에서 틀리는지", "muted"));
  const table = element("table", undefined, "stage-table");
  const head = element("tr");
  ["모델", "전체 항목", "준비", "필드 매핑"].forEach((text) => head.append(element("th", text)));
  const body = element("tbody");
  const cell = (value) => element("td", value == null ? "—" : `${(value * 100).toFixed(1)}%`);
  for (const model of state.selected) {
    const quality = report(model)?.quality;
    const row = element("tr");
    const name = element("td", model, "stage-model");
    name.style.setProperty("--model", color(model));
    row.append(name, cell(quality?.accuracy), cell(quality?.preparationAccuracy), cell(quality?.mappingAccuracy));
    body.append(row);
  }
  const thead = element("thead");
  thead.append(head);
  table.append(thead, body);
  box.append(summary, table, renderItemBreakdown());
  return box;
}

function renderItemBreakdown() {
  const card = element("div", undefined, "metric");
  const head = element("div", undefined, "metric-head");
  head.append(element("h3", "항목 판정"), element("span", "실행 전체 · 항목 수", "muted"));
  card.append(head);
  const legend = element("div", undefined, "item-legend");
  ITEM_KINDS.forEach(({ label, className }) => legend.append(element("span", label, className)));
  card.append(legend);
  if (!state.selected.length) card.append(element("div", "비교할 모델 선택 필요.", "empty"));
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
    row.append(Object.assign(element("span", model), { title: model }), track, numbers);
    card.append(row);
  }
  card.append(element("p", "채점 제외(공급자 사용 불가) 항목은 빠진다. 오답은 틀린 값이 들어갈 위험, 누락은 사용자가 직접 입력해야 하는 칸이다.", "muted metric-foot"));
  return card;
}

const OUTCOMES = {
  FILLED_CORRECT: { label: "맞게 넣음", className: "o-correct", points: 1 },
  BLANK_CORRECT: { label: "맞게 비움", className: "o-blank", points: 1 },
  MISSED: { label: "놓침", className: "o-missed", points: 0 },
  FILLED_WRONG_KEY: { label: "다른 항목", className: "o-wrong", points: -1 },
  FILLED_UNNEEDED: { label: "넣지 말 칸", className: "o-wrong", points: -1 },
  UNOBSERVED: { label: "확인 불가", className: "o-none", points: 0 },
  EXCLUDED: { label: "제외", className: "o-none", points: 0 },
  CORRECT: { label: "정답", className: "o-correct", points: 1 },
  WRONG_KEY: { label: "오답", className: "o-wrong", points: -1 },
  MISSING: { label: "누락", className: "o-missed", points: 0 },
  UNNECESSARY: { label: "불필요 제안", className: "o-wrong", points: -1 },
};
// 항목 종류. 칸 매핑은 사용자 화면 기준(확신도 0.8), 나머지는 모델 답 그대로 채점한다.
const COMPARE_KINDS = [
  { kind: "GENERIC_FIELDS", name: "칸 매핑", noun: "칸" },
  { kind: "SECTION_CLASSIFY", name: "섹션 분류", noun: "섹션" },
  { kind: "INTERACTION_DECISION", name: "학력 구분 선택", noun: "결정" },
];
const CATEGORY_NAMES = { PERSONAL: "기본정보", EDUCATION: "학력", CAREER: "경력", SENSITIVE: "민감정보(병역·보훈·장애)",
  LANGUAGE: "어학", CERTIFICATE: "자격증", PROJECT: "프로젝트", ACTIVITY: "활동", NONE: "해당 없음", MIXED: "여러 범주",
  ABSTAIN: "판단 보류" };
const TARGET_NAMES = { HIGH_SCHOOL: "고등학교 행", ASSOCIATE: "전문대학 행", BACHELOR: "대학교 행", MASTER: "대학원(석사) 행",
  DOCTOR: "대학원(박사) 행" };
const ROLE_NAMES = { ROW_KIND_OPTION: "학력 구분 선택" };
/** 항목의 정답·답을 사람이 읽는 글자로. */
function itemValue(item, value) {
  if (item.kind === "SECTION_CLASSIFY") return value == null ? "답 없음" : `${value} · ${CATEGORY_NAMES[value] ?? value}`;
  if (item.kind === "INTERACTION_DECISION") return value ?? "고르지 않음";
  return value ?? "넣을 항목 없음";
}
const itemLabel = (item) => item.kind === "SECTION_CLASSIFY" ? sectionTitle({ title: item.label })
  : item.kind === "INTERACTION_DECISION" ? TARGET_NAMES[item.label] ?? item.label ?? item.itemId : item.label ?? item.itemId;
function itemGroup(item) {
  const screen = STATE_NAMES[item.state] ?? item.state;
  if (item.kind === "SECTION_CLASSIFY") return `${screen} · ${item.stage === "PREPARATION" ? "준비 단계" : "필드 단계"}`;
  if (item.kind === "INTERACTION_DECISION") return `${screen} · ${ROLE_NAMES[item.group] ?? item.group ?? "선택 결정"}`;
  return `${screen} · ${sectionTitle({ title: item.group })}`;
}
const FIELD_FILTERS = [["diff", "모델끼리 다른"], ["wrong", "틀린"], ["missed", "놓친"], ["changed", "기준 대비 바뀐"], ["all", "전체"]];
const fieldKey = (item) => `${item.caseId}/${item.stage}/${item.kind}/${item.itemId}`;
const WRONG = new Set(["FILLED_WRONG_KEY", "FILLED_UNNEEDED", "WRONG_KEY", "UNNECESSARY"]);
const MISSED = new Set(["MISSED", "MISSING"]);

/** 칸 하나의 반복별 판정 요약. 가장 많은 판정, 반복이 갈렸는지, 점수(맞음 +1, 놓침 0, 잘못 넣음 −1의 평균). */
function cellOf(field) {
  if (!field?.answers.length) return null;
  const counts = {};
  field.answers.forEach(({ outcome }) => { counts[outcome] = (counts[outcome] ?? 0) + 1; });
  const [main, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { main, count, total: field.answers.length, counts,
    points: field.answers.reduce((sum, { outcome }) => sum + OUTCOMES[outcome].points, 0) / field.answers.length };
}

/** 실행의 항목별 답. 한 번 받은 결과는 다시 받지 않는다. 받는 중이면 null이고, 끝나면 다시 그린다. */
function runFields(run) {
  if (!run) return undefined;
  const cached = state.fields[run.id];
  if (cached === undefined) {
    state.fields[run.id] = null;
    api(`/runs/${run.id}/items`).then((fields) => { state.fields[run.id] = fields; })
      .catch(() => { state.fields[run.id] = []; }).finally(() => { if (state.page === "fields") renderFields(); });
    return null;
  }
  return cached;
}

/** 같은 데이터셋 버전으로 돌린 다른 비교 묶음. 기준 실행 후보다. */
function baselineGroups() {
  const current = groupRuns(state.group)[0]?.run;
  if (!current) return [];
  return [...new Set(state.runs.map(({ run }) => groupKey(run)))].filter((key) => key !== state.group
    && groupRuns(key).some(({ run }) => done(run) && run.versions.datasetVersion === current.versions.datasetVersion));
}

/**
 * 항목별 비교. 고른 종류(칸 매핑·섹션 분류·학력 구분 선택)의 답을 항목×모델 표로 놓고, 기준 실행을 고르면 같은 모델끼리
 * 항목마다 개선·악화를 표시한다. 행을 누르면 반복별 답과 확신도를 펼친다.
 */
function renderFields() {
  const page = $("#cf-fields");
  const models = state.selected;
  const runs = Object.fromEntries(models.map((model) => [model, latest(model)?.run]));
  const bases = Object.fromEntries(models.map((model) => [model, state.baseline
    ? groupRuns(state.baseline).find(({ run }) => done(run) && modelKey(run) === model)?.run : undefined]));
  const kind = COMPARE_KINDS.find((entry) => entry.kind === state.itemKind) ?? COMPARE_KINDS[0];
  const ofKind = (list) => list && list.filter((item) => item.kind === kind.kind);
  const data = Object.fromEntries(models.map((model) => [model, ofKind(runFields(runs[model]))]));
  const baseData = Object.fromEntries(models.map((model) => [model, ofKind(runFields(bases[model]))]));

  const head = element("div", undefined, "fields-head");
  const title = element("div");
  title.append(element("h2", "항목별 비교"), element("p", kind.kind === "GENERIC_FIELDS"
    ? "칸 매핑 답을 칸마다 모델끼리, 기준 실행과 비교합니다. 확신도 0.8 이상만 넣은 것으로 봅니다."
    : `${kind.name} 답을 항목마다 모델끼리, 기준 실행과 비교합니다. 확신도와 무관하게 모델 답 그대로 채점합니다.`, "muted"));
  const controls = element("div", undefined, "fields-controls");
  const baseSelect = element("select");
  baseSelect.setAttribute("aria-label", "기준 실행");
  baseSelect.append(Object.assign(element("option", "기준 실행 없음"), { value: "" }),
    ...baselineGroups().map((key) => Object.assign(element("option", `기준: ${groupLabel(key)}`), { value: key })));
  baseSelect.value = state.baseline;
  baseSelect.addEventListener("change", () => { state.baseline = baseSelect.value; renderFields(); });
  const screenSelect = element("select");
  screenSelect.setAttribute("aria-label", "화면");
  const states = [...new Set((state.dataset?.cases ?? []).map((item) => item.state))];
  screenSelect.append(Object.assign(element("option", "모든 화면"), { value: "all" }),
    ...states.map((key) => Object.assign(element("option", STATE_NAMES[key] ?? key), { value: key })));
  screenSelect.value = state.fieldScreen;
  screenSelect.addEventListener("change", () => { state.fieldScreen = screenSelect.value; renderFields(); });
  controls.append(baseSelect, screenSelect);
  head.append(title);
  const kinds = element("div", undefined, "stage item-kinds");
  kinds.setAttribute("aria-label", "항목 종류");
  COMPARE_KINDS.forEach((entry) => {
    const button = element("button", entry.name);
    button.type = "button";
    button.setAttribute("aria-pressed", String(entry.kind === kind.kind));
    button.addEventListener("click", () => { state.itemKind = entry.kind; state.openField = null; renderFields(); });
    kinds.append(button);
  });
  // 종류 전환은 왼쪽, 기준 실행·화면 선택은 오른쪽 한 줄에 둔다.
  const toolbar = element("div", undefined, "fields-toolbar");
  toolbar.append(kinds, controls);
  head.append(toolbar);

  if (!models.length) {
    page.replaceChildren(head, element("div", "비교할 모델 선택 필요.", "empty"));
    return;
  }
  if (models.some((model) => data[model] === null) || models.some((model) => baseData[model] === null)) {
    page.replaceChildren(head, element("div", "항목별 답을 불러오는 중.", "empty"));
    return;
  }

  // 칸 목록은 고른 모델의 답을 합친 순서(데이터셋 순서)다.
  const rows = new Map();
  for (const model of models) (data[model] ?? []).forEach((field) => { if (!rows.has(fieldKey(field))) rows.set(fieldKey(field), field); });
  const index = (list) => new Map((list ?? []).map((field) => [fieldKey(field), field]));
  const byModel = Object.fromEntries(models.map((model) => [model, index(data[model])]));
  const baseByModel = Object.fromEntries(models.map((model) => [model, index(baseData[model])]));
  const delta = (model, key) => {
    const now = cellOf(byModel[model].get(key));
    const before = cellOf(baseByModel[model].get(key));
    if (!now || !before) return 0;
    return Math.sign(Math.round((now.points - before.points) * 1000));
  };

  // 모델별 요약: 칸 수(반복 합)와 기준 대비 개선·악화 칸 수.
  const summary = element("div", undefined, "fields-summary");
  for (const model of models) {
    const card = element("div", undefined, "fields-model");
    card.style.setProperty("--model", color(model));
    const fields = data[model] ?? [];
    const tally = {};
    fields.forEach((field) => field.answers.forEach(({ outcome }) => { tally[outcome] = (tally[outcome] ?? 0) + 1; }));
    card.append(element("strong", model, "row-name"));
    if (!runs[model]) card.append(element("span", "끝난 실행 없음", "muted"));
    else if (!fields.length) card.append(element("span", "항목별 답 없음(데이터셋 확인 불가)", "muted"));
    else if (kind.kind === "GENERIC_FIELDS") {
      card.append(element("span", `맞게 넣음 ${tally.FILLED_CORRECT ?? 0} · 잘못 넣음 ${(tally.FILLED_WRONG_KEY ?? 0) + (tally.FILLED_UNNEEDED ?? 0)} · 놓침 ${tally.MISSED ?? 0}`, "muted"));
    }
    else {
      card.append(element("span", `정답 ${tally.CORRECT ?? 0} · 오답 ${(tally.WRONG_KEY ?? 0) + (tally.UNNECESSARY ?? 0)} · 누락 ${tally.MISSING ?? 0}`, "muted"));
    }
    if (state.baseline) {
      if (!bases[model]) card.append(element("span", "기준 실행에 이 모델 없음", "muted"));
      else {
        const keys = [...rows.keys()];
        const better = keys.filter((key) => delta(model, key) > 0).length;
        const worse = keys.filter((key) => delta(model, key) < 0).length;
        const changes = changedConditions(runs[model], bases[model]);
        card.append(element("span", changes.length ? `달라진 조건: ${changes.join(", ")}` : "조건 같음(코드·프롬프트·설정)",
          changes.length ? "fields-changes" : "muted"));
        const line = element("span", undefined, "fields-delta");
        line.append(element("b", `개선 ${better}${kind.noun === "칸" ? "칸" : "개"}`, "up"), element("span", " · "),
          element("b", `악화 ${worse}${kind.noun === "칸" ? "칸" : "개"}`, "down"));
        card.append(line);
      }
    }
    summary.append(card);
  }

  const chips = element("div", undefined, "fields-chips");
  FIELD_FILTERS.filter(([key]) => key !== "changed" || state.baseline).forEach(([key, label]) => {
    const chip = element("button", key === "all" ? label : `${label} ${kind.noun}`);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(state.fieldFilter === key));
    chip.addEventListener("click", () => { state.fieldFilter = key; renderFields(); });
    chips.append(chip);
  });
  const filter = state.fieldFilter === "changed" && !state.baseline ? "diff" : state.fieldFilter;
  const keep = (key, field) => {
    if (state.fieldScreen !== "all" && field.state !== state.fieldScreen) return false;
    const cells = models.map((model) => cellOf(byModel[model].get(key)));
    if (filter === "all") return true;
    if (filter === "diff") return new Set(cells.map((cell) => cell?.main)).size > 1 || cells.some((cell) => cell && cell.count < cell.total);
    if (filter === "wrong") return cells.some((cell) => cell && Object.keys(cell.counts).some((outcome) => WRONG.has(outcome)));
    if (filter === "missed") return cells.some((cell) => cell && Object.keys(cell.counts).some((outcome) => MISSED.has(outcome)));
    return models.some((model) => delta(model, key) !== 0);
  };
  const visible = [...rows.entries()].filter(([key, field]) => keep(key, field));

  const table = element("table", undefined, "fields-table");
  const thead = element("thead");
  const headRow = element("tr");
  headRow.append(element("th", kind.noun === "결정" ? "대상" : kind.noun), element("th", "정답"));
  models.forEach((model) => {
    const th = element("th", model, "model-col");
    th.style.setProperty("--model", color(model));
    headRow.append(th);
  });
  thead.append(headRow);
  const body = element("tbody");
  let group = null;
  for (const [key, field] of visible) {
    const groupName = itemGroup(field);
    if (groupName !== group) {
      group = groupName;
      const groupRow = element("tr", undefined, "fields-group");
      const cell = element("th", groupName);
      cell.colSpan = models.length + 2;
      groupRow.append(cell);
      body.append(groupRow);
    }
    const row = element("tr", undefined, "fields-row");
    row.tabIndex = 0;
    row.setAttribute("aria-expanded", String(state.openField === key));
    const labelCell = element("td", undefined, "field-label");
    labelCell.append(element("span", itemLabel(field)));
    if (field.control) labelCell.append(element("span", CONTROL_NAMES[field.control] ?? field.control, "muted"));
    row.append(labelCell, element("td", itemValue(field, field.expected), field.expected ? "field-key" : "field-key none"));
    for (const model of models) {
      const td = element("td");
      const cell = cellOf(byModel[model].get(key));
      if (!cell) td.append(element("span", "—", "muted"));
      else {
        const chip = element("span", OUTCOMES[cell.main].label, `outcome ${OUTCOMES[cell.main].className}`);
        td.append(chip);
        if (cell.count < cell.total) td.append(element("span", `${cell.count}/${cell.total}`, "outcome-mixed"));
        const change = state.baseline ? delta(model, key) : 0;
        if (change) td.append(element("span", change > 0 ? "▲" : "▼", change > 0 ? "up" : "down"));
      }
      row.append(td);
    }
    const toggle = () => { state.openField = state.openField === key ? null : key; renderFields(); };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } });
    body.append(row);
    if (state.openField === key) body.append(fieldDetail(key, models, byModel, baseByModel));
  }
  table.append(thead, body);
  const wrap = element("div", undefined, "table-wrap fields-wrap");
  if (visible.length) wrap.append(table);
  else {
    // 거른 결과가 없으면 이유와 함께 전체 보기로 바로 넘어갈 수 있게 한다.
    const empty = element("div", undefined, "fields-empty");
    empty.append(element("span", `조건에 맞는 ${kind.noun} 없음 · 전체 ${rows.size}개`));
    if (filter !== "all") {
      const all = element("button", "전체 보기");
      all.type = "button";
      all.addEventListener("click", () => { state.fieldFilter = "all"; renderFields(); });
      empty.append(all);
    }
    wrap.append(empty);
  }
  const filterbar = element("div", undefined, "fields-filters");
  filterbar.append(chips, element("span", `${visible.length} / ${rows.size}개`, "muted fields-count"));
  const foot = element("p", `반복이 갈린 항목은 가장 많은 판정과 횟수(예: 2/3)를 보입니다. ${state.baseline ? "개선·악화는 맞음 +1, 놓침·누락 0, 틀림 −1의 반복 평균을 같은 모델의 기준 실행과 비교합니다." : ""}`, "muted metric-foot");
  page.replaceChildren(head, summary, filterbar, wrap, foot);
}

/** 펼친 칸의 반복별 답·확신도. 기준 실행이 있으면 그 답도 함께 보인다. */
function fieldDetail(key, models, byModel, baseByModel) {
  const row = element("tr", undefined, "fields-detail");
  const cell = element("td");
  cell.colSpan = models.length + 2;
  const grid = element("div", undefined, "detail-grid");
  const answers = (field, title) => {
    const box = element("div");
    box.append(element("h5", title));
    if (!field?.answers.length) box.append(element("p", "답 없음", "muted"));
    else field.answers.forEach((answer) => {
      const line = element("div", undefined, "answer-line");
      line.append(element("span", `${answer.repetition}회`, "muted"),
        element("code", answer.value == null && field.kind === "GENERIC_FIELDS" ? "비움" : itemValue(field, answer.value)),
        element("span", answer.confidence == null ? "확신도 —" : `확신도 ${answer.confidence.toFixed(2)}`, "muted"),
        element("span", OUTCOMES[answer.outcome].label, `outcome ${OUTCOMES[answer.outcome].className}`));
      box.append(line);
    });
    return box;
  };
  for (const model of models) {
    const column = element("div", undefined, "detail-model");
    column.style.setProperty("--model", color(model));
    column.append(element("strong", model, "row-name"), answers(byModel[model].get(key), "이번 실행"));
    if (state.baseline) column.append(answers(baseByModel[model].get(key), "기준 실행"));
    grid.append(column);
  }
  cell.append(grid);
  row.append(cell);
  return row;
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
  $("#cf-overview").hidden = state.page !== "overview";
  $("#cf-tokens").hidden = state.page !== "tokens";
  $("#cf-fields").hidden = state.page !== "fields";
  root.querySelectorAll("[data-page]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.page === state.page)));
  root.querySelectorAll("[data-stage]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stage === state.stage)));
  renderProgress();
  renderOverview();
  renderTokens();
  if (state.page === "fields") renderFields();
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
  const pendingRun = groupRuns(state.group).some(({ run }) => ACTIVE.includes(run.status));
  $("#record-delete").disabled = !state.group || pendingRun;
  $("#record-delete").title = !state.group ? "삭제할 기록 없음" : pendingRun ? "진행 중인 실행이 있어 삭제할 수 없음" : "이 비교 기록 삭제";
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

/**
 * 비교 기록 삭제 확인. 묶음의 모델별 실행, 호출 결과, 재채점 이력을 지우고 프롬프트 원문은 남긴다. 되돌릴 수 없다.
 */
function confirmDelete(key) {
  if (!key) return;
  const runs = groupRuns(key).map(({ run }) => run);
  const box = element("div", undefined, "delete-confirm");
  box.append(element("p", `"${groupLabel(key)}" 비교 기록을 삭제합니다.`, "delete-title"),
    element("p", `모델 ${runs.length}개(${runs.map(modelKey).join(", ")})의 실행, 호출 결과, 재채점 이력이 지워집니다. 프롬프트 원문은 남습니다. 되돌릴 수 없습니다.`, "muted"));
  const message = element("p", "", "muted delete-message");
  const actions = element("div", undefined, "delete-actions");
  const cancel = element("button", "취소", "secondary-action");
  cancel.type = "button";
  cancel.addEventListener("click", () => $("#cf-source").close());
  const remove = element("button", "삭제", "danger-action");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      await api(`/records/${encodeURIComponent(key)}`, "DELETE");
      $("#cf-source").close();
      runs.forEach((run) => { delete state.fields[run.id]; });
      if (state.baseline === key) state.baseline = "";
      state.group = null;
      await load();
    } catch (error) {
      message.textContent = error.message.startsWith("이미 진행 중") ? "진행 중인 실행이 있어 삭제할 수 없습니다." : error.message;
      remove.disabled = false;
    }
  });
  actions.append(cancel, remove);
  box.append(message, actions);
  dialog("기록 삭제", box, "delete-dialog");
}

function dialog(title, content, className) {
  const box = $("#cf-source");
  box.className = `detail ${className ?? ""}`;
  $("#cf-source-title").textContent = title;
  $("#source-content").replaceChildren(content);
  if (!box.open) box.showModal();
}

const STATE_NAMES = { initial: "처음 화면", "high-school": "고등학교", university: "대학교", ged: "검정고시" };
// 화면 상태 설명. 같은 지원서라도 무엇을 골랐는지에 따라 나타나는 칸이 달라 상태별로 따로 평가한다.
const STATE_NOTES = {
  initial: "지원서를 처음 연 상태. 아무것도 고르지 않아 학력 행에는 '구분' 선택칸만 있습니다. 제품이 학력 구분을 직접 고르는 준비 단계까지 평가합니다.",
  "high-school": "학력 구분 '고등학교', 보훈·장애 '대상'을 고른 뒤 펼쳐진 화면. 고등학교 학력 칸과 보훈·장애 상세 칸이 나타납니다.",
  university: "학력 구분 '대학교', 보훈·장애 '대상'을 고른 뒤 펼쳐진 화면. 대학 학력 칸(전공 포함)과 보훈·장애 상세 칸이 나타납니다.",
  ged: "학력 구분 '검정고시'만 고른 화면. 학교·전공 칸 없이 '합격연월' 칸 하나만 나타납니다.",
};
const CONTROL_NAMES = { text: "글자", select: "선택", radio: "라디오", checkbox: "체크", textarea: "긴 글", custom: "직접 구현" };
const CALL_NAMES = { SECTION_CLASSIFY: "섹션 분류", INTERACTION_DECISION: "학력 구분 선택", GENERIC_FIELDS: "칸 매핑" };
const REVIEW_NAMES = { privacy: "개인정보", structure: "구조", mappingTruth: "칸 정답", preparationTruth: "준비 정답",
  inputIdentity: "입력 동일성" };
const REVIEW_OK = new Set(["PASSED", "HUMAN_REVIEWED", "SOURCE_PIPELINE_VERIFIED", "INSTALLED_VERIFIED"]);

const CONTROL_ICONS = { text: "▭", select: "▾", radio: "◉", checkbox: "☑", textarea: "¶" };
const STEP_APIS = { SECTION_CLASSIFY: "/generic/sections/classify", INTERACTION_DECISION: "/generic/interaction-decisions",
  GENERIC_FIELDS: "/generic/fields/analyze" };
const sectionTitle = (group) => !group.title ? "제목 없음" : group.title === "[비식별]" ? "기본정보" : group.title;

/**
 * 데이터셋 대화상자. 왼쪽에 화면 상태 목록과 합성 프로필, 오른쪽에 고른 화면의 설명·채점 흐름·지원서 와이어프레임을 둔다.
 * {@code selected}가 "profile"이면 합성 프로필을 보인다.
 */
function datasetView(selected = 0) {
  const data = state.dataset;
  if (!data) return element("p", "데이터셋을 불러오지 못했습니다.", "muted");
  const wrap = element("div", undefined, "dataset-view");
  const count = (item) => item.sections.reduce((n, group) => n + group.fields.length, 0);
  const head = element("div", undefined, "dataset-head");
  const title = element("div");
  title.append(element("strong", "우아한형제들 · 공고 R2605009"),
    element("span", `화면 ${data.cases.length}개 · 입력 칸 ${data.cases.reduce((n, item) => n + count(item), 0)}개 · 합성 프로필 ${Object.keys(data.profiles).length}명`, "muted"));
  head.append(title, element("span", data.usable ? "평가에 사용 가능" : "검토 필요", data.usable ? "badge ok" : "badge"));
  wrap.append(head);
  const about = element("details", undefined, "dataset-about");
  about.append(element("summary", "이 데이터셋이란"),
    element("p", "실제 채용 지원서 하나를 개인정보 없이 정제한 화면 모음. 학력 구분·보훈·장애 선택에 따라 나타나는 칸이 달라 화면 상태마다 따로 평가합니다. 모델은 확장프로그램이 실제로 보내는 질문에 답하고, 사람이 검토한 정답과 비교해 채점합니다."));
  wrap.append(about);
  if (!data.usable && data.rejection) wrap.append(element("p", `미완료 검토: ${data.rejection}`, "muted"));
  const layout = element("div", undefined, "dataset-layout2");
  const nav = element("nav", undefined, "screen-list");
  const go = (target) => dialog("데이터셋", datasetView(target), "dataset-dialog");
  data.cases.forEach((item, index) => {
    const button = element("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(selected === index));
    button.append(element("strong", STATE_NAMES[item.state] ?? item.state),
      element("span", `${count(item)}칸 · 호출 ${item.calls.length}개`, "muted"));
    button.addEventListener("click", () => go(index));
    nav.append(button);
  });
  const profileButton = element("button", undefined, "profile-entry");
  profileButton.type = "button";
  profileButton.setAttribute("aria-pressed", String(selected === "profile"));
  profileButton.append(element("strong", "합성 프로필"), element("span", "가상 지원자 정보", "muted"));
  profileButton.addEventListener("click", () => go("profile"));
  nav.append(profileButton);
  layout.append(nav);
  const main = element("div", undefined, "screen-detail");
  if (selected === "profile") {
    main.append(element("h3", "합성 프로필"), element("p", "평가용 가상 지원자. 실제 지원자 정보가 아닙니다. 모델에는 이 값이 아니라 화면 구조만 전달됩니다.", "state-note"));
    Object.entries(data.profiles).forEach(([id, profile]) => main.append(element("h5", id), profileTable(profile)));
  }
  else {
    const item = data.cases[selected];
    const top = element("div", undefined, "screen-title");
    top.append(element("h3", STATE_NAMES[item.state] ?? item.state),
      element("span", item.split === "tuning" ? "튜닝용" : "최종 평가용", "badge"));
    main.append(top);
    if (STATE_NOTES[item.state]) main.append(element("p", STATE_NOTES[item.state], "state-note"));
    // 채점 흐름: 준비 요청과 필드 요청으로 묶어 단계와 API를 보인다.
    const flow = element("div", undefined, "score-flow");
    [["PREPARATION", "준비 요청", "칸을 꺼내기 위한 질문"], ["MAPPING", "필드 요청", "칸에 넣을 값을 정하는 질문"]].forEach(([stage, name, note]) => {
      const calls = item.calls.filter((call) => call.stage === stage);
      if (!calls.length) return;
      const lane = element("div", undefined, "flow-lane");
      const laneHead = element("div", undefined, "lane-head");
      laneHead.append(element("strong", name), element("span", note, "muted"));
      lane.append(laneHead);
      const steps = element("ol", undefined, "flow-steps");
      calls.forEach((call) => {
        const step = element("li");
        step.append(element("span", String(call.order), "flow-no"), element("strong", CALL_NAMES[call.kind] ?? call.kind),
          element("span", `${call.items}항목`, "flow-items"), element("code", STEP_APIS[call.kind] ?? "", "flow-api"));
        steps.append(step);
      });
      lane.append(steps);
      flow.append(lane);
    });
    main.append(element("h4", "채점 흐름"), flow);
    // 지원서 와이어프레임: 섹션 카드와 칸 아이콘. 처음 화면보다 칸이 늘어난 섹션에 배지를 단다.
    const base = data.cases.find((other) => other.state === "initial");
    const samePlan = base && base !== item && base.sections.length === item.sections.length;
    const form = element("div", undefined, "form-wire");
    item.sections.forEach((group, index) => {
      const card = element("section", undefined, "wire-section");
      const cardHead = element("div", undefined, "wire-head");
      cardHead.append(element("strong", sectionTitle(group)), element("span", `${group.fields.length}칸`, "muted"));
      const delta = samePlan ? group.fields.length - base.sections[index].fields.length : 0;
      if (delta > 0) cardHead.append(element("span", `+${delta}칸`, "badge ok"));
      card.append(cardHead);
      group.fields.forEach((field) => {
        const row = element("div", undefined, `wire-field control-${field.control}`);
        row.append(element("span", CONTROL_ICONS[field.control] ?? "·", "wire-icon"), element("span", field.label ?? "이름 없음"),
          element("span", CONTROL_NAMES[field.control] ?? field.control, "wire-kind"));
        card.append(row);
      });
      form.append(card);
    });
    main.append(element("h4", `지원서 화면 · 입력 칸 ${count(item)}개`), form);
    const badges = element("div", undefined, "review-badges");
    Object.entries(item.review).filter(([key]) => REVIEW_NAMES[key]).forEach(([key, value]) =>
      badges.append(element("span", `${REVIEW_NAMES[key]} ${REVIEW_OK.has(value) ? "확인" : value}`,
        REVIEW_OK.has(value) ? "badge ok" : "badge")));
    main.append(element("h4", "검토 상태"), badges);
  }
  layout.append(main);
  wrap.append(layout);
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

/** 정답 기준 대화상자. 대표 점수(자동기입 점수)와 칸별 결과, 정답 기준, 진단 지표, 흔들림을 예시와 함께 보인다. */
function criteriaView() {
  const wrap = element("div", undefined, "criteria-view");
  const formula = element("div", undefined, "criteria-formula");
  formula.append(element("span", "자동기입 점수", "formula-name"), element("span", "="),
    element("span", "정밀도", "formula-part"), element("span", "×2 와"), element("span", "채움률", "formula-part"),
    element("span", "의 조화 평균(F0.5)"));
  wrap.append(formula, element("p", "사용자 화면 기준 점수. 잘못 넣은 칸은 사용자가 찾아서 고쳐야 하고 그대로 제출될 위험이 있지만, 놓친 칸은 직접 입력하면 됩니다. 그래서 잘못 넣으면 놓칠 때보다 2배 크게 깎습니다. 아무것도 넣지 않으면 0점입니다.", "muted criteria-lead"));
  const card = (title, ...children) => {
    const section = element("section", undefined, "criteria-card");
    section.append(element("h4", title), ...children);
    wrap.append(section);
  };
  const table = (head, rows) => {
    const box = element("table", undefined, "criteria-table criteria-grid");
    const thead = element("thead");
    const headRow = element("tr");
    head.forEach((text) => headRow.append(element("th", text)));
    thead.append(headRow);
    const body = element("tbody");
    rows.forEach((cells) => {
      const row = element("tr");
      cells.forEach((text) => row.append(element("td", text)));
      body.append(row);
    });
    box.append(thead, body);
    return box;
  };
  card("1. 칸별 결과",
    element("p", "칸 매핑 답을 확장프로그램과 같은 확신도 기준으로 봅니다. 0.8 이상만 자동기입, 0.5~0.8은 사용자 확인, 0.5 미만은 막음."),
    table(["결과", "뜻", "사용자 입장"], [["맞게 넣음", "정답 항목을 자동기입", "이득"], ["맞게 비움", "넣을 항목이 없는 칸을 넣지 않음", "이득"],
      ["놓침", "정답이 있는데 넣지 않음(비움·확인 필요·막음)", "직접 입력"], ["잘못 넣음", "다른 항목을 넣거나 넣지 말아야 할 칸에 넣음", "찾아서 고쳐야 함"]]),
    table(["지표", "계산"], [["정밀도", "맞게 넣음 ÷ 넣은 칸"], ["채움률", "맞게 넣음 ÷ 정답이 있는 칸"]]),
    element("p", "확장프로그램의 이름 칸 보정, 정확히 일치하는 값 올림 규칙은 반영하지 않습니다. OpenAI 확신도는 모델이 스스로 적은 값입니다.", "muted"));
  card("2. 정답 기준",
    element("p", "칸이 뜻하는 지원 프로필 항목이 정답. 지원자가 그 값을 가졌는지는 따지지 않습니다. 지원 프로필 항목에 없는 의미면 정답은 '넣을 항목 없음'."),
    table(["예시", "정답"], [["학교명 칸(대학교 행)", "education.university.schoolName"], ["자기소개서 칸", "넣을 항목 없음"],
      ["지원경로 섹션", "해당 없음(NONE)"]]));
  card("3. 진단 지표",
    element("p", "확신도와 무관하게 모델 답 그대로 채점합니다. 맞힌 항목 ÷ 채점한 항목이며 항목은 섹션 하나, 칸 하나, 버튼·선택지 결정 하나. 준비는 칸을 꺼내기 위한 질문(조작할 섹션 분류, 학력 구분 선택), 필드는 칸에 넣을 값을 정하는 질문(전체 섹션 분류, 칸 매핑)."),
    table(["항목 판정", "뜻"], [["오답", "정답이 있는데 다른 항목을 고름"], ["누락(판단 보류)", "정답이 있는데 고르지 않음"],
      ["불필요 제안", "넣을 항목이 없는데 무언가를 고름"]]));
  card("4. 점수에서 빠지는 것",
    table(["경우", "처리"], [["타임아웃·API 오류·응답 형식 오류", "점수에서 빼고 실패율에 넣음"],
      ["공급자를 쓸 수 없어 답하지 못한 항목", "그 항목만 채점에서 뺌"], ["채점할 항목이 하나도 없는 호출", "채점 불가로 실패율에 넣음"],
      ["확신도를 기록하기 전 실행", "자동기입 점수 측정 불가"]]));
  card("5. 반복별 범위",
    element("p", "같은 입력을 반복마다 따로 채점한 자동기입 점수의 최소~최대. 두 모델의 범위가 겹치면 차이를 구분할 수 없습니다."),
    element("p", "반복 수가 적으면 범위가 실제보다 좁게 잡힙니다. 같은 입력을 새로 실행하면 범위 밖으로 움직일 수 있습니다.", "muted"));
  return wrap;
}

// 프롬프트 조각을 그 조각을 보내는 제품 API별로 묶는다. 공급자 고정 문구는 모든 요청에 붙는다.
const PROMPT_APIS = [
  { prefix: "section-classification", path: "POST /api/v1/generic/sections/classify", name: "섹션 분류",
    note: "섹션이 어느 프로필 범주인지 묻는 질문" },
  { prefix: "generic-fields", path: "POST /api/v1/generic/fields/analyze", name: "칸 매핑",
    note: "칸마다 어떤 프로필 항목을 넣을지 묻는 질문" },
  { prefix: "interaction-decisions", path: "POST /api/v1/generic/interaction-decisions", name: "버튼·선택지 결정",
    note: "학력 구분, 행 추가, 검색 팝업처럼 화면을 조작할 대상을 묻는 질문" },
  { prefix: "", path: "모든 요청 공통", name: "공급자 고정 문구", note: "공급자 연결부가 질문 앞에 붙이는 시스템 문구" },
];
const PART_NAMES = { instructions: "지시문", confusionBoundaries: "헷갈리기 쉬운 경계", englishNameGuidance: "영문 이름 안내",
  system: "시스템 문구" };
const ROLE_FAMILIES = [
  { match: /^ROW_KIND_OPTION/, name: "학력 구분 선택지" }, { match: /^CALENDAR_/, name: "달력 조작" },
  { match: /^SEARCH_/, name: "검색 팝업 조작" }, { match: /^(REPEAT_ADD|SECTION_REVEAL)$/, name: "행 추가·섹션 펼치기" },
];
const apiOf = (name) => PROMPT_APIS.find((api) => api.prefix && name.startsWith(`${api.prefix}/`)) ?? PROMPT_APIS[3];
const localName = (name) => name.split("/").slice(1).join("/") || name;
const isCriterion = (name) => localName(name).startsWith("criterion.");
const roleOf = (name) => localName(name).startsWith("instructions.") ? localName(name).slice("instructions.".length) : null;
/** 사람이 읽는 조각 이름. 선택지는 선택지 키, 역할별 지시문은 역할 이름을 쓴다. */
const partLabel = (name) => isCriterion(name) ? `선택지 ${localName(name).slice("criterion.".length)}`
  : roleOf(name) ? `지시문 · ${roleOf(name)}` : PART_NAMES[localName(name)] ?? localName(name);

/** 읽기 좋게 문장마다 줄을 나누고 범주·역할 같은 대문자 키와 {자리표시자}를 강조한다. 원문은 바꾸지 않는다. */
function sentences(text) {
  return text.split("\n").flatMap((line) => line.split(/(?<=[.;])\s+(?=[A-Z{])/)).filter((line) => line.trim());
}
function readable(text) {
  const box = element("div", undefined, "prompt-text");
  sentences(text).forEach((sentence) => {
    const line = element("p");
    sentence.split(/(\{[A-Za-z]+\}|\b[A-Z][A-Z0-9_]{2,}(?:\.[A-Z0-9_]+)*\b)/).forEach((piece, index) =>
      line.append(index % 2 ? element("code", piece) : document.createTextNode(piece)));
    box.append(line);
  });
  return box;
}

/** 프롬프트 전체를 API별로. 지시문은 펼치고, 역할별 지시문은 종류별로, 선택지 설명은 검색되는 표로 접는다. */
function renderPromptGroups(parts) {
  const wrap = element("div");
  for (const api of PROMPT_APIS) {
    const own = Object.keys(parts).filter((name) => apiOf(name) === api);
    if (!own.length) continue;
    const box = element("details", undefined, "prompt-group");
    box.open = true;
    const summary = element("summary");
    summary.append(element("code", api.path, "api-path"), element("strong", api.name), element("span", api.note, "muted"));
    box.append(summary);
    own.filter((name) => !isCriterion(name) && !roleOf(name)).forEach((name) => {
      const part = element("section", undefined, "prompt-part");
      part.append(element("h5", partLabel(name)), readable(parts[name]));
      box.append(part);
    });
    const roles = own.filter((name) => roleOf(name));
    ROLE_FAMILIES.forEach((family) => {
      const members = roles.filter((name) => family.match.test(roleOf(name)));
      if (!members.length) return;
      const fold = element("details", undefined, "criteria-fold");
      fold.append(element("summary", `지시문 · ${family.name} (${members.length}가지 역할)`));
      members.forEach((name) => {
        const part = element("section", undefined, "prompt-part");
        part.append(element("h5", roleOf(name)), readable(parts[name]));
        fold.append(part);
      });
      box.append(fold);
    });
    const criteria = own.filter(isCriterion);
    if (criteria.length) {
      const list = element("details", undefined, "criteria-fold");
      list.append(element("summary", `선택지 설명 (${criteria.length})`));
      const table = element("table", undefined, "criteria-table");
      const body = element("tbody");
      criteria.forEach((name) => {
        const row = element("tr");
        row.append(element("td", localName(name).slice("criterion.".length)), element("td", parts[name]));
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

/** 문장 단위 차이(최장 공통 부분열). 각 줄은 " "(같음), "-"(삭제), "+"(추가)다. */
function lineDiff(before, after) {
  const a = sentences(before);
  const b = sentences(after);
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
  const rows = kind === "added" ? sentences(after).map((line) => ["+", line])
    : kind === "removed" ? sentences(before).map((line) => ["-", line]) : lineDiff(before, after);
  const card = element("details", undefined, "diff-card");
  card.open = true;
  const head = element("summary", undefined, "diff-head");
  head.append(element("span", { added: "추가", removed: "삭제", changed: "변경" }[kind], `diff-badge ${kind}`),
    element("strong", partLabel(name)), element("span", `+${rows.filter(([sign]) => sign === "+").length}`, "stat-add"),
    element("span", `−${rows.filter(([sign]) => sign === "-").length}`, "stat-del"));
  card.append(head);
  const table = element("table", undefined, "diff-table");
  const columns = element("colgroup");
  columns.append(element("col", undefined, "diff-sign-col"), element("col"));
  table.append(columns);
  const body = element("tbody");
  // 바뀐 문장 앞뒤 한 문장만 남기고 나머지 같은 문장은 접는다.
  const near = (index) => [-1, 0, 1].some((step) => rows[index + step] && rows[index + step][0] !== " ");
  let hidden = 0;
  const flush = () => {
    if (!hidden) return;
    const row = element("tr", undefined, "diff-fold");
    const cell = element("td", `… 변경 없는 문장 ${hidden}개`);
    cell.colSpan = 2;
    row.append(cell);
    body.append(row);
    hidden = 0;
  };
  // 바로 붙은 삭제·추가 문장은 같은 앞뒤를 빼고 달라진 가운데만 강조한다.
  rows.forEach(([sign, text], index) => {
    if (sign === " " && !near(index)) {
      hidden += 1;
      return;
    }
    flush();
    const row = element("tr", undefined, sign === "+" ? "diff-add" : sign === "-" ? "diff-del" : "diff-ctx");
    const pair = sign === "-" && rows[index + 1]?.[0] === "+" ? rows[index + 1][1]
      : sign === "+" && rows[index - 1]?.[0] === "-" ? rows[index - 1][1] : null;
    const cell = element("td", undefined, "diff-text");
    let start = text.length;
    let end = 0;
    if (pair !== null) {
      start = 0;
      while (start < text.length && start < pair.length && text[start] === pair[start]) start += 1;
      while (end < text.length - start && end < pair.length - start
        && text[text.length - 1 - end] === pair[pair.length - 1 - end]) end += 1;
    }
    if (pair !== null && start + end < text.length)
      cell.append(document.createTextNode(text.slice(0, start)), element("mark", text.slice(start, text.length - end)),
        document.createTextNode(text.slice(text.length - end)));
    else cell.textContent = text;
    row.append(element("td", sign, "diff-sign"), cell);
    body.append(row);
  });
  flush();
  table.append(body);
  card.append(table);
  return card;
}

/**
 * 프롬프트 대화상자. 공급자별로 버전을 커밋 목록처럼 최신순으로 보이고, 첫 버전은 전체 프롬프트를, 이후 버전은
 * 이전 버전 대비 바뀐 조각만 API별·문장 단위로 보인다. 문구가 완전히 같은 연속 버전은 하나로 합친다.
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
  const view = selected?.view ?? "diff";
  const open = async (next) => dialog("프롬프트",
    await promptView({ provider, index, view, ...next }), "criteria-dialog");
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
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  };
  // API별 변경 수를 색깔 칩으로. 칩을 누르면 바뀐 내용에서 그 API 위치로 이동한다.
  const chips = (diff, jump) => {
    const box = element("span", undefined, "change-chips");
    PROMPT_APIS.forEach((api, apiIndex) => {
      const count = (list) => list.filter((name) => apiOf(name) === api).length;
      const [added, removed, changed] = [count(diff.added), count(diff.removed), count(diff.changed)];
      if (!added && !removed && !changed) return;
      const chip = element(jump ? "button" : "span", undefined, "change-chip");
      chip.append(document.createTextNode(api.name));
      if (added) chip.append(element("b", `+${added}`, "stat-add"));
      if (removed) chip.append(element("b", `−${removed}`, "stat-del"));
      if (changed) chip.append(element("b", `~${changed}`, "stat-chg"));
      if (jump) {
        chip.type = "button";
        chip.addEventListener("click", () => wrap.querySelector(`#prompt-api-${apiIndex}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
      }
      box.append(chip);
    });
    if (!box.childElementCount) box.append(element("span", "문구 변경 없음", "muted"));
    return box;
  };
  const layout = element("div", undefined, "prompt-layout");
  const timeline = element("ol", undefined, "commit-list timeline");
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const version = versions[i];
    const item = element("li", undefined, i === index ? "selected" : undefined);
    const button = element("button");
    button.type = "button";
    const title = element("span", undefined, "commit-title");
    title.append(element("strong", label(i)));
    if (i === versions.length - 1) title.append(element("span", "최신", "badge ok"));
    const diff = i > 0 ? diffPromptParts(versions[i - 1].parts, version.parts) : null;
    button.append(title, diff ? chips(diff, false) : element("span", "처음 기록한 프롬프트", "commit-message"),
      element("span", when(version.entries[0].firstUsedAt), "muted commit-date"));
    button.addEventListener("click", () => open({ index: i, view: i === 0 ? "full" : "diff" }));
    item.append(button);
    timeline.append(item);
  }
  const side = element("div", undefined, "prompt-side");
  side.append(timeline);
  layout.append(side);
  const version = versions[index];
  const detail = element("div", undefined, "commit-detail");
  const head = element("div", undefined, "detail-head");
  head.append(element("h4", index === 0 ? "초기 버전" : `${label(index)} · ${label(index - 1)} 대비`));
  if (index > 0) {
    const toggle = element("div", undefined, "stage");
    [["diff", "바뀐 내용"], ["full", "전체 프롬프트"]].forEach(([key, text]) => {
      const button = element("button", text);
      button.type = "button";
      button.setAttribute("aria-pressed", String(view === key));
      button.addEventListener("click", () => open({ view: key }));
      toggle.append(button);
    });
    head.append(toggle);
  }
  detail.append(head);
  if (index === 0 || view === "full") detail.append(renderPromptGroups(version.parts));
  else {
    const before = versions[index - 1].parts;
    const diff = diffPromptParts(before, version.parts);
    detail.append(chips(diff, true));
    PROMPT_APIS.forEach((api, apiIndex) => {
      const pick = (list) => list.filter((name) => apiOf(name) === api);
      const changed = pick(diff.changed);
      const added = pick(diff.added);
      const removed = pick(diff.removed);
      if (!changed.length && !added.length && !removed.length) return;
      const section = element("div", undefined, "diff-api");
      section.id = `prompt-api-${apiIndex}`;
      section.append(element("code", api.path, "api-path"), element("strong", api.name));
      detail.append(section);
      changed.forEach((name) => detail.append(diffCard(name, "changed", before[name], version.parts[name])));
      added.forEach((name) => detail.append(diffCard(name, "added", "", version.parts[name])));
      removed.forEach((name) => detail.append(diffCard(name, "removed", before[name], "")));
    });
  }
  layout.append(detail);
  wrap.append(layout);
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
    field("실행 이름", prompt, "무엇을 바꿨는지 짧게(선택). 예: baseline, prompt-v2, batch10. 프롬프트 원문·코드 버전·서버 설정은 서버가 자동으로 기록합니다."),
    message, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const chosen = [...targets.querySelectorAll("input:checked")].map((box) => {
      const [provider, ...rest] = box.value.split("/");
      return { provider, model: rest.join("/") };
    });
    if (!chosen.length || chosen.length > 5) { message.textContent = "모델은 1~5개만 고를 수 있습니다."; return; }
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
$("#comparison").addEventListener("change", (e) => {
  state.group = e.target.value; state.selected = []; state.baseline = ""; state.openField = null; renderFilters(); render();
});
$("#cf-source-close").addEventListener("click", () => $("#cf-source").close());
$("#run-open").addEventListener("click", openRun);
$("#record-delete").addEventListener("click", () => confirmDelete(state.group));
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
