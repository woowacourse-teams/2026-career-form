import {
  debugCollectionSkip,
  type StructuralSkipReason,
} from "../../debug/structural-diagnostics";
import { detailControls, detailSectionId } from "./detail";
import type { FieldCandidateHandle } from "../../dom/types";
export const basicSpecs = {
  gender: {
    name: "genderFlag",
    label: "성별",
    kind: "radio",
    options: { M: "남", F: "여" },
    profile: "personal.personal.gender",
  },
  nationality: {
    name: "nationality",
    label: "국적",
    kind: "select",
    options: { KR: "대한민국" },
    profile: "personal.personal.nationality",
  },
  veteranStatus: {
    name: "patriot.patriotYn",
    label: "보훈여부",
    kind: "radio",
    options: { false: "비대상", true: "대상" },
    profile: "veteran.veteran.veteranStatus",
    rel: "patriot",
  },
  disabilityStatus: {
    name: "handicap.handicapYn",
    label: "장애여부",
    kind: "radio",
    options: { false: "비대상", true: "대상" },
    profile: "disability.disability.disabilityStatus",
    rel: "handicap",
  },
  militaryStatus: {
    name: "military.militaryTypeCode",
    label: "병역사항",
    kind: "radio",
    options: {
      "00": "비대상",
      "01": "군필",
      "02": "미필",
      "03": "면제",
      "04": "복무중",
    },
    profile: "military.military.militaryStatus",
    rel: "military noneMilitary",
  },
  veteranNumber: {
    name: "patriot.patriotNumber",
    label: "보훈번호",
    kind: "text",
    profile: "veteran.veteran.veteranNumber",
    parent: "veteranStatus",
    target: "patriot",
    max: 64,
  },
  veteranRelation: {
    name: "patriot.relationship",
    label: "보훈관계",
    kind: "text",
    profile: "veteran.veteran.veteranRelation",
    parent: "veteranStatus",
    target: "patriot",
    max: 64,
  },
  disabilityGrade: {
    name: "handicap.handicapGradeCode",
    label: "장애정도",
    kind: "select",
    profile: "disability.disability.disabilityGrade",
    parent: "disabilityStatus",
    target: "handicap",
    options: { "100": "심한 장애인", "200": "심하지 않은 장애인" },
  },
  disabilityType: {
    name: "handicap.handicapContentsCode",
    label: "장애유형",
    kind: "select",
    profile: "disability.disability.disabilityType",
    parent: "disabilityStatus",
    target: "handicap",
    options: {
      "01": "간장애",
      "02": "뇌전증장애(간질장애)",
      "03": "뇌병변장애",
      "05": "시각장애",
      "06": "신장장애",
      "07": "심장장애",
      "08": "안면변형장애",
      "11": "장루/요루장애",
      "12": "정신장애",
      "15": "청각장애",
      "16": "호흡기장애",
      "17": "지체장애",
      "18": "언어장애",
      "19": "지적장애(정신박약/정신지체)",
      "20": "자폐성장애(발달장애)",
      "21": "췌장장애",
      "99": "기타장애",
    },
  },
  militaryRank: {
    name: "military.militaryPositionCode",
    label: "계급",
    kind: "select",
    profile: "military.military.militaryRank",
    parent: "militaryStatus",
    target: "military",
    options: {
      "01": "이병",
      "02": "일병",
      "03": "상병",
      "04": "병장",
      "05": "하사",
      "06": "중사",
      "07": "상사",
      "08": "원사",
      "09": "준위",
      "10": "소위",
      "11": "중위",
      "12": "대위",
      "13": "소령",
      "14": "중령",
      "15": "대령",
      "16": "준장",
      "17": "소장",
      "18": "중장",
      "19": "대장",
      "20": "원수",
      "99": "기타",
    },
  },
  serviceStartDate: {
    name: "military.militaryStartDate",
    label: "복무 시작일",
    kind: "text",
    profile: "military.military.serviceStartDate",
    parent: "militaryStatus",
    target: "military",
    date: "military.militaryDate:YM",
  },
  serviceEndDate: {
    name: "military.militaryEndDate",
    label: "복무 종료일",
    kind: "text",
    profile: "military.military.serviceEndDate",
    parent: "militaryStatus",
    target: "military",
    date: "military.militaryDate:END",
  },
  dischargeType: {
    name: "military.militaryDischargeCode",
    label: "전역구분",
    kind: "select",
    profile: "military.military.dischargeType",
    parent: "militaryStatus",
    target: "military",
    options: {
      "01": "만기제대",
      "02": "소집해제",
      "03": "의가사제대",
      "04": "의병제대",
      "05": "불명예제대",
      "06": "상이제대",
    },
  },
  exemptionReason: {
    name: "military.exemptionReason",
    label: "면제사유",
    kind: "text",
    profile: "military.military.exemptionReason",
    parent: "militaryStatus",
    target: "noneMilitary",
    max: 512,
  },
} as const;
export type BasicKey = keyof typeof basicSpecs;
export type BasicControl = {
  key: BasicKey;
  elements: (HTMLInputElement | HTMLSelectElement)[];
  options: Map<string, HTMLElement>;
};
export const basicName = (key: BasicKey) => `hplace.detail.${key}`;
function usable(element: Element): boolean {
  if (element.matches(':disabled,[readonly],[aria-disabled="true"]'))
    return false;
  for (let e: Element | null = element; e; e = e.parentElement) {
    const style = e.ownerDocument.defaultView?.getComputedStyle(e);
    if (
      e.matches('[hidden],[inert],[aria-hidden="true"]') ||
      style?.display === "none" ||
      style?.visibility === "hidden"
    )
      return false;
  }
  return true;
}
export function basicControls(document: Document): BasicControl[] {
  if (!detailControls(document)) return [];
  const form = document.getElementById("frm");
  const collected: BasicControl[] = [];
  for (const key of Object.keys(basicSpecs) as BasicKey[]) {
    const add = (): BasicControl[] => {
      const spec = basicSpecs[key];
      const reject = (
        reason: StructuralSkipReason = "owner-mismatch",
      ): BasicControl[] => {
        debugCollectionSkip(basicName(key), reason, "legacy-control-contract");
        return [];
      };
      const elements = Array.from(
        document.querySelectorAll(`[name="${spec.name}"]`),
      );
      if (!elements.length) return reject("control-missing");
      if (elements.some((e) => e.matches(":disabled")))
        return reject("disabled");
      const subject = elements[0]?.closest(".subject");
      if (
        !subject ||
        !elements.every(
          (e) =>
            (e instanceof HTMLInputElement || e instanceof HTMLSelectElement) &&
            e.form === form &&
            e.closest(".subject") === subject &&
            e.closest("section") ===
              form?.querySelector(
                `section.writeResume[data-code="${key === "gender" ? "11" : "13"}"]`,
              ) &&
            usable(e),
        )
      )
        return reject();
      if (
        key === "gender" &&
        subject !== document.getElementById("englishName")?.closest(".subject")
      )
        return reject();
      if (
        key === "serviceEndDate" &&
        !collected.some(
          (c) =>
            c.key === "serviceStartDate" &&
            c.elements[0].closest(".subject") === subject,
        )
      )
        return reject();
      if ("parent" in spec) {
        const parent = collected.find((c) => c.key === spec.parent);
        const selected = parent?.elements.filter(
          (e) => e instanceof HTMLInputElement && e.checked,
        ) as HTMLInputElement[] | undefined;
        if (
          selected?.length !== 1 ||
          selected[0].closest(".subject") !== subject ||
          !elements.every(
            (e) => e.getAttribute("data-rel-target") === spec.target,
          ) ||
          !(spec.parent === "militaryStatus"
            ? spec.target === "noneMilitary"
              ? selected[0].value === "03"
              : ["01", "04"].includes(selected[0].value)
            : selected[0].value === "true")
        )
          return reject();
      }
      const options = new Map<string, HTMLElement>();
      if (spec.kind === "radio") {
        if (
          elements.length !== Object.keys(spec.options).length ||
          !elements.every(
            (e) => e instanceof HTMLInputElement && e.type === "radio",
          )
        )
          return reject();
        if ("rel" in spec) {
          const group = elements[0].closest("[data-rel-id]");
          if (
            group?.getAttribute("data-rel-id") !== spec.rel ||
            elements.some((e) => e.closest("[data-rel-id]") !== group) ||
            group.getAttribute("data-rel-type") !==
              (key === "militaryStatus" ? "complex" : "with") ||
            group.getAttribute("data-rel-value") !==
              (key === "militaryStatus" ? "01,04 03" : "true")
          )
            return reject();
        }
        for (const e of elements as HTMLInputElement[]) {
          const wrapper = e.closest("label");
          const label =
            wrapper?.querySelector("span.label")?.textContent?.trim() ??
            wrapper?.textContent?.trim();
          if (
            !wrapper ||
            !Array.from(e.labels ?? []).includes(wrapper) ||
            wrapper.closest(".subject") !== subject ||
            wrapper.querySelectorAll("input").length !== 1 ||
            (spec.options as Record<string, string>)[e.value] !== label ||
            options.has(e.value)
          )
            return reject("label-mismatch");
          options.set(e.value, e);
        }
      } else if (spec.kind === "text") {
        const input = elements[0];
        if (
          elements.length !== 1 ||
          !(input instanceof HTMLInputElement) ||
          input.type !== "text" ||
          ("max" in spec && input.maxLength !== spec.max) ||
          ("date" in spec &&
            ((key === "serviceStartDate"
              ? ![
                  "military.militaryDate:YM",
                  "military.militaryDate:YMD",
                ].includes(input.dataset.dates ?? "")
              : input.dataset.dates !== spec.date) ||
              !input.classList.contains("date") ||
              !input.classList.contains(
                key === "serviceStartDate" ? "start" : "end",
              )))
        )
          return reject();
      } else {
        const select = elements[0];
        if (
          elements.length !== 1 ||
          !(select instanceof HTMLSelectElement) ||
          select.multiple
        )
          return reject();
        const codes = new Set<string>();
        for (const o of select.options) {
          if (!o.value) continue;
          if (codes.has(o.value)) return reject("option-mismatch");
          codes.add(o.value);
          if (
            (spec.options as Record<string, string>)[o.value] ===
              o.textContent?.trim() &&
            !o.disabled &&
            !o.closest("optgroup[disabled]")
          )
            options.set(o.value, o);
        }
        if (!options.size) return reject("option-mismatch");
      }
      return [{ key, elements: elements as BasicControl["elements"], options }];
    };
    collected.push(...add());
  }
  return collected;
}
export function ownedBasicControl(
  handle: FieldCandidateHandle,
): BasicControl | undefined {
  if (
    !handle.candidate.domName?.startsWith("hplace.detail.") ||
    handle.candidate.domId !== handle.candidate.domName ||
    !Object.keys(basicSpecs).some(
      (key) => handle.candidate.domName === `hplace.detail.${key}`,
    )
  )
    return undefined;
  const document = handle.elements[0]?.ownerDocument;
  if (!document || handle.sectionId !== detailSectionId) return undefined;
  return basicControls(document).find(
    (c) =>
      handle.candidate.domName === basicName(c.key) &&
      handle.candidate.domId === basicName(c.key) &&
      c.elements.length === handle.elements.length &&
      c.elements.every((e, i) => e === handle.elements[i]) &&
      c.options.size === handle.optionElements.size &&
      [...c.options].every(
        ([code, e]) => handle.optionElements.get(code) === e,
      ),
  );
}
