export type SteppedPickerLevel = "years" | "months" | "days";

let pickerCount = 0;

/** A stepped picker made of plain buttons, like a decade/year/month dialog. */
export function attachSteppedPicker(
  button: HTMLButtonElement,
  {
    start,
    precision,
    today = { year: 2026, month: 10 },
    hideDelayMs,
  }: {
    start: SteppedPickerLevel;
    precision: "month" | "day";
    today?: { year: number; month: number };
    /** Keeps the closed dialog on screen briefly, like a fade-out. */
    hideDelayMs?: number;
  },
): HTMLElement {
  const document = button.ownerDocument;
  const dialog = document.createElement("div");
  dialog.id = `stepped-picker-${++pickerCount}`;
  dialog.setAttribute("role", "dialog");
  dialog.hidden = true;
  document.body.append(dialog);
  button.setAttribute("aria-expanded", "false");
  let level: SteppedPickerLevel = start;
  let decade = Math.floor(today.year / 10) * 10;
  let year = today.year;
  let month = today.month;
  const close = () => {
    if (hideDelayMs === undefined) dialog.hidden = true;
    else setTimeout(() => (dialog.hidden = true), hideDelayMs);
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-controls");
  };
  const cell = (label: string, onClick: () => void, aria?: string) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (aria) element.setAttribute("aria-label", aria);
    element.addEventListener("click", onClick);
    return element;
  };
  const nav = (delta: number) => {
    const element = cell("", () => {
      if (level === "years") decade += 10 * delta;
      else if (level === "months") year += delta;
      else month += delta;
      render();
    });
    element.innerHTML = "<svg></svg>";
    return element;
  };
  const render = () => {
    const children: HTMLElement[] = [nav(-1)];
    if (level === "months")
      children.push(cell(String(year), () => ((level = "years"), render())));
    if (level === "days")
      children.push(
        cell(`${year}년 ${month}월`, () => ((level = "months"), render())),
      );
    children.push(nav(1));
    if (level === "years")
      for (let y = decade; y < decade + 10; y++)
        children.push(
          cell(String(y), () => {
            year = y;
            level = "months";
            render();
          }),
        );
    if (level === "months")
      for (let m = 1; m <= 12; m++)
        children.push(
          cell(`${m}월`, () => {
            month = m;
            if (precision === "month") {
              button.textContent = `${year}.${String(m).padStart(2, "0")}`;
              close();
            } else {
              level = "days";
              render();
            }
          }),
        );
    if (level === "days") {
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let d = 1; d <= days; d++)
        children.push(
          cell(
            String(d),
            () => {
              button.textContent = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              close();
            },
            `${d} ${month}월 ${year}`,
          ),
        );
    }
    dialog.replaceChildren(...children);
  };
  button.addEventListener("click", () => {
    level = start;
    dialog.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", dialog.id);
    render();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  return dialog;
}
