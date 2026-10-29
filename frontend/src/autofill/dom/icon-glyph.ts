type Stroke = "horizontal" | "vertical" | "other";

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function pathStrokes(d: string): Stroke[] {
  const commands = d.trim().match(/[a-z][^a-z]*/gi) ?? [];
  const strokes: Stroke[] = [];
  let current: Stroke | undefined;
  for (const command of commands) {
    const letter = command[0]!.toUpperCase();
    const values = command.slice(1).match(NUMBER) ?? [];
    if (letter === "M" && values.length === 2) {
      if (current) strokes.push(current);
      current = undefined;
      continue;
    }
    const stroke: Stroke =
      letter === "H" && values.length === 1
        ? "horizontal"
        : letter === "V" && values.length === 1
          ? "vertical"
          : "other";
    current = current && current !== stroke ? "other" : stroke;
  }
  if (current) strokes.push(current);
  return strokes;
}

function lineStroke(line: SVGLineElement | Element): Stroke {
  const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((name) =>
    Number(line.getAttribute(name)),
  );
  if ([x1, y1, x2, y2].some((value) => !Number.isFinite(value))) return "other";
  if (y1 === y2 && x1 !== x2) return "horizontal";
  if (x1 === x2 && y1 !== y2) return "vertical";
  return "other";
}

/**
 * The plus or minus a text-less control draws with straight strokes only:
 * one horizontal stroke is "-", one horizontal and one vertical stroke is
 * "+". A box or circle behind the strokes is ignored; any other drawing or
 * any text gives no glyph.
 */
export function iconGlyphLabel(element: Element): "+" | "-" | undefined {
  if ((element.textContent ?? "").trim()) return undefined;
  const svgs = element.querySelectorAll("svg");
  if (svgs.length !== 1) return undefined;
  const shapes = Array.from(svgs[0]!.querySelectorAll("*")).filter(
    (node) => !["g", "title", "desc", "defs"].includes(node.tagName.toLowerCase()),
  );
  const strokes: Stroke[] = [];
  for (const shape of shapes) {
    const tag = shape.tagName.toLowerCase();
    if (tag === "path") strokes.push(...pathStrokes(shape.getAttribute("d") ?? ""));
    else if (tag === "line") strokes.push(lineStroke(shape));
    // A box or circle behind the strokes is the button's frame, not a stroke.
    else if (!["rect", "circle", "ellipse"].includes(tag)) return undefined;
  }
  const horizontal = strokes.filter((stroke) => stroke === "horizontal").length;
  const vertical = strokes.filter((stroke) => stroke === "vertical").length;
  if (horizontal + vertical !== strokes.length) return undefined;
  if (horizontal === 1 && vertical === 1) return "+";
  if (horizontal === 1 && vertical === 0) return "-";
  return undefined;
}
