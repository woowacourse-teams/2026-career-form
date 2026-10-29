import { isVisibleWriteElement } from "../dom/write-target";

/**
 * Row save (#370): some forms register a repeated entry only when the user
 * presses the save button of that row. The extension presses that button for
 * rows it filled itself, and never any other save, submit or move control.
 */
export interface RowSaveField {
  /** `category.section#itemIndex` for a repeatable profile entry, else undefined. */
  recordKey: string | undefined;
  recordLabel: string;
  elements: readonly Element[];
  /**
   * False for a field the user did not approve. It never decides its row, but
   * still marks the area of its row as not another row's area.
   */
  approved?: boolean;
  /** The extension wrote this field in the current pass. */
  written: boolean;
  /** The field holds its approved value (written in any pass, or already matched). */
  settled: boolean;
}

export type RowSaveManualReason =
  | "row-incomplete"
  | "button-disabled"
  | "unconfirmed"
  | "stopped";

export interface RowSaveManual {
  recordKey: string;
  recordLabel: string;
  reason: RowSaveManualReason;
}

export interface RowSaveOutcome {
  saved: string[];
  manual: RowSaveManual[];
  stopped: boolean;
}

interface RowSaveOptions {
  document: Document;
  fields: readonly RowSaveField[];
  savedKeys: ReadonlySet<string>;
  /** An earlier pass could not confirm a row save. */
  stopped?: boolean;
  signal?: AbortSignal;
  enableWaitMs?: number;
  confirmTimeoutMs?: number;
}

const ROW_SAVE_LABEL = /^(저장|save)$/i;
const FILL_CONTROL =
  "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='reset']):not([type='image']), select, textarea";
const POLL_MS = 50;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Row {
  key: string;
  label: string;
  fields: RowSaveField[];
}

export async function saveWrittenRows({
  document,
  fields,
  savedKeys,
  stopped: stoppedBefore = false,
  signal,
  enableWaitMs = 1_000,
  confirmTimeoutMs = 3_000,
}: RowSaveOptions): Promise<RowSaveOutcome> {
  const outcome: RowSaveOutcome = { saved: [], manual: [], stopped: stoppedBefore };
  const rows = new Map<string, Row>();
  for (const field of fields) {
    if (!field.recordKey || field.approved === false) continue;
    const row = rows.get(field.recordKey) ?? {
      key: field.recordKey,
      label: field.recordLabel,
      fields: [],
    };
    row.fields.push(field);
    rows.set(field.recordKey, row);
  }
  const candidates = [...rows.values()]
    .filter(
      (row) =>
        !savedKeys.has(row.key) && row.fields.some((field) => field.written),
    )
    .flatMap((row) => {
      const button = rowSaveButton(document, row, fields);
      return button ? [{ row, button }] : [];
    })
    .sort((left, right) =>
      left.button.compareDocumentPosition(right.button) &
      Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
    );
  for (const { row, button } of candidates) {
    const manual = (reason: RowSaveManualReason) =>
      outcome.manual.push({ recordKey: row.key, recordLabel: row.label, reason });
    if (outcome.stopped || signal?.aborted) {
      manual("stopped");
      continue;
    }
    if (!row.fields.every((field) => field.settled)) {
      manual("row-incomplete");
      continue;
    }
    if (!(await becomesEnabled(button, enableWaitMs))) {
      manual("button-disabled");
      continue;
    }
    const written = row.fields
      .filter((field) => field.written)
      .flatMap((field) => field.elements);
    const url = document.URL;
    button.click();
    if (await registered(document, url, written, confirmTimeoutMs)) {
      outcome.saved.push(row.key);
    } else {
      manual("unconfirmed");
      outcome.stopped = true;
    }
  }
  return outcome;
}

/**
 * The one save button that belongs to this row alone: its nearest area with
 * form fields holds this row's fields, no field of another row or item, and
 * not every field of the page.
 */
function rowSaveButton(
  document: Document,
  row: Row,
  fields: readonly RowSaveField[],
): HTMLElement | undefined {
  const own = new Set(row.fields.flatMap((field) => field.elements));
  const others = fields
    .filter((field) => field.recordKey !== row.key)
    .flatMap((field) => field.elements);
  const pageControls = document.querySelectorAll(FILL_CONTROL).length;
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>(
      "button, input[type='button'], [role='button']",
    ),
  ).filter((button) => {
    if (!isRowSaveControl(button)) return false;
    const area = fieldArea(button);
    if (!area) return false;
    const areaControls = area.querySelectorAll(FILL_CONTROL).length;
    return (
      [...own].some((element) => area.contains(element)) &&
      !others.some((element) => area.contains(element)) &&
      areaControls < pageControls
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function isRowSaveControl(button: HTMLElement): boolean {
  const names = [
    button instanceof HTMLInputElement ? button.value : button.textContent,
    button.getAttribute("aria-label"),
    button.getAttribute("title"),
  ]
    .map((name) => name?.replace(/\s+/g, "") ?? "")
    .filter(Boolean);
  if (names.length === 0 || !names.every((name) => ROW_SAVE_LABEL.test(name)))
    return false;
  if (button.matches("a[href], a[href] *")) return false;
  if (button.hasAttribute("formaction") || button.hasAttribute("form"))
    return false;
  // A form's submit button sends the whole form, not one row.
  if (
    button instanceof HTMLButtonElement &&
    button.closest("form") &&
    button.getAttribute("type")?.trim().toLowerCase() !== "button"
  )
    return false;
  return isVisibleWriteElement(button);
}

function fieldArea(button: HTMLElement): Element | undefined {
  for (
    let current = button.parentElement;
    current && current !== button.ownerDocument.body;
    current = current.parentElement
  ) {
    if (current.querySelector(FILL_CONTROL)) return current;
  }
  return undefined;
}

function enabled(button: HTMLElement): boolean {
  return (
    !button.matches(":disabled") &&
    button.getAttribute("aria-disabled")?.trim().toLowerCase() !== "true"
  );
}

async function becomesEnabled(
  button: HTMLElement,
  timeoutMs: number,
): Promise<boolean> {
  for (let waited = 0; !enabled(button); waited += POLL_MS) {
    if (waited >= timeoutMs) return false;
    await wait(POLL_MS);
  }
  return button.isConnected;
}

function cleared(element: Element): boolean {
  if (!element.isConnected) return true;
  if (element instanceof HTMLElement && !isVisibleWriteElement(element))
    return true;
  if (
    element instanceof HTMLInputElement &&
    (element.type === "checkbox" || element.type === "radio")
  )
    return !element.checked;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  )
    return !element.value.trim();
  return !element.textContent?.trim();
}

/**
 * The row is registered when every field the extension wrote left the entry
 * area: removed, hidden, or emptied for the next entry.
 */
async function registered(
  document: Document,
  url: string,
  written: readonly Element[],
  timeoutMs: number,
): Promise<boolean> {
  for (let waited = 0; ; waited += POLL_MS) {
    if (document.URL !== url) return false;
    if (written.length > 0 && written.every(cleared)) return true;
    if (waited >= timeoutMs) return false;
    await wait(POLL_MS);
  }
}
