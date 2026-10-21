import { genericRowFor, genericRows } from "../dom/repeatable-rows";
import { assignRepeatGroups, sameRepeatGroupKey } from "../dom/repeat-groups";
import { isTrustedId } from "../dom/trusted-id";

export interface CalendarUnitEvidence {
  readonly unit: "month" | "day";
  readonly unitEvidence: "target-format" | "target-label";
}

type CalendarUnitObservation =
  | CalendarUnitEvidence
  | { readonly unit: "month" | "day"; readonly unitEvidence: "unconfirmed" }
  | { readonly unit: "conflict" };

function labelsOf(target: HTMLInputElement): string[] {
  return [
    target.getAttribute("aria-label") ?? "",
    ...Array.from(target.labels ?? [], (label) => label.textContent ?? ""),
    ...(target.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => target.ownerDocument.getElementById(id)?.textContent ?? ""),
  ]
    .map((label) => label.trim())
    .filter(Boolean);
}

/** A label may name an entire repeated column, but never a different shape. */
function sharedColumnLabels(target: HTMLInputElement): string[] {
  const row = genericRowFor(target);
  const parent = row?.parentElement;
  if (!row || !parent) return [];
  const rows = genericRows(parent).filter((peer) => peer.parentElement === parent);
  const assignments = assignRepeatGroups(
    parent,
    rows,
    (peer) => [peer.id, ...peer.classList]
      .filter((name) => /(?:^|[-_])item$/i.test(name) && !/^form-item(?:-group)?$/i.test(name))
      .sort((left, right) => right.length - left.length)[0]
      ?.replace(/[-_]?item$/i, "")
      .replace(/[^a-z0-9가-힣]/gi, "")
      .toLowerCase(),
    "calendar",
  );
  const own = assignments.find((assignment) => assignment.row === row);
  if (!own || own.ambiguous) return [];
  const peers = assignments.filter(
    (assignment) =>
      !assignment.ambiguous && sameRepeatGroupKey(assignment.key, own.key),
  );
  if (peers.length < 2) return [];
  const selector =
    "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='reset']), select, textarea";
  const describe = (peer: Element) => {
    const controls = Array.from(peer.querySelectorAll<HTMLInputElement>(selector));
    const shape = JSON.stringify(
      controls.map((control) => {
        const path: string[] = [];
        for (
          let node: Element = control;
          node !== peer;
          node = node.parentElement!
        ) {
          const siblings = Array.from(node.parentElement!.children).filter(
            (child) => child.tagName === node.tagName,
          );
          path.unshift(`${node.tagName}:${siblings.indexOf(node)}`);
        }
        return [
          path,
          control.tagName,
          control.type,
          control.name.replace(/\d+/g, "#"),
          control.readOnly,
          control.getAttribute("maxlength"),
          control.getAttribute("placeholder"),
        ];
      }),
    );
    return { controls, shape };
  };
  const current = describe(row);
  const column = current.controls.indexOf(target);
  if (column < 0) return [];
  const columns = peers.map(({ row: peer }) => describe(peer));
  if (columns.some((peer) => peer.shape !== current.shape)) return [];
  return columns.flatMap(({ controls }) => {
    const control = controls[column];
    if (
      !(control instanceof HTMLInputElement) ||
      control === target ||
      (control.id &&
        !isTrustedId(control.getRootNode() as Document | ShadowRoot, control.id))
    )
      return [];
    return labelsOf(control);
  });
}

/** Two independent DOM clues; never infer a unit from site/input classes. */
export function calendarUnitEvidence(
  target: HTMLInputElement,
): CalendarUnitObservation | undefined {
  const ownLabels = labelsOf(target);
  const labels = ownLabels.length ? ownLabels : sharedColumnLabels(target);
  if (labels.join("").length > 512 || target.placeholder.length > 128)
    return { unit: "conflict" };
  const units = new Set(
    labels.flatMap((label) => {
      const day = /년\s*월\s*일|일(?:[^가-힣]|$)|\bdate\b/iu.test(label);
      const month = /년\s*월(?!\s*일)|월(?:[^가-힣]|$)|\bmonth\b/iu.test(label);
      return [...(day ? ["day"] : []), ...(month ? ["month"] : [])];
    }),
  );
  const hasUnitLabel = units.size === 1;
  const placeholder = target.placeholder.toUpperCase().trim();
  const day = /^YYYY([-./])MM\1DD$/.test(placeholder);
  const month = /^YYYY[-./]MM$/.test(placeholder);
  if (/YY|MM|DD/.test(placeholder) && !day && !month)
    return { unit: "conflict" };
  if (day) units.add("day");
  if (month) units.add("month");
  const length = target.getAttribute("maxlength");
  if (length !== null) {
    if (length !== "7" && length !== "10") return { unit: "conflict" };
    units.add(length === "7" ? "month" : "day");
  }
  if (units.size > 1) return { unit: "conflict" };
  if (units.size === 0) return;
  const unit = units.has("day") ? "day" : "month";
  if (!hasUnitLabel || (!day && !month && length === null))
    return { unit, unitEvidence: "unconfirmed" };
  return {
    unit,
    unitEvidence: day || month ? "target-format" : "target-label",
  };
}
