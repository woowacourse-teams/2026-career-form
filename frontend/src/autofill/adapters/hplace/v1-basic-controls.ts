import { debugCollectionSkip } from "../../debug/structural-diagnostics";
import type { FieldCandidateHandle } from "../../dom/types";
import { hplaceDocumentKind } from "./fingerprint";

/**
 * Hplace v1 applicant app, step 1 ("기본정보", CF-505). The page is a React
 * build whose class names are hashes, so controls are identified only by
 * fixed `name`s, row titles (the row's first `span[aria-hidden="true"]`),
 * placeholders, design-system `ats-*` classes and fixed option labels.
 */
export const v1SectionId = "hplace-v1-basic";
export const v1Name = (key: V1Key) =>
  key === "englishName"
    ? "hplace.v1.englishName.familyFirst"
    : `hplace.v1.${key}`;

const codes = (labels: string[]) =>
  Object.fromEntries(
    labels.map((label, i) => [String(i + 1).padStart(2, "0"), label]),
  );
const same = (labels: string[]) =>
  Object.fromEntries(labels.map((label) => [label, label]));

type Spec =
  | {
      kind: "text";
      label: string;
      name: string;
      profile?: string;
      parent?: V1Driver;
    }
  | {
      kind: "date";
      label: string;
      row: string;
      placeholder: string;
      profile: string;
      parent?: V1Driver;
      /** The only date input of its row (birth date). */
      sole?: true;
    }
  | {
      kind: "radio";
      label: string;
      name: string;
      options: Record<string, string>;
      profile: string;
    }
  | {
      kind: "toggle";
      label: string;
      row: string;
      options: Record<string, string>;
      profile: string;
      /** The label that unlocks this row's dependents (measured). */
      unlocks: string;
    }
  | {
      kind: "dropdown";
      label: string;
      row: string;
      index: number;
      placeholder: string;
      options: Record<string, string>;
      profile: string;
      parent?: V1Driver;
    };

export const v1Specs = {
  englishName: {
    kind: "text",
    label: "영문이름",
    name: "basicInfoGroupAnswers.englishName",
  },
  birthday: {
    kind: "date",
    label: "생년월일",
    row: "생년월일",
    placeholder: "YYYY.MM.DD",
    profile: "personal.personal.birthDate",
    sole: true,
  },
  gender: {
    kind: "radio",
    label: "성별",
    name: "basicInfoGroupAnswers.gender",
    options: { M: "남", F: "여" },
    profile: "personal.personal.gender",
  },
  emergencyPhone: {
    kind: "text",
    label: "비상연락처",
    name: "basicInfoGroupAnswers.emergencyContact.emergencyPhoneNumber",
    profile: "contact.contact.emergencyPhoneNumber",
  },
  militaryStatus: {
    kind: "toggle",
    label: "병역",
    row: "병역",
    options: same(["비대상", "군필", "미필", "면제", "복무중"]),
    profile: "military.military.militaryStatus",
    unlocks: "군필",
  },
  serviceStartDate: {
    kind: "date",
    label: "입대일",
    row: "병역",
    placeholder: "입대일",
    profile: "military.military.serviceStartDate",
    parent: "militaryStatus",
  },
  serviceEndDate: {
    kind: "date",
    label: "제대일",
    row: "병역",
    placeholder: "제대일",
    profile: "military.military.serviceEndDate",
    parent: "militaryStatus",
  },
  militarySpecialty: {
    kind: "text",
    label: "병과",
    name: "militaryGroupAnswers.militaryItemAnswer.militaryRole",
    profile: "military.military.militarySpecialty",
    parent: "militaryStatus",
  },
  militaryRank: {
    kind: "dropdown",
    label: "계급",
    row: "병역",
    index: 0,
    placeholder: "계급을 선택해주세요.",
    options: {
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
      "99": "기타",
    },
    profile: "military.military.militaryRank",
    parent: "militaryStatus",
  },
  dischargeType: {
    kind: "dropdown",
    label: "제대구분",
    row: "병역",
    index: 1,
    placeholder: "제대구분을 선택해주세요.",
    options: codes([
      "만기제대",
      "소집해제",
      "의가사제대",
      "의병제대",
      "불명예제대",
      "상이제대",
    ]),
    profile: "military.military.dischargeType",
    parent: "militaryStatus",
  },
  militaryBranch: {
    kind: "dropdown",
    label: "군별",
    row: "병역",
    index: 2,
    placeholder: "군별을 선택해주세요.",
    options: {
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
      "99": "기타",
    },
    profile: "military.military.militaryBranch",
    parent: "militaryStatus",
  },
  disabilityStatus: {
    kind: "toggle",
    label: "장애",
    row: "장애",
    options: same(["비대상", "대상"]),
    profile: "disability.disability.disabilityStatus",
    unlocks: "대상",
  },
  disabilityRegistrationNumber: {
    kind: "text",
    label: "장애등록번호",
    name: "preferentialEmploymentGroupResumeItemAnswers.handicapAnswer.handicapRegistrationNumber",
    profile: "disability.disability.disabilityRegistrationNumber",
    parent: "disabilityStatus",
  },
  disabilityGrade: {
    kind: "dropdown",
    label: "장애 정도",
    row: "장애",
    index: 0,
    placeholder: "장애 정도",
    options: { "100": "심한 장애인", "200": "심하지 않은 장애인" },
    profile: "disability.disability.disabilityGrade",
    parent: "disabilityStatus",
  },
  disabilityType: {
    kind: "dropdown",
    label: "장애 유형",
    row: "장애",
    index: 1,
    placeholder: "장애 유형",
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
      "99": "기타장애",
    },
    profile: "disability.disability.disabilityType",
    parent: "disabilityStatus",
  },
  veteranStatus: {
    kind: "toggle",
    label: "보훈",
    row: "보훈",
    options: same(["비대상", "대상"]),
    profile: "veteran.veteran.veteranStatus",
    unlocks: "대상",
  },
  veteranNumber: {
    kind: "text",
    label: "보훈번호",
    name: "preferentialEmploymentGroupResumeItemAnswers.patriotAnswer.patriotNumber",
    profile: "veteran.veteran.veteranNumber",
    parent: "veteranStatus",
  },
  veteranRelation: {
    kind: "dropdown",
    label: "보훈 관계",
    row: "보훈",
    index: 0,
    placeholder: "관계를 선택해주세요.",
    options: same([
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
    profile: "veteran.veteran.veteranRelation",
    parent: "veteranStatus",
  },
  nationality: {
    kind: "dropdown",
    label: "국적",
    row: "국적",
    index: 0,
    placeholder: "국적을 선택해주세요.",
    options: { KR: "대한민국" },
    profile: "personal.personal.nationality",
  },
} as const satisfies Record<string, Spec>;

export type V1Key = keyof typeof v1Specs;
export type V1Driver = "militaryStatus" | "disabilityStatus" | "veteranStatus";
export const v1Drivers: readonly V1Driver[] = [
  "militaryStatus",
  "disabilityStatus",
  "veteranStatus",
];
export const v1Spec = (key: V1Key): Spec => v1Specs[key];

/** Catalog entries in page order (object keys like "10" would sort first). */
export function v1OptionEntries(key: V1Key): [string, string][] {
  const spec = v1Spec(key);
  if (!("options" in spec)) return [];
  const entries = Object.entries(spec.options as Record<string, string>);
  return entries.every(([code]) => /^\d+$/.test(code))
    ? entries.sort(([a], [b]) => Number(a) - Number(b))
    : entries;
}

export interface V1Control {
  key: V1Key;
  /** Native inputs: one text input, or the two gender radios. */
  elements: HTMLInputElement[];
  /** Custom controls: the toggle buttons, or the one dropdown trigger. */
  custom: HTMLButtonElement[];
  /** Radio code -> input, toggle label -> button. Dropdown lists exist only while open. */
  options: Map<string, HTMLElement>;
  /** The field row the control was found in (status rows: the driver's row). */
  row: Element;
  disabled: boolean;
}

/** v1 resume form step 1: the only v1 screen this adapter writes. */
export function isV1BasicPage(document: Document): boolean {
  const location = document.location;
  return (
    !!location &&
    /^\/v1\/applicant\/resume-form\/\d+$/.test(location.pathname) &&
    new URLSearchParams(location.search).get("step") === "1" &&
    hplaceDocumentKind(document) === "v1"
  );
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/\s+/g, " ").trim() ?? "";

/** The unique field row whose first child is the `aria-hidden` title span. */
export function v1Row(document: Document, title: string): Element | undefined {
  const root = document.getElementById("root");
  const rows = Array.from(
    root?.querySelectorAll('span[aria-hidden="true"]') ?? [],
  ).filter(
    (span) =>
      span.parentElement?.firstElementChild === span && text(span) === title,
  );
  return rows.length === 1 ? rows[0].parentElement! : undefined;
}

/** Dropdown triggers of a row, in document order. */
function rowDropdowns(row: Element): HTMLButtonElement[] {
  return Array.from(
    row.querySelectorAll<HTMLButtonElement>(
      "div.ats-inline-flex.ats-flex-col.ats-relative > button[type=button]",
    ),
  );
}

/** The one toggle group of a row whose option labels are exactly `labels`. */
function toggleGroup(
  row: Element,
  labels: string[],
): HTMLButtonElement[] | undefined {
  const groups = new Map<Element, HTMLButtonElement[]>();
  for (const button of row.querySelectorAll<HTMLButtonElement>(
    "li.ats-list-none > button",
  )) {
    const parent = button.parentElement!.parentElement!;
    groups.set(parent, [...(groups.get(parent) ?? []), button]);
  }
  const matching = [...groups.values()].filter((buttons) => {
    const seen = buttons.map(text);
    return (
      seen.length === labels.length &&
      new Set(seen).size === seen.length &&
      seen.every((label) => labels.includes(label))
    );
  });
  // A group that shares the row's first label set but differs is malformed.
  return matching.length === 1 &&
    [...groups.values()].filter((b) => b.some((x) => labels.includes(text(x))))
      .length === 1
    ? matching[0]
    : undefined;
}

export const isSelectedToggle = (button: Element) =>
  button.classList.contains("ats-bg-white") &&
  button.classList.contains("ats-text-gray-800");

/** The dropdown body of an open trigger: its container's own `#dropdown-body`. */
export function dropdownBody(trigger: HTMLButtonElement): Element | undefined {
  const bodies = Array.from(trigger.parentElement?.children ?? []).filter(
    (e) => e.id === "dropdown-body",
  );
  return bodies.length === 1 ? bodies[0] : undefined;
}

type Located =
  | { status: "absent" }
  | { status: "malformed"; reason: Parameters<typeof debugCollectionSkip>[1] }
  | { status: "ok"; control: V1Control };

function locate(document: Document, key: V1Key): Located {
  const spec = v1Spec(key);
  const root = document.getElementById("root");
  const malformed = (
    reason: Parameters<typeof debugCollectionSkip>[1] = "control-shape",
  ): Located => ({ status: "malformed", reason });
  const ok = (
    control: Omit<V1Control, "key" | "disabled">,
    disabled: boolean,
  ): Located => ({ status: "ok", control: { key, ...control, disabled } });
  if (!root) return { status: "absent" };
  if (spec.kind === "text" || spec.kind === "radio") {
    const nodes = Array.from(
      document.querySelectorAll(`[name="${spec.name}"]`),
    );
    if (!nodes.length) return { status: "absent" };
    if (!nodes.every((e) => root.contains(e) && e instanceof HTMLInputElement))
      return malformed("owner-mismatch");
    const inputs = nodes as HTMLInputElement[];
    const row = inputs[0].closest("[data-review-key]")?.parentElement;
    if (!row) return malformed("owner-mismatch");
    if (spec.kind === "text") {
      if (inputs.length !== 1 || inputs[0].type !== "text") return malformed();
      if (inputs[0].readOnly) return malformed("owner-mismatch");
      return ok(
        { elements: inputs, custom: [], options: new Map(), row },
        inputs[0].disabled,
      );
    }
    const fieldset = inputs[0].closest("fieldset");
    const options = new Map<string, HTMLElement>();
    for (const input of inputs) {
      const label = input.closest("label");
      if (
        input.type !== "radio" ||
        !fieldset ||
        input.closest("fieldset") !== fieldset ||
        !label ||
        label.querySelectorAll("input").length !== 1 ||
        spec.options[input.value as keyof typeof spec.options] !==
          text(label) ||
        options.has(input.value)
      )
        return malformed("label-mismatch");
      options.set(input.value, input);
    }
    if (options.size !== Object.keys(spec.options).length)
      return malformed("label-mismatch");
    return ok(
      { elements: inputs, custom: [], options, row: fieldset! },
      inputs.some((i) => i.disabled),
    );
  }
  const row = v1Row(document, spec.row);
  if (!row) return { status: "absent" };
  if (spec.kind === "date") {
    const unnamed = Array.from(row.querySelectorAll("input")).filter(
      (i) => !i.hasAttribute("name") && i.type !== "file",
    );
    const byPlaceholder = unnamed.filter(
      (i) => i.placeholder === spec.placeholder,
    );
    const candidates =
      byPlaceholder.length || !spec.sole ? byPlaceholder : unnamed;
    if (!candidates.length) return { status: "absent" };
    const input = candidates[0];
    if (
      candidates.length !== 1 ||
      input.type !== "text" ||
      input.placeholder !== spec.placeholder ||
      input.readOnly
    )
      return malformed();
    return ok(
      { elements: [input], custom: [], options: new Map(), row },
      input.disabled,
    );
  }
  if (spec.kind === "toggle") {
    if (!row.querySelector("li.ats-list-none > button"))
      return { status: "absent" };
    const buttons = toggleGroup(row, Object.values(spec.options));
    if (!buttons) return malformed("label-mismatch");
    if (buttons.filter(isSelectedToggle).length > 1) return malformed();
    return ok(
      {
        elements: [],
        custom: buttons,
        options: new Map(buttons.map((b) => [text(b), b])),
        row,
      },
      buttons.some((b) => b.disabled),
    );
  }
  const trigger = rowDropdowns(row)[spec.index];
  if (!trigger) return { status: "absent" };
  const shown = text(trigger);
  if (
    shown !== spec.placeholder &&
    !Object.values(spec.options).includes(shown)
  )
    return malformed("option-mismatch");
  return ok(
    { elements: [], custom: [trigger], options: new Map(), row },
    trigger.disabled,
  );
}

/** Every in-scope control the page renders, verified or not (for reporting). */
export function v1PresentControls(
  document: Document,
): { key: V1Key; enabled: boolean }[] {
  if (!isV1BasicPage(document)) return [];
  return (Object.keys(v1Specs) as V1Key[]).flatMap((key) => {
    const found = locate(document, key);
    if (found.status === "absent") return [];
    if (found.status === "ok")
      return [{ key, enabled: !found.control.disabled }];
    // Malformed: report it only when its nodes are open for input.
    const spec = v1Spec(key);
    const nodes =
      spec.kind === "text" || spec.kind === "radio"
        ? Array.from(document.querySelectorAll(`[name="${spec.name}"]`))
        : [];
    return [
      {
        key,
        enabled: nodes.length
          ? nodes.every((n) => !n.matches(":disabled"))
          : true,
      },
    ];
  });
}

/** Located controls, including locked ones (for default checks and settling). */
export function v1AllControls(document: Document): V1Control[] {
  if (!isV1BasicPage(document)) return [];
  return (Object.keys(v1Specs) as V1Key[]).flatMap((key) => {
    const found = locate(document, key);
    return found.status === "ok" ? [found.control] : [];
  });
}

/** Verified, enabled step-1 controls: the ones collected and written. */
export function v1BasicControls(document: Document): V1Control[] {
  if (!isV1BasicPage(document)) return [];
  return (Object.keys(v1Specs) as V1Key[]).flatMap((key) => {
    const found = locate(document, key);
    if (found.status === "malformed")
      debugCollectionSkip(v1Name(key), found.reason, "v1-control-contract");
    if (found.status !== "ok") return [];
    if (found.control.disabled) {
      debugCollectionSkip(v1Name(key), "disabled", "v1-control-locked");
      return [];
    }
    return [found.control];
  });
}

export function ownedV1Control(
  handle: FieldCandidateHandle,
): V1Control | undefined {
  const domName = handle.candidate.domName;
  if (
    !domName?.startsWith("hplace.v1.") ||
    handle.candidate.domId !== domName ||
    handle.sectionId !== v1SectionId
  )
    return undefined;
  const key = (Object.keys(v1Specs) as V1Key[]).find(
    (k) => v1Name(k) === domName,
  );
  const document = (handle.elements[0] ?? handle.customElements?.[0])
    ?.ownerDocument;
  if (!key || !document) return undefined;
  const control = v1BasicControls(document).find((c) => c.key === key);
  const custom = handle.customElements ?? [];
  return control &&
    control.elements.length === handle.elements.length &&
    control.elements.every((e, i) => e === handle.elements[i]) &&
    control.custom.length === custom.length &&
    control.custom.every((e, i) => e === custom[i]) &&
    control.options.size === handle.optionElements.size &&
    [...control.options].every(([id, e]) => handle.optionElements.get(id) === e)
    ? control
    : undefined;
}

/** The page value in profile terms: a label, a text value, or "" when empty. */
export function v1ControlValue(control: V1Control): string | undefined {
  const spec = v1Spec(control.key);
  if (spec.kind === "text" || spec.kind === "date")
    return control.elements[0].value;
  if (spec.kind === "radio") {
    const checked = control.elements.filter((e) => e.checked);
    return checked.length === 0
      ? ""
      : checked.length === 1
        ? spec.options[checked[0].value as keyof typeof spec.options]
        : undefined;
  }
  if (spec.kind === "toggle") {
    const selected = control.custom.filter(isSelectedToggle);
    return selected.length === 1
      ? text(selected[0])
      : selected.length
        ? undefined
        : "";
  }
  const shown = text(control.custom[0]);
  return shown === spec.placeholder ? "" : shown;
}

export function v1Value(handle: FieldCandidateHandle): string | undefined {
  const control = ownedV1Control(handle);
  return control ? v1ControlValue(control) : undefined;
}
