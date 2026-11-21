import {
  resetHplacePage,
  setHplacePage,
} from "../../workflow/test-utils/hplace.fixture";
import type {
  FieldAnalysis,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  PreparationAnalyzeRequest,
  PreparationAnalyzeResponse,
} from "../../api/types";
import { createEmptyProfile, type Profile } from "../../../profile/model";
import { v1Url } from "./v1-basic.test-fixtures";
import backendResponse from "./__fixtures__/v1-history-fields-response.json";

/**
 * Synthetic Hplace v1 applicant app, step 2 ("학력 및 연구/경력"), rebuilt
 * from the value-free captures step2-cards.json, step2-probe.json,
 * step2-probe2.json and step2-live-addendum.md (2026-11-21). Hash classes are
 * replaced by meaningless `x-*` ones; only the `ats-*` utility classes step 1
 * relies on are kept. Shims imitate the React page: the add control appends
 * a card (button with zero cards, `div[tabindex="0"]` after), named inputs use
 * the 0-based card order, 퇴사 unlocks 퇴사일, date inputs keep only a full
 * YYYY.MM.DD, and typing a 회사명 opens a suggestion list.
 */
export type HistoryLevel = "고등학교" | "대학교" | "대학원" | "직장경력";
export const historyLevels: HistoryLevel[] = [
  "고등학교",
  "대학교",
  "대학원",
  "직장경력",
];
const containerIds: Record<HistoryLevel, string> = {
  고등학교: "7001",
  대학교: "7002",
  대학원: "7003",
  직장경력: "7005",
};
const prefixes: Partial<Record<HistoryLevel, string>> = {
  대학교: "collegeGroupAnswers",
  대학원: "graduateSchoolGroupAnswers",
  직장경력: "careerGroupAnswers",
};

export const historyOptions: Record<string, [string, string][]> = {
  // Measured order (step2-probe-fail.json hsRegion), after 선택안함.
  region: [
    "서울",
    "부산",
    "대구",
    "인천",
    "광주",
    "대전",
    "울산",
    "경기",
    "강원",
    "충북",
    "충남",
    "전북",
    "전남",
    "경북",
    "경남",
    "제주",
    "세종",
    "미국",
    "일본",
    "기타 지역",
  ].map((l, i) => [String(i + 1).padStart(2, "0"), l] as [string, string]),
  hsCategory: [["01", "합성계열"]],
  dept: [["01", "공학"]],
  scale: ["3.0", "3.5", "4.0", "4.3", "4.5", "5.0", "7.0", "20", "100"].map(
    (l) => [l, l] as [string, string],
  ),
  employment: [
    "정규직",
    "계약직",
    "파견직",
    "프리랜서",
    "개인사업",
    "병역특례",
    "인턴",
    "아르바이트",
    "기타",
  ].map((l, i) => [String(i + 1), l] as [string, string]),
};

const row = (title: string, content: string, required = false) =>
  `<div class="x-row"><span aria-hidden="true">${title}</span><div class="x-title"><p>${title}${required ? "*" : ""}</p></div><div class="x-content">${content}</div></div>`;
let reviewKey = 900;
const wrap = (control: string) =>
  `<span data-review-key="${reviewKey++}@0">${control}</span>`;
const input = (attrs: string) =>
  wrap(`<div class="x-field"><input class="x-input" ${attrs}></div>`);
const dropdown = (placeholder: string, list: string, disabled = false) =>
  wrap(
    `<div class="ats-inline-flex ats-flex-col ats-relative x-dd"><button type="button" data-list="${list}" data-placeholder="${placeholder}"${disabled ? " disabled" : ""}>${placeholder}</button></div>`,
  );
/** A toggle group; `selected` is the page's own default selection. */
const toggle = (labels: string[], selected?: string) =>
  wrap(
    `<div class="x-toggle">${labels
      .map(
        (label) =>
          `<li class="ats-list-none"><button type="button" class="${label === selected ? "ats-bg-white ats-text-gray-800" : "ats-bg-gray-80 ats-text-gray-600"} x-btn">${label}</button></li>`,
      )
      .join("")}</div>`,
  );
const durations = (labels: string[]) =>
  `<div class="x-durations">${labels.map((l) => `<button type="button" class="x-duration">${l}</button>`).join("")}</div>`;
export const SEARCH_INPUT =
  'input[placeholder="학교명을 검색해주세요."], input[placeholder="전공명을 검색해주세요."]';
const search = () =>
  input('type="text" placeholder="학교명을 검색해주세요." class="x-search"');
const graduation = (withCompletion: boolean) =>
  toggle(
    withCompletion
      ? ["졸업", "졸업예정", "수료", "중퇴", "휴학", "재학"]
      : ["졸업", "졸업예정", "중퇴", "휴학", "재학"],
    "졸업",
  );
const period = (labels: string[]) =>
  input('type="text" placeholder="입학일"') +
  input('type="text" placeholder="졸업일"') +
  durations(labels);

function cardBody(level: HistoryLevel, k: number): string {
  const p = prefixes[level];
  if (level === "고등학교")
    return [
      row("졸업구분", graduation(false), true),
      row(
        "학교정보",
        search() +
          dropdown("학교 소재지를 선택해주세요", "region") +
          dropdown("계열을 선택해주세요.", "hsCategory") +
          toggle(["주간", "야간"], "주간"),
      ),
      row("재학기간", period(["2 년", "3 년"])),
    ].join("");
  if (level === "직장경력")
    return [
      row("고용형태", dropdown("고용형태를 선택해주세요", "employment"), true),
      row(
        "근무기간",
        toggle(["재직중", "퇴사"], "재직중") +
          input('type="text" placeholder="입사일"') +
          input('type="text" placeholder="퇴사일" disabled'),
        true,
      ),
      row("회사명", input('type="text" placeholder="회사명을 입력해주세요."')),
      row(
        "부서",
        input(
          `type="text" name="${p}.${k}.department" placeholder="부서명을 입력해주세요." maxlength="100"`,
        ),
      ),
      row(
        "직급",
        input(
          `type="text" name="${p}.${k}.position" placeholder="직급을 입력해주세요." maxlength="100"`,
        ),
      ),
      row(
        "담당업무",
        input(
          `type="text" name="${p}.${k}.assignedTask" placeholder="담당업무를 입력해주세요." maxlength="100"`,
        ),
      ),
    ].join("");
  const college = level === "대학교";
  const grade = college ? "collegeGrade" : "graduateSchoolGrade";
  return [
    row(
      "학위구분",
      toggle(
        college ? ["학사", "전문학사"] : ["석사", "박사"],
        college ? "학사" : "석사",
      ),
      true,
    ),
    row(
      "학교정보",
      search() +
        dropdown("학교 소재지를 선택해주세요", "region", true) +
        toggle(["본교", "분교"], "본교"),
    ),
    row("재학기간", period(["1 학기", "1 년", "2 년"])),
    row("졸업구분", graduation(true), true),
    row("입학구분", toggle(["입학", "편입"], "입학")),
    ...(college
      ? [row("학과계열", dropdown("학과계열을 선택해주세요", "dept"))]
      : []),
    row(
      "학업성적",
      input(
        `type="number" name="${p}.${k}.${grade}.score" placeholder="평점"`,
      ) + dropdown("만점기준", "scale"),
    ),
    ...(college
      ? [row("이수학점", input(`type="text" name="${p}.${k}.majorCredits"`))]
      : []),
    row(
      "전공",
      wrap('<button type="button" class="x-major-add">추가하기</button>') +
        '<div class="x-majors"></div>',
    ),
  ].join("");
}

/**
 * One major sub-row (step2-probe.json majorAdded, live addendum item 8): an
 * unnamed search input, the role toggles and three disabled named inputs
 * indexed by card and sub-row. The 대학원 list name is assumed.
 */
function majorHtml(level: HistoryLevel, k: number, m: number): string {
  const list = `${prefixes[level]}.${k}.${level === "대학교" ? "collegeMajorList" : "graduateSchoolMajorList"}.${m}`;
  return `<div class="x-major">${input('type="text" placeholder="전공명을 검색해주세요." class="x-search"')}${toggle(["주전공", "복수전공", "부전공", "연계전공", "융합전공"])}${input(`type="number" name="${list}.majorGrade.score" placeholder="평점" disabled`)}${input(`type="text" name="${list}.rankingAndHeadCount.ranking" disabled`)}${input(`type="text" name="${list}.rankingAndHeadCount.headcount" placeholder="전체인원" disabled`)}</div>`;
}

/** Synthetic search catalog keyed by the exact typed query. */
export const searchCatalog: Record<string, string[]> = {
  합성고등학교: ["합성고등학교", "합성고등학교 부설"],
  합성대학교: ["합성대학교", "합성대학교 분교"],
  합성전문대학: ["합성전문대학"],
  합성대학원: ["합성대학원", "합성대학원대학교"],
  합성공학: ["합성공학", "합성공학과", "응용합성공학"],
  합성경영: ["합성경영"],
  없는학교: ["없는학교분교", "새없는학교"],
  동명학교: ["동명학교", "동명학교"],
};

/** The chip a picked row leaves in place of the search input (afterPick). */
const chipHtml = (name: string) =>
  `<div><div><p>${name}</p><svg class="x-chip-x"></svg></div></div>`;

/** One card: head (level label + three icon buttons) and body (rows). */
export function cardHtml(level: HistoryLevel, k: number): string {
  return `<div class="x-card"><div class="x-head"><p>- ${level} ${k + 1}</p><div><button type="button" class="x-icon" disabled><svg></svg></button><button type="button" class="x-icon"><svg></svg></button><button type="button" class="x-icon" aria-label="닫기"><svg></svg></button></div></div><div class="x-body">${cardBody(level, k)}<div class="x-spacer"></div></div></div>`;
}
const addButton = (level: HistoryLevel) =>
  `<button type="button" class="x-addbtn"><svg></svg><p>${level}</p></button>`;
const addDiv = (level: HistoryLevel) =>
  `<div tabindex="0" class="x-adddiv"><div><p>${level}</p></div></div>`;
/** A fresh level container (step2-skeleton.json `fresh`): the add button is
 * a direct child next to empty spacers; cards are inserted as direct
 * children before them, and the button becomes a `div[tabindex="0"]`. */
const container = (level: HistoryLevel) =>
  `<div id="${containerIds[level]}" data-level="${level}">${addButton(level)}<div class="x-gap"></div><div class="x-gap"></div></div>`;

export interface V1HistoryPage {
  forbiddenClicks(): string[];
  /** Cards whose 전공 추가하기 was clicked ("대학교 0", ...). */
  majorAdds(): string[];
  /** Every query a search input received, in order ("" when cleared). */
  searchQueries(): string[];
  /** Removes a label from a dropdown list the next time it opens. */
  dropOption(list: string, label: string): void;
  /** Level names of the add controls clicked, in order. */
  addClicks(): string[];
  /** The add control of `level` stops adding cards after `n`. */
  limit(level: HistoryLevel, n: number): void;
  /** The next add click of `level` adds nothing. */
  stall(level: HistoryLevel): void;
  /** 회사명 suggestion lists opened so far. */
  suggestionLists(): number;
  /** 회사명 suggestions open only 1 s after typing (a slow site request). */
  lateSuggestions(): void;
}

export const levelContainer = (level: HistoryLevel) =>
  document.getElementById(containerIds[level])!;
export const cards = (level: HistoryLevel) =>
  Array.from(levelContainer(level).children).filter((c) =>
    c.matches(".x-card"),
  );
export const card = (level: HistoryLevel, k: number) => cards(level)[k]!;
export const addControl = (level: HistoryLevel) =>
  levelContainer(level).querySelector<HTMLElement>(".x-addbtn, .x-adddiv")!;

/** Appends a card synchronously, as a restored draft or the user would. */
export function appendCard(level: HistoryLevel): Element {
  const box = levelContainer(level);
  const k = cards(level).length;
  const anchor = Array.from(box.children).find((c) => !c.matches(".x-card"))!;
  anchor.insertAdjacentHTML("beforebegin", cardHtml(level, k));
  const button = box.querySelector(":scope > .x-addbtn");
  if (button) button.outerHTML = addDiv(level);
  return cards(level)[k];
}

export const cardRow = (c: Element, title: string) =>
  Array.from(c.querySelectorAll('span[aria-hidden="true"]')).find(
    (s) => s.textContent === title,
  )!.parentElement!;
export const cardToggle = (c: Element, title: string, label: string) =>
  Array.from(
    cardRow(c, title).querySelectorAll<HTMLButtonElement>(
      "li.ats-list-none > button",
    ),
  ).find((b) => b.textContent === label)!;
export const cardSelected = (c: Element, title: string) =>
  Array.from(
    cardRow(c, title).querySelectorAll<HTMLButtonElement>(
      "li.ats-list-none > button",
    ),
  )
    .filter(
      (b) =>
        b.classList.contains("ats-bg-white") &&
        b.classList.contains("ats-text-gray-800"),
    )
    .map((b) => b.textContent);
export const cardInput = (c: Element, placeholder: string) =>
  c.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
export const cardNamed = (c: Element, suffix: string) =>
  c.querySelector<HTMLInputElement>(`input[name$=".${suffix}"]`)!;
/** Adds a major sub-row synchronously (a restored draft). */
export function appendMajor(c: Element): Element {
  const level = c.closest<HTMLElement>("[data-level]")!.dataset
    .level as HistoryLevel;
  const k = cards(level).indexOf(c);
  const box = cardRow(c, "전공").querySelector(".x-majors")!;
  box.insertAdjacentHTML("beforeend", majorHtml(level, k, box.children.length));
  return box.lastElementChild!;
}
/** Replaces a row's search input with a chip, as a pick (or a draft) does. */
export function pickChip(c: Element, title: string, name: string): void {
  const search = cardRow(c, title).querySelector<HTMLInputElement>(
    SEARCH_INPUT,
  )!;
  search.closest("[data-review-key]")!.innerHTML = chipHtml(name);
}
export const chipText = (c: Element, title: string) =>
  Array.from(cardRow(c, title).querySelectorAll("span[data-review-key] p")).map(
    (p) => p.textContent,
  );
export const searchInput = (c: Element, title: string) =>
  cardRow(c, title).querySelector<HTMLInputElement>(SEARCH_INPUT);
export const cardDropdown = (c: Element, list: string) =>
  c.querySelector<HTMLButtonElement>(`.x-dd > button[data-list="${list}"]`)!;

export function mountV1Step2(step = "2"): V1HistoryPage {
  resetHplacePage();
  setHplacePage(v1Url(step));
  document.head.innerHTML = `<script type="module" src="/v1/applicant/index-Synth02a.js"></script><link rel="stylesheet" href="/v1/applicant/index-Synth02b.css">`;
  document.body.innerHTML = `<div id="root"><div class="x-app">
<div class="x-top"><h5>지원서 작성</h5><button type="button" class="x-extend">연장</button><div>D-1</div></div>
<nav>${["기본정보", "학력 및 연구/경력", "어학/자격/기타", "자기소개서/역량기술서", "최종 점검"].map((l, i) => `<button type="button" data-testid="resume-form-stepper-item" data-step-sn="${i + 1}">${l}</button>`).join("")}</nav>
<button type="button" data-testid="resume-parsing-upload">AI로 지원서 채우기</button>
<div class="x-section"><div><h5>학력사항</h5></div>
${container("고등학교")}
${container("대학교")}
${container("대학원")}
<div id="7004"><div>${row("졸업증명서 첨부('27년 2월 졸업자)", wrap('<input type="file">') + wrap('<button type="button" class="x-attach">첨부파일 추가</button>'))}</div></div>
</div>
<div class="x-section"><div><h5>경력사항</h5></div>
${container("직장경력")}
<div id="7006"><div>${row("경력기술서", wrap('<button type="button" class="x-attach">추가하기</button>'))}${row("포트폴리오", wrap('<button type="button" class="x-attach">추가하기</button>'))}<div></div></div></div>
</div>
<div class="x-footer"><button type="button" class="x-prev">이전</button><button type="button" data-testid="resume-form-save">임시저장</button><button type="button" data-testid="resume-form-save-and-leave">저장 후 나가기</button><button type="button" class="x-next">다음</button></div>
</div></div><div id="tooltip-root"></div><div id="overlay-root"></div>`;
  return installShims();
}

function installShims(): V1HistoryPage {
  const root = document.getElementById("root")!;
  const forbidden: string[] = [];
  const adds: string[] = [];
  const majorAdds: string[] = [];
  const queries: string[] = [];
  const removed = new Map<string, Set<string>>();
  const limits = new Map<HistoryLevel, number>();
  const stalled = new Set<HistoryLevel>();
  let suggestDelay = 60;
  let suggestionLists = 0;
  const later = (run: () => void) => setTimeout(run, 0);
  root.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      const hit = target.closest(
        '[data-testid="resume-form-save"],[data-testid="resume-form-save-and-leave"],[data-testid="resume-form-stepper-item"],[data-testid^="resume-parsing-"],.x-prev,.x-next,.x-extend,.x-duration,.x-attach,.x-icon,.x-chip-x,input[type="file"],.x-suggest li',
      );
      if (hit) forbidden.push(hit.textContent?.trim() || hit.className);
      const choice = target.closest("li.ats-list-none > button");
      if (
        choice &&
        [
          "본교",
          "분교",
          "주전공",
          "복수전공",
          "부전공",
          "연계전공",
          "융합전공",
        ].includes(choice.textContent ?? "")
      )
        forbidden.push(choice.textContent!);
      const trigger = target.closest(".x-dd > button") as HTMLElement | null;
      if (trigger && ["hsCategory", "dept"].includes(trigger.dataset.list!))
        forbidden.push(`dropdown:${trigger.dataset.list}`);
      // Only the row title closes an open search or suggestion list
      // (measured: Escape, blur and clearing the input do not).
      const title = target.closest('span[aria-hidden="true"]');
      if (title)
        for (const body of title.parentElement!.querySelectorAll(
          ".x-results, .x-suggest",
        ))
          later(() => body.remove());
    },
    true,
  );
  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const majorAdd = target.closest(".x-major-add");
    if (majorAdd) {
      const c = majorAdd.closest(".x-card")!;
      const level = c.closest<HTMLElement>("[data-level]")!.dataset
        .level as HistoryLevel;
      majorAdds.push(`${level} ${cards(level).indexOf(c)}`);
      later(() => appendMajor(c));
      return;
    }
    const pick = target.closest(".x-results li > button");
    if (pick) {
      const name = pick.textContent!;
      const widget = pick.closest("[data-review-key]")!;
      const rowElement = pick.closest(".x-row")!;
      later(() => {
        widget.innerHTML = chipHtml(name);
        // A school pick fills the row's 소재지 (the site's own choice).
        if (rowElement.firstElementChild!.textContent === "학교정보")
          rowElement.querySelector<HTMLButtonElement>(
            '.x-dd > button[data-list="region"]',
          )!.textContent = "서울";
      });
      return;
    }
    const add = target.closest(".x-addbtn, .x-adddiv");
    if (add) {
      const box = add.closest<HTMLElement>("[data-level]")!;
      const level = box.dataset.level as HistoryLevel;
      adds.push(level);
      if (stalled.delete(level)) return;
      if (cards(level).length >= (limits.get(level) ?? Infinity)) return;
      later(() => appendCard(level));
      return;
    }
    const choice = target.closest("li.ats-list-none > button");
    if (choice instanceof HTMLButtonElement) {
      const group = choice.closest(".x-toggle")!;
      for (const button of group.querySelectorAll("button")) {
        const on = button === choice;
        button.classList.toggle("ats-bg-white", on);
        button.classList.toggle("ats-text-gray-800", on);
        button.classList.toggle("ats-bg-gray-80", !on);
        button.classList.toggle("ats-text-gray-600", !on);
      }
      const rowElement = choice.closest(".x-row")!;
      if (rowElement.firstElementChild!.textContent === "근무기간")
        later(() => {
          const end = rowElement.querySelector<HTMLInputElement>(
            'input[placeholder="퇴사일"]',
          )!;
          end.disabled = choice.textContent !== "퇴사";
          if (end.disabled) end.value = "";
        });
      return;
    }
    const option = target.closest("#dropdown-body ul > li > button");
    if (option instanceof HTMLButtonElement && option.closest(".x-dd")) {
      const box = option.closest(".x-dd")!;
      const trigger = box.querySelector(":scope > button") as HTMLButtonElement;
      later(() => {
        trigger.textContent =
          option.value === "선택안함_옵션"
            ? trigger.dataset.placeholder!
            : option.textContent!;
        box.querySelector(":scope > #dropdown-body")?.remove();
      });
      return;
    }
    const trigger = target.closest(".x-dd > button");
    if (trigger instanceof HTMLButtonElement && !trigger.disabled) {
      const box = trigger.parentElement!;
      const body = box.querySelector(":scope > #dropdown-body");
      if (body) {
        later(() => body.remove());
        return;
      }
      const list = historyOptions[trigger.dataset.list!].filter(
        ([, label]) => !removed.get(trigger.dataset.list!)?.has(label),
      );
      later(() =>
        box.insertAdjacentHTML(
          "beforeend",
          `<div id="dropdown-body" class="x-body"><ul><li><button type="button" value="선택안함_옵션"><span><p>선택안함</p></span></button></li>${list.map(([code, label]) => `<li><button type="button" value="${code}"><span><p>${label}</p></span></button></li>`).join("")}</ul></div>`,
        ),
      );
    }
  });
  root.addEventListener("input", (event) => {
    const field = event.target;
    if (field instanceof HTMLInputElement && field.matches(SEARCH_INPUT)) {
      const query = field.value;
      queries.push(query);
      const box = field.parentElement!;
      const names = query ? searchCatalog[query] : undefined;
      // The site searches after a short delay; unknown queries show nothing.
      if (names)
        setTimeout(() => {
          if (!field.isConnected || field.value !== query) return;
          box.querySelector(":scope > .x-results")?.remove();
          box.insertAdjacentHTML(
            "beforeend",
            `<div id="dropdown-body" class="x-results"><div><div role="scrollbar"><div id="design-system-scroll-contain"><div><ul>${names.map((n) => `<li><button type="button"><span>${n}</span></button></li>`).join("")}</ul></div></div></div></div></div>`,
          );
        }, 40);
      return;
    }
    if (
      field instanceof HTMLInputElement &&
      field.placeholder === "회사명을 입력해주세요." &&
      field.value
    ) {
      const typed = field.value;
      // Suggestions come from a site request: they open a moment later.
      setTimeout(() => {
        const box = field.parentElement!;
        if (field.value !== typed || box.querySelector(":scope > .x-suggest"))
          return;
        suggestionLists++;
        if (true)
          box.insertAdjacentHTML(
            "beforeend",
            `<div id="dropdown-body" class="x-suggest"><ul><li><button type="button"><span>${field.value}(주)</span></button></li><li><button type="button"><span>${field.value} 합성</span></button></li></ul></div>`,
          );
      }, suggestDelay);
    }
  });
  root.addEventListener("focusout", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    if (["입학일", "졸업일", "입사일", "퇴사일"].includes(field.placeholder)) {
      // The page keeps only a full day; 8 digits are reformatted.
      const value = field.value;
      later(() => {
        const digits = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
        field.value = /^\d{4}\.\d{2}\.\d{2}$/.test(value)
          ? value
          : digits
            ? `${digits[1]}.${digits[2]}.${digits[3]}`
            : "";
      });
    }
  });
  return {
    forbiddenClicks: () => [...forbidden],
    majorAdds: () => [...majorAdds],
    searchQueries: () => [...queries],
    dropOption: (list, label) =>
      removed.set(list, (removed.get(list) ?? new Set()).add(label)),
    addClicks: () => [...adds],
    limit: (level, n) => limits.set(level, n),
    stall: (level) => stalled.add(level),
    suggestionLists: () => suggestionLists,
    lateSuggestions: () => {
      suggestDelay = 1000;
    },
  };
}

/** Bounded wait for a page state; fails instead of passing by timing luck. */
export async function until(check: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("state not reached");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export const nextYear = () => new Date().getFullYear() + 1;

/** Synthetic entries: 1 high school, 2 universities, 1 graduate school, 2 careers. */
export function v1HistoryProfile(): Profile {
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "hs-1",
      sectionId: "highSchool",
      values: {
        academicProcess: "고등학교",
        schoolName: "합성고등학교",
        completionStatus: "졸업",
        schoolRegion: "region:seoul",
        attendanceType: "attendance:day",
        startDate: "2006-03-02",
        endDate: "2009-02-10",
      },
    },
    {
      id: "univ-1",
      sectionId: "university",
      values: {
        degreeLevel: "학사",
        schoolName: "합성대학교",
        startDate: "2009-03-02",
        endDate: "2013-02-20",
        completionStatus: "졸업",
        transferStatus: "비해당",
        gpaScore: "3.8",
        gpaScale: "4.50",
        majorName: "합성공학",
      },
    },
    {
      id: "univ-2",
      sectionId: "university",
      values: {
        degreeLevel: "전문학사",
        schoolName: "합성전문대학",
        startDate: "2014-03-02",
        endDate: `${nextYear()}-02-20`,
        completionStatus: "졸업예정",
        transferStatus: "해당",
        majorName: "합성경영",
      },
    },
    {
      id: "grad-1",
      sectionId: "graduateSchool",
      values: {
        degreeLevel: "석사",
        schoolName: "합성대학원",
        startDate: "2016-03-02",
        endDate: "2018-02-20",
        completionStatus: "졸업",
        admissionType: "입학",
        gpaScore: "4.2",
        gpaScale: "4.5",
      },
    },
  ];
  profile.careers = [
    {
      id: "career-1",
      sectionId: "career",
      values: {
        companyName: "합성회사",
        employmentType: "정규",
        startDate: "2018-03-02",
        endDate: "2020-12-31",
        employmentStatus: "퇴직",
        department: "합성부서",
        position: "사원",
        responsibilities: "합성 업무",
      },
    },
    {
      id: "career-2",
      sectionId: "career",
      values: {
        companyName: "두번째회사",
        employmentType: "계약",
        startDate: "2021-01-04",
        employmentStatus: "재직중",
        department: "개발",
        position: "대리",
        responsibilities: "개발 업무",
      },
    },
  ];
  return profile;
}

/** Real backend analyses per `<group>.<field>` (captured, synthetic request). */
const backendFields = backendResponse.fields as Record<
  string,
  Omit<FieldAnalysis, "candidateId">
>;

const historyName =
  /^hplace\.v1\.(highschool|college|graduateSchool|career)\.(\d+)\.([A-Za-z]+|major0\.majorName)$/;

/**
 * Fake backend fields analysis for `hplace-v1-history`: each field gets the
 * real backend's analysis of the same group and field (binding, autofill
 * policy, write command), captured from the local backend.
 */
export function v1HistoryAnalysis(
  request: FieldsAnalyzeRequest,
): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((s) => s.fields)
      .map((f): FieldAnalysis => {
        const m = historyName.exec(f.domName ?? "");
        const real = m && backendFields[`${m[1]}.${m[3]}`];
        if (
          !real ||
          f.domName !== f.domId ||
          (m[1] === "highschool" && m[2] !== "0")
        )
          return {
            candidateId: f.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          } as FieldAnalysis;
        return {
          ...structuredClone(real),
          candidateId: f.candidateId,
        } as FieldAnalysis;
      }),
  };
}

const addName =
  /^hplace\.v1\.(?:(?:highschool|college|graduateSchool|career)|(?:college|graduateSchool)\.\d+\.major)\.add$/;

/** Fake backend preparation analysis: ADD for every exact add action. */
export function v1HistoryPreparation(
  request: PreparationAnalyzeRequest,
): PreparationAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    preparationPlans: request.sections
      .filter((s) => s.sectionId === "hplace-v1-history")
      .flatMap((s) => s.actionCandidates)
      .filter((a) => a.domName === a.domId && addName.test(a.domName ?? ""))
      .map((a) => ({
        actionCandidateId: a.candidateId,
        command: "ADD_REPEATABLE_GROUP" as const,
        expectedEffect: "GROUP_COUNT_INCREMENT" as const,
      })),
  };
}
