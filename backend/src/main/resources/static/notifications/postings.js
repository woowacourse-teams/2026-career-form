import { accessHeaders, clearAccess } from "/quality/access.js";

const form = document.getElementById("posting-form");
const list = document.getElementById("postings");
const message = document.getElementById("message");
const dialog = document.getElementById("delete-dialog");
const reasons = {
  COMPANY: "회사명은 1자 이상 80자 이하여야 합니다.",
  ROLE: "직무는 1자 이상 120자 이하여야 합니다.",
  LINK: "HTTP(S) 공고 링크를 1024자 안으로 입력해 주세요. 계정 정보가 포함된 링크는 사용할 수 없습니다.",
  PERIOD: "접수 시작은 마감보다 앞서야 합니다.",
  CLOSED: "마감이 지난 공고는 등록할 수 없습니다.",
};
let selected = null;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function date(value) {
  return value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "없음";
}

async function api(path, method = "GET", payload) {
  const response = await fetch("/api/v1/notifications/admin" + path, {
    method, credentials: "omit",
    headers: { ...accessHeaders(), ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (response.status === 401) { clearAccess(); location.reload(); throw new Error("로그인이 만료되었습니다."); }
  if (response.status === 204) return undefined;
  const body = (response.headers.get("Content-Type") ?? "").includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 409) throw new Error(`같은 링크의 공고가 이미 등록돼 있습니다. 기존 공고 ID ${body?.postingId ?? "미확인"}`);
    if (response.status === 400) throw new Error(reasons[body?.reason] ?? "입력값을 확인해 주세요.");
    if (response.status === 404) throw new Error(body?.error === "POSTING_NOT_FOUND" ? "이미 삭제된 공고입니다." : "알림 기능이 꺼져 있거나 서버가 이 API를 제공하지 않습니다.");
    if (response.status === 403) throw new Error("접근 정보가 만료되었습니다. 다시 로그인해 주세요.");
    throw new Error("지금 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
  return body;
}

function state(row, now) {
  if (new Date(row.closesAt) <= now) return "마감";
  if (new Date(row.opensAt) > now) return "접수 전";
  return "접수 중";
}

function card(row) {
  const card = element("article", undefined, "candidate");
  card.dataset.postingId = row.id;
  const header = element("div", undefined, "candidate-header");
  header.append(element("h2", row.role ? `${row.company} · ${row.role}` : row.company), element("span", state(row, new Date()), "badge"));
  if (!row.role) header.append(element("span", "직무 없음", "badge"));
  const period = element("div", undefined, "meta");
  period.append(element("span", `접수 시작 ${date(row.opensAt)}`), element("span", `마감 ${date(row.closesAt)}`),
    element("span", `등록 ${date(row.registeredAt)}`), element("span", `발송 예정 ${date(row.scheduledAt)}`));
  const link = element("a", "공고 열기");
  link.href = row.link;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const progress = element("div", undefined, "meta");
  progress.append(element("span", `대기 ${row.progress.pending}`, "badge"), element("span", `발송 중 ${row.progress.sending}`, "badge"),
    element("span", `수락 ${row.progress.accepted}`, "badge"), element("span", `포기 ${row.progress.abandoned}`, "badge"),
    element("span", `마지막 시도 ${date(row.progress.lastAttemptAt)}`));
  const actions = element("div", undefined, "actions");
  const remove = element("button", "삭제", "secondary");
  remove.addEventListener("click", () => {
    selected = row;
    document.getElementById("delete-context").textContent = `${row.role ? `${row.company} · ${row.role}` : row.company} 공고를 삭제합니다.`;
    dialog.showModal();
  });
  actions.append(remove);
  card.append(header, period, link, progress, actions);
  return card;
}

function percent(value) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function seconds(millis) {
  return millis === null || millis === undefined ? "—" : `${(millis / 1000).toFixed(1)}초`;
}

async function loadSummary() {
  const now = new Date();
  for (const row of document.querySelectorAll("#summary-table tbody tr[data-days]")) {
    const days = Number(row.dataset.days);
    const from = new Date(now.getTime() - days * 86400000).toISOString();
    try {
      const summary = await api(`/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(now.toISOString())}`);
      const cells = [summary.postings, summary.deliveries.pending, summary.deliveries.sending, summary.deliveries.accepted, summary.deliveries.abandoned,
        percent(summary.acceptanceRate), percent(summary.abandonRate),
        summary.deliveries.averageAttempts === null ? "—" : summary.deliveries.averageAttempts.toFixed(2),
        seconds(summary.latencyMillis.p50), seconds(summary.latencyMillis.p95), summary.subscriptions];
      row.replaceChildren(element("th", `최근 ${days}일`), ...cells.map(value => element("td", String(value))));
      row.firstChild.setAttribute("scope", "row");
    } catch (error) {
      const failed = element("td", error.message);
      failed.colSpan = 11;
      row.replaceChildren(element("th", `최근 ${days}일`), failed);
      row.firstChild.setAttribute("scope", "row");
    }
  }
}

async function load() {
  try {
    const result = await api("/postings");
    list.replaceChildren(...result.postings.map(card));
    if (!result.postings.length) list.append(element("p", "등록된 공고가 없습니다.", "hint"));
  } catch (error) {
    message.textContent = error.message;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const data = new FormData(form);
    const result = await api("/postings", "POST", {
      company: String(data.get("company")).trim(), role: String(data.get("role")).trim() || undefined, link: String(data.get("link")).trim(),
      opensAt: new Date(String(data.get("opensAt"))).toISOString(), closesAt: new Date(String(data.get("closesAt"))).toISOString(),
    });
    message.textContent = `등록했습니다. 구독자 ${result.deliveries}명에게 ${date(result.scheduledAt)} 발송을 예약했습니다.`;
    form.reset();
    await load();
    await loadSummary();
  } catch (error) {
    message.textContent = error instanceof RangeError ? "접수 시작과 마감 시각을 모두 입력해 주세요." : error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("delete-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selected) return;
  try {
    await api(`/postings/${selected.id}`, "DELETE");
    dialog.close();
    message.textContent = "삭제했습니다. 대기 중이던 발송은 취소되고 수락된 기록은 남습니다.";
    selected = null;
    await load();
    await loadSummary();
  } catch (error) {
    message.textContent = error.message;
    dialog.close();
  }
});
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
document.getElementById("logout").addEventListener("click", () => {
  clearAccess();
  location.reload();
});
void load();
void loadSummary();
