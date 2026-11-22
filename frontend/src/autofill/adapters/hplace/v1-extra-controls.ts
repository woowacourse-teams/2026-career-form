import {
  debugCollectionSkip,
  debugRuntimeSkip,
} from "../../debug/structural-diagnostics";
import type {
  ActionCandidateHandle,
  FieldCandidateHandle,
} from "../../dom/types";
import { hplaceDocumentKind } from "./fingerprint";
import { rowDropdowns } from "./v1-basic-controls";
import {
  cardState,
  chipWidgets,
  historySpec,
  parseV1HistoryName,
  v1HistorySearchRow,
} from "./v1-history-controls";
import { showsOnlyName } from "./v1-search";

/**
 * Hplace v1 applicant app, step 3 ("어학/자격/기타", CF-510). The step starts
 * without inputs. The 자격증 and 외국어활용능력 blocks (a title span, a title
 * and a body holding an entry list and one 추가하기 button) each get one
 * entry sub-row per click (step3-rows.json, step3-probe-f.json). Only these
 * two blocks are located, by their exact title: 공인외국어시험 (an exam pick
 * opens the site's score-verification window), 컴퓨터활용능력 and the 경험
 * cards (no profile category) are never touched.
 */
export const v1ExtraSectionId = "hplace-v1-extra";

export type ExtraGroup = "certificate" | "languageSkill";
export const extraGroups: readonly ExtraGroup[] = [
  "certificate",
  "languageSkill",
];
export const extraBlockTitle: Record<ExtraGroup, string> = {
  certificate: "자격증",
  languageSkill: "외국어활용능력",
};
/** Profile category and section of each block (review-plan pairs by it). */
export const extraProfileSection: Record<
  ExtraGroup,
  { categoryId: "certifications" | "languages"; sectionId: string }
> = {
  certificate: { categoryId: "certifications", sectionId: "certificate" },
  languageSkill: { categoryId: "languages", sectionId: "languageSkill" },
};

export type ExtraField =
  "licenseName" | "organization" | "acquireDate" | "registNumber" | "language";

export type ExtraSpec =
  | { kind: "search"; label: string; placeholder: string; profile: string }
  | {
      kind: "text";
      label: string;
      placeholder: string;
      /** The measured name start (the probe cut names at 30 characters). */
      namePrefix: string;
      profile: string;
    }
  | { kind: "date"; label: string; placeholder: string; profile: string }
  | {
      kind: "dropdown";
      label: string;
      /** The measured start of the trigger's placeholder (cut at 12 characters). */
      placeholderPrefix: string;
      options: readonly string[];
      profile: string;
    };

/** The 외국어활용능력 options after 선택안함, as measured (first 30 rows). */
export const languageLabels = [
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
const LICENSE_NAME_PREFIX = "licenseGroupAnswer.licenseAnsw";

/** In-scope controls of a sub-row, in write order (the search first). */
const extraSpecs: Record<
  ExtraGroup,
  readonly (readonly [ExtraField, ExtraSpec])[]
> = {
  certificate: [
    [
      "licenseName",
      {
        kind: "search",
        label: "자격증명",
        placeholder: "자격증명을 검색해주세요.",
        profile: "certifications.certificate.name",
      },
    ],
    [
      "organization",
      {
        kind: "text",
        label: "발급기관",
        placeholder: "발급기관을 입력해주세요.",
        namePrefix: LICENSE_NAME_PREFIX,
        profile: "certifications.certificate.issuer",
      },
    ],
    [
      "acquireDate",
      {
        kind: "date",
        label: "취득일",
        placeholder: "취득일",
        profile: "certifications.certificate.acquisitionDate",
      },
    ],
    [
      "registNumber",
      {
        kind: "text",
        label: "등록번호",
        placeholder: "등록번호를 입력해주세요.",
        namePrefix: LICENSE_NAME_PREFIX,
        profile: "certifications.certificate.registrationNo",
      },
    ],
  ],
  languageSkill: [
    [
      "language",
      {
        kind: "dropdown",
        label: "외국어",
        placeholderPrefix: "활용가능한 외국어를 선",
        options: languageLabels,
        profile: "languages.languageSkill.language",
      },
    ],
  ],
};

export function extraSpec(
  group: ExtraGroup,
  field: string,
): ExtraSpec | undefined {
  return extraSpecs[group].find(([f]) => f === field)?.[1];
}

export const v1ExtraName = (
  group: ExtraGroup,
  index: number,
  field: ExtraField,
) => `hplace.v1.${group}.${index}.${field}`;

const fieldName =
  /^hplace\.v1\.(certificate|languageSkill)\.(0|[1-9]\d*)\.([A-Za-z]+)$/;
export function parseV1ExtraName(
  name: string | undefined,
): { group: ExtraGroup; index: number; field: ExtraField } | undefined {
  const m = fieldName.exec(name ?? "");
  if (!m) return undefined;
  const group = m[1] as ExtraGroup;
  return extraSpec(group, m[3])
    ? { group, index: Number(m[2]), field: m[3] as ExtraField }
    : undefined;
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/\s+/g, " ").trim() ?? "";

export interface ExtraBlock {
  group: ExtraGroup;
  status: "ok" | "malformed";
  /** The block row: title span, title, body. */
  row: Element;
  add?: HTMLButtonElement;
  /** Entry sub-rows in document order. */
  subRows: Element[];
}

/** Block rows titled exactly `title`: a `div` whose first child is the title span. */
function titledRows(document: Document, title: string): Element[] {
  return Array.from(
    document
      .getElementById("root")
      ?.querySelectorAll('span[aria-hidden="true"]') ?? [],
  )
    .filter(
      (span) =>
        text(span) === title &&
        span.parentElement?.tagName === "DIV" &&
        span.parentElement.firstElementChild === span,
    )
    .map((span) => span.parentElement!);
}

/**
 * The measured block shape (f1_certAfter, f2_skill): body > wrapper >
 * [list?, 추가하기], each list child a sub-row `[content div, icon button]`.
 * The list is optional only before the first add (not measured).
 */
function blockShape(group: ExtraGroup, row: Element): ExtraBlock {
  const malformed: ExtraBlock = {
    group,
    status: "malformed",
    row,
    subRows: [],
  };
  const body = row.children.length === 3 ? row.children[2] : undefined;
  const adds = Array.from(
    body?.querySelectorAll<HTMLButtonElement>('button[type="button"]') ?? [],
  ).filter((b) => text(b) === "추가하기");
  const add = adds.length === 1 ? adds[0] : undefined;
  const wrapper = add?.parentElement;
  if (
    !body ||
    !add ||
    add.disabled ||
    !wrapper ||
    wrapper.parentElement !== body ||
    body.children.length !== 1 ||
    wrapper.lastElementChild !== add
  )
    return malformed;
  const lists = Array.from(wrapper.children).filter((c) => c !== add);
  if (lists.length > 1 || lists.some((l) => l.tagName !== "DIV"))
    return malformed;
  const subRows = Array.from(lists[0]?.children ?? []);
  const sound = subRows.every(
    (sub) =>
      sub.tagName === "DIV" &&
      sub.children.length === 2 &&
      sub.children[0].tagName === "DIV" &&
      sub.children[1] instanceof HTMLButtonElement,
  );
  return sound ? { group, status: "ok", row, add, subRows } : malformed;
}

/** The in-scope blocks on the page; one titled twice is malformed. */
export function v1ExtraBlocks(document: Document): ExtraBlock[] {
  return extraGroups.flatMap((group) => {
    const rows = titledRows(document, extraBlockTitle[group]);
    if (!rows.length) return [];
    return [
      rows.length === 1
        ? blockShape(group, rows[0])
        : { group, status: "malformed" as const, row: rows[0], subRows: [] },
    ];
  });
}

/** v1 resume form step 3 with its 어학, 자격/지식/기술 and 경험 sections. */
export function isV1ExtraPage(document: Document): boolean {
  const location = document.location;
  if (
    !location ||
    !/^\/v1\/applicant\/resume-form\/\d+$/.test(location.pathname) ||
    new URLSearchParams(location.search).get("step") !== "3" ||
    hplaceDocumentKind(document) !== "v1"
  )
    return false;
  const headers = Array.from(
    document.getElementById("root")?.querySelectorAll("h5") ?? [],
  ).map(text);
  // Tenants choose their sections (a second tenant has no 어학): one known
  // header is enough, none repeated; each in-scope block is independent and
  // the page is supported only while at least one of them is present.
  const counts = ["어학", "자격/지식/기술", "경험"].map(
    (h) => headers.filter((x) => x === h).length,
  );
  return (
    counts.some((n) => n === 1) &&
    counts.every((n) => n <= 1) &&
    v1ExtraBlocks(document).length > 0
  );
}

export interface ExtraControl {
  group: ExtraGroup;
  /** 0-based sub-row order inside the block. */
  index: number;
  field: ExtraField;
  spec: ExtraSpec;
  name: string;
  elements: HTMLInputElement[];
  custom: HTMLButtonElement[];
  /** Dropdown lists exist only while open. */
  options: Map<string, HTMLElement>;
  /** The entry sub-row. */
  row: Element;
  /** The block row (its title span closes a list). */
  block: Element;
  disabled: boolean;
}

type Located =
  | { status: "absent" }
  | { status: "malformed"; nodes: HTMLElement[] }
  | { status: "ok"; control: ExtraControl };

function locate(block: ExtraBlock, index: number, field: ExtraField): Located {
  const spec = extraSpec(block.group, field)!;
  const sub = block.subRows[index];
  if (block.status !== "ok" || !sub) return { status: "absent" };
  const ok = (
    control: Pick<ExtraControl, "elements" | "custom">,
    disabled: boolean,
  ): Located => ({
    status: "ok",
    control: {
      group: block.group,
      index,
      field,
      spec,
      name: v1ExtraName(block.group, index, field),
      ...control,
      options: new Map(),
      row: sub,
      block: block.row,
      disabled,
    },
  });
  if (spec.kind === "dropdown") {
    // The language trigger is the sub-row's first dropdown (f2_skill).
    const trigger = rowDropdowns(sub)[0];
    if (!trigger) return { status: "absent" };
    const shown = text(trigger);
    if (
      !shown.startsWith(spec.placeholderPrefix) &&
      !spec.options.includes(shown)
    )
      return { status: "malformed", nodes: [trigger] };
    return ok({ elements: [], custom: [trigger] }, trigger.disabled);
  }
  const candidates = Array.from(sub.querySelectorAll("input")).filter(
    (i) => i.placeholder === spec.placeholder,
  );
  if (!candidates.length) return { status: "absent" };
  const input = candidates[0];
  const named =
    spec.kind === "text"
      ? input.name.startsWith(spec.namePrefix)
      : !input.hasAttribute("name");
  if (
    candidates.length !== 1 ||
    input.type !== "text" ||
    input.readOnly ||
    !named
  )
    return { status: "malformed", nodes: candidates };
  return ok({ elements: [input], custom: [] }, input.disabled);
}

function allLocated(document: Document) {
  return v1ExtraBlocks(document).flatMap((block) =>
    block.status !== "ok"
      ? []
      : block.subRows.flatMap((_, index) =>
          extraSpecs[block.group].map(([field]) => ({
            block,
            index,
            field,
            found: locate(block, index, field),
          })),
        ),
  );
}

/** Verified, enabled step-3 controls: the ones collected and written. */
export function v1ExtraControls(document: Document): ExtraControl[] {
  if (!isV1ExtraPage(document)) return [];
  return allLocated(document).flatMap(({ block, index, field, found }) => {
    const name = v1ExtraName(block.group, index, field);
    if (found.status === "malformed")
      debugCollectionSkip(name, "control-shape", "v1-extra-contract");
    if (found.status !== "ok") return [];
    if (found.control.disabled) {
      debugCollectionSkip(name, "disabled", "v1-extra-locked");
      return [];
    }
    return [found.control];
  });
}

/** The live control of one sub-row field, located again from the page. */
export function v1ExtraControl(
  document: Document,
  group: ExtraGroup,
  index: number,
  field: ExtraField,
): ExtraControl | undefined {
  if (!isV1ExtraPage(document)) return undefined;
  const block = v1ExtraBlocks(document).find((b) => b.group === group);
  const found = block && locate(block, index, field);
  return found?.status === "ok" ? found.control : undefined;
}

export function ownedV1ExtraControl(
  handle: FieldCandidateHandle,
): ExtraControl | undefined {
  const domName = handle.candidate.domName;
  const parsed = parseV1ExtraName(domName);
  if (
    !parsed ||
    handle.candidate.domId !== domName ||
    handle.sectionId !== v1ExtraSectionId
  )
    return undefined;
  const document = (handle.elements[0] ?? handle.customElements?.[0])
    ?.ownerDocument;
  const control =
    document &&
    v1ExtraControl(document, parsed.group, parsed.index, parsed.field);
  const custom = handle.customElements ?? [];
  return control &&
    !control.disabled &&
    control.elements.length === handle.elements.length &&
    control.elements.every((e, i) => e === handle.elements[i]) &&
    control.custom.length === custom.length &&
    control.custom.every((e, i) => e === custom[i])
    ? control
    : undefined;
}

/** The page value in profile terms: a label, a text value, or "" when empty. */
export function v1ExtraControlValue(control: ExtraControl): string {
  const { spec } = control;
  if (spec.kind === "dropdown") {
    const shown = text(control.custom[0]);
    return shown.startsWith(spec.placeholderPrefix) ? "" : shown;
  }
  return control.elements[0].value;
}

/** The current sub-row of a block, located again (a pick re-renders it). */
export function v1ExtraSubRow(
  document: Document,
  group: ExtraGroup,
  index: number,
): Element | undefined {
  if (!isV1ExtraPage(document)) return undefined;
  const block = v1ExtraBlocks(document).find((b) => b.group === group);
  return block?.status === "ok" ? block.subRows[index] : undefined;
}

/**
 * The chip a certificate sub-row shows instead of its search input: its text
 * when the sub-row holds exactly one chip widget and no search input.
 */
export function v1ExtraChip(
  document: Document,
  index: number,
): string | undefined {
  const spec = extraSpec("certificate", "licenseName");
  const sub = v1ExtraSubRow(document, "certificate", index);
  if (!sub || spec?.kind !== "search") return undefined;
  if (sub.querySelector(`input[placeholder="${spec.placeholder}"]`))
    return undefined;
  if (!sub.querySelector("span[data-review-key]")) {
    // No review-key spans (second tenant, k-step3-after.txt): the picked name
    // is the sub-row's one text leaf, in the name block (`div > div > div >
    // p`): the outermost element around it that holds no input or button,
    // and the first content block of its parent. Otherwise: unknown.
    const leaves = Array.from(sub.querySelectorAll("*")).filter(
      (e) =>
        e.children.length === 0 &&
        !(e instanceof HTMLInputElement) &&
        !e.closest("button, li, #dropdown-body, svg") &&
        text(e) !== "",
    );
    const [leaf] = leaves;
    if (
      leaves.length !== 1 ||
      leaf.parentElement?.querySelector("input, button")
    )
      return undefined;
    let block: Element = leaf;
    while (
      block.parentElement &&
      block.parentElement !== sub &&
      !block.parentElement.querySelector("input, button")
    )
      block = block.parentElement;
    return block.parentElement?.firstElementChild === block
      ? text(leaf)
      : undefined;
  }
  const chips = chipWidgets(sub);
  return chips.length === 1 ? chips[0] : undefined;
}

/** The certificate sub-row shows exactly `name` as its pick: the strict chip
 * reading, or without review-key spans the measure-free fallback. */
export function v1ExtraChipShows(
  document: Document,
  index: number,
  name: string,
): boolean {
  const spec = extraSpec("certificate", "licenseName");
  const sub = v1ExtraSubRow(document, "certificate", index);
  if (!sub || spec?.kind !== "search") return false;
  return (
    showsOnlyName(sub, spec.placeholder, name) ??
    v1ExtraChip(document, index) === name
  );
}

/** A picked certificate field (its input replaced): the chip of its sub-row. */
export function v1ExtraPickedValue(
  handle: FieldCandidateHandle,
): string | undefined {
  const parsed = parseV1ExtraName(handle.candidate.domName);
  const document = handle.elements[0]?.ownerDocument;
  return parsed?.field === "licenseName" &&
    document &&
    handle.sectionId === v1ExtraSectionId &&
    handle.candidate.domId === handle.candidate.domName
    ? v1ExtraChip(document, parsed.index)
    : undefined;
}

/**
 * Value-free shape of a picked search row (tags and counts, never text):
 * the text leaves, the name block's index among its siblings, the inputs and
 * buttons beside the first leaf, svgs, sibling blocks, the leaf's depth, the
 * search inputs left and the review-key spans.
 */
function pickedShape(
  row: Element,
  placeholder: string,
  skipTitle: boolean,
): string {
  const [titleSpan, titleBox] = skipTitle ? Array.from(row.children) : [];
  const leaves = Array.from(row.querySelectorAll("*")).filter(
    (e) =>
      e.children.length === 0 &&
      !(e instanceof HTMLInputElement) &&
      e !== titleSpan &&
      !titleBox?.contains(e) &&
      !e.closest("button, li, #dropdown-body, svg") &&
      text(e) !== "",
  );
  const [leaf] = leaves;
  let block: Element | undefined = leaf;
  while (
    block?.parentElement &&
    block.parentElement !== row &&
    !block.parentElement.querySelector("input, button")
  )
    block = block.parentElement;
  let depth = 0;
  for (
    let e: Element | null = leaf ?? null;
    e && e !== row;
    e = e.parentElement
  )
    depth++;
  const parent = leaf?.parentElement;
  return [
    `leaves${leaves.length}`,
    `nameblock${block?.parentElement ? Array.from(block.parentElement.children).indexOf(block) : "x"}`,
    `parentInputs${parent?.querySelectorAll("input").length ?? 0}`,
    `parentButtons${parent?.querySelectorAll("button").length ?? 0}`,
    `svg${row.querySelectorAll("svg").length}`,
    `blocks${block?.parentElement?.children.length ?? "x"}`,
    `depth${depth}`,
    `search${row.querySelectorAll(`input[placeholder="${placeholder}"]`).length}`,
    `rk${row.querySelectorAll("span[data-review-key]").length}`,
  ].join("-");
}

/** Last detail logged per wire key: the result screen reads values often. */
const loggedPicked = new Map<string, string>();

/**
 * One value-free line when the result screen cannot read a picked v1 search
 * value (step-2 school/major, step-3 자격증명), with the registry status
 * and the row shape. Logged once per key and shape.
 */
export function debugV1PickedUnread(
  handle: FieldCandidateHandle,
  status: string,
): void {
  const name = handle.candidate.domName;
  const document = (handle.elements[0] ?? handle.customElements?.[0])
    ?.ownerDocument;
  if (!name || !document) return;
  let shape: string | undefined;
  const extra = parseV1ExtraName(name);
  const history = extra ? undefined : parseV1HistoryName(name);
  if (extra?.field === "licenseName") {
    const sub = v1ExtraSubRow(document, "certificate", extra.index);
    shape = sub ? pickedShape(sub, "자격증명을 검색해주세요.", false) : "norow";
  } else if (
    history &&
    (history.field === "academyName" || history.field === "major0.majorName")
  ) {
    const spec = historySpec(history.group, history.field);
    const row = v1HistorySearchRow(
      document,
      history.group,
      history.index,
      history.field,
    );
    shape =
      row && spec?.kind === "search"
        ? pickedShape(row, spec.placeholder, true)
        : "norow";
  }
  if (shape === undefined) return;
  const detail = `status-${status}-${shape}`;
  if (loggedPicked.get(name) === detail) return;
  loggedPicked.set(name, detail);
  debugRuntimeSkip(name, "picked-unread", detail, "result");
}

/** One value-free line when a read picked value differs from the profile. */
export function debugV1PickedMismatch(
  handle: FieldCandidateHandle,
  shown: string,
  expected: string,
): void {
  const name = handle.candidate.domName;
  if (!name || !(parseV1ExtraName(name) || parseV1HistoryName(name))) return;
  const detail = `v1-picked-mismatch-len${shown.length}-len${expected.length}`;
  if (loggedPicked.get(name) === detail) return;
  loggedPicked.set(name, detail);
  debugRuntimeSkip(name, "label-mismatch", detail, "result");
}

export function v1ExtraValue(handle: FieldCandidateHandle): string | undefined {
  const control = ownedV1ExtraControl(handle);
  return control ? v1ExtraControlValue(control) : v1ExtraPickedValue(handle);
}

/** Open but malformed controls of sound blocks (reported, never written). */
export function v1ExtraMalformed(
  document: Document,
): { group: ExtraGroup; index: number; field: ExtraField }[] {
  if (!isV1ExtraPage(document)) return [];
  return allLocated(document).flatMap(({ block, index, field, found }) =>
    found.status === "malformed" &&
    found.nodes.every((n) => !n.matches(":disabled"))
      ? [{ group: block.group, index, field }]
      : [],
  );
}

export const v1ExtraAddName = (group: ExtraGroup) => `hplace.v1.${group}.add`;

export interface ExtraAddAction {
  name: string;
  group: ExtraGroup;
  element: HTMLButtonElement;
  /** Sub-rows of the block. */
  count: number;
  /** The digest an add must leave unchanged (plus the new sub-row at the end). */
  state: () => string[];
}

/** The 추가하기 of every sound in-scope block. */
export function v1ExtraAddActions(document: Document): ExtraAddAction[] {
  if (!isV1ExtraPage(document)) return [];
  return v1ExtraBlocks(document).flatMap((block) =>
    block.status === "ok" && block.add
      ? [
          {
            name: v1ExtraAddName(block.group),
            group: block.group,
            element: block.add,
            count: block.subRows.length,
            state: () => block.subRows.map(cardState),
          },
        ]
      : [],
  );
}

/** An add action handle that is still its live add button; its name. */
export function ownedV1ExtraAddAction(
  handle: Pick<ActionCandidateHandle, "sectionId" | "candidate" | "element">,
): string | undefined {
  const name = handle.candidate.domName;
  return name &&
    handle.sectionId === v1ExtraSectionId &&
    handle.candidate.domId === name &&
    v1ExtraAddActions(handle.element.ownerDocument).some(
      (a) => a.name === name && a.element === handle.element,
    )
    ? name
    : undefined;
}
