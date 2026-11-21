import { debugCollectionSkip } from "../../debug/structural-diagnostics";
import type {
  ActionCandidateHandle,
  FieldCandidateHandle,
} from "../../dom/types";
import { hplaceDocumentKind } from "./fingerprint";
import {
  isSelectedToggle,
  rowDropdowns,
  toggleGroup,
} from "./v1-basic-controls";

/**
 * Hplace v1 applicant app, step 2 ("학력 및 연구/경력", CF-509). The step
 * starts without inputs: each level (고등학교, 대학교, 대학원, 직장경력)
 * lives in its own container `#root div[id=<digits>]` holding a card list
 * and one add control. Row titles repeat in every card, so controls are
 * located inside one card only; a card's level comes from its own row set,
 * never from its position. Step 1 (v1-basic-controls.ts) is not affected.
 */
export const v1HistorySectionId = "hplace-v1-history";

export type HistoryGroup =
  "highschool" | "college" | "graduateSchool" | "career";
export const historyGroups: readonly HistoryGroup[] = [
  "highschool",
  "college",
  "graduateSchool",
  "career",
];
export const historyLevelLabel: Record<HistoryGroup, string> = {
  highschool: "고등학교",
  college: "대학교",
  graduateSchool: "대학원",
  career: "직장경력",
};
/** Profile category and section of each level (review-plan pairs by it). */
export const historyProfileSection: Record<
  HistoryGroup,
  { categoryId: "education" | "careers"; sectionId: string }
> = {
  highschool: { categoryId: "education", sectionId: "highSchool" },
  college: { categoryId: "education", sectionId: "university" },
  graduateSchool: { categoryId: "education", sectionId: "graduateSchool" },
  career: { categoryId: "careers", sectionId: "career" },
};
/** The page's own per-level index prefix of named inputs (none in 고등학교). */
const namePrefix: Partial<Record<HistoryGroup, string>> = {
  college: "collegeGroupAnswers",
  graduateSchool: "graduateSchoolGroupAnswers",
  career: "careerGroupAnswers",
};
/** Measured row title set of each card level (step2-cards.json). */
const levelRows: Record<HistoryGroup, readonly string[]> = {
  highschool: ["졸업구분", "학교정보", "재학기간"],
  college: [
    "학위구분",
    "학교정보",
    "재학기간",
    "졸업구분",
    "입학구분",
    "학과계열",
    "학업성적",
    "이수학점",
    "전공",
  ],
  graduateSchool: [
    "학위구분",
    "학교정보",
    "재학기간",
    "졸업구분",
    "입학구분",
    "학업성적",
    "전공",
  ],
  career: ["고용형태", "근무기간", "회사명", "부서", "직급", "담당업무"],
};
const degreeLabels: Partial<Record<HistoryGroup, string[]>> = {
  college: ["학사", "전문학사"],
  graduateSchool: ["석사", "박사"],
};

export type HistorySpec =
  | {
      kind: "toggle";
      label: string;
      row: string;
      options: readonly string[];
      profile: string;
      /** The label that unlocks this row's dependents (measured: 퇴사). */
      unlocks?: string;
    }
  | {
      kind: "dropdown";
      label: string;
      row: string;
      index: number;
      /** Dropdown triggers the row holds (fail closed on any other count). */
      count: number;
      placeholders: readonly string[];
      options: readonly string[];
      profile: string;
    }
  | {
      kind: "date";
      label: string;
      row: string;
      placeholder: string;
      profile: string;
      parent?: HistoryField;
      /** 졸업일: a future day is allowed while the card says 졸업예정. */
      future?: true;
    }
  | {
      kind: "text";
      label: string;
      row: string;
      profile: string;
      /** Unnamed input identified by placeholder (회사명). */
      placeholder?: string;
      /** Named input: `<prefix>.<i>.<name>`. */
      name?: string;
      numeric?: true;
      /** Typing opens an optional suggestion list that is never picked. */
      suggestions?: true;
    };

export type HistoryField =
  | "graduationTypeCode"
  | "locationCode"
  | "dayOrNight"
  | "entranceDate"
  | "graduationDate"
  | "degreeTypeCode"
  | "entranceTypeCode"
  | "perfectScore"
  | "score"
  | "employmentType"
  | "workingStatus"
  | "leavingDate"
  | "company"
  | "department"
  | "position"
  | "assignedTask";

const regionLabels = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];
export const scaleLabels = [
  "3.0",
  "3.5",
  "4.0",
  "4.3",
  "4.5",
  "5.0",
  "7.0",
  "20",
  "100",
];
const employmentLabels = [
  "정규직",
  "계약직",
  "파견직",
  "프리랜서",
  "개인사업",
  "병역특례",
  "인턴",
  "아르바이트",
  "기타",
];

/** In-scope controls of a card, in write order (status before its date). */
export function historySpecs(
  group: HistoryGroup,
): readonly (readonly [HistoryField, HistorySpec])[] {
  const p = `${historyProfileSection[group].categoryId}.${historyProfileSection[group].sectionId}`;
  const date = (
    row: string,
    placeholder: string,
    profile: string,
    extra: Partial<Extract<HistorySpec, { kind: "date" }>> = {},
  ): HistorySpec => ({
    kind: "date",
    label: placeholder,
    row,
    placeholder,
    profile: `${p}.${profile}`,
    ...extra,
  });
  if (group === "career")
    return [
      [
        "employmentType",
        {
          kind: "dropdown",
          label: "고용형태",
          row: "고용형태",
          index: 0,
          count: 1,
          // Captured text was cut at 12 characters: with or without a period.
          placeholders: ["고용형태를 선택해주세요", "고용형태를 선택해주세요."],
          options: employmentLabels,
          profile: `${p}.employmentType`,
        },
      ],
      [
        "workingStatus",
        {
          kind: "toggle",
          label: "재직중/퇴사",
          row: "근무기간",
          options: ["재직중", "퇴사"],
          profile: `${p}.employmentStatus`,
          unlocks: "퇴사",
        },
      ],
      ["entranceDate", date("근무기간", "입사일", "startDate")],
      [
        "leavingDate",
        date("근무기간", "퇴사일", "endDate", { parent: "workingStatus" }),
      ],
      [
        "company",
        {
          kind: "text",
          label: "회사명",
          row: "회사명",
          placeholder: "회사명을 입력해주세요.",
          profile: `${p}.companyName`,
          suggestions: true,
        },
      ],
      [
        "department",
        {
          kind: "text",
          label: "부서",
          row: "부서",
          name: "department",
          profile: `${p}.department`,
        },
      ],
      [
        "position",
        {
          kind: "text",
          label: "직급",
          row: "직급",
          name: "position",
          profile: `${p}.position`,
        },
      ],
      [
        "assignedTask",
        {
          kind: "text",
          label: "담당업무",
          row: "담당업무",
          name: "assignedTask",
          profile: `${p}.responsibilities`,
        },
      ],
    ];
  const graduation: HistorySpec = {
    kind: "toggle",
    label: "졸업구분",
    row: "졸업구분",
    options:
      group === "highschool"
        ? ["졸업", "졸업예정", "중퇴", "휴학", "재학"]
        : ["졸업", "졸업예정", "수료", "중퇴", "휴학", "재학"],
    profile: `${p}.completionStatus`,
  };
  const entrance = date("재학기간", "입학일", "startDate");
  const graduationDate = date("재학기간", "졸업일", "endDate", {
    future: true,
  });
  if (group === "highschool")
    return [
      ["graduationTypeCode", graduation],
      [
        "locationCode",
        {
          kind: "dropdown",
          label: "학교 소재지",
          row: "학교정보",
          index: 0,
          count: 2,
          placeholders: ["학교 소재지를 선택해주세요."],
          options: regionLabels,
          profile: `${p}.schoolRegion`,
        },
      ],
      [
        "dayOrNight",
        {
          kind: "toggle",
          label: "주간/야간",
          row: "학교정보",
          options: ["주간", "야간"],
          profile: `${p}.attendanceType`,
        },
      ],
      ["entranceDate", entrance],
      ["graduationDate", graduationDate],
    ];
  return [
    [
      "degreeTypeCode",
      {
        kind: "toggle",
        label: "학위구분",
        row: "학위구분",
        options: degreeLabels[group]!,
        profile: `${p}.degreeLevel`,
      },
    ],
    ["entranceDate", entrance],
    ["graduationTypeCode", graduation],
    ["graduationDate", graduationDate],
    [
      "entranceTypeCode",
      {
        kind: "toggle",
        label: "입학구분",
        row: "입학구분",
        options: ["입학", "편입"],
        profile: `${p}.${group === "college" ? "transferStatus" : "admissionType"}`,
      },
    ],
    // The scale is written before its score: the pair rule reads it back.
    [
      "perfectScore",
      {
        kind: "dropdown",
        label: "만점기준",
        row: "학업성적",
        index: 0,
        count: 1,
        placeholders: ["만점기준"],
        options: scaleLabels,
        profile: `${p}.gpaScale`,
      },
    ],
    [
      "score",
      {
        kind: "text",
        label: "평점",
        row: "학업성적",
        name: `${group === "college" ? "collegeGrade" : "graduateSchoolGrade"}.score`,
        profile: `${p}.gpaScore`,
        numeric: true,
      },
    ],
  ];
}

export function historySpec(
  group: HistoryGroup,
  field: string,
): HistorySpec | undefined {
  return historySpecs(group).find(([f]) => f === field)?.[1];
}

export const v1HistoryName = (
  group: HistoryGroup,
  index: number,
  field: HistoryField,
) => `hplace.v1.${group}.${index}.${field}`;

const fieldName =
  /^hplace\.v1\.(highschool|college|graduateSchool|career)\.(0|[1-9]\d*)\.([A-Za-z]+)$/;
export function parseV1HistoryName(
  name: string | undefined,
): { group: HistoryGroup; index: number; field: HistoryField } | undefined {
  const m = fieldName.exec(name ?? "");
  if (!m) return undefined;
  const group = m[1] as HistoryGroup;
  return historySpec(group, m[3])
    ? { group, index: Number(m[2]), field: m[3] as HistoryField }
    : undefined;
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/\s+/g, " ").trim() ?? "";
/** A field row: a `div` whose first child is the `aria-hidden` title span. */
const isRow = (e: Element) =>
  e.tagName === "DIV" &&
  !!e.firstElementChild?.matches('span[aria-hidden="true"]');

export interface HistoryCard {
  element: Element;
  /** Row title -> row; undefined when a title repeats inside the card. */
  rows: Map<string, Element> | undefined;
}
export type AddControl = HTMLButtonElement | HTMLDivElement;
export interface HistoryLevel {
  group: HistoryGroup;
  status: "ok" | "malformed";
  container: Element;
  /** The add control: `button` with zero cards, `div[tabindex="0"]` after. */
  add?: AddControl;
  cards: HistoryCard[];
}

function cardRows(card: Element): Map<string, Element> | undefined {
  const body = card.children[1];
  const rows = new Map<string, Element>();
  for (const row of Array.from(body?.children ?? []).filter(isRow)) {
    const title = text(row.firstElementChild);
    if (rows.has(title)) return undefined;
    rows.set(title, row);
  }
  return rows;
}

/** The single level whose measured row set equals the card's own rows. */
function cardLevel(card: HistoryCard): HistoryGroup | undefined {
  if (!card.rows) return undefined;
  const titles = [...card.rows.keys()];
  const matches = historyGroups.filter((group) => {
    const expected = levelRows[group];
    if (
      titles.length !== expected.length ||
      !titles.every((t) => expected.includes(t))
    )
      return false;
    const degree = degreeLabels[group];
    return !degree || !!toggleGroup(card.rows!.get("학위구분")!, degree);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** Named inputs carry the page's own 0-based card index; HS has none. */
function namesMatch(group: HistoryGroup, card: Element, index: number) {
  const named = Array.from(card.querySelectorAll("input[name]")).map(
    (i) => (i as HTMLInputElement).name,
  );
  const prefix = namePrefix[group];
  return prefix
    ? named.every((n) => n.startsWith(`${prefix}.${index}.`))
    : named.length === 0;
}

interface ContainerShape {
  container: Element;
  cards: HistoryCard[];
  /** False when a row sits outside the measured card shape. */
  sound: boolean;
  adds: { group: HistoryGroup; element: AddControl }[];
}

function containerShape(container: Element): ContainerShape {
  const rows = Array.from(container.querySelectorAll("div")).filter(isRow);
  const outer = rows.filter((r) => !rows.some((o) => o !== r && o.contains(r)));
  let sound = true;
  let wrapper: Element | undefined;
  const found = new Set<Element>();
  // container > list wrapper > card > (head, body) > row
  for (const row of outer) {
    const body = row.parentElement;
    const card = body?.parentElement;
    const list = card?.parentElement;
    if (
      !body ||
      !card ||
      !list ||
      list.parentElement !== container ||
      card.children.length !== 2 ||
      card.children[1] !== body ||
      (wrapper && wrapper !== list)
    ) {
      sound = false;
      continue;
    }
    wrapper = list;
    found.add(card);
  }
  const elements = wrapper ? Array.from(wrapper.children) : [];
  if (elements.some((e) => !found.has(e))) sound = false;
  const cards = elements
    .filter((e) => found.has(e))
    .map((element) => ({ element, rows: cardRows(element) }));
  const inCard = (e: Element) => cards.some((c) => c.element.contains(e));
  const adds = Array.from(
    container.querySelectorAll<AddControl>(
      'button[type="button"], div[tabindex="0"]',
    ),
  ).flatMap((element) => {
    if (inCard(element)) return [];
    const labels = element.querySelectorAll("p");
    const group = historyGroups.find(
      (g) => labels.length === 1 && text(labels[0]) === historyLevelLabel[g],
    );
    return group ? [{ group, element }] : [];
  });
  return { container, cards, sound, adds };
}

function levelContainers(document: Document): Element[] {
  const root = document.getElementById("root");
  const all = Array.from(root?.querySelectorAll("div[id]") ?? []).filter((d) =>
    /^\d+$/.test(d.id),
  );
  return all.filter((d) => !all.some((o) => o !== d && o.contains(d)));
}

/**
 * Every level container the page shows. A container is claimed by the level
 * of its add control and of its cards; one that claims no level (the
 * attachment blocks) is ignored. A level is malformed when a card matches no
 * level or another one, a page index disagrees with the card order, the add
 * control is not the measured shape, or two containers claim it.
 */
export function v1HistoryLevels(document: Document): HistoryLevel[] {
  const levels: HistoryLevel[] = [];
  for (const shape of levelContainers(document).map(containerShape)) {
    const cardGroups = shape.cards.map(cardLevel);
    const claimed = new Set<HistoryGroup>([
      ...shape.adds.map((a) => a.group),
      ...cardGroups.filter((g): g is HistoryGroup => !!g),
    ]);
    if (!claimed.size) continue;
    const [group] = [...claimed];
    const add = shape.adds.length === 1 ? shape.adds[0].element : undefined;
    const addShape =
      !add ||
      (shape.cards.length === 0
        ? add instanceof HTMLButtonElement && !add.disabled
        : add.matches('div[tabindex="0"]'));
    const ok =
      claimed.size === 1 &&
      shape.sound &&
      shape.adds.length <= 1 &&
      addShape &&
      cardGroups.every((g) => g === group) &&
      shape.cards.every((c, i) => namesMatch(group, c.element, i));
    for (const g of claimed)
      levels.push({
        group: g,
        status: ok ? "ok" : "malformed",
        container: shape.container,
        ...(ok && add ? { add } : {}),
        cards: shape.cards,
      });
  }
  const seen = (g: HistoryGroup) => levels.filter((l) => l.group === g).length;
  return historyGroups.flatMap((g) => {
    const mine = levels.filter((l) => l.group === g);
    return seen(g) > 1
      ? mine.map(({ add: _add, ...l }) => ({
          ...l,
          status: "malformed" as const,
        }))
      : mine;
  });
}

/** v1 resume form step 2 with its 학력사항/경력사항 sections and level containers. */
export function isV1HistoryPage(document: Document): boolean {
  const location = document.location;
  if (
    !location ||
    !/^\/v1\/applicant\/resume-form\/\d+$/.test(location.pathname) ||
    new URLSearchParams(location.search).get("step") !== "2" ||
    hplaceDocumentKind(document) !== "v1"
  )
    return false;
  const headers = Array.from(
    document.getElementById("root")?.querySelectorAll("h5") ?? [],
  ).map(text);
  return (
    headers.filter((h) => h === "학력사항").length === 1 &&
    headers.filter((h) => h === "경력사항").length === 1 &&
    v1HistoryLevels(document).length > 0
  );
}

export interface HistoryControl {
  group: HistoryGroup;
  /** 0-based card order among the cards of the same level. */
  index: number;
  field: HistoryField;
  spec: HistorySpec;
  name: string;
  elements: HTMLInputElement[];
  custom: HTMLButtonElement[];
  /** Toggle label -> button. Dropdown lists exist only while open. */
  options: Map<string, HTMLElement>;
  row: Element;
  card: Element;
  disabled: boolean;
}

type Located =
  | { status: "absent" }
  | { status: "malformed"; nodes: HTMLElement[] }
  | { status: "ok"; control: HistoryControl };

function locate(
  level: HistoryLevel,
  index: number,
  field: HistoryField,
): Located {
  const spec = historySpec(level.group, field)!;
  const card = level.cards[index];
  const row = card?.rows?.get(spec.row);
  if (level.status !== "ok" || !card || !row) return { status: "absent" };
  const malformed = (nodes: HTMLElement[] = []): Located => ({
    status: "malformed",
    nodes,
  });
  const ok = (
    control: Pick<HistoryControl, "elements" | "custom" | "options">,
    disabled: boolean,
  ): Located => ({
    status: "ok",
    control: {
      group: level.group,
      index,
      field,
      spec,
      name: v1HistoryName(level.group, index, field),
      ...control,
      row,
      card: card.element,
      disabled,
    },
  });
  if (spec.kind === "toggle") {
    const all = Array.from(
      row.querySelectorAll<HTMLButtonElement>("li.ats-list-none > button"),
    );
    if (!all.length) return { status: "absent" };
    const buttons = toggleGroup(row, [...spec.options]);
    if (!buttons || buttons.filter(isSelectedToggle).length > 1)
      return malformed(all);
    return ok(
      {
        elements: [],
        custom: buttons,
        options: new Map(buttons.map((b) => [text(b), b])),
      },
      buttons.some((b) => b.disabled),
    );
  }
  if (spec.kind === "dropdown") {
    const triggers = rowDropdowns(row);
    const trigger = triggers[spec.index];
    if (!trigger) return { status: "absent" };
    const shown = text(trigger);
    if (
      triggers.length !== spec.count ||
      (!spec.placeholders.includes(shown) && !spec.options.includes(shown))
    )
      return malformed([trigger]);
    return ok(
      { elements: [], custom: [trigger], options: new Map() },
      trigger.disabled,
    );
  }
  const name =
    spec.kind === "text" && spec.name
      ? `${namePrefix[level.group]}.${index}.${spec.name}`
      : undefined;
  const candidates = name
    ? Array.from(
        row.ownerDocument.querySelectorAll<HTMLInputElement>(
          `input[name="${name}"]`,
        ),
      )
    : Array.from(row.querySelectorAll("input")).filter(
        (i) => !i.hasAttribute("name") && i.placeholder === spec.placeholder,
      );
  if (!candidates.length) return { status: "absent" };
  const input = candidates[0];
  const type = spec.kind === "text" && spec.numeric ? "number" : "text";
  if (
    candidates.length !== 1 ||
    !row.contains(input) ||
    input.type !== type ||
    input.readOnly
  )
    return malformed(candidates);
  return ok(
    { elements: [input], custom: [], options: new Map() },
    input.disabled,
  );
}

function allLocated(document: Document) {
  return v1HistoryLevels(document).flatMap((level) =>
    level.status !== "ok"
      ? []
      : level.cards.flatMap((_, index) =>
          historySpecs(level.group).map(([field]) => ({
            level,
            index,
            field,
            found: locate(level, index, field),
          })),
        ),
  );
}

/** Located controls of sound cards, including locked ones. */
export function v1HistoryAllControls(document: Document): HistoryControl[] {
  if (!isV1HistoryPage(document)) return [];
  return allLocated(document).flatMap(({ found }) =>
    found.status === "ok" ? [found.control] : [],
  );
}

/** Verified, enabled step-2 controls: the ones collected and written. */
export function v1HistoryControls(document: Document): HistoryControl[] {
  if (!isV1HistoryPage(document)) return [];
  return allLocated(document).flatMap(({ level, index, field, found }) => {
    const name = v1HistoryName(level.group, index, field);
    if (found.status === "malformed")
      debugCollectionSkip(name, "control-shape", "v1-history-contract");
    if (found.status !== "ok") return [];
    if (found.control.disabled) {
      debugCollectionSkip(name, "disabled", "v1-history-locked");
      return [];
    }
    return [found.control];
  });
}

/** Malformed but open controls of sound cards (reported, never written). */
export function v1HistoryMalformed(
  document: Document,
): { group: HistoryGroup; index: number; field: HistoryField }[] {
  if (!isV1HistoryPage(document)) return [];
  return allLocated(document).flatMap(({ level, index, field, found }) =>
    found.status === "malformed" &&
    found.nodes.length > 0 &&
    found.nodes.every((n) => !n.matches(":disabled"))
      ? [{ group: level.group, index, field }]
      : [],
  );
}

/** The live control of one card field, located again from the page. */
export function v1HistoryControl(
  document: Document,
  group: HistoryGroup,
  index: number,
  field: HistoryField,
): HistoryControl | undefined {
  if (!isV1HistoryPage(document)) return undefined;
  const level = v1HistoryLevels(document).find((l) => l.group === group);
  const found = level && locate(level, index, field);
  return found?.status === "ok" ? found.control : undefined;
}

export function ownedV1HistoryControl(
  handle: FieldCandidateHandle,
): HistoryControl | undefined {
  const domName = handle.candidate.domName;
  const parsed = parseV1HistoryName(domName);
  if (
    !parsed ||
    handle.candidate.domId !== domName ||
    handle.sectionId !== v1HistorySectionId
  )
    return undefined;
  const document = (handle.elements[0] ?? handle.customElements?.[0])
    ?.ownerDocument;
  const control =
    document &&
    v1HistoryControl(document, parsed.group, parsed.index, parsed.field);
  const custom = handle.customElements ?? [];
  return control &&
    !control.disabled &&
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
export function v1HistoryControlValue(
  control: HistoryControl,
): string | undefined {
  const { spec } = control;
  if (spec.kind === "toggle") {
    const selected = control.custom.filter(isSelectedToggle);
    return selected.length === 1
      ? text(selected[0])
      : selected.length
        ? undefined
        : "";
  }
  if (spec.kind === "dropdown") {
    const shown = text(control.custom[0]);
    return spec.placeholders.includes(shown) ? "" : shown;
  }
  return control.elements[0].value;
}

export function v1HistoryValue(
  handle: FieldCandidateHandle,
): string | undefined {
  const control = ownedV1HistoryControl(handle);
  return control ? v1HistoryControlValue(control) : undefined;
}

export const v1HistoryAddName = (group: HistoryGroup) =>
  `hplace.v1.${group}.add`;

/** Add controls of sound levels, in level order. */
export function v1HistoryAddActions(
  document: Document,
): { group: HistoryGroup; element: AddControl }[] {
  if (!isV1HistoryPage(document)) return [];
  return v1HistoryLevels(document).flatMap((level) =>
    level.status === "ok" && level.add
      ? [{ group: level.group, element: level.add }]
      : [],
  );
}

/** An add action handle that is still its sound level's live add control. */
export function ownedV1HistoryAddAction(
  handle: Pick<ActionCandidateHandle, "sectionId" | "candidate" | "element">,
): HistoryGroup | undefined {
  const group = historyGroups.find(
    (g) => handle.candidate.domName === v1HistoryAddName(g),
  );
  return group &&
    handle.sectionId === v1HistorySectionId &&
    handle.candidate.domId === handle.candidate.domName &&
    v1HistoryAddActions(handle.element.ownerDocument).some(
      (a) => a.group === group && a.element === handle.element,
    )
    ? group
    : undefined;
}

/** Cards of a sound level, or undefined when the level cannot be counted. */
export function v1HistoryCards(
  document: Document,
  group: HistoryGroup,
): Element[] | undefined {
  if (!isV1HistoryPage(document)) return undefined;
  const levels = v1HistoryLevels(document).filter((l) => l.group === group);
  return levels.length === 1 && levels[0].status === "ok"
    ? levels[0].cards.map((c) => c.element)
    : undefined;
}

/** Browser-local digest of one card's state (never sent). */
export function cardState(card: Element): string {
  return JSON.stringify([
    Array.from(card.querySelectorAll("input")).map((i) =>
      i.type === "file" ? "" : `${i.disabled ? "d" : ""}:${i.value}`,
    ),
    Array.from(card.querySelectorAll("li.ats-list-none > button")).map((b) =>
      isSelectedToggle(b) ? 1 : 0,
    ),
    rowDropdowns(card).map(text),
  ]);
}
