// AI 평가 화면. 평가 실행 API의 결과만 표시한다. 예시 데이터나 추정값을 만들지 않으며 미관측 값은 "—"로 둔다.
import { accessHeaders, clearAccess } from "/quality/access.js";
import { estimateCost, formatUsd, validRate } from "/evaluations/pricing.js";

// 평가는 항상 현재 데이터셋의 모든 화면으로 한다. 전후 비교는 같은 데이터셋으로 개선 전·후 코드를 각각 돌려 비교한다.
const DATASET = { id: "generic-matching" };
const COLORS = ["#4e6d90", "#688b7c", "#ac8d68", "#8a6f9e", "#6f8f9e"];
const PRICE_KEY = "cf-evaluation-model-prices-v1";
const root = document.getElementById("cf-eval-preview");
const $ = (selector) => root.querySelector(selector);
const state = { runs: [], dataset: null, models: [], selected: [], group: null, stage: "total", page: "overview",
  fields: {}, catalog: null, fieldHidden: [], canDelete: false, compare: { before: "", after: "" }, fieldFilter: "diff", fieldScreen: "all", openField: null, itemKind: "GENERIC_FIELDS" };
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
function groupLabel(key) {
  const runs = groupRuns(key).map(({ run }) => run);
  const first = runs[0];
  const at = new Date(first.requestedAt);
  const time = `${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${promptKey(first)} · ${time}`;
}

/** 고른 실행의 실행 조건. 화면에는 작은 칩 하나만 두고, 마우스를 올리면 조건 전체가 말풍선으로 보인다. */
function comparisonDetail(key) {
  const runs = groupRuns(key).map(({ run }) => run);
  const first = runs[0];
  if (!first) return [];
  const settings = first.versions.settings ?? {};
  const rows = [
    ["데이터셋", `v${first.versions.datasetVersion} · 화면 ${state.dataset?.cases?.length ?? "—"}개`, "채점에 쓴 지원서 화면 묶음"],
    ["반복", `${first.repetitions}회`, "같은 입력을 몇 번 돌렸는지"],
    ["모델", runs.map(modelKey).join("\n"), ""],
    ["코드 버전", first.versions.codeVersion ?? "—", "실행한 백엔드 커밋. 호출 구조가 바뀌면 달라짐"],
    ["실행", first.requestedBy === "auto-deploy" ? "자동(배포)" : first.requestedBy ?? "—", "자동은 평가에 영향을 주는 변경이 배포됐을 때 돈 실행. 이름이 바뀐 것을 뜻함"],
    ...(settings["field-batch-size"] != null ? [["칸 묶음", `${settings["field-batch-size"]}칸`, "칸 매핑에서 AI에 한 번에 묻는 칸 수"]] : []),
    ...(settings["section-concurrency"] != null ? [["섹션 동시", `${settings["section-concurrency"]}개`, "동시에 처리하는 섹션 수"]] : []),
  ];
  const chip = element("span", "실행 조건", "condition-chip");
  chip.dataset.helpTitle = "실행 조건";
  chip.dataset.helpRows = JSON.stringify(rows);
  chip.tabIndex = 0;
  return [chip];
}

// 결과에 영향을 주는 실행 조건. 코드 버전과 서버 설정(배치·병렬·재시도)이 바뀌면 프롬프트가 같아도 품질·성능이 달라질 수 있다.
const CURRENT_CONFIDENCE = 0.8;
const SETTING_NAMES = { "field-batch-size": "칸 묶음", "section-concurrency": "섹션 동시", "max-concurrent": "최대 동시 호출",
  "rate-limit-retries": "재시도", "timeout-ms": "시간 제한(ms)", "min-confidence": "확신도 기준", "reasoning-effort": "추론 강도", "whole-form": "화면 전체 질문" };
/** 이전 실행과 달라진 조건(코드, 프롬프트, 모델, 설정). 같으면 빈 목록이다. */
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
  if (foot) cardHelp(card, foot);
  return card;
}

const color = (model) => COLORS[state.models.indexOf(model) % COLORS.length];
const report = (model) => latest(model)?.report;

function renderOverview() {
  renderQuality();
  const total = state.stage === "total";
  const perf = (m) => report(m)?.performance[stageKey()];
  const seconds = (m) => {
    const value = total ? report(m)?.flows.time.meanMs : perf(m)?.productCall.meanMs;
    return value == null ? null : value / 1000;
  };
  const failure = (m) => percent(total ? report(m)?.flows.failureRate : perf(m)?.failureRate);
  const timeCard = bars(total ? "자동기입 시간" : "요청 처리 시간",
    total ? "버튼 1번 · 평균 · 낮을수록 좋음" : "서버 요청 1개 · 평균 · 낮을수록 좋음", seconds,
    Math.max(1, ...state.selected.map((m) => seconds(m) ?? 0)), (v) => `${v.toFixed(2)}초`,
    total ? richNote(["자동기입 버튼 1번"], " = ", ["준비"], "(섹션 분류·버튼·선택 결정) + ", ["매핑"], "(섹션 분류·칸 매핑)의 서버 요청 시간 합 · 클릭·칸 입력·네트워크 왕복 제외")
      : richNote(["서버 요청 1개"], "(섹션 분류·칸 매핑 등)를 끝내기까지 · 안에서 ", ["AI에게 여러 번"], " 물을 수 있음 · 서버 처리·재시도 포함"));
  if (total) {
    timeCard.querySelectorAll(".bar-row").forEach((row, index) => {
      const time = report(state.selected[index])?.flows.time;
      const repetitions = latest(state.selected[index])?.run.repetitions;
      if (time?.p95Ms == null) return;
      const note = element("span", undefined, "range-note stat-line");
      note.append(stat("p95", `${(time.p95Ms / 1000).toFixed(2)}초`, "측정한 자동기입 중 느린 쪽 5%를 뺀 가장 느린 시간"),
        stat("측정", `${time.count}번`, repetitions ? `자동기입 ${time.count / repetitions}번 × 반복 ${repetitions}회` : undefined));
      row.after(note);
    });
  }
  if (!total) {
    // 요청 하나 안에서 AI에게 몇 번 물었는지 보이면 AI 응답 시간과 이어서 읽을 수 있다.
    timeCard.querySelectorAll(".bar-row").forEach((row, index) => {
      const stage = perf(state.selected[index]);
      if (!stage?.calls || !stage.modelAttempt?.count) return;
      const note = element("span", undefined, "range-note stat-line");
      note.append(stat("요청", `${stage.calls}개`), stat("요청 1개에 AI 질문", `평균 ${(stage.modelAttempt.count / stage.calls).toFixed(1)}번`));
      row.after(note);
    });
  }
  const tokenLimitCard = () => bars("입력 토큰 초과", "거절된 AI 질문 수 · 낮을수록 좋음", (m) => perf(m)?.tokenLimitAttempts ?? null,
    Math.max(1, ...state.selected.map((m) => perf(m)?.tokenLimitAttempts ?? 0)), (v) => `${v}번`,
    richNote(["입력 토큰 한도를 넘어 거절된 질문"], " · 반으로 나눠 다시 물으므로 요청 실패는 아님 · 시간은 위 수치에 포함"));
  // 전체 흐름은 자동기입 단위로 본다. AI 응답 시간은 단계마다 섞이는 준비·매핑 탭에서만 보이고, 처리량은 실행 전체
  // 경과 시간으로 나누므로 전체 흐름에서만 뜻이 있다.
  $("#cf-performance").replaceChildren(...(total ? [
    timeCard,
    bars("처리량", "초당 끝낸 요청 수 · 높을수록 좋음", (m) => perf(m)?.throughputPerSecond,
      Math.max(0.1, ...state.selected.map((m) => perf(m)?.throughputPerSecond ?? 0)), (v) => `${v.toFixed(2)}/초`,
      richNote(["끝낸 서버 요청 수 ÷ 실행 경과 시간"], " · 요청을 차례로 보내므로 요청 처리 시간이 짧을수록 높음")),
    bars("자동기입 실패율", "낮을수록 좋음", failure, 100, (v) => `${v.toFixed(1)}%`,
      richNote(["서버 요청이 하나라도 실패한 자동기입"], "(준비 + 매핑)의 비율")),
    tokenLimitCard(),
  ] : [
    modelTimeCard(perf),
    timeCard,
    bars("요청 실패율", "낮을수록 좋음", failure, 100, (v) => `${v.toFixed(1)}%`,
      richNote(["실패한 서버 요청"], "의 비율 · 타임아웃·API 오류·응답 형식 오류·채점 불가")),
    tokenLimitCard(),
  ]));
}

/**
 * 모델 응답 시간: 서버가 모델 API에 요청을 보낸 직전부터 응답 전체를 받을 때까지, 시도 1건 평균. 네트워크와 공급자 대기가
 * 들어 있고 서버의 요청 만들기·해석·배치 대기는 빠진다. 요청 처리 시간과 비교하면 서버 쪽 처리·대기를 가늠할 수 있다.
 */
function modelTimeCard(perf) {
  const attempt = (m) => perf(m)?.modelAttempt;
  const seconds = (m) => attempt(m)?.meanMs == null ? null : attempt(m).meanMs / 1000;
  const card = bars("AI 응답 시간", "AI 질문 1번 · 평균 · 낮을수록 좋음", seconds, Math.max(1, ...state.selected.map((m) => seconds(m) ?? 0)),
    (v) => `${v.toFixed(2)}초`, richNote(["AI에 질문 하나"], "를 보내고 답을 다 받기까지 · ", ["모델 속도 비교 기준"], " · 서버 처리 제외, 공급자 쪽 대기 포함"));
  card.querySelectorAll(".bar-row").forEach((row, index) => {
    const value = attempt(state.selected[index]);
    if (!value?.count) return;
    const note = element("span", undefined, "range-note stat-line");
    note.append(stat("p95", `${(value.p95Ms / 1000).toFixed(2)}초`, "AI 질문 중 느린 쪽 5%를 뺀 가장 느린 시간"), stat("AI 질문", `${value.count}번`));
    row.after(note);
  });
  return card;
}

function renderTokens() {
  const caption = { total: "준비 + 매핑 전체", prepare: "준비", mapping: "매핑" }[state.stage];
  $("#cf-token-caption").textContent = `${caption} · AI 질문 1번당 평균 · 토큰을 알려 주지 않은 질문은 평균에서 뺍니다.`;
  const body = $("#cf-token-body");
  body.replaceChildren();
  const chart = $("#cf-token-chart");
  chart.replaceChildren();
  const heading = element("div", undefined, "token-chart-heading");
  const pricing = element("button", "모델 단가 설정", "pricing-trigger");
  pricing.type = "button";
  pricing.addEventListener("click", openPricing);
  heading.append(element("h4", "AI 질문 1번당 평균 토큰"), pricing);
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
      stat("질문당 비용", costs[index].mean == null ? "단가 미설정" : formatUsd(costs[index].mean));
      stat("실행 전체 비용", costs[index].total == null ? "단가 미설정" : formatUsd(costs[index].total));
      row.append(name, track, value, stats);
      box.append(row);
      return;
    } else if (run && ACTIVE.includes(run.status)) {
      track.classList.add("pending");
      value.append(element("b", RUN_STATUS[run.status]), element("span", `요청 ${run.processedCalls}/${run.plannedCalls}개`, "muted"));
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
    axis.append(element("span"), ticks, element("span", "토큰 / 질문", "muted"));
    box.append(axis);
  }
  // 실행 하나는 자동기입 몇 회뿐이라 금액이 작다. 자동기입 1회 비용(자동기입 1번에 쓴 평균 토큰 × 단가)을
  // 1,000회 기준으로 키우고, 가장 저렴한 모델 대비 배수로 비교한다. 처음 화면 준비는 자동기입마다 다시 쓰이므로
  // 실행 토큰 합 ÷ 자동기입 수가 아니라 보고의 자동기입 단위 토큰을 쓴다.
  const priced = rows.map((row, index) => {
    const flows = report(row.model)?.flows;
    const perAutofill = flows?.inputTokensMean == null ? null
      : estimateCost(flows.inputTokensMean, flows.outputTokensMean, prices[row.model]);
    const perThousand = perAutofill == null ? null : perAutofill * 1000;
    return { ...row, flows: flows?.count, total: costs[index].total, perThousand };
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
    summary.append(element("p", "자동기입 1회 = 준비(섹션 분류·버튼·선택 결정) + 매핑(섹션 분류·칸 매핑). 고르기 전 화면이 따로 있는 공고는 그 화면의 준비를 고른 뒤 화면마다 더합니다. 비용 = 그 입력·출력 토큰 × 모델 단가 설정의 USD 단가(100만 토큰당). 서버는 비용을 계산하지 않습니다.", "muted"));
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
/** 실행 묶음에서 그 모델의 끝난 실행과 보고. 없으면 undefined다. */
const groupEntry = (key, model) => key ? groupRuns(key).find(({ run }) => done(run) && modelKey(run) === model) : undefined;
/**
 * 이후 실행의 모델과 비교할 이전 실행. 같은 모델이 없으면 모델을 바꾼 것이므로 같은 공급자의 남은 모델과 짝짓는다.
 * 모델 변경은 달라진 조건에 나타난다.
 */
function baseEntry(after, before, model) {
  const exact = groupEntry(before, model);
  if (exact) return exact;
  const finished = groupRuns(after).filter(({ run }) => done(run)).map(({ run }) => modelKey(run));
  const provider = groupEntry(after, model)?.run.versions.provider;
  return groupRuns(before).find(({ run }) => done(run) && run.versions.provider === provider && !finished.includes(modelKey(run)));
}

/**
 * 이전 대비 변화를 실행마다 생기는 흔들림과 구분할 수 없는 이유. 구분할 수 있으면 null이다. 어느 한쪽이 반복 1회면
 * 흔들림 폭을 모르고, values(보고 → 반복별 값)를 주면 두 실행의 반복별 범위가 겹칠 때도 구분할 수 없다고 본다.
 */
function unclearReason(now, base, values) {
  if ((now?.run.repetitions ?? 0) < 2 || (base?.run.repetitions ?? 0) < 2)
    return "이전이나 이후 실행이 반복 1회라 흔들림과 구분할 수 없습니다. 반복 3회 이상으로 비교해야 합니다.";
  const [a, b] = [values?.(now.report) ?? [], values?.(base.report) ?? []];
  if (a.length > 1 && b.length > 1 && Math.min(...a) <= Math.max(...b) && Math.min(...b) <= Math.max(...a))
    return "두 실행의 반복별 범위가 겹쳐 흔들림과 구분할 수 없습니다.";
  return null;
}
const repetitionScores = (stage) => (value) => (value?.repetitions ?? []).map((item) => item.scores?.[stage])
  .filter((score) => score != null);

const shortPercent = (value) => `${(value * 100).toFixed(1)}%`;

/** 막대 아래 판정별 수. 색 점과 이름·수를 나란히 두고 합계를 끝에 둔다. 범례를 대신한다. */
function countLine(kinds, counts, total, unit, titles = {}) {
  const line = element("span", undefined, "item-numbers count-line");
  kinds.forEach(({ key, label, className }) => {
    const part = element("span", undefined, `count ${className}`);
    part.append(element("b", String(counts[key] ?? 0)), document.createTextNode(` ${label.split("(")[0]}`));
    if (titles[key]) part.dataset.help = titles[key];
    line.append(part);
  });
  const sum = element("span", undefined, "count-total");
  sum.append(document.createTextNode("총 "), element("b", String(total)), document.createTextNode(unit));
  line.append(sum);
  return line;
}

/** 설명 한 줄. 배열로 넘긴 부분([글자])은 굵게, 나머지는 그대로 둔다. */
/** 카드 설명은 아래에 적지 않고 제목에 커서를 올리면 보인다. {@code note}는 글자이거나 richNote 결과다. */
function cardHelp(card, note) {
  const title = card.querySelector("h3");
  title.dataset.help = typeof note === "string" ? note : note.textContent;
  title.classList.add("has-help");
  title.tabIndex = 0;
}

function richNote(...parts) {
  const note = element("p", undefined, "muted metric-foot rich-note");
  parts.forEach((part) => note.append(Array.isArray(part) ? element("b", part[0]) : document.createTextNode(part)));
  return note;
}

/** 작은 지표 하나: 이름은 흐리게, 값은 굵게. 설명을 주면 마우스를 올렸을 때 보인다. */
function stat(label, value, help) {
  const item = element("span", undefined, help ? "stat has-help" : "stat");
  item.append(element("span", label, "stat-label"), element("b", value));
  if (help) {
    item.dataset.help = help;
    item.tabIndex = 0;
  }
  return item;
}

// 설명 말풍선. 브라우저 기본 title은 늦게 뜨거나 안 뜨는 환경이 있어, data-help가 있는 요소에 마우스를 올리거나
// 포커스하면 바로 띄운다. 화면 밖으로 나가지 않게 위치를 맞춘다.
const helpTip = Object.assign(document.createElement("div"), { className: "help-tip", role: "tooltip" });
root.append(helpTip);
function showHelp(target) {
  if (target.dataset.helpRows) {
    // 이름·값·설명 표 형태의 말풍선. 값은 굵게, 설명은 흐리게 둔다.
    const grid = element("dl", undefined, "help-rows");
    JSON.parse(target.dataset.helpRows).forEach(([label, value, note]) => {
      const detail = element("dd");
      detail.append(element("b", value));
      if (note) detail.append(element("span", note, "help-note"));
      grid.append(element("dt", label), detail);
    });
    helpTip.replaceChildren(element("strong", target.dataset.helpTitle ?? "", "help-title"), grid);
  }
  else helpTip.textContent = target.dataset.help;
  const box = target.getBoundingClientRect();
  const tip = helpTip.getBoundingClientRect();
  const left = Math.min(Math.max(8, box.left + box.width / 2 - tip.width / 2), innerWidth - tip.width - 8);
  const above = box.top - tip.height - 8;
  helpTip.style.left = `${left}px`;
  helpTip.style.top = `${above >= 8 ? above : box.bottom + 8}px`;
  helpTip.classList.add("show");
}
const hideHelp = () => { helpTip.classList.remove("show"); };
root.addEventListener("mouseover", (event) => {
  const target = event.target.closest?.("[data-help], [data-help-rows]");
  if (target) showHelp(target); else hideHelp();
});
root.addEventListener("focusin", (event) => { if (event.target.dataset?.help || event.target.dataset?.helpRows) showHelp(event.target); });
root.addEventListener("focusout", hideHelp);
addEventListener("scroll", hideHelp, { passive: true });

/**
 * 단계 점수 카드(정밀도를 중시한 F0.5). stage는 TOTAL·PREPARATION·MAPPING이며, 막대 아래에 정밀도·채움률·반복 범위를 둔다.
 * 칸 매핑은 확신도 0.8 이상만 답한 것으로 보고, 섹션 분류·버튼·선택 결정은 답 그대로 본다.
 */
function scoreCard(stage, title) {
  const fill = (model) => report(model)?.scores?.[stage];
  const card = bars(title, "높을수록 좋음", (m) => percent(fill(m)?.score), 100, (v) => `${v.toFixed(1)}%`);
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
    const values = (report(state.selected[index])?.repetitions ?? []).map((item) => item.scores?.[stage])
      .filter((value) => value != null).map((value) => value * 100);
    const note = element("span", undefined, "range-note stat-line");
    note.append(stat("정밀도", autofill.precision == null ? "—" : shortPercent(autofill.precision),
      "답한 것 중 맞은 비율. 잘못 답할수록 낮아집니다(칸 매핑은 확신도 0.8 이상만 답한 것으로 봄)."),
    stat("채움률", shortPercent(autofill.fillRate), "정답이 있는 질문 중 맞게 답한 비율. 놓칠수록 낮아집니다."));
    if (values.length > 1) note.append(stat(`반복 ${values.length}회`, `${Math.min(...values).toFixed(1)}~${Math.max(...values).toFixed(1)}%`,
      "같은 입력을 반복마다 따로 채점한 점수의 최소~최대. 두 모델의 범위가 겹치면 차이를 구분하기 어렵습니다."));
    row.after(note);
  });
  cardHelp(card, richNote(["정밀도"], " 답한 것 중 맞은 비율 · ", ["채움률"], " 답해야 할 것 중 맞게 답한 비율 · ",
    ["잘못 답하면 놓칠 때보다 2배 감점"]));
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
  if (!state.selected.length) card.append(element("div", "비교할 모델 선택 필요.", "empty"));
  for (const model of state.selected) {
    const autofill = report(model)?.autofill;
    const counts = autofill && { ...autofill.counts, wrong: autofill.counts.filledWrongKey + autofill.counts.filledUnneeded };
    const row = element("div", undefined, "item-row");
    row.style.setProperty("--model", color(model));
    const track = element("div", undefined, "item-track");
    const total = counts ? AUTOFILL_KINDS.reduce((sum, { key }) => sum + counts[key], 0) : 0;
    let text = element("span", "자동기입 결과 없음", "item-numbers");
    if (counts?.unobserved) text = element("span", "확신도 기록 전 실행이라 측정 불가", "item-numbers");
    else if (total) {
      AUTOFILL_KINDS.forEach(({ key, label, className }) => {
        const part = element("span", undefined, className);
        part.style.width = `${counts[key] / total * 100}%`;
        part.title = `${label} ${counts[key]}`;
        track.append(part);
      });
      text = countLine(AUTOFILL_KINDS, counts, total, "칸",
        { wrong: `다른 항목 ${counts.filledWrongKey} · 넣지 말아야 할 칸 ${counts.filledUnneeded}` });
    }
    row.append(Object.assign(element("span", model), { title: model }), track, text);
    card.append(row);
  }
  cardHelp(card, richNote(["놓침"], " = 비움 + 확인 필요(확신도 0.5~0.8) + 막음(0.5 미만) + 요청 실패 → ", ["사용자가 직접 입력하는 칸"]));
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
// 평가 단계. 자동기입 흐름의 준비(섹션 분류 → 버튼·선택 결정)와 매핑(섹션 분류 → 칸 매핑)에 맞춰 품질·성능을 함께 나눠 본다.
const STAGE_NOTES = {
  total: "자동기입 버튼 1번 전체 · 준비 + 매핑",
  prepare: "칸을 꺼내는 단계 · 섹션 분류 → 버튼·선택 결정",
  mapping: "칸에 값을 정하는 단계 · 섹션 분류 → 칸 매핑",
};
const CALL_LABELS = { "PREPARATION/SECTION_CLASSIFY": "섹션 분류", "PREPARATION/INTERACTION_DECISION": "버튼·선택 결정",
  "MAPPING/SECTION_CLASSIFY": "섹션 분류", "MAPPING/GENERIC_FIELDS": "칸 매핑" };

/** 고른 호출 종류들의 항목 판정 합. 없으면 null이다. */
function itemsOf(model, keys) {
  const byCall = report(model)?.itemsByCall;
  if (!byCall) return null;
  const found = keys.map((key) => byCall[key]).filter(Boolean);
  if (!found.length) return null;
  return Object.fromEntries(ITEM_KINDS.map(({ key }) => [key, found.reduce((sum, items) => sum + (items[key] ?? 0), 0)]));
}
const scoredOf = (items) => items ? ITEM_KINDS.reduce((sum, { key }) => sum + items[key], 0) : 0;
const accuracyOf = (items) => scoredOf(items) ? items.correct / scoredOf(items) : null;

const CONFIDENCE_METRICS = [["점수", "score"], ["정밀도", "precision"], ["채움률", "fillRate"]];

/** 지표 하나의 기준별 선 그래프. 지표끼리 눈금을 맞춰 기준을 올릴 때 무엇이 얼마나 움직이는지 비교할 수 있게 한다. */
function confidenceChart(label, key, models) {
  const all = models.flatMap((model) => report(model).confidence);
  const values = all.flatMap((point) => CONFIDENCE_METRICS.map(([, metric]) => point[metric])).filter((value) => value != null);
  const low = Math.floor(Math.min(...values) * 10) / 10;
  const thresholds = [...new Set(all.map((point) => point.threshold))].sort((a, b) => a - b);
  const [width, height, left, right, top, bottom] = [150, 118, 28, 6, 6, 18];
  const x = (threshold) => left + (threshold - thresholds[0]) / ((thresholds.at(-1) - thresholds[0]) || 1) * (width - left - right);
  const y = (value) => top + (1 - (value - low) / ((1 - low) || 1)) * (height - top - bottom);
  const gridValues = [low, (low + 1) / 2, 1];
  const parts = gridValues.map((value) => `<line class="confidence-grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"></line>`
    + `<text class="confidence-tick" x="${left - 4}" y="${y(value) + 3}" text-anchor="end">${Math.round(value * 100)}</text>`);
  thresholds.forEach((threshold) => parts.push(`<text class="confidence-tick" x="${x(threshold)}" y="${height - 5}" text-anchor="middle">${threshold}</text>`));
  if (thresholds.includes(CURRENT_CONFIDENCE)) parts.push(`<line class="confidence-now" x1="${x(CURRENT_CONFIDENCE)}" x2="${x(CURRENT_CONFIDENCE)}" y1="${top}" y2="${height - bottom}"></line>`);
  const dots = [];
  models.forEach((model) => {
    const points = report(model).confidence.filter((point) => point[key] != null);
    parts.push(`<polyline class="confidence-line" stroke="${color(model)}" points="${points.map((point) => `${x(point.threshold)},${y(point[key])}`).join(" ")}"></polyline>`);
    points.forEach((point) => {
      parts.push(`<circle class="confidence-dot" fill="${color(model)}" cx="${x(point.threshold)}" cy="${y(point[key])}" r="3"><title></title></circle>`);
      dots.push(`${model} · 기준 ${point.threshold} · ${label} ${(point[key] * 100).toFixed(1)}%`);
    });
  });
  const chart = element("div", undefined, "confidence-chart");
  chart.append(element("h4", label));
  const figure = element("div");
  figure.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} 기준별 그래프">${parts.join("")}</svg>`;
  figure.querySelectorAll("circle title").forEach((title, index) => { title.textContent = dots[index]; });
  chart.append(figure);
  return chart;
}

/** 확신도 기준을 바꾸면 칸 매핑이 어떻게 달라지는지. 모델마다 확신도의 뜻이 달라 같은 기준이 공정한지 본다. */
function confidenceCard() {
  const card = element("div", undefined, "metric");
  card.id = "cf-confidence";
  const head = element("div", undefined, "metric-head");
  head.append(element("h3", "확신도 기준별 칸 매핑"), element("span", "세로선이 현재 기준 · 점에 올리면 값", "muted"));
  card.append(head);
  const models = state.selected.filter((model) => report(model)?.confidence?.length);
  if (!models.length) {
    card.append(element("div", state.selected.length ? "확신도 기록 전 실행이라 측정 불가." : "비교할 모델 선택 필요.", "empty"));
    return card;
  }
  const legend = element("div", undefined, "confidence-legend");
  models.forEach((model) => {
    const name = element("span", model, "stage-model");
    name.style.setProperty("--model", color(model));
    legend.append(name);
  });
  const charts = element("div", undefined, "confidence-charts");
  charts.append(...CONFIDENCE_METRICS.map(([label, key]) => confidenceChart(label, key, models)));
  card.append(legend, charts);
  const table = element("table", undefined, "compare-table confidence-table");
  const thead = element("thead");
  const top = element("tr");
  top.append(element("th", "기준"));
  models.forEach((model) => {
    const th = element("th", model, "model-col");
    th.style.setProperty("--model", color(model));
    top.append(th);
  });
  thead.append(top);
  const body = element("tbody");
  const text = (value) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
  report(models[0]).confidence.forEach(({ threshold }) => {
    const row = element("tr");
    row.append(element("th", threshold === CURRENT_CONFIDENCE ? `${threshold} 현재` : String(threshold)));
    models.forEach((model) => {
      const points = report(model).confidence;
      const point = points.find((entry) => entry.threshold === threshold);
      const best = Math.max(...points.map((entry) => entry.score ?? 0));
      const cell = element("td", undefined, "number");
      cell.append(element("span", text(point?.score), point?.score === best ? "best" : undefined),
        element("span", `정밀도 ${text(point?.precision)} · 채움률 ${text(point?.fillRate)}`, "compare-range"));
      row.append(cell);
    });
    body.append(row);
  });
  table.append(thead, body);
  const wrap = element("div", undefined, "table-wrap compare-wrap");
  wrap.append(table);
  const details = element("details", undefined, "confidence-details");
  details.append(element("summary", "표로 보기"), wrap);
  card.append(details);
  cardHelp(card, richNote(["칸 매핑 질문만"], " · 섹션 분류 제외 · 같은 데이터로 본 값이라 최고 점수 기준을 그대로 믿으면 안 됨 · ", ["JEV는 확률, OpenAI는 모델이 적은 값"], "이라 같은 숫자가 같은 뜻이 아님"));
  return card;
}

function renderQuality() {
  const quality = $("#cf-quality");
  if (state.stage === "prepare") {
    quality.replaceChildren(scoreCard("PREPARATION", "준비 점수"),
      stageAccuracyCard("준비 결과", ["PREPARATION/SECTION_CLASSIFY", "PREPARATION/INTERACTION_DECISION"],
        richNote(["섹션 분류"], " 조작할 섹션을 고르는 질문 · ", ["버튼·선택 결정"], " 학력 구분이나 행 추가처럼 무엇을 누르고 고를지 정하는 질문")));
  }
  else if (state.stage === "mapping") {
    quality.replaceChildren(scoreCard("MAPPING", "매핑 점수"), renderAutofill(), confidenceCard(),
      stageAccuracyCard("섹션 분류 결과", ["MAPPING/SECTION_CLASSIFY"],
        richNote(["섹션 분류"], " 화면의 섹션마다 범주(기본정보·학력·해당 없음 …)를 정하는 질문")));
  }
  else quality.replaceChildren(scoreCard("TOTAL", "자동기입 점수"), stageSummary());
}

/**
 * 준비 결과·섹션 분류 결과 카드. 칸별 결과처럼 판정별로 나뉜 막대와 판정 수를 보이고, 아래에 맞힌 비율과 호출 종류별 비율을 둔다.
 * 평가는 다음 요청을 정답으로 만들므로 여기 오답은 자동기입 점수에 반영되지 않는다.
 */
function stageAccuracyCard(title, keys, foot) {
  const card = element("div", undefined, "metric");
  const head = element("div", undefined, "metric-head");
  head.append(element("h3", title), element("span", "항목 수", "muted"));
  card.append(head);
  if (!state.selected.length) card.append(element("div", "비교할 모델 선택 필요.", "empty"));
  for (const model of state.selected) {
    const items = itemsOf(model, keys);
    const row = element("div", undefined, "item-row");
    row.style.setProperty("--model", color(model));
    const track = element("div", undefined, "item-track");
    const total = items ? scoredOf(items) : 0;
    let text = element("span", "결과 없음", "item-numbers");
    if (total) {
      ITEM_KINDS.forEach(({ key, label, className }) => {
        const part = element("span", undefined, className);
        part.style.width = `${items[key] / total * 100}%`;
        part.title = `${label} ${items[key]}`;
        track.append(part);
      });
      text = countLine(ITEM_KINDS, items, total, "개");
    }
    row.append(Object.assign(element("span", model), { title: model }), track, text);
    if (total) {
      const rates = element("span", undefined, "item-numbers item-rates stat-line");
      rates.append(stat("맞힌 비율", shortPercent(accuracyOf(items))));
      if (keys.length > 1) keys.forEach((key) => {
        const value = accuracyOf(itemsOf(model, [key]));
        rates.append(stat(CALL_LABELS[key], value == null ? "—" : shortPercent(value)));
      });
      row.append(rates);
    }
    card.append(row);
  }
  cardHelp(card, foot);
  return card;
}

/** 전체 흐름의 단계 요약: 모델마다 준비·매핑 점수를 한 줄로. 자세한 결과는 준비·매핑 탭에서 본다. */
function stageSummary() {
  const card = element("div", undefined, "metric");
  const head = element("div", undefined, "metric-head");
  head.append(element("h3", "단계별 점수"), element("span", "자세히는 준비·매핑 탭", "muted"));
  card.append(head);
  for (const model of state.selected) {
    const row = element("div", undefined, "summary-row");
    const name = element("span", model, "stage-model");
    name.style.setProperty("--model", color(model));
    const line = element("span", undefined, "stat-line");
    [["준비", "PREPARATION", "섹션 분류 + 버튼·선택 결정"], ["매핑", "MAPPING", "섹션 분류 + 칸 매핑"]].forEach(([label, stage, help]) => {
      const value = report(model)?.scores?.[stage]?.score;
      line.append(stat(`${label} 점수`, value == null ? "—" : shortPercent(value), help));
    });
    row.append(name, line);
    card.append(row);
  }
  cardHelp(card, richNote(["자동기입 점수"], " = 준비와 매핑의 모든 질문을 합쳐 같은 식으로 낸 점수"));
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
  { kind: "INTERACTION_DECISION", name: "버튼·선택 결정", noun: "결정" },
];
const CATEGORY_NAMES = { PERSONAL: "기본정보", EDUCATION: "학력", CAREER: "경력", SENSITIVE: "민감정보(병역·보훈·장애)",
  LANGUAGE: "어학", CERTIFICATE: "자격증", PROJECT: "프로젝트", ACTIVITY: "활동", NONE: "해당 없음", MIXED: "여러 범주",
  ABSTAIN: "판단 보류" };
const TARGET_NAMES = { HIGH_SCHOOL: "고등학교 행", ASSOCIATE: "전문대학 행", BACHELOR: "대학교 행", MASTER: "대학원(석사) 행",
  DOCTOR: "대학원(박사) 행" };
const ROLE_NAMES = { ROW_KIND_OPTION: "학력 구분 선택", REPEAT_ADD: "행 추가", SECTION_REVEAL: "접힌 섹션 열기" };
/** 항목의 정답·답을 사람이 읽는 글자로. */
function itemValue(item, value) {
  if (item.kind === "SECTION_CLASSIFY") return value == null ? "답 없음" : `${value} · ${CATEGORY_NAMES[value] ?? value}`;
  if (item.kind === "INTERACTION_DECISION") return value ?? "고르지 않음";
  return value ?? "넣을 항목 없음";
}
const itemLabel = (item) => item.kind === "SECTION_CLASSIFY" ? sectionTitle({ title: item.label })
  : item.kind === "INTERACTION_DECISION" ? TARGET_NAMES[item.label] ?? item.label ?? ROLE_NAMES[item.group] ?? item.itemId : item.label ?? item.itemId;
function itemGroup(item) {
  const screen = stateName(item.state);
  if (item.kind === "SECTION_CLASSIFY") return `${screen} · ${item.stage === "PREPARATION" ? "준비 단계" : "매핑 단계"}`;
  if (item.kind === "INTERACTION_DECISION") return `${screen} · ${ROLE_NAMES[item.group] ?? item.group ?? "선택 결정"}`;
  return `${screen} · ${sectionTitle({ title: item.group })}`;
}
const FIELD_FILTERS = [["diff", "모델끼리 다른"], ["wrong", "틀린"], ["missed", "놓친"], ["all", "전체"]];
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
      .catch(() => { state.fields[run.id] = []; }).finally(() => {
        if (state.page === "fields") renderFields();
        if (state.page === "compare") renderCompare();
      });
    return null;
  }
  return cached;
}

/**
 * 항목별 비교. 고른 종류(칸 매핑·섹션 분류·버튼·선택 결정)의 답을 항목×모델 표로 놓는다. 행을 누르면 반복별 답과 확신도를
 * 펼친다. 같은 모델의 이전 실행과 견주는 것은 전후 비교 탭이 맡는다.
 */
function renderFields() {
  const page = $("#cf-fields");
  // 위쪽 모델 체크로 고른 모델 안에서 이 탭에 보일 모델을 따로 체크한다. 다른 탭에는 영향을 주지 않는다.
  const models = state.selected.filter((model) => !state.fieldHidden.includes(model));
  const runs = Object.fromEntries(state.selected.map((model) => [model, latest(model)?.run]));
  const kind = COMPARE_KINDS.find((entry) => entry.kind === state.itemKind) ?? COMPARE_KINDS[0];
  const ofKind = (list) => list && list.filter((item) => item.kind === kind.kind);
  const data = Object.fromEntries(state.selected.map((model) => [model, ofKind(runFields(runs[model]))]));

  const head = element("div", undefined, "fields-head");
  const title = element("div");
  title.append(element("h2", "항목별 비교"), element("p", kind.kind === "GENERIC_FIELDS"
    ? "칸 매핑 답을 칸마다 모델끼리 비교합니다. 확신도 0.8 이상만 넣은 것으로 봅니다."
    : `${kind.name} 답을 항목마다 모델끼리 비교합니다. 확신도와 무관하게 모델 답 그대로 채점합니다.`, "muted"));
  const controls = element("div", undefined, "fields-controls");
  const screenSelect = element("select");
  screenSelect.setAttribute("aria-label", "화면");
  // 화면은 공고별로 묶는다. "site:<공고>"는 그 공고의 모든 화면이다.
  const cases = state.dataset?.cases ?? [];
  const siteOfState = new Map(cases.map((item) => [item.state, item.siteId]));
  // 이전 버전 실행으로 바꾸면 고른 공고·화면이 없을 수 있어 모든 공고로 되돌린다.
  if (state.fieldScreen !== "all" && !cases.some((item) => item.state === state.fieldScreen || `site:${item.siteId}` === state.fieldScreen)) state.fieldScreen = "all";
  const inScreen = (field) => state.fieldScreen.startsWith("site:") ? siteOfState.get(field.state) === state.fieldScreen.slice(5)
    : state.fieldScreen === "all" || field.state === state.fieldScreen;
  screenSelect.append(Object.assign(element("option", "모든 공고"), { value: "all" }));
  [...new Set(cases.map((item) => item.siteId))].forEach((site) => {
    const group = Object.assign(element("optgroup"), { label: siteName(site) });
    group.append(Object.assign(element("option", "공고 전체"), { value: `site:${site}` }),
      ...cases.filter((item) => item.siteId === site)
        .map((item) => Object.assign(element("option", stateName(item.state)), { value: item.state })));
    screenSelect.append(group);
  });
  screenSelect.value = state.fieldScreen;
  screenSelect.addEventListener("change", () => { state.fieldScreen = screenSelect.value; renderFields(); });
  controls.append(screenSelect);
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
  // 종류 전환은 왼쪽, 화면 선택은 오른쪽 한 줄에 둔다.
  const toolbar = element("div", undefined, "fields-toolbar");
  toolbar.append(kinds, controls);
  head.append(toolbar);

  if (state.selected.some((model) => data[model] === null)) {
    page.replaceChildren(head, element("div", "항목별 답을 불러오는 중.", "empty"));
    return;
  }
  // 모델 상자: 표에 보일 모델을 체크한다. 가로로 줄바꿈되어 모델이 늘어도 세로로 쌓이지 않고, 체크를 풀어도 남아 다시 켤 수 있다.
  const summary = element("div", undefined, "fields-summary");
  summary.setAttribute("aria-label", "항목별 비교에 보일 모델");
  state.selected.forEach((model) => {
    const label = element("label");
    label.style.setProperty("--model", color(model));
    const input = element("input");
    input.type = "checkbox";
    input.checked = models.includes(model);
    input.addEventListener("change", () => {
      state.fieldHidden = input.checked ? state.fieldHidden.filter((hidden) => hidden !== model) : [...state.fieldHidden, model];
      state.openField = null;
      renderFields();
    });
    label.append(input, document.createTextNode(model));
    if (!runs[model]) label.append(element("span", "끝난 실행 없음", "muted"));
    else if (!data[model]?.length) label.append(element("span", "항목별 답 없음", "muted"));
    summary.append(label);
  });
  // 표의 모델 칸 머리: 고른 공고·화면의 판정(반복 합)을 작은 막대로, 수는 커서를 올리면 보인다.
  const verdictHead = (model, th) => {
    const tally = {};
    (data[model] ?? []).filter(inScreen).forEach((field) => field.answers.forEach(({ outcome }) => { tally[outcome] = (tally[outcome] ?? 0) + 1; }));
    const autofill = kind.kind === "GENERIC_FIELDS";
    const kinds = autofill ? AUTOFILL_KINDS : ITEM_KINDS;
    const counts = autofill
      ? { filledCorrect: tally.FILLED_CORRECT ?? 0, blankCorrect: tally.BLANK_CORRECT ?? 0, missed: tally.MISSED ?? 0,
        wrong: (tally.FILLED_WRONG_KEY ?? 0) + (tally.FILLED_UNNEEDED ?? 0) }
      : { correct: tally.CORRECT ?? 0, wrongKey: tally.WRONG_KEY ?? 0, missing: tally.MISSING ?? 0, unnecessary: tally.UNNECESSARY ?? 0 };
    const total = kinds.reduce((sum, { key }) => sum + counts[key], 0);
    if (!total) return;
    const track = element("div", undefined, "item-track");
    kinds.forEach(({ key, className }) => {
      const part = element("span", undefined, className);
      part.style.width = `${counts[key] / total * 100}%`;
      track.append(part);
    });
    th.append(track);
    th.dataset.help = [...kinds.map(({ key, label }) => `${label.split("(")[0]} ${counts[key]}`), `총 ${total}${autofill ? "칸" : "개"}`].join(" · ");
  };
  if (!models.length) {
    page.replaceChildren(head, summary, element("div", "볼 모델을 체크해야 합니다.", "empty"));
    return;
  }

  // 칸 목록은 고른 모델의 답을 합친 순서(데이터셋 순서)다.
  const rows = new Map();
  for (const model of models) (data[model] ?? []).forEach((field) => { if (!rows.has(fieldKey(field))) rows.set(fieldKey(field), field); });
  const index = (list) => new Map((list ?? []).map((field) => [fieldKey(field), field]));
  const byModel = Object.fromEntries(models.map((model) => [model, index(data[model])]));

  const chips = element("div", undefined, "fields-chips");
  // 모델이 하나면 모델끼리 다른 항목이 없으므로 그 필터를 빼고 전체를 기본으로 본다.
  const filters = FIELD_FILTERS.filter(([key]) => key !== "diff" || models.length > 1);
  const filter = filters.some(([key]) => key === state.fieldFilter) ? state.fieldFilter : "all";
  filters.forEach(([key, label]) => {
    const chip = element("button", key === "all" ? label : `${label} ${kind.noun}`);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(filter === key));
    chip.addEventListener("click", () => { state.fieldFilter = key; renderFields(); });
    chips.append(chip);
  });
  const keep = (key, field) => {
    if (!inScreen(field)) return false;
    const cells = models.map((model) => cellOf(byModel[model].get(key)));
    if (filter === "all") return true;
    if (filter === "diff") return new Set(cells.map((cell) => cell?.main)).size > 1 || cells.some((cell) => cell && cell.count < cell.total);
    if (filter === "wrong") return cells.some((cell) => cell && Object.keys(cell.counts).some((outcome) => WRONG.has(outcome)));
    return cells.some((cell) => cell && Object.keys(cell.counts).some((outcome) => MISSED.has(outcome)));
  };
  const visible = [...rows.entries()].filter(([key, field]) => keep(key, field));
  const screenTotal = [...rows.values()].filter(inScreen).length;

  const table = element("table", undefined, "fields-table");
  const thead = element("thead");
  const headRow = element("tr");
  headRow.append(element("th", kind.noun === "결정" ? "대상" : kind.noun), element("th", "정답"));
  models.forEach((model) => {
    const th = element("th", model, "model-col");
    th.style.setProperty("--model", color(model));
    verdictHead(model, th);
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
      }
      row.append(td);
    }
    const toggle = () => { state.openField = state.openField === key ? null : key; renderFields(); };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } });
    body.append(row);
    if (state.openField === key) body.append(fieldDetail(key, models, byModel));
  }
  table.append(thead, body);
  const wrap = element("div", undefined, "table-wrap fields-wrap");
  if (visible.length) wrap.append(table);
  else {
    // 거른 결과가 없으면 이유와 함께 전체 보기로 바로 넘어갈 수 있게 한다.
    const empty = element("div", undefined, "fields-empty");
    empty.append(element("span", `조건에 맞는 ${kind.noun} 없음 · 전체 ${screenTotal}개`));
    if (filter !== "all") {
      const all = element("button", "전체 보기");
      all.type = "button";
      all.addEventListener("click", () => { state.fieldFilter = "all"; renderFields(); });
      empty.append(all);
    }
    wrap.append(empty);
  }
  const filterbar = element("div", undefined, "fields-filters");
  filterbar.append(chips, element("span", `${visible.length} / ${screenTotal}개`, "muted fields-count"));
  const foot = element("p", "반복이 갈린 항목은 가장 많은 판정과 횟수(예: 2/3)를 보입니다.", "muted metric-foot");
  page.replaceChildren(head, summary, filterbar, wrap, foot);
}

/** 펼친 칸의 반복별 답·확신도. */
function fieldDetail(key, models, byModel) {
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
    column.append(element("strong", model, "row-name"), answers(byModel[model].get(key), "반복별 답"));
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
    row.append(label, bar, element("span", `요청 ${run.processedCalls}/${run.plannedCalls}개`, "number progress-count"));
    panel.append(row);
  }
}

function render() {
  $("#cf-overview").hidden = state.page !== "overview";
  $("#cf-overview-stage").hidden = state.page !== "overview";
  $("#cf-stage-note").textContent = STAGE_NOTES[state.stage];
  $("#cf-tokens").hidden = state.page !== "tokens";
  $("#cf-fields").hidden = state.page !== "fields";
  $("#cf-compare").hidden = state.page !== "compare";
  root.querySelectorAll("[data-page]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.page === state.page)));
  root.querySelectorAll("[data-stage]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stage === state.stage)));
  renderProgress();
  renderOverview();
  renderTokens();
  if (state.page === "fields") renderFields();
  if (state.page === "compare") renderCompare();
  const cases = state.dataset?.cases ?? [];
  $("#profile-count").textContent = `프로필 ${new Set(cases.map((c) => c.profileId)).size}개`;
  $("#site-count").textContent = `사이트 ${new Set(cases.map((c) => c.siteId)).size}개`;
  const active = state.runs.find(({ run }) => ["QUEUED", "RUNNING"].includes(run.status))?.run;
  const waiting = state.runs.filter(({ run }) => run.status === "WAITING").length;
  // 진행 수는 모델 하나의 서버 요청 수(화면마다 요청 2~3개 × 반복)다.
  // 상태 줄은 평가가 진행 중일 때만 보인다. 끝난 평가의 정보는 비교 칸과 실행 조건 칩에 있다.
  $("#cf-status").hidden = !active;
  if (active) {
    $("#cf-status").textContent = `${RUN_STATUS[active.status]} · ${modelKey(active)} · 요청 ${active.processedCalls}/${active.plannedCalls}개 처리`
      + `${waiting ? ` · 다음 모델 ${waiting}개 차례 대기` : ""} (자동 갱신 중)`;
  }
}

// 자동기입 흐름도(시퀀스): 참여자 세로선과 순서대로 오가는 요청. 파란 알약은 서버 요청(요청 처리 시간), 보라 알약은 AI 질문
// (AI 응답 시간)이고 회색은 평가가 재지 않는 동작이다. 위쪽 링크로 여는 창이고, 창 안의 단계 탭을 고르면 다른 단계 줄을 흐리게 한다.
const FLOW_ACTORS = [["지원자", "지원서 화면"], ["확장프로그램", "평가 땐 저장된 요청"], ["서버", "Career Form"], ["AI 모델", "JEV · GPT 등"]];
const FLOW_ROWS = [
  { stage: "START", arrows: [[0, 1, "자동기입 버튼"]] },
  { stage: "PREPARATION", arrows: [[1, 2, "섹션 분류", "request"], [2, 3, "AI 질문", "ai"]] },
  { stage: "PREPARATION", arrows: [[3, 1, "조작할 섹션"]] },
  { stage: "PREPARATION", arrows: [[1, 2, "버튼·선택 결정", "request"], [2, 3, "AI 질문", "ai"]] },
  { stage: "PREPARATION", arrows: [[3, 1, "누를 버튼 · 고를 선택지"]] },
  { stage: "PREPARATION", arrows: [[1, 0, "클릭해 칸 펼치기"]] },
  { stage: "MAPPING", arrows: [[1, 2, "섹션 분류", "request"], [2, 3, "AI 질문", "ai"]] },
  { stage: "MAPPING", arrows: [[3, 1, "섹션 범주"]] },
  { stage: "MAPPING", arrows: [[1, 2, "칸 매핑", "request"], [2, 3, "AI 질문 · 5칸씩", "ai"]] },
  { stage: "MAPPING", arrows: [[3, 1, "칸별 항목 · 확신도"]] },
  { stage: "END", arrows: [[1, 0, "확신도 0.8 이상 칸 입력", "result"]] },
];

/** 공고별 자동기입 1번의 서버 요청 수. 준비만 있는 화면의 요청과 칸 매핑이 있는 화면 하나의 요청을 더한다(서버 묶음 규칙과 같다). */
function autofillRequestCounts() {
  const cases = state.dataset?.cases ?? [];
  return [...new Set(cases.map((item) => item.siteId))].map((site) => {
    const inSite = cases.filter((item) => item.siteId === site);
    const mapped = (item) => item.calls.some((call) => call.stage === "MAPPING");
    const start = inSite.filter((item) => !mapped(item)).reduce((sum, item) => sum + item.calls.length, 0);
    const branch = inSite.find(mapped);
    return { site, count: start + (branch?.calls.length ?? 0) };
  }).filter(({ count }) => count).map(({ site, count }) => `${siteName(site)} ${count}개`).join(", ");
}

function flowSvg(focus) {
  const X = [100, 340, 600, 840];
  const top = 62;
  const step = 32;
  const height = top + FLOW_ROWS.length * step + 10;
  const text = (x, y, value, cls, anchor = "middle") =>
    `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" dominant-baseline="central">${value}</text>`;
  const parts = [`<defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="context-stroke"/></marker></defs>`];
  FLOW_ACTORS.forEach(([name, note], index) => {
    parts.push(`<g class="flow-actor-group a${index}">${text(X[index], 16, name, "flow-actor")}${text(X[index], 34, note, "flow-note")}`
      + `<line x1="${X[index]}" y1="46" x2="${X[index]}" y2="${height}" class="flow-life"/></g>`);
  });
  FLOW_ROWS.forEach((row, index) => {
    const y = top + index * step;
    const dim = focus && row.stage !== focus ? " dim" : "";
    const arrows = row.arrows.map(([from, to, label, kind]) => {
      const [x1, x2] = from < to ? [X[from] + 6, X[to] - 6] : [X[from] - 6, X[to] + 6];
      const mid = (X[from] + X[to]) / 2;
      const width = [...label].length * 12.5 + 22;
      const pill = kind ? `<rect x="${mid - width / 2}" y="${y - 11}" width="${width}" height="22" rx="6" class="flow-pill ${kind}"/>`
        + text(mid, y, label, `flow-pill-text ${kind}`)
        : `<rect x="${mid - width / 2}" y="${y - 9}" width="${width}" height="18" class="flow-gap"/>${text(mid, y, label, "flow-label")}`;
      return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="flow-line ${kind ?? "plain"}" marker-end="url(#flow-arrow)"/>${pill}`;
    }).join("");
    parts.push(`<g class="flow-row${dim}" data-flow-stage="${row.stage}">${arrows}</g>`);
  });
  return `<svg viewBox="0 0 940 ${height + 4}" role="img" aria-label="자동기입 흐름">${parts.join("")}</svg>`;
}

/** 자동기입 흐름 창. 단계 탭(전체 흐름·준비·매핑)은 메인 화면에서 고른 단계로 시작한다. */
function flowView() {
  const box = element("div", undefined, "flow-view");
  const tabs = element("div", undefined, "stage flow-tabs");
  const drawing = element("div", undefined, "flow-drawing");
  let current = state.stage;
  const show = () => {
    tabs.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.flow === current)));
    drawing.innerHTML = flowSvg({ prepare: "PREPARATION", mapping: "MAPPING" }[current]);
  };
  [["total", "전체 흐름"], ["prepare", "준비"], ["mapping", "매핑"]].forEach(([key, name]) => {
    const button = element("button", name);
    button.type = "button";
    button.dataset.flow = key;
    button.addEventListener("click", () => { current = key; show(); });
    tabs.append(button);
  });
  show();
  const legend = element("div", undefined, "flow-legend");
  [["request", "서버 요청", "요청 처리 시간 · 요청 하나 안에서 AI에게 여러 번 물을 수 있음"],
    ["ai", "AI 질문", "AI 응답 시간 · 서버가 모델에 보내고 답을 다 받기까지"],
    ["plain", "회색 화살표", "평가가 재지 않음 · 클릭·칸 입력·네트워크 왕복"]].forEach(([kind, name, note]) => {
    const item = element("span", undefined, "flow-legend-item");
    item.append(element("b", name, `flow-chip ${kind}`), element("span", note, "muted"));
    legend.append(item);
  });
  const counts = autofillRequestCounts();
  legend.append(element("p", `자동기입 시간 = 준비와 매핑의 서버 요청 처리 시간의 합.${counts ? ` 자동기입 1번의 요청 수: ${counts}.` : ""} 준비 탭은 준비 요청, 매핑 탭은 매핑 요청을 봅니다. 평가 때는 확장프로그램 대신 저장해 둔 요청을 서버에 보내고, 답을 사람이 검토한 정답과 비교해 채점합니다.`, "muted flow-foot"));
  box.append(element("p", "자동기입 버튼 한 번에 오가는 요청을 순서대로 보입니다. 평가가 채점하고 시간을 재는 곳은 서버 요청과 AI 질문입니다.", "muted criteria-lead"), tabs, drawing, legend);
  return box;
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
  $("#comparison-detail").replaceChildren(...(state.group ? comparisonDetail(state.group) : []));
  const pendingRun = groupRuns(state.group).some(({ run }) => ACTIVE.includes(run.status));
  $("#record-delete").hidden = !state.canDelete;
  $("#record-delete").disabled = !state.group || pendingRun;
  $("#result-copy").disabled = !state.group;
  $("#record-delete").title = !state.group ? "삭제할 기록 없음" : pendingRun ? "진행 중인 실행이 있어 삭제할 수 없음" : "이 실행 기록 삭제";
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
 * PR에 붙일 결과 요약(마크다운). 실행 묶음 after의 조건과 모델별 점수·시간을 표로 만든다. before(이전 실행 묶음)를 주면
 * 변화와 달라진 조건을 함께 적고, 흔들림과 구분할 수 없는 변화에는 '구분 불가'를 붙인다.
 */
function resultSummary(after, before, models) {
  const entries = models.map((model) => groupEntry(after, model)).filter(Boolean);
  const first = entries[0]?.run;
  if (!first) return "";
  const percentText = (value) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
  const secondsText = (ms) => ms == null ? "—" : `${(ms / 1000).toFixed(2)}초`;
  const change = (now, then, unit, scale, unclear) => now == null || then == null ? ""
    : ` (${now - then >= 0 ? "+" : "−"}${(Math.abs(now - then) * scale).toFixed(unit === "%p" ? 1 : 2)}${unit}`
      + `${unclear && Math.abs(now - then) > 1e-9 ? ", 구분 불가" : ""})`;
  const lines = [`### AI 평가 결과 · ${promptKey(first)}`, "",
    `- 데이터셋 v${first.versions.datasetVersion} · 반복 ${first.repetitions}회 · 코드 \`${first.versions.codeVersion ?? "—"}\``];
  if (before) {
    const base = groupRuns(before)[0]?.run;
    lines.push(`- 이전: ${groupLabel(before)} · 반복 ${base?.repetitions ?? "—"}회 · 코드 \`${base?.versions.codeVersion ?? "—"}\``);
  }
  lines.push("", "| 모델 | 자동기입 점수 | 준비 점수 | 매핑 점수 | 정밀도 | 채움률 | 자동기입 시간 | AI 응답 시간 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const entry of entries) {
    const model = modelKey(entry.run);
    const now = entry.report;
    const base = before ? baseEntry(after, before, model) : undefined;
    const then = base?.report;
    const score = (stage) => percentText(now?.scores?.[stage]?.score)
      + change(now?.scores?.[stage]?.score, then?.scores?.[stage]?.score, "%p", 100, base && unclearReason(entry, base, repetitionScores(stage)));
    const total = now?.scores?.TOTAL;
    lines.push(`| ${model} | ${score("TOTAL")} | ${score("PREPARATION")} | ${score("MAPPING")} | ${percentText(total?.precision)} | `
      + `${percentText(total?.fillRate)} | ${secondsText(now?.flows.time.meanMs)}`
      + `${change(now?.flows.time.meanMs, then?.flows.time.meanMs, "초", 0.001, base && unclearReason(entry, base))} | `
      + `${secondsText(now?.performance.TOTAL?.modelAttempt?.meanMs)} |`);
  }
  if (before) {
    const changes = entries.flatMap((entry) => {
      const base = baseEntry(after, before, modelKey(entry.run))?.run;
      return base ? changedConditions(entry.run, base).map((text) => `${modelKey(entry.run)}: ${text}`) : [];
    });
    lines.push("", `- 달라진 조건: ${changes.length ? changes.join(" · ") : "없음(코드·프롬프트·설정 같음)"}`);
  }
  return lines.join("\n");
}

async function copySummary(button, text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    button.dataset.help = "결과 요약을 복사했습니다. PR 본문에 붙여 넣으세요.";
    button.classList.add("copied");
    showHelp(button);
    setTimeout(() => { button.classList.remove("copied"); delete button.dataset.help; hideHelp(); }, 1800);
  }
  catch {
    // 클립보드를 쓸 수 없는 환경이면 직접 복사할 수 있게 보여 준다.
    const area = Object.assign(element("textarea", text, "summary-text"), { readOnly: true, rows: 12 });
    dialog("결과 요약", area, "criteria-dialog");
    area.select();
  }
}

/** 전후 비교 표의 지표. value는 보고에서 값을 꺼내고, values가 있으면 반복별 범위로 흔들림을 판단한다. */
const COMPARE_METRICS = [
  { label: "자동기입 점수", value: (r) => r?.scores?.TOTAL?.score, values: repetitionScores("TOTAL"), kind: "percent" },
  { label: "준비 점수", value: (r) => r?.scores?.PREPARATION?.score, values: repetitionScores("PREPARATION"), kind: "percent" },
  { label: "매핑 점수", value: (r) => r?.scores?.MAPPING?.score, values: repetitionScores("MAPPING"), kind: "percent" },
  { label: "정밀도", value: (r) => r?.scores?.TOTAL?.precision, kind: "percent" },
  { label: "채움률", value: (r) => r?.scores?.TOTAL?.fillRate, kind: "percent" },
  { label: "자동기입 시간", value: (r) => r?.flows?.time?.meanMs, kind: "seconds" },
  { label: "AI 응답 시간", value: (r) => r?.performance?.TOTAL?.modelAttempt?.meanMs, kind: "seconds" },
  { label: "자동기입 실패율", value: (r) => r?.flows?.failureRate, kind: "rate" },
];

/** 같은 데이터셋 버전으로 끝난 실행이 있는 묶음(최신 순). */
function compareGroups() {
  const version = state.catalog?.currentVersion;
  return [...new Set(state.runs.map(({ run }) => groupKey(run)))]
    .filter((key) => groupRuns(key).some(({ run }) => done(run) && run.versions.datasetVersion === version));
}

/** 지표 하나의 이전·이후·변화 칸. 점수는 오를수록, 시간·실패율은 내릴수록 좋음이다. */
function compareCells(metric, now, base) {
  const [after, before] = [metric.value(now.report), metric.value(base.report)];
  const text = (value) => value == null ? "—" : metric.kind === "seconds" ? `${(value / 1000).toFixed(2)}초` : `${(value * 100).toFixed(1)}%`;
  const range = (entry) => {
    const values = metric.values?.(entry.report) ?? [];
    return values.length > 1 ? `${(Math.min(...values) * 100).toFixed(1)}~${(Math.max(...values) * 100).toFixed(1)}` : null;
  };
  const valueCell = (value, entry) => {
    const td = element("td", text(value), "number");
    const spread = range(entry);
    if (spread) td.append(element("span", `반복 ${spread}`, "compare-range"));
    return td;
  };
  const change = element("td", undefined, "number");
  if (after == null || before == null) change.textContent = "—";
  else {
    const diff = after - before;
    const same = Math.abs(diff) < 1e-9;
    const unclear = same ? null : unclearReason(now, base, metric.values);
    const good = metric.kind === "percent" ? diff > 0 : diff < 0;
    const amount = metric.kind === "seconds" ? `${(Math.abs(diff) / 1000).toFixed(2)}초` : `${(Math.abs(diff) * 100).toFixed(1)}%p`;
    const delta = element("span", same ? "변화 없음" : `${diff > 0 ? "+" : "−"}${amount}${unclear ? " 구분 불가" : ""}`,
      `delta ${same ? "same" : unclear ? "unclear" : good ? "good" : "bad"}`);
    if (unclear) delta.dataset.help = unclear;
    change.append(delta);
  }
  return [valueCell(before, base), valueCell(after, now), change];
}

/** 이전·이후 실행에서 판정이 바뀐 항목(칸·섹션·결정). 맞음 +1, 놓침 0, 틀림 −1의 반복 평균이 달라진 것만 남긴다. */
function changedItems(beforeFields, afterFields) {
  const before = new Map(beforeFields.map((field) => [fieldKey(field), field]));
  return afterFields.flatMap((field) => {
    const [now, then] = [cellOf(field), cellOf(before.get(fieldKey(field)))];
    if (!now || !then) return [];
    const direction = Math.sign(Math.round((now.points - then.points) * 1000));
    return direction ? [{ field, now, then, direction }] : [];
  }).sort((a, b) => a.direction - b.direction);
}

/**
 * 전후 비교 탭. 고치기 전(이전)과 후(이후) 실행 묶음을 골라 같은 모델끼리 지표·달라진 조건·판정이 바뀐 항목을 보인다.
 * 메인 화면은 실행 하나만 보이고, 실행 사이의 비교는 여기서만 한다.
 */
function renderCompare() {
  const page = $("#cf-compare");
  const groups = compareGroups();
  const { compare } = state;
  if (!groups.includes(compare.after)) compare.after = groups.includes(state.group) ? state.group : groups[0] ?? "";
  if (!groups.includes(compare.before) || compare.before === compare.after)
    compare.before = groups.slice(groups.indexOf(compare.after) + 1)[0] ?? groups.find((key) => key !== compare.after) ?? "";

  const head = element("div", undefined, "compare-head");
  const title = element("div");
  title.append(element("h2", "전후 비교"), element("p", "고치기 전 실행(이전)과 고친 뒤 실행(이후)을 같은 모델끼리, 모델을 바꿨으면 같은 공급자끼리 비교합니다.", "muted"));
  const picks = element("div", undefined, "compare-picks");
  const picker = (label, key, id) => {
    const select = element("select");
    select.id = id;
    select.setAttribute("aria-label", `${label} 실행`);
    select.append(...groups.map((group) => Object.assign(element("option", groupLabel(group)), { value: group })));
    select.value = compare[key];
    select.addEventListener("change", () => { compare[key] = select.value; renderCompare(); });
    const wrap = element("label");
    wrap.append(element("span", label, "muted"), select);
    return wrap;
  };
  const copy = element("button", undefined, "icon-button copy-button");
  copy.type = "button";
  copy.id = "compare-copy";
  copy.setAttribute("aria-label", "비교 요약 복사");
  copy.title = "비교 요약 복사(PR에 붙이기)";
  copy.innerHTML = $("#result-copy").innerHTML;
  picks.append(picker("이전", "before", "compare-before"), element("span", "→", "muted compare-arrow"), picker("이후", "after", "compare-after"), copy);
  head.append(title, picks);

  if (groups.length < 2 || !compare.before) {
    page.replaceChildren(head, element("div", "비교할 실행이 둘 이상 필요합니다. 고치기 전과 후에 각각 평가를 돌립니다.", "empty"));
    return;
  }
  const models = [...new Set(groupRuns(compare.after).map(({ run }) => modelKey(run)))]
    .filter((model) => groupEntry(compare.after, model) && baseEntry(compare.after, compare.before, model));
  const baseOf = (model) => baseEntry(compare.after, compare.before, model);
  const pairLabel = (model) => {
    const base = baseOf(model).run;
    return modelKey(base) === model ? model : `${base.versions.provider} ${base.versions.model} → ${model.split("/")[1]}`;
  };
  copy.addEventListener("click", () => copySummary(copy, resultSummary(compare.after, compare.before, models)));
  if (!models.length) {
    page.replaceChildren(head, element("div", "두 실행에 함께 끝난 모델이 없습니다.", "empty"));
    return;
  }

  // 지표 표: 모델마다 이전·이후·변화 세 칸.
  const table = element("table", undefined, "compare-table");
  const thead = element("thead");
  const top = element("tr");
  top.append(element("th", "지표"));
  const sub = element("tr");
  sub.append(element("th"));
  models.forEach((model) => {
    const th = element("th", pairLabel(model), "model-col");
    th.colSpan = 3;
    th.style.setProperty("--model", color(model));
    top.append(th);
    sub.append(element("th", "이전", "number"), element("th", "이후", "number"), element("th", "변화", "number"));
  });
  thead.append(top, sub);
  const body = element("tbody");
  for (const metric of COMPARE_METRICS) {
    const row = element("tr");
    row.append(element("th", metric.label));
    models.forEach((model) => row.append(...compareCells(metric, groupEntry(compare.after, model), baseOf(model))));
    body.append(row);
  }
  table.append(thead, body);
  const tableWrap = element("div", undefined, "table-wrap compare-wrap");
  tableWrap.append(table);

  // 달라진 조건: 같으면 모델이 같은 입력에 다르게 답한 흔들림뿐이다.
  const conditions = element("div", undefined, "compare-conditions");
  models.forEach((model) => {
    const changes = changedConditions(groupEntry(compare.after, model).run, baseOf(model).run);
    const line = element("p");
    const name = element("span", model, "stage-model");
    name.style.setProperty("--model", color(model));
    line.append(name, element("span", changes.length ? ` 달라진 조건: ${changes.join(", ")}` : " 조건 같음(코드·프롬프트·설정)",
      changes.length ? "fields-changes" : "muted"));
    conditions.append(line);
  });

  // 판정이 바뀐 항목. 악화를 먼저 보인다.
  const items = element("div", undefined, "compare-items");
  items.append(element("h3", "판정이 바뀐 항목"));
  const loaded = models.map((model) => [model, runFields(baseOf(model).run), runFields(groupEntry(compare.after, model).run)]);
  if (loaded.some(([, before, after]) => before === null || after === null)) items.append(element("p", "항목별 답을 불러오는 중.", "muted"));
  else {
    const list = element("table", undefined, "fields-table");
    const listHead = element("tr");
    listHead.append(...["모델", "화면 · 묶음", "항목", "정답", "이전", "이후"].map((text) => element("th", text)));
    const listBody = element("tbody");
    const summary = element("div", undefined, "fields-summary");
    for (const [model, before, after] of loaded) {
      const changed = changedItems(before ?? [], after ?? []);
      const card = element("div", undefined, "fields-model");
      card.style.setProperty("--model", color(model));
      const line = element("span", undefined, "fields-delta");
      line.append(element("b", `개선 ${changed.filter((item) => item.direction > 0).length}개`, "up"), element("span", " · "),
        element("b", `악화 ${changed.filter((item) => item.direction < 0).length}개`, "down"));
      card.append(element("strong", model, "row-name"), line);
      summary.append(card);
      for (const { field, now, then, direction } of changed) {
        const row = element("tr", undefined, "compare-item");
        const name = element("td", model, "model-col");
        name.style.setProperty("--model", color(model));
        const outcome = (cell) => {
          const td = element("td");
          td.append(element("span", OUTCOMES[cell.main].label, `outcome ${OUTCOMES[cell.main].className}`));
          if (cell.count < cell.total) td.append(element("span", `${cell.count}/${cell.total}`, "outcome-mixed"));
          return td;
        };
        const after = outcome(now);
        after.append(element("span", direction > 0 ? "▲" : "▼", direction > 0 ? "up" : "down"));
        row.append(name, element("td", itemGroup(field)), element("td", itemLabel(field)),
          element("td", itemValue(field, field.expected), field.expected ? "field-key" : "field-key none"), outcome(then), after);
        listBody.append(row);
      }
    }
    list.append(element("thead"), listBody);
    list.firstChild.append(listHead);
    const listWrap = element("div", undefined, "table-wrap fields-wrap");
    if (listBody.children.length) listWrap.append(list);
    else listWrap.append(element("div", "판정이 바뀐 항목 없음.", "fields-empty"));
    items.append(summary, listWrap);
  }

  const foot = element("p", "변화는 이전이나 이후 실행이 반복 1회이거나 두 실행의 반복별 범위가 겹치면 좋음·나쁨 색 없이 '구분 불가'로 보입니다. 프롬프트·코드가 같아도 실행마다 몇 %p씩 움직이므로 둘 다 반복 3회 이상으로 돌립니다. 항목 판정은 맞음 +1, 놓침 0, 틀림 −1의 반복 평균으로 비교합니다.", "muted metric-foot");
  page.replaceChildren(head, tableWrap, conditions, items, foot);
}

/**
 * 비교 기록 삭제 확인. 묶음의 모델별 실행, 호출 결과, 재채점 이력을 지우고 프롬프트 원문은 남긴다. 되돌릴 수 없다.
 */
function confirmDelete(key) {
  if (!key) return;
  const runs = groupRuns(key).map(({ run }) => run);
  const box = element("div", undefined, "delete-confirm");
  box.append(element("p", `"${promptKey(runs[0])}" 실행 기록을 삭제합니다.`, "delete-title"),
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
      if (state.compare.before === key) state.compare.before = "";
      if (state.compare.after === key) state.compare.after = "";
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

/** 실행 이름 짓는 법. 예시를 누르면 이름 칸에 들어간다. 서버 규칙: 영문·숫자·.-_ 32자 이하. */
function namingGuide(input) {
  const box = element("div", undefined, "naming-guide");
  box.append(element("strong", "이름 짓는 법"));
  const list = element("ul");
  [["기준이 되는 첫 실행", ["baseline"]],
    ["프롬프트를 바꾼 실행", ["prompt-none-sections", "prompt-v2"]],
    ["호출 구조·설정을 바꾼 실행", ["batch10", "concurrency6", "parallel-mapping"]],
    ["모델 버전을 바꾼 실행", ["jev-1.14"]]].forEach(([when, examples]) => {
    const item = element("li");
    item.append(element("span", when, "naming-when"));
    examples.forEach((example) => {
      const chip = element("button", example, "naming-example");
      chip.type = "button";
      chip.addEventListener("click", () => { input.value = example; input.focus(); });
      item.append(chip);
    });
    list.append(item);
  });
  box.append(list, element("p", "바꾼 것 하나만 소문자 영어로, 단어는 -로 잇기 · 날짜·모델 이름은 넣지 않기(자동 기록) · 영문·숫자·.-_ 32자 이하", "muted"));
  return box;
}

function dialog(title, content, className) {
  const box = $("#cf-source");
  box.className = `detail ${className ?? ""}`;
  $("#cf-source-title").textContent = title;
  $("#source-content").replaceChildren(content);
  if (!box.open) box.showModal();
}

/** 글과 `코드`를 섞은 한 줄. 백틱으로 감싼 부분을 code로 바꾼다. */
function codeLine(tag, text) {
  const node = element(tag);
  text.split(/(`[^`]+`)/).forEach((part) => node.append(part.startsWith("`") ? element("code", part.slice(1, -1)) : part));
  return node;
}

// 환경별 사용 가이드. 로컬은 고칠 때마다 직접 재고, 개발서버는 머지마다 자동으로 잰다.
const GUIDES = {
  local: {
    name: "로컬",
    lead: "프롬프트·호출 구조·설정을 고친 뒤 나아졌는지 잽니다. 기록은 내 컴퓨터의 Docker 볼륨에만 남습니다.",
    steps: [
      "`python3 scripts/evaluation_local.py`로 이 체크아웃 코드를 띄웁니다. 처음 실행 때 로그인 비밀번호를 정합니다.",
      "고치기 전에 평가 실행 → 이름 `baseline`, 반복 3회로 돌립니다.",
      "코드·프롬프트를 고치고 같은 명령으로 다시 띄웁니다. 커밋 전이면 코드 버전에 `-dirty-`가 붙어 구분됩니다.",
      "고친 뒤 평가를 반복 3회로 돌립니다. 이름에는 바꾼 내용을 적습니다(예: `batch10`).",
      "전후 비교 탭에서 이전 `baseline` → 이후 `batch10`을 고르고, 복사 버튼으로 요약을 PR 본문에 붙입니다.",
    ],
    rows: [
      ["띄우기", "`python3 scripts/evaluation_local.py`", "`127.0.0.1:18090/evaluations/`"],
      ["끄기", "`python3 scripts/evaluation_local.py stop`", "기록은 남습니다"],
      ["비밀번호 다시 정하기", "`python3 scripts/evaluation_local.py reset-password`", "해시만 저장합니다"],
      ["기록 지우기", "휴지통 버튼", "로컬에서만 보입니다. 개발서버 기록은 지울 수 없습니다"],
      ["모델 키", "`.env.local`", "JEV·OpenAI 키를 읽습니다(없으면 메인 체크아웃)"],
    ],
  },
  dev: {
    name: "개발서버",
    lead: "develop에 머지되어 배포될 때, 평가에 영향을 주는 변경이 있으면 서버가 평가를 한 번 자동으로 돌립니다. 변수명 변경처럼 AI에 묻는 내용이 같으면 돌지 않습니다. 기록은 개발서버 MongoDB에 계속 남습니다.",
    steps: [
      "실행에서 가장 최근 자동 평가를 고릅니다. 이름이 바뀐 것과 커밋입니다(예: `prompt-391fbd8`, `call-391fbd8`). 실행 조건에 '자동(배포)'로 표시됩니다.",
      "전후 비교 탭에서 이전에 그 전 자동 평가를 고르면 그 변경이 바꾼 점수·시간·항목을 봅니다.",
      "더 재보고 싶으면 평가 실행으로 직접 돌립니다. 반복 3회 한 번에 약 $0.2(GPT 약 $0.13, JEV 약 $0.07)가 듭니다.",
    ],
    rows: [
      ["자동 평가 조건", "AI 질문·응답, 프롬프트, 설정, 공급자 연결 코드, 데이터셋", "하나라도 바뀌면 돕니다. AI 호출 없이 가짜 모델로 판단합니다. 공급자가 같은 이름으로 모델을 바꾼 경우와 속도만 바뀐 변경은 알 수 없어 직접 돌립니다"],
      ["자동 평가 이름", "`prompt` `call` `settings` `provider` `dataset` + 커밋", "첫 평가는 `first`, 많이 바뀌면 `multi`. 반복 3회, 공급자마다 기본 모델 하나"],
      ["켜는 값(관리자)", "GitHub `development` Environment", "변수 `CAREER_FORM_QUALITY_ENABLED`, `CAREER_FORM_EVALUATION_ENABLED`, `CAREER_FORM_EVALUATION_AUTO_RUN_ENABLED`, `CAREER_FORM_EVALUATION_OPENAI_ENABLED`를 true로, 시크릿 `CAREER_FORM_QUALITY_PASSWORD_HASH`"],
      ["로그인", "팀 공용 비밀번호", "비밀번호 원문은 서버에 없고 해시만 있습니다"],
      ["운영·스테이징", "켜지 않음", "배포 설정이 평가 값을 넘기지 않습니다"],
    ],
  },
};

/** 사용 가이드 대화상자. 지금 서버가 로컬 주소면 로컬 탭을, 아니면 개발서버 탭을 먼저 연다. */
function guideView() {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  let current = local ? "local" : "dev";
  const box = element("div", undefined, "guide");
  const tabs = element("div", undefined, "dataset-tabs guide-tabs");
  const body = element("div");
  const show = () => {
    tabs.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.guide === current)));
    const guide = GUIDES[current];
    const steps = element("ol", undefined, "guide-steps");
    guide.steps.forEach((step) => steps.append(codeLine("li", step)));
    const table = element("table", undefined, "criteria-table");
    const rows = element("tbody");
    guide.rows.forEach(([name, value, note]) => {
      const row = element("tr");
      row.append(element("td", name), codeLine("td", value), codeLine("td", note));
      rows.append(row);
    });
    table.append(rows);
    body.replaceChildren(element("p", guide.lead, "muted criteria-lead"), element("h4", "순서"), steps, element("h4", "참고"), table);
  };
  Object.entries(GUIDES).forEach(([key, guide]) => {
    const button = element("button", guide.name);
    button.type = "button";
    button.dataset.guide = key;
    button.addEventListener("click", () => { current = key; show(); });
    tabs.append(button);
  });
  show();
  box.append(tabs, body);
  return box;
}

// 공고·화면 이름과 설명은 데이터셋 목록 파일(catalog.json)에서 온다. 공고나 화면을 더해도 이 코드는 고치지 않는다.
const siteName = (site) => state.catalog?.sites?.[site]?.name ?? site;
const stateName = (key) => state.catalog?.states?.[key]?.name ?? key;
const stateNote = (key) => state.catalog?.states?.[key]?.note;
const CONTROL_NAMES = { text: "글자", select: "선택", radio: "라디오", checkbox: "체크", textarea: "긴 글", custom: "직접 구현" };
const CALL_NAMES = { SECTION_CLASSIFY: "섹션 분류", INTERACTION_DECISION: "버튼·선택 결정", GENERIC_FIELDS: "칸 매핑" };
const REVIEW_NAMES = { privacy: "개인정보", structure: "구조", mappingTruth: "칸 정답", preparationTruth: "준비 정답",
  inputIdentity: "입력 동일성" };
const REVIEW_OK = new Set(["PASSED", "HUMAN_REVIEWED", "SOURCE_PIPELINE_VERIFIED", "INSTALLED_VERIFIED"]);

const CONTROL_ICONS = { text: "▭", select: "▾", radio: "◉", checkbox: "☑", textarea: "¶" };
const STEP_APIS = { SECTION_CLASSIFY: "/generic/sections/classify", INTERACTION_DECISION: "/generic/interaction-decisions",
  GENERIC_FIELDS: "/generic/fields/analyze" };
const sectionTitle = (group) => !group.title ? "제목 없음" : group.title === "[비식별]" ? "기본정보" : group.title;

/**
 * 데이터셋 대화상자. 위에 공고 탭, 왼쪽에 고른 공고의 화면 상태 목록과 합성 프로필, 오른쪽에 고른 화면의 설명·채점 흐름·
 * 지원서 와이어프레임을 둔다. {@code selected}가 "profile"이면 합성 프로필을 보인다.
 */
function datasetView(selected = 0) {
  const data = state.dataset;
  if (!data) return element("p", "데이터셋을 불러오지 못했습니다.", "muted");
  const wrap = element("div", undefined, "dataset-view");
  const count = (item) => item.sections.reduce((n, group) => n + group.fields.length, 0);
  const head = element("div", undefined, "dataset-head");
  const title = element("div");
  const sites = [...new Set(data.cases.map((item) => item.siteId))];
  title.append(element("strong", `데이터셋 v${data.version} · 공고 ${sites.length}개`),
    element("span", `화면 ${data.cases.length}개 · 입력 칸 ${data.cases.reduce((n, item) => n + count(item), 0)}개 · 합성 프로필 ${Object.keys(data.profiles).length}명`, "muted"));
  head.append(title, element("span", data.usable ? "평가에 사용 가능" : "검토 필요", data.usable ? "badge ok" : "badge"));
  wrap.append(head);
  const about = element("details", undefined, "dataset-about");
  about.append(element("summary", "이 데이터셋이란"),
    element("p", "실제 채용 지원서를 개인정보 없이 정제한 화면 모음. 선택에 따라 나타나는 칸이 달라지는 지원서는 화면 상태마다 따로 평가합니다. 모델은 확장프로그램이 실제로 보내는 질문에 답하고, 사람이 검토한 정답과 비교해 채점합니다."));
  wrap.append(about);
  if (!data.usable && data.rejection) wrap.append(element("p", `미완료 검토: ${data.rejection}`, "muted"));
  const go = (target) => dialog("데이터셋", datasetView(target), "dataset-dialog");
  // 공고 탭: 고른 화면의 공고가 눌린 상태다. 합성 프로필을 볼 때는 첫 공고를 둔다.
  const site = selected === "profile" ? sites[0] : data.cases[selected]?.siteId;
  const tabs = element("div", undefined, "dataset-tabs posting-tabs");
  sites.forEach((key) => {
    const cases = data.cases.filter((item) => item.siteId === key);
    const tab = element("button");
    tab.type = "button";
    tab.setAttribute("aria-pressed", String(key === site));
    tab.append(element("strong", siteName(key)), element("span", `화면 ${cases.length}개`, "muted"));
    tab.addEventListener("click", () => go(data.cases.indexOf(cases[0])));
    tabs.append(tab);
  });
  wrap.append(tabs);
  const layout = element("div", undefined, "dataset-layout2");
  const nav = element("nav", undefined, "screen-list");
  data.cases.forEach((item, index) => {
    if (item.siteId !== site) return;
    const button = element("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(selected === index));
    button.append(element("strong", stateName(item.state)),
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
    top.append(element("h3", stateName(item.state)),
      element("span", item.split === "tuning" ? "튜닝용" : "최종 평가용", "badge"));
    main.append(top);
    if (stateNote(item.state)) main.append(element("p", stateNote(item.state), "state-note"));
    // 채점 흐름: 준비 요청과 매핑 요청으로 묶어 단계와 API를 보인다.
    const flow = element("div", undefined, "score-flow");
    [["PREPARATION", "준비 요청", "칸을 꺼내기 위한 질문"], ["MAPPING", "매핑 요청", "칸에 넣을 값을 정하는 질문"]].forEach(([stage, name, note]) => {
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
    const base = data.cases.find((other) => other.siteId === item.siteId && other.state === "initial");
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
    main.append(element("h4", `지원서 화면 · 입력 칸 ${count(item)}개`),
      item.sections.length ? form : element("p", "이 화면은 칸 채우기를 채점하지 않아 칸 목록이 없습니다(준비 단계만).", "muted"));
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

/** 정답 기준 대화상자. 대표 점수(자동기입 점수)와 칸별 결과, 정답 기준, 준비 결과·섹션 분류 결과, 흔들림을 예시와 함께 보인다. */
function criteriaView() {
  const wrap = element("div", undefined, "criteria-view");
  const formula = element("div", undefined, "criteria-formula");
  formula.append(element("span", "자동기입 점수", "formula-name"), element("span", "="),
    element("span", "정밀도", "formula-part"), element("span", "×2 와"), element("span", "채움률", "formula-part"),
    element("span", "의 조화 평균(F0.5)"));
  wrap.append(formula, element("p", "잘못 답하면(엉뚱한 값을 넣거나 엉뚱한 섹션을 조작하면) 사용자가 찾아서 고쳐야 하지만, 놓친 것은 직접 하면 됩니다. 그래서 잘못 답하면 놓칠 때보다 2배 크게 깎습니다. 아무것도 답하지 않으면 0점입니다. 같은 식으로 준비 점수(섹션 분류·버튼·선택 결정), 매핑 점수(섹션 분류·칸 매핑), 둘을 합친 자동기입 점수를 냅니다. 칸 매핑은 확신도 0.8 이상만 답한 것으로 보고, 나머지 질문은 답 그대로 봅니다.", "muted criteria-lead"));
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
      ["놓침", "정답이 있는데 넣지 않음(비움·확인 필요·막음·요청 실패)", "직접 입력"], ["잘못 넣음", "다른 항목을 넣거나 넣지 말아야 할 칸에 넣음", "찾아서 고쳐야 함"]]),
    table(["지표", "계산"], [["정밀도", "맞게 넣음 ÷ 넣은 칸"], ["채움률", "맞게 넣음 ÷ 정답이 있는 칸"]]),
    element("p", "확장프로그램의 이름 칸 보정, 정확히 일치하는 값 올림 규칙은 반영하지 않습니다. OpenAI 확신도는 모델이 스스로 적은 값입니다.", "muted"));
  card("2. 정답 기준",
    element("p", "칸이 뜻하는 지원 프로필 항목이 정답. 지원자가 그 값을 가졌는지는 따지지 않습니다. 지원 프로필 항목에 없는 의미면 정답은 '넣을 항목 없음'."),
    table(["예시", "정답"], [["학교명 칸(대학교 행)", "education.university.schoolName"], ["자기소개서 칸", "넣을 항목 없음"],
      ["지원경로 섹션", "해당 없음(NONE)"]]));
  card("3. 준비 결과 · 섹션 분류 결과",
    element("p", "준비(섹션 분류·버튼·선택 결정)와 매핑(섹션 분류)의 질문을 확신도와 무관하게 모델 답 그대로 채점합니다. 맞힌 항목 비율이며 항목은 섹션 하나, 칸 하나, 버튼·선택지 결정 하나. 준비는 칸을 꺼내기 위한 질문(조작할 섹션 분류, 버튼·선택 결정), 매핑은 칸에 넣을 값을 정하는 질문(전체 섹션 분류, 칸 매핑)."),
    table(["항목 판정", "뜻"], [["오답", "정답이 있는데 다른 항목을 고름"], ["누락(판단 보류)", "정답이 있는데 고르지 않음"],
      ["불필요 제안", "넣을 항목이 없는데 무언가를 고름"]]));
  card("4. 점수에서 빠지는 것",
    table(["경우", "처리"], [["타임아웃·API 오류·응답 형식 오류", "점수에서 빼고 실패율에 넣음"],
      ["공급자를 쓸 수 없어 답하지 못한 항목", "그 항목만 채점에서 뺌"], ["채점할 항목이 하나도 없는 호출", "채점 불가로 실패율에 넣음"],
      ["확신도를 기록하기 전 실행", "자동기입 점수 측정 불가"]]));
  card("5. 반복별 범위",
    element("p", "같은 입력을 반복마다 따로 채점한 자동기입 점수의 최소~최대. 두 모델의 범위가 겹치면 차이를 구분할 수 없습니다."),
    element("p", "반복 수가 적으면 범위가 실제보다 좁게 잡힙니다. 같은 입력을 새로 실행하면 범위 밖으로 움직일 수 있습니다.", "muted"),
    element("p", "전후 비교 탭의 변화는 이전이나 이후 실행이 반복 1회이거나 두 실행의 반복별 범위가 겹치면 좋음·나쁨 색 없이 '구분 불가'로 보입니다. 프롬프트·코드가 같아도 실행마다 몇 %p씩 움직이므로, 개선을 판단할 때는 둘 다 반복 3회 이상으로 돌립니다.", "muted"));
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
  // 원문은 코드 폭에 맞춰 문장 중간에서 줄을 바꾸므로, 소문자로 이어지는 줄은 앞 줄에 붙인 뒤 문장으로 나눈다.
  return text.replace(/\s*\n\s*(?=[a-z])/g, " ").split("\n")
    .flatMap((line) => line.split(/(?<=[.;])\s+(?=[A-Z{])/)).filter((line) => line.trim());
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
  form.append(element("p", "100만 토큰당 USD 단가. 이 브라우저에만 저장합니다.", "pricing-explanation"), message, apply);
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
  const repetitions = Object.assign(element("input"), { type: "number", min: "1", max: "20", value: "3" });
  const prompt = Object.assign(element("input"), { type: "text", maxLength: 32, placeholder: "예: baseline",
    pattern: "[A-Za-z0-9._\\-]{1,32}", title: "영문·숫자·.-_ 32자 이하" });
  const message = element("p", "실제 모델을 호출하며 비용이 발생합니다. 진행 중인 평가가 있으면 등록되지 않습니다.", "muted");
  const submit = element("button", "등록", "apply-pricing");
  submit.type = "submit";
  form.append(
    field("모델", targets, providers.length
      ? "비교할 모델을 고릅니다(최대 5개). 같은 조건으로 한 모델씩 차례로 돌고, 결과는 한 화면에 나란히 나옵니다."
      : "이 서버에 연결된 공급자가 없습니다.", "div"),
    field("반복 수", repetitions, "같은 입력을 몇 번 돌릴지(1~20). 전후 비교에서 흔들림과 진짜 변화를 가르려면 3 이상이 필요합니다."),
    field("실행 이름", prompt, "무엇을 바꿨는지 짧게(선택). 프롬프트 원문·코드 버전·서버 설정·날짜는 서버가 자동으로 기록합니다."),
    namingGuide(prompt),
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
        datasetId: DATASET.id, datasetVersion: state.catalog?.currentVersion, split: "all",
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

const loadedDatasets = {};

/** 화면에 보이는 데이터셋을 고른 실행의 버전으로 맞춘다. 실행이 없으면 새 평가가 쓰는 버전이다. */
async function selectDataset() {
  const versions = groupRuns(state.group)[0]?.run.versions;
  const version = versions?.datasetVersion ?? state.catalog?.currentVersion;
  if (version == null) return void (state.dataset = null);
  const key = `${versions?.datasetId ?? DATASET.id}/v${version}`;
  if (!(key in loadedDatasets)) {
    try { loadedDatasets[key] = await api(`/datasets/${key}`); } catch { return void (state.dataset = null); }
  }
  state.dataset = loadedDatasets[key];
}

async function load() {
  clearTimeout(pollTimer);
  let failed = null;
  try {
    state.runs = await api("/runs?limit=50");
    state.catalog = await api(`/datasets/${DATASET.id}/catalog`);
    // 기록 삭제는 서버가 허용할 때만 보인다(개발서버처럼 함께 쓰는 서버는 꺼져 있다).
    state.canDelete = (await api("/capabilities")).recordDelete === true;
  } catch (error) {
    state.runs = [];
    failed = error.message;
  }
  renderFilters();
  await selectDataset();
  renderFilters();
  render();
  if (failed) Object.assign($("#cf-status"), { textContent: failed, hidden: false });
  // 대기·실행 중인 평가가 있으면 끝날 때까지 결과를 다시 불러온다.
  if (state.runs.some(({ run }) => ["WAITING", "QUEUED", "RUNNING"].includes(run.status))) pollTimer = setTimeout(load, POLL_MS);
}

root.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => { state.page = b.dataset.page; render(); }));
root.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => { state.stage = b.dataset.stage; render(); }));
$("#comparison").addEventListener("change", async (e) => {
  state.group = e.target.value; state.selected = []; state.openField = null;
  await selectDataset();
  renderFilters();
  render();
});
$("#cf-source-close").addEventListener("click", () => $("#cf-source").close());
$("#run-open").addEventListener("click", openRun);
$("#record-delete").addEventListener("click", () => confirmDelete(state.group));
$("#result-copy").addEventListener("click", () => copySummary($("#result-copy"), resultSummary(state.group, null, state.selected)));
$("#provider-open").addEventListener("click", () => openProviders());
$("#guide-open").addEventListener("click", () => dialog("사용 가이드", guideView(), "criteria-dialog"));
$("#refresh").addEventListener("click", load);
document.getElementById("logout").addEventListener("click", () => { clearAccess(); location.reload(); });
root.querySelectorAll("[data-source]").forEach((link) => link.addEventListener("click", async (event) => {
  event.preventDefault();
  const kind = link.dataset.source;
  try {
    if (kind === "데이터셋") dialog(kind, datasetView(), "dataset-dialog");
    else if (kind === "자동기입 흐름") dialog(kind, flowView(), "dataset-dialog");
    else if (kind === "정답 기준") dialog(kind, criteriaView(), "criteria-dialog");
    else dialog(kind, await promptView(), "criteria-dialog");
  } catch (error) { dialog(kind, element("p", error.message, "muted"), "criteria-dialog"); }
}));
await load();
