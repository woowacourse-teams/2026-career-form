import {
  resetHplacePage,
  setHplacePage,
} from "../../workflow/test-utils/hplace.fixture";
import type {
  FieldAnalysis,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  ValueBinding,
} from "../../api/types";
import { createEmptyProfile, type Profile } from "../../../profile/model";

/**
 * Synthetic Hplace v1 applicant app, step 1 ("기본정보"), rebuilt from the
 * observed skeleton (v1-step1-structure.md, 2026-11-21). Emotion classes are
 * replaced by meaningless ones so no selector can depend on them. Tiny shims
 * imitate the React page: toggles move the selected classes and unlock their
 * row's dependents, dropdown bodies exist only while open, the radio changes
 * only through its label and service dates normalize to YYYY.MM on blur.
 */
export const v1Url = (step = "1", path = "/v1/applicant/resume-form/4242") =>
  `https://synthetic.recruiter.co.kr${path}?step=${step}`;

const codes = (labels: string[], start = 1) =>
  labels.map(
    (label, i) =>
      [String(i + start).padStart(2, "0"), label] as [string, string],
  );
export const fixtureOptions: Record<string, [string, string][]> = {
  rank: [
    ...codes([
      "이병",
      "일병",
      "상병",
      "병장",
      "하사",
      "중사",
      "상사",
      "원사",
      "준위",
      "소위",
      "중위",
      "대위",
      "소령",
      "중령",
      "대령",
      "준장",
      "소장",
      "중장",
      "대장",
      "원수",
    ]),
    ["99", "기타"],
  ],
  discharge: codes([
    "만기제대",
    "소집해제",
    "의가사제대",
    "의병제대",
    "불명예제대",
    "상이제대",
  ]),
  branch: [
    ...codes([
      "육군",
      "해군",
      "공군",
      "해병",
      "전경",
      "의경",
      "해경",
      "공익",
      "병역특례",
      "카투사",
      "의무소방",
    ]),
    ["99", "기타"],
  ],
  grade: [
    ["100", "심한 장애인"],
    ["200", "심하지 않은 장애인"],
  ],
  type: [
    ["01", "간장애"],
    ["03", "뇌병변장애"],
    ["17", "지체장애"],
    ["99", "기타장애"],
  ],
  convenience: [
    ["Y", "필요"],
    ["N", "불필요"],
  ],
  relation: ["부", "모", "조부", "조모", "형제", "배우자", "자녀"].map(
    (l) => [l, l] as [string, string],
  ),
  rate: [["10", "10%"]],
  nationality: [
    ["KR", "대한민국"],
    ["US", "미국"],
  ],
  emergencyRelation: [["01", "부모"]],
  field: [["01", "합성분야"]],
};

const row = (title: string, content: string, required = false) =>
  `<div class="x-row"><span aria-hidden="true">${title}</span><div class="x-title">${title}${required ? "*" : ""}</div><div class="x-content">${content}</div></div>`;
let reviewKey = 100;
const wrap = (control: string) =>
  `<span data-review-key="${reviewKey++}@">${control}</span>`;
const text = (attrs: string) =>
  wrap(`<input type="text" class="ats-outline-none x-input" ${attrs}>`);
const dropdown = (placeholder: string, list: string, disabled = false) =>
  wrap(
    `<div class="ats-inline-flex ats-flex-col ats-relative x-dd"><button type="button" data-list="${list}" data-placeholder="${placeholder}"${disabled ? " disabled" : ""}>${placeholder}</button></div>`,
  );
const toggle = (labels: string[]) =>
  wrap(
    `<div class="x-toggle">${labels
      .map(
        (label, i) =>
          `<li class="ats-list-none"><button type="button" class="${i === 0 ? "ats-bg-white ats-text-gray-800" : "ats-bg-gray-80 ats-text-gray-600"} x-btn">${label}</button></li>`,
      )
      .join("")}</div>`,
  );

export interface V1Page {
  forbiddenClicks(): string[];
  /** Removes an option from a dropdown list the next time it opens. */
  dropOption(list: string, label: string): void;
  /** Makes a dropdown ignore the click that would close its open body. */
  ignoreClose(list: string): void;
}

/** Labels that unlock a status row's dependents (measured: 군필, 대상). */
const unlocking: Record<string, string> = {
  병역: "군필",
  장애여부: "대상",
  보훈여부: "대상",
};

export function mountV1Step1(step = "1", path?: string): V1Page {
  resetHplacePage();
  setHplacePage(v1Url(step, path));
  document.head.innerHTML = `<script type="module" src="/v1/applicant/index-Synth01a.js"></script><link rel="stylesheet" href="/v1/applicant/index-Synth01b.css">`;
  const locked = true;
  document.body.innerHTML = `<div id="root"><div class="x-app">
<nav>${["기본정보", "학력 및 연구/경력", "어학/자격/기타", "자기소개서/역량기술서", "최종 점검"].map((l, i) => `<button type="button" data-testid="resume-form-stepper-item" data-step-sn="${i + 1}">${l}</button>`).join("")}</nav>
<button type="button" data-testid="resume-parsing-upload">AI로 지원서 채우기</button>
<button type="button" data-testid="resume-parsing-banner-upload">파일 업로드</button>
<div class="x-section"><div><h5>기본정보</h5></div>
<div id="5001"><div class="x-group">
${row("분야", dropdown("분야를 선택해주세요.", "field"), true)}
${row("이름", text('name="basicInfoGroupAnswers.name" readonly value="합성" maxlength="50"'), true)}
${row("영문이름", text('name="basicInfoGroupAnswers.englishName" maxlength="100" placeholder="영문이름을 입력해주세요."'))}
${row("생년월일", text('placeholder="YYYY.MM.DD"'), true)}
${row("성별", wrap('<fieldset><legend class="ats-sr-only">성별</legend><label class="x-radio"><input type="radio" class="ats-appearance-none" name="basicInfoGroupAnswers.gender" value="M"><span>남</span></label><label class="x-radio"><input type="radio" class="ats-appearance-none" name="basicInfoGroupAnswers.gender" value="F"><span>여</span></label></fieldset>'), true)}
${row("휴대전화", text('name="basicInfoGroupAnswers.mobilePhone" readonly value="010-0000-0000"'))}
${row("이메일", text('name="basicInfoGroupAnswers.email" readonly value="synthetic@example.test"'))}
${row("비상연락처", text('name="basicInfoGroupAnswers.emergencyContact.emergencyPhoneNumber" maxlength="20"') + dropdown("관계", "emergencyRelation", true))}
${row("사진", wrap('<input type="file" accept="image/*">'))}
</div></div></div>
<div class="x-section"><div><h5>병역/취업우대</h5></div>
<div id="5002"><div class="x-group">
${row("병역", toggle(["비대상", "군필", "미필", "면제", "복무중"]) + `<div class="x-sub">${text('placeholder="입대일" disabled')}${text('placeholder="제대일" disabled')}${wrap('<div><button type="button" class="x-duration" disabled>18개월</button><button type="button" class="x-duration" disabled>21개월</button><button type="button" class="x-duration" disabled>24개월</button></div>')}${text('name="militaryGroupAnswers.militaryItemAnswer.militaryRole" maxlength="100" disabled')}${dropdown("계급을 선택해주세요.", "rank", locked)}${dropdown("제대구분을 선택해주세요.", "discharge", locked)}${dropdown("군별을 선택해주세요.", "branch", locked)}</div>`)}
${row("장애여부", toggle(["비대상", "대상"]) + text('name="preferentialEmploymentGroupResumeItemAnswers.handicapAnswer.handicapRegistrationNumber" maxlength="15" disabled') + dropdown("장애 정도", "grade", locked) + dropdown("장애 유형", "type", locked) + dropdown("편의 제공 여부 선택", "convenience", locked))}
${row("보훈여부", toggle(["비대상", "대상"]) + text('name="preferentialEmploymentGroupResumeItemAnswers.patriotAnswer.patriotNumber" maxlength="13" disabled') + dropdown("관계를 선택해주세요.", "relation", locked) + dropdown("보훈비율을 선택해주세요.", "rate", locked))}
</div></div></div>
<div class="x-section"><div><h5>인적사항</h5></div>
<div id="5003"><div class="x-group">
${row("국적", dropdown("국적을 선택해주세요.", "nationality"))}
${row("현주소", text('name="addressGroupResumeItemAnswers.currentAddress.zipCode" disabled') + text('name="addressGroupResumeItemAnswers.currentAddress.address" disabled') + text('name="addressGroupResumeItemAnswers.currentAddress.detailAddress" disabled') + wrap('<button type="button" class="x-address">주소입력</button>'))}
${row("취미", text('name="etcGroupResumeItemAnswers.hobby" maxlength="100"'))}
</div></div></div>
<div class="x-footer"><button type="button" class="x-prev">이전</button><button type="button" data-testid="resume-form-save">임시저장</button><button type="button" data-testid="resume-form-save-and-leave">저장 후 나가기</button><button type="button" class="x-next">다음</button></div>
</div></div><div id="tooltip-root"></div><div id="overlay-root"></div>`;
  return installShims();
}

function installShims(): V1Page {
  const root = document.getElementById("root")!;
  const forbidden: string[] = [];
  const removed = new Map<string, Set<string>>();
  const stuck = new Set<string>();
  const later = (run: () => void) => setTimeout(run, 0);
  const isForbidden = (target: Element) =>
    target.closest(
      '[data-testid="resume-form-save"],[data-testid="resume-form-save-and-leave"],[data-testid="resume-form-stepper-item"],[data-testid^="resume-parsing-"],.x-prev,.x-next,.x-address,.x-duration,input[type="file"]',
    );
  root.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      const hit = isForbidden(target);
      if (hit) forbidden.push(hit.textContent?.trim() || hit.tagName);
      const trigger = target.closest(
        ".x-dd > button",
      ) as HTMLButtonElement | null;
      if (
        trigger &&
        ["field", "emergencyRelation", "convenience", "rate"].includes(
          trigger.dataset.list!,
        )
      )
        forbidden.push(`dropdown:${trigger.dataset.list}`);
    },
    true,
  );
  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    // Status toggles: the selected classes move synchronously; the row's
    // dependents unlock on the next React render.
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
      const title = rowElement.querySelector(
        'span[aria-hidden="true"]',
      )!.textContent!;
      later(() => {
        const open = choice.textContent === unlocking[title];
        for (const control of rowElement.querySelectorAll<
          HTMLInputElement | HTMLButtonElement
        >(".x-input, .x-dd > button, .x-duration"))
          control.disabled = !open;
      });
      return;
    }
    // Dropdown option: trigger text becomes the label, the body closes.
    const option = target.closest("#dropdown-body ul > li > button");
    if (option instanceof HTMLButtonElement) {
      const container = option.closest(".x-dd")!;
      const trigger = container.querySelector(
        ":scope > button",
      ) as HTMLButtonElement;
      later(() => {
        trigger.textContent =
          option.value === "선택안함_옵션"
            ? trigger.dataset.placeholder!
            : option.textContent!;
        container.querySelector(":scope > #dropdown-body")?.remove();
      });
      return;
    }
    const trigger = target.closest(".x-dd > button");
    if (trigger instanceof HTMLButtonElement && !trigger.disabled) {
      const container = trigger.parentElement!;
      const body = container.querySelector(":scope > #dropdown-body");
      if (body) {
        if (!stuck.has(trigger.dataset.list!)) later(() => body.remove());
        return;
      }
      const list = fixtureOptions[trigger.dataset.list!].filter(
        ([, label]) => !removed.get(trigger.dataset.list!)?.has(label),
      );
      later(() =>
        container.insertAdjacentHTML(
          "beforeend",
          `<div id="dropdown-body" class="x-body"><input type="text" placeholder="검색"><ul><div>header</div><div>header</div><li><button type="button" value="선택안함_옵션">선택안함</button></li>${list.map(([code, label]) => `<li><button type="button" value="${code}">${label}</button></li>`).join("")}</ul></div>`,
        ),
      );
      return;
    }
    // Native radio: only the wrapping label changes the state.
    if (target instanceof HTMLInputElement && target.type === "radio") {
      event.preventDefault();
      return;
    }
    const label = target.closest("label.x-radio");
    if (label) {
      event.preventDefault();
      const input = label.querySelector("input")!;
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  root.addEventListener("focusout", (event) => {
    const input = event.target;
    if (
      input instanceof HTMLInputElement &&
      ["입대일", "제대일"].includes(input.placeholder)
    ) {
      const m = /^(\d{4})\.(\d{2})\.\d{2}$/.exec(input.value);
      if (m) later(() => (input.value = `${m[1]}.${m[2]}`));
    }
  });
  return {
    forbiddenClicks: () => [...forbidden],
    dropOption: (list, label) =>
      removed.set(list, (removed.get(list) ?? new Set()).add(label)),
    ignoreClose: (list) => stuck.add(list),
  };
}

export const rowOf = (title: string) =>
  Array.from(document.querySelectorAll('span[aria-hidden="true"]')).find(
    (s) => s.textContent === title,
  )!.parentElement!;
export const toggleButton = (title: string, label: string) =>
  Array.from(
    rowOf(title).querySelectorAll<HTMLButtonElement>(
      "li.ats-list-none > button",
    ),
  ).find((b) => b.textContent === label)!;
export const selectedToggle = (title: string) =>
  Array.from(
    rowOf(title).querySelectorAll<HTMLButtonElement>(
      "li.ats-list-none > button",
    ),
  )
    .filter(
      (b) =>
        b.classList.contains("ats-bg-white") &&
        b.classList.contains("ats-text-gray-800"),
    )
    .map((b) => b.textContent);
export const dropdownTrigger = (list: string) =>
  document.querySelector<HTMLButtonElement>(
    `.x-dd > button[data-list="${list}"]`,
  )!;
export const dateInput = (placeholder: string) =>
  document.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  )!;
export const named = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;

/** Bounded wait for a page state; fails instead of passing by timing luck. */
export async function until(check: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("state not reached");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Clicks status toggles the way a user would and waits for the unlock. */
export async function unlockDependents(): Promise<void> {
  toggleButton("병역", "군필").click();
  toggleButton("장애여부", "대상").click();
  toggleButton("보훈여부", "대상").click();
  await until(
    () =>
      !dateInput("입대일").disabled &&
      !dropdownTrigger("grade").disabled &&
      !dropdownTrigger("relation").disabled,
  );
}

export function v1Profile(): Profile {
  const profile = createEmptyProfile();
  Object.assign(profile.personal, {
    englishFamilyName: "Tester",
    englishGivenName: "Synthetic",
    birthDate: "1990-01-31",
    gender: "남성",
    nationality: "대한민국",
  });
  profile.contact.emergencyPhoneNumber = "010-1234-5678";
  Object.assign(profile.military, {
    militaryStatus: "군필",
    serviceStartDate: "2010-03-02",
    serviceEndDate: "2012-01-01",
    militarySpecialty: "합성병과",
    militaryRank: "병장",
    dischargeType: "만기제대",
    militaryBranch: "육군",
  });
  Object.assign(profile.disability, {
    disabilityStatus: "대상",
    disabilityRegistrationNumber: "1234-5678",
    disabilityGrade: "심한 장애인",
    disabilityType: "지체장애",
  });
  Object.assign(profile.veteran, {
    veteranStatus: "대상",
    veteranNumber: "12-345678",
    veteranRelation: "부",
  });
  return profile;
}

const identity = (labels: string[]) =>
  Object.fromEntries(labels.map((l) => [l, l]));
/** What the backend returns for the CF-505 wire table (plan.md). */
const bindings: Record<string, ValueBinding> = {
  "englishName.familyFirst": {
    type: "DERIVED",
    recipe: "ENGLISH_FULL_NAME_FAMILY_FIRST",
  },
  birthday: { type: "DIRECT", profileFieldKey: "personal.personal.birthDate" },
  gender: {
    type: "LOOKUP",
    profileFieldKey: "personal.personal.gender",
    optionMap: { 남성: "남", 여성: "여" },
  },
  emergencyPhone: {
    type: "DIRECT",
    profileFieldKey: "contact.contact.emergencyPhoneNumber",
  },
  militaryStatus: {
    type: "LOOKUP",
    profileFieldKey: "military.military.militaryStatus",
    optionMap: identity(["비대상", "군필", "미필", "면제", "복무중"]),
  },
  serviceStartDate: {
    type: "DIRECT",
    profileFieldKey: "military.military.serviceStartDate",
  },
  serviceEndDate: {
    type: "DIRECT",
    profileFieldKey: "military.military.serviceEndDate",
  },
  militarySpecialty: {
    type: "DIRECT",
    profileFieldKey: "military.military.militarySpecialty",
  },
  militaryRank: {
    type: "LOOKUP",
    profileFieldKey: "military.military.militaryRank",
    optionMap: identity(fixtureOptions.rank.map(([, l]) => l)),
  },
  dischargeType: {
    type: "LOOKUP",
    profileFieldKey: "military.military.dischargeType",
    optionMap: identity(fixtureOptions.discharge.map(([, l]) => l)),
  },
  militaryBranch: {
    type: "LOOKUP",
    profileFieldKey: "military.military.militaryBranch",
    optionMap: {
      육군: "육군",
      해군: "해군",
      공군: "공군",
      해병대: "해병",
      전투경찰: "전경",
      해양경찰: "해경",
      의무경찰: "의경",
      의무소방: "의무소방",
    },
  },
  disabilityStatus: {
    type: "DERIVED",
    recipe: "BOOLEAN_YN",
    profileFieldKey: "disability.disability.disabilityStatus",
    trueLabel: "대상",
    falseLabel: "비대상",
  },
  disabilityRegistrationNumber: {
    type: "DIRECT",
    profileFieldKey: "disability.disability.disabilityRegistrationNumber",
  },
  disabilityGrade: {
    type: "LOOKUP",
    profileFieldKey: "disability.disability.disabilityGrade",
    optionMap: {
      "심한 장애인": "심한 장애인",
      "심하지 않은 장애인": "심하지 않은 장애인",
      중증: "심한 장애인",
      경증: "심하지 않은 장애인",
    },
  },
  disabilityType: {
    type: "LOOKUP",
    profileFieldKey: "disability.disability.disabilityType",
    optionMap: {
      지체장애: "지체장애",
      간장애: "간장애",
      기타: "기타장애",
      췌장장애: "췌장장애",
    },
  },
  veteranStatus: {
    type: "DERIVED",
    recipe: "BOOLEAN_YN",
    profileFieldKey: "veteran.veteran.veteranStatus",
    trueLabel: "대상",
    falseLabel: "비대상",
  },
  veteranNumber: {
    type: "DIRECT",
    profileFieldKey: "veteran.veteran.veteranNumber",
  },
  veteranRelation: {
    type: "LOOKUP",
    profileFieldKey: "veteran.veteran.veteranRelation",
    optionMap: identity([
      "부",
      "모",
      "조부",
      "조모",
      "외조부",
      "외조모",
      "형제",
      "자매",
      "남매",
      "배우자",
      "자녀",
    ]),
  },
  nationality: {
    type: "LOOKUP",
    profileFieldKey: "personal.personal.nationality",
    optionMap: { 대한민국: "대한민국" },
  },
};
const conditional = new Set(["gender", "nationality", "emergencyPhone"]);

export function v1Analysis(
  request: FieldsAnalyzeRequest,
): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((s) => s.fields)
      .map((f): FieldAnalysis => {
        const key = f.domName?.replace(/^hplace\.v1\./, "") ?? "";
        const valueBinding = bindings[key];
        if (!valueBinding || f.domName !== f.domId)
          return {
            candidateId: f.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          } as FieldAnalysis;
        return {
          candidateId: f.candidateId,
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy: conditional.has(key) ? "CONDITIONAL" : "ALLOWED",
          writePlan: {
            command:
              f.control === "radio"
                ? "CHECK_RADIO"
                : f.control === "select"
                  ? "SELECT_OPTION"
                  : "SET_TEXT",
          },
          valueBinding,
        } as FieldAnalysis;
      }),
  };
}
