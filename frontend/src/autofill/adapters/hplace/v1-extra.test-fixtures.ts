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
import backendResponse from "./__fixtures__/v1-extra-fields-response.json";

/**
 * Synthetic Hplace v1 applicant app, step 3 ("어학/자격/기타"), rebuilt only
 * from the value-free captures step3-rows.json (skeleton and rows),
 * step3-probe-f.json (f1_certAfter, f2_skill, f2_skillDdOptions) and
 * step3-cert-date.json (2026-11-22). The page starts without inputs; each
 * block (title span + title + body) keeps one 추가하기 button that appends
 * one entry sub-row `[content div, delete icon button]` to the block's list.
 * Hash classes are replaced by meaningless `x-*` ones; the `ats-*` dropdown
 * classes are the ones the probe selected the language list with.
 * Assumed (not measured): the 자격증 search timeline is the step-2 one, the
 * register row is the step-2 shape, the 취득일 input keeps only a full
 * YYYY.MM.DD (as every step-2 date), and the language placeholder ends in
 * "택해주세요." (the capture was cut at 12 characters).
 */
export type ExtraBlockTitle =
  "공인외국어시험" | "외국어활용능력" | "자격증" | "컴퓨터활용능력";

/** f2_skillDdOptions, in page order (the capture shows the first 30 rows). */
export const languageOptions = [
  "선택안함",
  "영어",
  "일본어",
  "중국어",
  "프랑스어",
  "독일어",
  "스페인어",
  "포르투갈어",
  "이탈리아어",
  "네덜란드어",
  "아랍어",
  "말레이시아어",
  "인도네시아어",
  "베트남어",
  "인도어",
  "태국어",
  "러시아어",
  "이란어",
  "터키어",
  "핀란드어",
  "노르웨이어",
  "헝가리어",
  "덴마크어",
  "미얀마어",
  "불가리아어",
  "폴란드어",
  "방글라데시어",
  "타직어",
  "스와힐리어",
  "키르키즈어",
];
export const LANGUAGE_PLACEHOLDER = "활용가능한 외국어를 선택해주세요.";
/** The measured names, cut at 30 characters by the probe. */
const LICENSE_NAME = "licenseGroupAnswer.licenseAnsw";

let reviewKey = 500;
/** "k": the second tenant, whose controls have no review-key span
 * (k-step3-cert-list.json; chips and pick re-render assumed alike). */
let tenant3: "bbq" | "k" = "bbq";
const wrap = (control: string) =>
  tenant3 === "k"
    ? `<div class="x-w">${control}</div>`
    : `<span data-review-key="${reviewKey++}@0">${control}</span>`;
const field = (input: string) => wrap(`<div><div>${input}</div></div>`);

/** A block: title span, title, body > [list, 추가하기] (f1_certAfter). */
const block = (title: ExtraBlockTitle) =>
  `<div class="x-block" data-block="${title}"><span aria-hidden="true">${title}</span><div><p>${title}</p><div></div></div><div><div><div class="x-list"></div><button type="button" class="x-block-add">추가하기</button></div></div></div>`;
const deleteIcon = '<button class="x-del"><svg></svg></button>';

/** 자격증 sub-row before a pick: one unnamed search input (step3-rows.json). */
const certSearchRow = () =>
  `<div class="x-sub"><div><div>${field('<input type="text" placeholder="자격증명을 검색해주세요." class="x-search">')}</div></div>${deleteIcon}</div>`;
/** Chip: `span > div > div > p` (+ the X svg). */
const chip = (name: string) =>
  wrap(`<div><div><p>${name}</p><svg class="x-chip-x"></svg></div></div>`);
/** 자격증 sub-row after a pick (f1_certAfter + step3-cert-date.json). */
const certPickedRow = (name: string) =>
  `<div class="x-sub"><div><div>${chip(name)}${field(`<input type="text" maxlength="100" placeholder="발급기관을 입력해주세요." name="${LICENSE_NAME}">`)}<div>${wrap(`<div><div><div><div></div><input type="text" placeholder="취득일"></div></div></div>`)}</div></div><div>${field(`<input type="text" maxlength="30" placeholder="등록번호를 입력해주세요." name="${LICENSE_NAME}">`)}</div></div>${deleteIcon}</div>`;
/** 외국어활용능력 sub-row: one button dropdown (f2_skill). */
const skillRow = () =>
  `<div class="x-sub"><div>${wrap(`<div><div class="ats-inline-flex ats-flex-col ats-relative x-dd"><button type="button" data-list="language"><p>${LANGUAGE_PLACEHOLDER}</p></button></div></div>`)}</div>${deleteIcon}</div>`;
/** 공인외국어시험 sub-row before a pick (step3-rows.json): never touched. */
const examRow = () =>
  `<div class="x-sub"><div><div>${field('<input type="text" placeholder="시험을 검색해주세요" class="x-exam">')}<form><input type="hidden" name="examCode"><input type="hidden" name="etc"></form></div></div>${deleteIcon}</div>`;
const softwareRow = () =>
  `<div class="x-sub"><div>${field('<input type="text" maxlength="100" name="softwareSkillGroupAnswer.softWareSkillAnswers.0.softwareName" placeholder="프로그램명 을 입력해주세요.">')}</div>${deleteIcon}</div>`;
const subRow: Record<ExtraBlockTitle, () => string> = {
  공인외국어시험: examRow,
  외국어활용능력: skillRow,
  자격증: certSearchRow,
  컴퓨터활용능력: softwareRow,
};

/** 경험 containers: the add control is labelled with the section name. */
const experience = [
  "수상경력",
  "교육이수사항",
  "학내외활동",
  "해외경험",
  "봉사활동",
];
const experienceAdd = (label: string) =>
  `<button type="button" class="x-exp-add"><svg></svg><p>${label}</p></button>`;

export const blockRow = (title: ExtraBlockTitle) =>
  document.querySelector<HTMLElement>(`[data-block="${title}"]`)!;
export const subRows = (title: ExtraBlockTitle) =>
  Array.from(blockRow(title).querySelector(".x-list")!.children);
export const subRowAt = (title: ExtraBlockTitle, k: number) =>
  subRows(title)[k]!;
export const blockAdd = (title: ExtraBlockTitle) =>
  blockRow(title).querySelector<HTMLButtonElement>(".x-block-add")!;

/** Appends a sub-row synchronously, as a restored draft or the user would. */
export function appendSubRow(title: ExtraBlockTitle): Element {
  blockRow(title)
    .querySelector(".x-list")!
    .insertAdjacentHTML("beforeend", subRow[title]());
  return subRows(title).at(-1)!;
}
/** Shows a picked certificate in sub-row `k`, as a pick (or a draft) does. */
export function pickCertificate(k: number, name: string): Element {
  if (!subRows("자격증")[k]) appendSubRow("자격증");
  subRowAt("자격증", k).outerHTML = certPickedRow(name);
  return subRowAt("자격증", k);
}
export const certInput = (k: number, placeholder: string) =>
  subRowAt("자격증", k).querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
export const certChip = (k: number) =>
  Array.from(subRowAt("자격증", k).querySelectorAll("p"))
    .filter((p) => p.nextElementSibling?.matches("svg.x-chip-x"))
    .map((p) => p.textContent);
export const languageTrigger = (k: number) =>
  subRowAt("외국어활용능력", k).querySelector<HTMLButtonElement>(
    ".x-dd > button",
  )!;

/** Synthetic certificate catalog keyed by the exact typed query. */
export const certificateCatalog: Record<string, string[]> = {
  정보처리기사: ["정보처리기사"],
  합성자격: ["합성자격 1급", "합성자격 2급"],
  동명자격: ["동명자격", "동명자격"],
};
const registerRow = (query: string) =>
  `<li><button type="button" class="x-register"><span><div><svg><path></path></svg><span>'${query}'</span>등록하기</div></span></button></li>`;
const resultRows = (names: string[]) =>
  names
    .map((n) => `<li><button type="button"><span>${n}</span></button></li>`)
    .join("");
/** A result list; on the second tenant it sits outside the input's row and
 * carries the sub-row it answers (measured: one body, li > button > span). */
const list = (rows: string, sub?: number) =>
  `<div id="dropdown-body" class="x-results"${sub === undefined ? "" : ` data-sub="${sub}"`}><div><div><div role="scrollbar"><div id="design-system-scroll-container"><div><ul>${rows}</ul></div></div><div><div></div></div><div><div></div></div></div></div></div></div>`;

export interface V1ExtraPage {
  forbiddenClicks(): string[];
  /** Block titles whose 추가하기 was clicked, in order. */
  addClicks(): string[];
  /** Every query a certificate search input received ("" when cleared). */
  searchQueries(): string[];
  registerClicks(): number;
  /** The next add click of a block adds nothing. */
  stall(title: ExtraBlockTitle): void;
}

/** The second tenant's step 3 (k-step3-skeleton.json): no 어학 section,
 * one 자격증 block, one 경험 add, other step nav labels. */
const bbqStep3Body =
  () => `<nav>${["기본정보", "학력 및 연구/경력", "어학/자격/기타", "자기소개서/역량기술서", "최종 점검"].map((l, i) => `<button type="button" data-testid="resume-form-stepper-item" data-step-sn="${i + 1}">${l}</button>`).join("")}</nav>
<div class="x-section"><div><h5>어학</h5></div>
<div id="8001">${block("공인외국어시험")}${block("외국어활용능력")}</div>
</div>
<div class="x-section"><div><h5>자격/지식/기술</h5></div>
<div id="8002">${block("자격증")}<div></div></div>
<div id="8003">${block("컴퓨터활용능력")}</div>
</div>
<div class="x-section"><div><h5>경험</h5></div>
${experience.map((label, i) => `<div id="${8004 + i}">${experienceAdd(label)}<div></div></div>`).join("")}
</div>
`;
const kStep3Body =
  () => `<nav>${["기본정보", "학력 및 경력", "자기소개서", "최종 점검"].map((l, i) => `<button type="button" data-testid="resume-form-stepper-item" data-step-sn="${i + 1}">${l}</button>`).join("")}</nav>
<div class="x-section"><div><h5>자격/지식/기술</h5></div>
<div id="8002"><div class="x-wrap">${block("자격증")}<div class="x-portal"></div></div></div>
</div>
<div class="x-section"><div><h5>경험</h5></div>
<div id="8004">${experienceAdd("학내외활동 *")}<div></div></div>
</div>
`;

export function mountV1Step3(
  step = "3",
  variant: "bbq" | "k" = "bbq",
): V1ExtraPage {
  resetHplacePage();
  tenant3 = variant;
  setHplacePage(v1Url(step));
  document.head.innerHTML = `<script type="module" src="/v1/applicant/index-Synth03a.js"></script><link rel="stylesheet" href="/v1/applicant/index-Synth03b.css">`;
  document.body.innerHTML = `<div id="root"><div class="x-app">
<div class="x-top"><h5>지원서 작성</h5><button type="button" class="x-extend">연장</button></div>
${variant === "k" ? kStep3Body() : bbqStep3Body()}<div class="x-footer"><button type="button" class="x-prev">이전</button><button type="button" data-testid="resume-form-save">임시저장</button><button type="button" data-testid="resume-form-save-and-leave">저장 후 나가기</button><button type="button" class="x-next">다음</button></div>
</div></div><div id="tooltip-root"></div><div id="overlay-root"></div>`;
  return installShims();
}

function installShims(): V1ExtraPage {
  const root = document.getElementById("root")!;
  const forbidden: string[] = [];
  const adds: string[] = [];
  const queries: string[] = [];
  const stalled = new Set<ExtraBlockTitle>();
  let registerClicks = 0;
  const later = (run: () => void) => setTimeout(run, 0);
  /** The sub-row a list answers: its own (second tenant) or the enclosing one. */
  const subIndex = (e: Element) => {
    const own = e.closest<HTMLElement>(".x-results")?.dataset.sub;
    return own !== undefined
      ? Number(own)
      : subRows("자격증").indexOf(e.closest(".x-sub")!);
  };
  /** Second tenant: lists outside the row (assumed: the title closes them). */
  const dropOutside = () => {
    if (tenant3 === "k")
      for (const body of document.querySelectorAll(".x-wrap .x-results"))
        body.remove();
  };
  const blockOf = (e: Element) =>
    e.closest<HTMLElement>("[data-block]")?.dataset.block as
      ExtraBlockTitle | undefined;
  root.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      const hit = target.closest(
        '[data-testid="resume-form-save"],[data-testid="resume-form-save-and-leave"],[data-testid="resume-form-stepper-item"],.x-prev,.x-next,.x-extend,.x-del,.x-chip-x,.x-exp-add,input[type="file"]',
      );
      if (hit) forbidden.push(hit.textContent?.trim() || hit.className);
      const owner = blockOf(target);
      // 공인외국어시험 (an exam pick opens a verification window) and
      // 컴퓨터활용능력 (no profile category) are never touched.
      if (owner === "공인외국어시험" || owner === "컴퓨터활용능력")
        forbidden.push(`${owner}:${target.tagName.toLowerCase()}`);
      const title = target.closest('span[aria-hidden="true"]');
      if (title) {
        for (const body of title.parentElement!.querySelectorAll(".x-results"))
          later(() => body.remove());
        later(dropOutside);
      }
    },
    true,
  );
  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const add = target.closest(".x-block-add");
    if (add) {
      const title = blockOf(add)!;
      adds.push(title);
      if (stalled.delete(title)) return;
      later(() => appendSubRow(title));
      return;
    }
    const register = target.closest(".x-register");
    if (register) {
      registerClicks++;
      const typed =
        /^'(.*)'등록하기$/.exec(register.textContent ?? "")?.[1] ?? "";
      const k = subIndex(register);
      setTimeout(() => {
        pickCertificate(k, typed);
        dropOutside();
      }, 110);
      return;
    }
    const pick = target.closest(".x-results li > button");
    if (pick) {
      const k = subIndex(pick);
      const name = pick.textContent!;
      // The pick re-renders the whole sub-row (chip, 발급기관, 취득일, 등록번호).
      later(() => {
        pickCertificate(k, name);
        dropOutside();
      });
      return;
    }
    const option = target.closest("#dropdown-body ul > li > button");
    if (option instanceof HTMLButtonElement && option.closest(".x-dd")) {
      const box = option.closest(".x-dd")!;
      const trigger = box.querySelector(":scope > button")!;
      later(() => {
        trigger.innerHTML = `<p>${option.textContent === "선택안함" ? LANGUAGE_PLACEHOLDER : option.textContent}</p>`;
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
      later(() =>
        box.insertAdjacentHTML(
          "beforeend",
          `<div id="dropdown-body" class="x-body"><ul>${languageOptions.map((l) => `<li><button type="button"><span><p>${l}</p></span></button></li>`).join("")}</ul></div>`,
        ),
      );
    }
  });
  root.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const owner = blockOf(input);
    if (owner === "공인외국어시험" || owner === "컴퓨터활용능력")
      forbidden.push(`${owner}:input`);
    if (!input.matches(".x-search")) return;
    const query = input.value;
    queries.push(query);
    const k = subRows("자격증").indexOf(input.closest(".x-sub")!);
    const outside = tenant3 === "k";
    // Second tenant: the one list appears outside the row, in the section.
    const box = outside
      ? input.closest(".x-wrap")!.querySelector(".x-portal")!
      : input.parentElement!;
    const show = (ms: number, rows: string) =>
      setTimeout(() => {
        if (!input.isConnected || input.value !== query) return;
        box.querySelector(":scope > .x-results")?.remove();
        box.insertAdjacentHTML(
          "beforeend",
          list(rows, outside ? k : undefined),
        );
      }, ms);
    if (!query) return;
    if (outside && query === "두목록") {
      // Two lists in the section at once: neither is taken.
      show(420, resultRows([query]));
      setTimeout(
        () =>
          input
            .closest(".x-wrap")!
            .insertAdjacentHTML("beforeend", list(resultRows([query]), k)),
        430,
      );
      return;
    }
    const names = certificateCatalog[query];
    // The step-2 timeline: a transient register row, an empty list, the answer.
    show(100, registerRow(query));
    show(300, "");
    show(
      420,
      names
        ? resultRows(names)
        : query === "다른등록"
          ? registerRow("다른이름")
          : registerRow(query),
    );
  });
  root.addEventListener("focusout", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.placeholder !== "취득일")
      return;
    const value = input.value;
    const kept = /^\d{4}\.\d{2}\.\d{2}$/.test(value);
    if (tenant3 === "k") {
      // Second tenant (live, baa3384: retained-value mask `####.99`): the
      // 취득일 widget keeps only the year and month, right after the write.
      queueMicrotask(() => {
        input.value =
          kept || /^\d{4}\.\d{2}$/.test(value) ? value.slice(0, 7) : "";
      });
      return;
    }
    later(() => {
      input.value = kept ? value : "";
    });
  });
  return {
    forbiddenClicks: () => [...forbidden],
    addClicks: () => [...adds],
    searchQueries: () => [...queries],
    registerClicks: () => registerClicks,
    stall: (title) => stalled.add(title),
  };
}

/** Synthetic entries: 2 certificates, 2 language skills, 1 language test. */
export function v1ExtraProfile(): Profile {
  const profile = createEmptyProfile();
  profile.certifications = [
    {
      id: "cert-1",
      sectionId: "certificate",
      values: {
        name: "정보처리기사",
        issuer: "합성기관",
        acquisitionDate: "2020-05-01",
        registrationNo: "A-1234",
      },
    },
    {
      id: "cert-2",
      sectionId: "certificate",
      values: {
        name: "목록에없는자격",
        issuer: "두번째기관",
        acquisitionDate: "2021-07",
        registrationNo: "B-5678",
      },
    },
  ];
  profile.languages = [
    {
      id: "exam-1",
      sectionId: "languageTest",
      values: { language: "영어", testName: "TOEIC", grade: "900" },
    },
    {
      id: "skill-1",
      sectionId: "languageSkill",
      values: { language: "영어", conversationalLevel: "상" },
    },
    {
      id: "skill-2",
      sectionId: "languageSkill",
      values: { language: "일본어", conversationalLevel: "중" },
    },
  ];
  return profile;
}

/** Backend analyses per `<group>.<field>`: the values HplaceV1ExtraPolicyTest asserts. */
const backendFields = backendResponse.fields as Record<
  string,
  Omit<FieldAnalysis, "candidateId">
>;
const extraName =
  /^hplace\.v1\.(certificate|languageSkill)\.(0|[1-9]\d?)\.([A-Za-z]+)$/;

export function v1ExtraAnalysis(
  request: FieldsAnalyzeRequest,
): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((s) => s.fields)
      .map((f): FieldAnalysis => {
        const m = extraName.exec(f.domName ?? "");
        const real = m && backendFields[`${m[1]}.${m[3]}`];
        if (!real || f.domName !== f.domId)
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

const addName = /^hplace\.v1\.(certificate|languageSkill)\.add$/;

export function v1ExtraPreparation(
  request: PreparationAnalyzeRequest,
): PreparationAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    preparationPlans: request.sections
      .filter((s) => s.sectionId === "hplace-v1-extra")
      .flatMap((s) => s.actionCandidates)
      .filter((a) => a.domName === a.domId && addName.test(a.domName ?? ""))
      .map((a) => ({
        actionCandidateId: a.candidateId,
        command: "ADD_REPEATABLE_GROUP" as const,
        expectedEffect: "GROUP_COUNT_INCREMENT" as const,
      })),
  };
}

export { resetHplacePage };
