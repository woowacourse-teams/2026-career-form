const CONTROLS = "input:not([type=hidden]), select, textarea";

const normalized = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, "").trim();

function stageTexts(select: HTMLSelectElement): Set<string> {
  return new Set(
    Array.from(select.options)
      .filter((option) => option.value !== "")
      .map((option) => normalized(option.textContent ?? ""))
      .filter(Boolean),
  );
}

/** Text the row shows itself, outside any control and its options. */
function fixedTexts(row: Element): string[] {
  const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest("select, option, textarea, button"))
      continue;
    const text = normalized(node.textContent ?? "");
    if (text) texts.push(text);
  }
  return texts;
}

function hasKindSelect(row: Element, stages: Set<string>): boolean {
  return Array.from(row.querySelectorAll("select")).some(
    (select) =>
      Array.from(select.options).filter((option) =>
        stages.has(normalized(option.textContent ?? "")),
      ).length >= 2,
  );
}

export interface EducationStageRows {
  /** The row holding the stage select. */
  selectRow: Element;
  /** Sibling rows that show one stage of the same list as fixed text. */
  fixedRows: { row: Element; label: string }[];
}

/**
 * Splits an education area whose rows the page renders unevenly: the row that
 * holds a stage select, and sibling rows that name their stage as fixed text
 * taken from that select's own options (e.g. a permanent high-school row).
 * Undefined when any sibling row has its own stage select or no stage text.
 */
export function stageRowsAround(
  select: HTMLSelectElement,
  container: Element,
): EducationStageRows | undefined {
  const stages = stageTexts(select);
  if (stages.size < 2) return undefined;
  let row: Element = select;
  while (
    row !== container &&
    row.parentElement &&
    container.contains(row.parentElement)
  ) {
    const siblings = Array.from(row.parentElement.children).filter(
      (child) => child !== row && child.querySelector(CONTROLS),
    );
    if (siblings.some((sibling) => hasKindSelect(sibling, stages)))
      return undefined;
    const fixedRows = siblings.flatMap((sibling) => {
      const labels = fixedTexts(sibling).filter((text) => stages.has(text));
      return labels.length === 1 ? [{ row: sibling, label: labels[0]! }] : [];
    });
    if (siblings.length > 0 && fixedRows.length === siblings.length)
      return { selectRow: row, fixedRows };
    row = row.parentElement;
  }
  return undefined;
}
