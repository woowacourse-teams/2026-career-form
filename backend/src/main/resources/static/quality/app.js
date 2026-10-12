import { accessHeaders, clearAccess } from "./access.js";
import { siteCard, scopePostings } from "./site-card.js";

const items = document.getElementById("items");
const message = document.getElementById("message");
const more = document.getElementById("more");
const claimant = document.getElementById("claimant");
const statusNames = { WAITING: "대기", REQUESTED: "확인 요청됨", CLAIMED: "담당 중", DEFERRED: "보류", COMPLETED: "확인 완료" };
const routeNames = { STATIC: "회사별 정적", GREETING: "Greeting", GENERIC: "범용", UNKNOWN: "경로 미확인" };
let state = { status: "PENDING", offset: 0, selected: null, loading: false };
let loadGeneration = 0;
let selectionReasons = new Map();
const linkedCandidate = new URLSearchParams(location.search).get("candidate");
const targetCandidate = /^candidate_[0-9a-f]{64}$/.test(linkedCandidate ?? "") ? linkedCandidate : null;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function api(path, payload) {
  const response = await fetch("/api/v1/quality" + path, {
    method: payload === undefined ? "GET" : "POST", credentials: "omit",
    headers: { ...accessHeaders(), ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (response.status === 401) { location.replace("/quality/login.html"); throw new Error("로그인이 만료되었습니다."); }
  if (!response.ok) {
    throw new Error(response.status === 409 ? "다른 팀원이 수정했습니다. 목록을 새로 확인해 주세요."
      : response.status === 403 ? "접근 정보가 만료되었습니다. 다시 로그인해 주세요."
      : response.status === 400 ? "칸 수, 별칭과 공개 링크의 범위를 확인해 주세요."
      : "지금 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
  return response.status === 204 ? undefined : response.json();
}

function date(value) {
  return value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미등록";
}

function actionButton(label, action) {
  const button = element("button", label, "secondary");
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await action(); } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
  return button;
}

async function change(row, action, payload = {}) {
  await api(`/sites/${row.id}/${action}`, payload);
  message.textContent = "기록했습니다.";
  await load(false);
}

function showConfirmation(row) {
  state = { ...state, selected: row };
  const form = document.getElementById("confirm-form");
  form.reset();
  form.elements.publicLink.readOnly = Boolean(row.posting);
  form.elements.publicLink.value = row.links?.[0]?.url ?? (row.publicLink !== row.homepage ? row.publicLink : "") ?? "";
  document.getElementById("scope-context").textContent = row.posting ? `${row.site}, 공고별 전체 입력 가능 칸 수. 조건부 항목을 펼치고 반복 항목은 각 1행으로 확인해 주세요.` : `${row.site}, 과거 화면 기준`;
  document.getElementById("dedicated-label").hidden = row.posting || row.identity !== "UNVERIFIED";
  document.getElementById("scope-label").textContent = row.posting
    ? "조건부 항목을 펼치고 반복 항목을 각 1행 둔 전체 입력 가능 칸 수를 확인했습니다."
    : "지금 확인한 지원서와 과거 후보의 화면 범위가 같습니다.";
  document.getElementById("reference-hint").textContent = row.posting
    ? "수집 범위와 반복 행 기준이 일치하는 이후 실행에만 참고 분모를 적용합니다. 화면 상태 변화로 확인 작업을 다시 만들지 않습니다."
    : "같은 구조의 이후 실행부터 참고 분모를 적용합니다. 공유 호스트의 기업 소속이 불확실하면 자동 재사용하지 않습니다.";
  document.getElementById("confirm-dialog").showModal();
}

function showDeferral(row) {
  state = { ...state, selected: row };
  const next = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + 7 * 86400000));
  document.getElementById("defer-form").elements.until.value = next;
  document.getElementById("defer-dialog").showModal();
}

function showHistory(row) {
  const history = document.getElementById("history");
  history.replaceChildren(...row.history.map(value => {
    const entry = element("li");
    entry.append(element("strong", `${value.fieldCount}칸`), element("p", `${date(value.confirmedAt)}, ${value.confirmedBy ?? "과거 확인자 미기록"}`));
    return entry;
  }));
  document.getElementById("history-dialog").showModal();
}

function card(row, ordinal) {
  const card = element("section", undefined, "candidate-scope");
  card.dataset.candidateId = row.id;
  if (row.id === targetCandidate) card.dataset.selected = "true";
  const header = element("div", undefined, "candidate-header");
  header.append(element("h3", row.posting ? `공고 ${/\/o\/(\d+)\/apply$/.exec(row.publicLink)?.[1] ?? ordinal}` : `과거 관측 ${ordinal}`), element("span", statusNames[row.status] ?? row.status, "badge"));
  const meta = element("div", undefined, "meta");
  meta.append(element("span", routeNames[row.route] ?? row.route), element("span", `첫 관측 ${date(row.firstSeen)}`));
  if (row.posting) meta.append(element("span", "공고별 확인"));
  if (row.claimant) meta.append(element("span", row.claimant));
  if (row.recheck) meta.append(element("span", "재확인 대상"));
  if (row.identity === "UNVERIFIED") meta.append(element("span", "기업 소속 미확인"));
  if (row.deferredUntil && row.status === "DEFERRED") meta.append(element("span", `재확인 ${date(row.deferredUntil)}`));
  card.append(header, meta, element("p", row.posting ? "조건부 항목을 펼치고 반복 항목은 각 1행인 기준으로 확인합니다. 기준과 다른 실행의 비율에는 자동 적용하지 않습니다." : scopePostings(row), "hint"));
  if (row.posting) {
    const link = element("a", "지원서 열기");
    link.href = row.publicLink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.dataset.applicationLink = "true";
    card.append(link);
  }
  const selection = element("p", selectionReasons.get(row.id) ?? "오늘 선정 목록 외에도 확인할 수 있습니다.", "hint");
  selection.dataset.selectionReason = row.id;
  card.append(selection);
  const version = element("details");
  version.append(element("summary", "기술 상세"), element("p", row.version, "hint"), element("p", row.structure, "hint"));
  card.append(version);
  const actions = element("div", undefined, "actions");
  if (row.status === "COMPLETED") {
    const confirmed = row.history.at(-1);
    card.append(element("p", `${confirmed?.fieldCount ?? 0}칸`),
      element("p", `확인일 ${date(confirmed?.confirmedAt)}, 확인자 ${confirmed?.confirmedBy ?? "과거 확인자 미기록"}`, "hint"));
    actions.append(actionButton("확인 이력", () => showHistory(row)), actionButton("재확인 열기", () => change(row, "reopen")));
  } else if (row.status === "CLAIMED" && !row.mine) {
    actions.append(element("span", "다른 팀원이 확인 중입니다.", "hint"));
  } else {
    if (!row.mine) actions.append(actionButton("담당하기", () => change(row, "claim", { claimant: claimant.value })));
    else actions.append(actionButton("담당 해제", () => change(row, "release")));
    actions.append(actionButton("필드 수 등록", () => showConfirmation(row)), actionButton("보류", () => showDeferral(row)));
    if (row.status === "DEFERRED") actions.append(actionButton("보류 재개", () => change(row, "release")));
  }
  card.append(actions);
  return card;
}

async function load(append) {
  if (append && state.loading) return;
  const generation = ++loadGeneration;
  state = { ...state, loading: true, offset: append ? state.offset : 0 };
  try {
    const page = await api(`/site-groups?status=${state.status}&offset=${state.offset}&limit=50`);
    if (generation !== loadGeneration) return;
    if (!append) items.replaceChildren();
    const existing = new Set(Array.from(items.querySelectorAll("[data-site-id]"), node => node.dataset.siteId));
    items.append(...page.items.filter(site => !existing.has(site.id)).map(site => siteCard(site, card)));
    if (!append && targetCandidate) {
      if (!page.items.some(site => site.candidates.some(row => row.id === targetCandidate))) {
        const selected = await api(`/site-groups/${targetCandidate}`);
        if (generation !== loadGeneration) return;
        items.prepend(siteCard(selected, card));
      }
      items.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }
    if (!items.children.length) items.append(element("p", state.status === "PENDING" ? "현재 미확인 후보가 없습니다." : "아직 완료한 후보가 없습니다.", "hint"));
    state = { ...state, offset: page.nextOffset };
    more.hidden = !page.hasMore;
  } catch (error) { if (generation === loadGeneration) showError(error.message); }
  finally { if (generation === loadGeneration) state = { ...state, loading: false }; }
}

function showError(text) {
  message.textContent = text;
  const dialog = document.querySelector("dialog[open]");
  if (!dialog) return;
  let status = dialog.querySelector(".dialog-message");
  if (!status) { status = element("p", undefined, "dialog-message"); status.setAttribute("role", "status"); dialog.append(status); }
  status.textContent = text;
}

for (const [id, status] of [["pending", "PENDING"], ["completed", "COMPLETED"]]) {
  document.getElementById(id).addEventListener("click", () => {
    state = { ...state, status };
    for (const current of ["pending", "completed"]) {
      document.getElementById(current).setAttribute("aria-pressed", String(current === id));
      document.getElementById(current).className = current === id ? "" : "secondary";
    }
    void load(false);
  });
}
more.addEventListener("click", () => void load(true));
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
document.getElementById("logout").addEventListener("click", () => {
  clearAccess();
  location.replace("/quality/login.html");
});
document.getElementById("confirm-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await change(state.selected, "confirm", { fieldCount: Number(form.elements.fieldCount.value),
      publicLink: form.elements.publicLink.value || null, dedicatedHost: form.elements.dedicatedHost.checked, claimant: claimant.value });
    document.getElementById("confirm-dialog").close();
  } catch (error) { showError(error.message); }
});
document.getElementById("defer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await change(state.selected, "defer", { reason: form.elements.reason.value, until: `${form.elements.until.value}T09:20:00+09:00` });
    document.getElementById("defer-dialog").close();
  } catch (error) { showError(error.message); }
});
void load(false);
api("/notifications").then(value => {
  document.getElementById("notification").textContent = value.message;
  selectionReasons = new Map(value.entries.map(entry => [entry.candidateId, entry.reason]));
  document.querySelectorAll("[data-selection-reason]").forEach(node => {
    node.textContent = selectionReasons.get(node.dataset.selectionReason) ?? "오늘 선정 목록 외에도 확인할 수 있습니다.";
  });
}).catch(() => { document.getElementById("notification").textContent = "알림 상태를 조회하지 못했습니다."; });
