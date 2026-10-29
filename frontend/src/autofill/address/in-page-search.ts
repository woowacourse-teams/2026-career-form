import { addressWithoutRoadReference, normalizeAddress, type AddressIdentity } from "./match";

/**
 * A site's own address search: a same-origin dialog with one query box and a
 * result list. Only ARIA roles, button text and the stored postcode are read.
 */

const POLL_MS = 50;
const RESULT_WAIT_MS = 5_000;
const CLOSE_WAIT_MS = 2_000;

function shown(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true")
      return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden"))
      return false;
  }
  return element.isConnected;
}

function text(element: Element): string {
  return normalizeAddress(element.textContent ?? "");
}

export function visibleDialogs(document: Document): Element[] {
  return Array.from(
    document.querySelectorAll("[role='dialog'], [aria-modal='true'], dialog[open]"),
  ).filter(shown);
}

function queryBox(dialog: Element): HTMLInputElement | undefined {
  const boxes = Array.from(dialog.querySelectorAll("input")).filter(
    (input) =>
      ["text", "search", ""].includes(input.type) &&
      !input.readOnly &&
      !input.disabled &&
      shown(input),
  );
  return boxes.length === 1 ? boxes[0] : undefined;
}

export function openedSearchDialog(
  document: Document,
  before: readonly Element[],
): Element | undefined {
  const opened = visibleDialogs(document).filter(
    (dialog) => !before.includes(dialog) && queryBox(dialog),
  );
  return opened.length === 1 ? opened[0] : undefined;
}

async function until<T>(
  read: () => T | undefined,
  ms: number,
  signal: AbortSignal,
): Promise<T | undefined> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value !== undefined || signal.aborted || Date.now() >= deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function compact(value: string): string {
  return normalizeAddress(value).replace(/\s+/g, "");
}

function close(dialog: Element): void {
  if (!dialog.isConnected || !shown(dialog)) return;
  dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

/**
 * Searches the road address and selects the single result row that carries
 * the stored postcode and the same road address. A dialog that then asks for
 * the detail line gets the stored detail and its one confirm button. Returns
 * the address the site should show, or undefined after closing the dialog.
 */
export async function selectInPageAddress(
  dialog: Element,
  expected: AddressIdentity & { detail?: string },
  maySelect: () => Promise<boolean>,
  signal: AbortSignal,
): Promise<AddressIdentity | undefined> {
  const fail = () => {
    close(dialog);
    return undefined;
  };
  const box = queryBox(dialog);
  if (!box) return fail();
  const road = addressWithoutRoadReference(expected.address);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
    box,
    road,
  );
  box.dispatchEvent(new Event("input", { bubbles: true }));
  box.dispatchEvent(new Event("change", { bubbles: true }));
  const submits = Array.from(dialog.querySelectorAll("button")).filter(
    (button) => /^(검색|조회|찾기|search)$/i.test(text(button)) && shown(button),
  );
  if (submits.length === 1) submits[0]!.click();
  else if (submits.length === 0)
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  else return fail();
  const postal = new RegExp(`(?<!\\d)${expected.postalCode}(?!\\d)`);
  const rowText = (row: Element) => {
    const cells = row.querySelectorAll("td, [role='cell'], [role='gridcell']");
    return cells.length > 0
      ? normalizeAddress(Array.from(cells, text).join(" "))
      : text(row);
  };
  const rows = () =>
    Array.from(
      dialog.querySelectorAll("tbody tr, [role='row'], [role='option'], li"),
    ).filter((row) => shown(row) && !row.querySelector("th"));
  const match = await until(
    () => {
      const found = rows().filter(
        (row) =>
          postal.test(rowText(row)) &&
          compact(rowText(row)).includes(compact(road)),
      );
      return found.length > 0 ? found : undefined;
    },
    RESULT_WAIT_MS,
    signal,
  );
  if (!match || match.length !== 1 || !(await maySelect()))
    return fail();
  const row = match[0]!;
  // The road line is the innermost element that holds the road address; a row
  // may also list the lot-number address.
  const roadLine = Array.from(row.querySelectorAll("*")).find(
    (element) =>
      compact(text(element)).includes(compact(road)) &&
      !Array.from(element.children).some((child) =>
        compact(text(child)).includes(compact(road)),
      ),
  );
  const roadText = roadLine
    ? text(roadLine).replace(postal, " ").trim()
    : normalizeAddress(rowText(row).replace(postal, " "));
  const inner = row.querySelectorAll("button, a");
  (inner.length === 1 ? (inner[0] as HTMLElement) : (row as HTMLElement)).click();
  const gone = () => !dialog.isConnected || !shown(dialog);
  const detailBox = await until(
    () => {
      if (gone()) return null;
      const boxes = Array.from(dialog.querySelectorAll("input")).filter(
        (input) =>
          input !== box &&
          ["text", ""].includes(input.type) &&
          !input.readOnly &&
          !input.disabled &&
          shown(input),
      );
      return boxes.length === 1 ? boxes[0] : undefined;
    },
    CLOSE_WAIT_MS,
    signal,
  );
  if (detailBox === undefined) return fail();
  let detail = "";
  if (detailBox) {
    const confirms = Array.from(dialog.querySelectorAll("button")).filter(
      (button) =>
        shown(button) &&
        /(입력|확인|선택|적용|완료)$/.test(text(button)) &&
        !/닫기|취소|검색/.test(text(button)),
    );
    if (confirms.length !== 1 || !(await maySelect())) return fail();
    detail = normalizeAddress(expected.detail ?? "");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      detailBox,
      detail,
    );
    detailBox.dispatchEvent(new Event("input", { bubbles: true }));
    detailBox.dispatchEvent(new Event("change", { bubbles: true }));
    confirms[0]!.click();
    if (!(await until(() => (gone() ? true : undefined), CLOSE_WAIT_MS, signal)))
      return fail();
  }
  return {
    postalCode: expected.postalCode,
    address: detail ? `${roadText} ${detail}` : roadText,
  };
}
