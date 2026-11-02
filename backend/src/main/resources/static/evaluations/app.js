// AI 평가 화면. 평가 실행 API의 결과만 표시한다. 예시 데이터나 추정값을 만들지 않으며 미관측 값은 "—"로 둔다.
import { accessHeaders, clearAccess } from "/quality/access.js";
import { estimateCost, formatUsd, validRate } from "/evaluations/pricing.js";

// 첫 버전이 기본값이다. 이전 버전은 이전 결과와 같은 입력으로 다시 잴 때 고른다.
const DATASET = { id: "generic-matching", versions: [2, 1] };
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
      UNKNOWN_PROVIDER: "이 서버에 연결되지 않은 공급자입니다.",
      UNKNOWN_MODEL: "이 공급자가 허용하지 않은 모델입니다.",
      INVALID_TARGETS: "모델은 1~5개를 중복 없이 골라 주세요.",
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
const SPLIT = { tuning: "튜닝용", final: "최종 평가용" };
function groupLabel(key) {
  const runs = groupRuns(key).map(({ run }) => run);
  const first = runs[0];
  const at = new Date(first.requestedAt);
  const time = `${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${time} · ${SPLIT[first.versions.split] ?? first.versions.split} · 데이터 v${first.versions.datasetVersion} · 반복 ${first.repetitions} · ${promptKey(first)} · 모델 ${runs.length}개`;
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
    bars("자동기입 최종 정확도", "%", (m) => percent(report(m)?.quality.accuracy), 100, (v) => `${v.toFixed(1)}%`,
      "채점 가능한 준비·매핑 호출 점수의 평균. 실패 호출은 빠진다."),
    bars("준비 정확도", "%", (m) => percent(report(m)?.quality.preparationAccuracy), 100, (v) => `${v.toFixed(1)}%`),
    bars("필드 매핑 정확도", "%", (m) => percent(report(m)?.quality.mappingAccuracy), 100, (v) => `${v.toFixed(1)}%`));
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
      value.append(element("b", `${count(totals[index])} 토큰`),
        element("span", `입력 ${count(tokens.inputMean)} · 출력 ${count(tokens.outputMean)}`, "muted"));
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
  if (observed.length > 1) {
    const sorted = [...observed].sort((a, b) => totals[rows.indexOf(a)] - totals[rows.indexOf(b)]);
    const low = totals[rows.indexOf(sorted[0])];
    const high = totals[rows.indexOf(sorted[sorted.length - 1])];
    box.append(element("p", `같은 입력에서 시도당 토큰이 ${count(low)}에서 ${count(high)}까지 ${(high / low).toFixed(1)}배 벌어집니다.`, "token-summary"));
  }
  return box;
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

function datasetView() {
  const wrap = element("div", undefined, "dataset-layout");
  const data = state.dataset;
  if (!data) return element("p", "데이터셋을 불러오지 못했습니다.", "muted");
  wrap.append(element("p", `${data.datasetId} v${data.version} · ${data.usable ? "평가에 사용 가능" : "평가 전 검토 필요"}`, "muted"));
  if (!data.usable && data.rejection) wrap.append(element("p", `미완료 검토: ${data.rejection}`, "muted"));
  for (const item of data.cases) {
    const section = element("section", undefined, "application-preview");
    section.append(element("h5", `${item.siteId} · ${item.state} · ${item.split === "tuning" ? "튜닝용" : "최종 평가용"}`));
    section.append(element("p", `호출 ${item.calls.map((c) => `${c.order}.${c.stage === "PREPARATION" ? "준비" : "매핑"} ${c.kind}(${c.items})`).join(" → ")}`, "muted"));
    if (item.actions.length) section.append(element("p", `화면 동작: ${item.actions.join(", ")}`, "muted"));
    const fields = element("div", undefined, "application-fields");
    for (const group of item.sections) for (const field of group.fields)
      fields.append(Object.assign(element("div"), { textContent: `${group.title ?? "제목 없음"} · ${field.label ?? "이름 없음"} (${field.control})` }));
    section.append(fields);
    const review = element("p", Object.entries(item.review).map(([k, v]) => `${k} ${v}`).join(" · "), "muted");
    section.append(review);
    wrap.append(section);
  }
  for (const [id, profile] of Object.entries(data.profiles)) {
    const box = element("section", undefined, "profile-preview");
    box.append(element("h5", `평가 프로필 ${id} (합성)`));
    box.append(element("pre", JSON.stringify(profile, null, 2)));
    wrap.append(box);
  }
  return wrap;
}

function criteriaView() {
  const list = element("div", undefined, "criteria-list");
  const lines = [
    ["호출 점수", "맞힌 항목 수 ÷ 정답 항목 수(매핑 불가·기권 정답 포함). 항목 안 부분 점수 없음."],
    ["오답의 종류", "다른 키, 누락(정답이 있는데 답 없음), 불필요 제안(정답이 매핑 불가인데 답함)은 모두 그 항목의 오답이며 별도 감점은 없다."],
    ["채점 제외", "공급자 사용 불가 항목은 빼고, 모든 항목이 빠진 호출은 채점 불가로 실패율에 넣는다."],
    ["최종 정확도", "채점 가능한 호출 점수의 합 ÷ 채점 가능한 호출 수. 호출 안의 항목 수로 비중을 바꾸지 않는다."],
    ["실패", "타임아웃, API 오류, 응답 형식 오류는 정확도에서 빼고 실패율에 넣는다. 채점 가능한 호출이 없으면 측정 불가."],
  ];
  for (const [title, text] of lines) {
    const section = element("section");
    section.append(element("h4", title), element("p", text));
    list.append(section);
  }
  return list;
}

async function promptView() {
  const wrap = element("div", undefined, "criteria-list");
  const versions = [];
  for (const { run } of [...state.runs].reverse())
    if (!versions.some((v) => v.digest === run.versions.promptDigest))
      versions.push({ digest: run.versions.promptDigest, name: promptKey(run) });
  if (!versions.length) return element("p", "실행 기록이 없어 프롬프트 버전이 없습니다.", "muted");
  const shown = groupRuns(state.group)[0]?.run.versions.promptDigest;
  const index = Math.max(0, versions.findIndex((v) => v.digest === shown));
  const current = await api(`/prompts/${versions[index].digest}`);
  const previous = index > 0 ? await api(`/prompts/${versions[index - 1].digest}`) : null;
  wrap.append(element("p", `${versions[index].name} · ${current.digest.slice(0, 12)}${previous ? ` · 이전 ${versions[index - 1].name} 대비 바뀐 조각만 표시` : ""}`, "muted"));
  for (const [name, text] of Object.entries(current.parts)) {
    const before = previous?.parts[name];
    if (previous && before === text) continue;
    const section = element("section");
    section.append(element("h4", `${name}${previous ? (before === undefined ? " (추가)" : " (변경)") : ""}`));
    if (before !== undefined) section.append(element("pre", `- ${before}`));
    section.append(element("pre", `${previous ? "+ " : ""}${text}`));
    wrap.append(section);
  }
  for (const name of Object.keys(previous?.parts ?? {}).filter((n) => !(n in current.parts))) {
    const section = element("section");
    section.append(element("h4", `${name} (삭제)`), element("pre", `- ${previous.parts[name]}`));
    wrap.append(section);
  }
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
  const split = element("select");
  split.append(Object.assign(element("option", "튜닝용"), { value: "tuning" }), Object.assign(element("option", "최종 평가용"), { value: "final" }));
  const version = element("select");
  DATASET.versions.forEach((value) => version.append(Object.assign(element("option", `v${value}`), { value: String(value) })));
  const repetitions = Object.assign(element("input"), { type: "number", min: "1", max: "20", value: "1" });
  const prompt = Object.assign(element("input"), { type: "text", maxLength: 32, placeholder: "비워 두면 이름 없음" });
  const message = element("p", "실제 모델을 호출하며 비용이 발생합니다. 진행 중인 평가가 있으면 등록되지 않습니다.", "muted");
  const submit = element("button", "등록", "apply-pricing");
  submit.type = "submit";
  form.append(
    field("모델", targets, providers.length
      ? "비교할 모델을 고릅니다(최대 5개). 같은 조건으로 한 모델씩 차례로 돌고, 결과는 한 화면에 나란히 나옵니다."
      : "이 서버에 연결된 공급자가 없습니다.", "div"),
    field("데이터셋 버전", version, "같은 화면·정답을 그 버전의 제품 수집기 요청으로 잽니다. 개선 전후는 같은 버전끼리 비교합니다."),
    field("분할", split, "튜닝용은 개선 작업 중 확인용, 최종 평가용은 개선 전후 비교용 화면입니다."),
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
        datasetId: DATASET.id, datasetVersion: Number(version.value), split: split.value,
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
  try { state.dataset = await api(`/datasets/${DATASET.id}/v${DATASET.versions[0]}`); } catch { state.dataset = null; }
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
