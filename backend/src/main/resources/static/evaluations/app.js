// AI 평가 화면. 평가 실행 API의 결과만 표시한다. 예시 데이터나 추정값을 만들지 않으며 미관측 값은 "—"로 둔다.
import { accessHeaders, clearAccess } from "/quality/access.js";
import { estimateCost, formatUsd, validRate } from "/evaluations/pricing.js";

const DATASET = { id: "generic-matching", version: 1 };
const COLORS = ["#4e6d90", "#688b7c", "#ac8d68", "#8a6f9e", "#6f8f9e"];
const PRICE_KEY = "cf-evaluation-model-prices-v1";
const root = document.getElementById("cf-eval-preview");
const $ = (selector) => root.querySelector(selector);
const state = { runs: [], dataset: null, models: [], selected: [], promptVersion: null, stage: "total", page: "overview" };
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
    };
    throw new Error(reasons[body?.code] ?? (response.status === 404 ? "평가 기능이 꺼져 있거나 대상이 없습니다." : "지금 처리할 수 없습니다."));
  }
  return body;
}

const modelKey = (run) => `${run.versions.provider}/${run.versions.model}`;
const promptKey = (run) => run.versions.promptVersion ?? run.versions.promptDigest.slice(0, 8);
const done = (run) => ["COMPLETED", "PARTIAL"].includes(run.status);

/** 모델·프롬프트별 가장 최근에 끝난 실행. */
function latest(model, prompt) {
  return state.runs.find(({ run }) => done(run) && modelKey(run) === model && promptKey(run) === prompt);
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
const report = (model) => latest(model, state.promptVersion)?.report;

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
    const number = (value) => value == null ? "—" : Math.round(value).toLocaleString();
    row.append(name, element("td", number(tokens?.inputMean)), element("td", number(tokens?.outputMean)),
      element("td", number(tokens?.inputMean == null ? null : tokens.inputMean + tokens.outputMean)),
      element("td", number(tokens?.inputTotal == null ? null : tokens.inputTotal + tokens.outputTotal)),
      element("td", tokens ? String(tokens.unobservedAttempts) : "—"),
      element("td", tokens ? formatUsd(cost) : "—", "cost-cell"), element("td", tokens ? formatUsd(totalCost) : "—", "cost-cell"));
    body.append(row);
    const line = element("div", undefined, "token-comparison");
    line.append(element("div", `${model} · ${tokens?.inputMean == null ? "—" : number(tokens.inputMean + tokens.outputMean) + " 토큰"} · 평균 예상 비용 ${tokens ? formatUsd(cost) : "—"}`, "token-model"));
    chart.append(line);
  }
}

function render() {
  $("#cf-overview").hidden = state.page === "tokens";
  $("#cf-tokens").hidden = state.page !== "tokens";
  root.querySelectorAll("[data-page]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.page === state.page)));
  root.querySelectorAll("[data-stage]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stage === state.stage)));
  renderOverview();
  renderTokens();
  const cases = state.dataset?.cases ?? [];
  $("#profile-count").textContent = `프로필 ${new Set(cases.map((c) => c.profileId)).size}개`;
  $("#site-count").textContent = `사이트 ${new Set(cases.map((c) => c.siteId)).size}개`;
  const active = state.runs.find(({ run }) => ["QUEUED", "RUNNING"].includes(run.status))?.run;
  const STATUS = { QUEUED: "대기 중", RUNNING: "실행 중", COMPLETED: "완료", PARTIAL: "일부 완료", FAILED: "실패", CANCELLED: "취소됨" };
  const last = state.runs[0]?.run;
  $("#cf-status").textContent = active
    ? `${STATUS[active.status]} · ${active.processedCalls}/${active.plannedCalls} 호출 처리 (자동 갱신 중)`
    : last ? `최근 실행: ${STATUS[last.status] ?? last.status} · ${last.processedCalls}/${last.plannedCalls} 호출 · 총 ${state.runs.length}건`
      : "측정 결과 없음";
}

function renderFilters() {
  state.models = [...new Set(state.runs.map(({ run }) => modelKey(run)))];
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
  const prompts = [...new Set(state.runs.map(({ run }) => promptKey(run)))];
  state.promptVersion = prompts.includes(state.promptVersion) ? state.promptVersion : prompts[0] ?? null;
  const select = $("#prompt-version");
  select.replaceChildren(...prompts.map((p) => Object.assign(element("option", p), { value: p })));
  select.value = state.promptVersion ?? "";
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
  const index = Math.max(0, versions.findIndex((v) => v.name === state.promptVersion));
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
  const field = (label, input, hint) => {
    const wrap = element("label");
    wrap.append(element("span", label), input, element("span", hint, "hint"));
    return wrap;
  };
  const provider = element("select");
  const model = element("select");
  for (const item of providers) provider.append(Object.assign(element("option", item.provider), { value: item.provider }));
  const fillModels = () => {
    const chosen = providers.find((item) => item.provider === provider.value);
    model.replaceChildren(...(chosen?.models ?? []).map((name) => Object.assign(element("option", name), { value: name })));
    model.value = chosen?.defaultModel ?? "";
  };
  provider.addEventListener("change", fillModels);
  fillModels();
  const split = element("select");
  split.append(Object.assign(element("option", "튜닝용"), { value: "tuning" }), Object.assign(element("option", "최종 평가용"), { value: "final" }));
  const repetitions = Object.assign(element("input"), { type: "number", min: "1", max: "20", value: "1" });
  const prompt = Object.assign(element("input"), { type: "text", maxLength: 32, placeholder: "비워 두면 이름 없음" });
  const message = element("p", "실제 모델을 호출하며 비용이 발생합니다. 진행 중인 평가가 있으면 등록되지 않습니다.", "muted");
  const submit = element("button", "등록", "apply-pricing");
  submit.type = "submit";
  form.append(
    field("공급자", provider, providers.length ? "이 서버에 연결된 공급자만 나옵니다." : "연결된 공급자가 없습니다."),
    field("모델", model, "같은 데이터셋으로 모델끼리 비교합니다."),
    field("분할", split, "튜닝용은 개선 작업 중 확인용, 최종 평가용은 개선 전후 비교용 화면입니다."),
    field("반복 수", repetitions, "같은 입력을 몇 번 돌릴지(1~20). 응답시간 편차를 보려면 3 이상을 권장합니다."),
    field("프롬프트 이름", prompt, "결과를 구분할 이름표(선택). 예: baseline. 실제 프롬프트 내용은 서버가 자동으로 기록합니다."),
    message, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const result = await api("/runs", "POST", {
        datasetId: DATASET.id, datasetVersion: DATASET.version, split: split.value,
        repetitions: Number(repetitions.value), promptVersion: prompt.value.trim() || null, overrides: {},
        provider: provider.value || null, model: model.value || null,
      });
      $("#cf-source").close();
      $("#cf-status").textContent = `등록했습니다(실행 ${result.runId.slice(0, 8)}). 진행 상황을 자동으로 갱신합니다.`;
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
  if (state.runs.some(({ run }) => ["QUEUED", "RUNNING"].includes(run.status))) pollTimer = setTimeout(load, POLL_MS);
}

root.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => { state.page = b.dataset.page; render(); }));
root.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => { state.stage = b.dataset.stage; render(); }));
$("#prompt-version").addEventListener("change", (e) => { state.promptVersion = e.target.value; render(); });
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
