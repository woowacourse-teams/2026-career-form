/** Measure label text, not its wrapper (which can also contain the input). */
export function floatingLabelRects(
  document: Document,
  controls: readonly HTMLElement[] = [],
): DOMRect[] {
  const roots = new Set<Element>([
    ...document.querySelectorAll("label, legend, .field-title"),
    ...controls.flatMap((control) =>
      control.parentElement ? [control.parentElement] : [],
    ),
  ]);
  return [...roots].flatMap((label) => {
    if (!label.isConnected || label.closest("[hidden], [inert]")) return [];
    const range = document.createRange();
    if (typeof range.getClientRects !== "function") {
      const rect = label.getBoundingClientRect();
      return !label.querySelector("input, select, textarea") &&
        rect.height <= 48
        ? [rect]
        : [];
    }
    const walker = document.createTreeWalker(label, 4);
    const rects: DOMRect[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (
        !node.textContent?.trim() ||
        node.parentElement?.closest("input, select, textarea, button")
      )
        continue;
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    return rects.length || label.querySelector("input, select, textarea")
      ? rects
      : [label.getBoundingClientRect()];
  });
}

/** Leave a gap only where floating label text intersects the highlight's top edge. */
export function fieldHighlightClip(
  field: DOMRect,
  labels: readonly DOMRect[],
): string {
  const gaps = labels
    .filter(
      (label) =>
        label.width > 0 &&
        label.height > 0 &&
        label.top < field.top + 3 &&
        label.bottom > field.top &&
        label.right > field.left &&
        label.left < field.right,
    )
    .map((label) => ({
      left: Math.max(0, label.left - field.left - 4),
      right: Math.min(field.width, label.right - field.left + 4),
      depth: Math.min(field.height, label.bottom - field.top + 2),
    }))
    .sort((a, b) => a.left - b.left);
  const merged: typeof gaps = [];
  for (const gap of gaps) {
    const previous = merged.at(-1);
    if (previous && gap.left <= previous.right) {
      previous.right = Math.max(previous.right, gap.right);
      previous.depth = Math.max(previous.depth, gap.depth);
    } else merged.push({ ...gap });
  }
  if (!merged.length) return "";
  const points = ["0px 0px"];
  for (const gap of merged)
    points.push(
      `${gap.left}px 0px`,
      `${gap.left}px ${gap.depth}px`,
      `${gap.right}px ${gap.depth}px`,
      `${gap.right}px 0px`,
    );
  points.push(
    `${field.width}px 0px`,
    `${field.width}px ${field.height}px`,
    `0px ${field.height}px`,
  );
  return `polygon(${points.join(", ")})`;
}
