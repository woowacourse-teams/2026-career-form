/*
 * Fabricated ui-datepicker-shaped emulator for tests. It mirrors the public
 * markup contract of the jQuery UI datepicker family (one shared root, a
 * year select, a 0-based month select, and day cells carrying data-year and
 * data-month with a link) and re-renders the root on every view change so
 * tests exercise stale-DOM handling. No employer markup is copied here.
 */

export interface UiDatepickerOptions {
  dateFormat?: "yy-mm-dd" | "yy.mm.dd";
  yearRange: readonly [number, number];
  defaultDate?: string;
  minDate?: string;
  maxDate?: string;
  disabledDates?: readonly string[];
  trigger?: boolean;
  monthLabels?: readonly string[];
  monthValueBase?: 0 | 1;
  hideDelayMs?: number;
  showOtherMonths?: boolean;
  /** Replaces the chosen date before writing, to simulate a faulty widget. */
  mutateSelection?: (date: string) => string;
  /** Clears the input asynchronously after selection. */
  clearAfterMs?: number;
  dayHref?: string;
}

export interface UiDatepickerHarness {
  root: HTMLElement;
  attach(input: HTMLInputElement, options: UiDatepickerOptions): void;
  isOpen(): boolean;
}

const KOREAN_MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseIso(value: string | undefined) {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : undefined;
}

function format(date: string, dateFormat: UiDatepickerOptions["dateFormat"]) {
  return dateFormat === "yy.mm.dd" ? date.replaceAll("-", ".") : date;
}

export function installUiDatepicker(document: Document): UiDatepickerHarness {
  const root = document.createElement("div");
  root.id = "ui-datepicker-div";
  root.className =
    "ui-datepicker ui-widget ui-widget-content ui-helper-clearfix ui-corner-all";
  root.style.display = "none";
  document.body.append(root);

  let active:
    | {
        input: HTMLInputElement;
        options: UiDatepickerOptions;
        year: number;
        month: number;
      }
    | undefined;

  const inRange = (options: UiDatepickerOptions, date: string) =>
    (!options.minDate || date >= options.minDate) &&
    (!options.maxDate || date <= options.maxDate);

  const clamp = () => {
    if (!active) return;
    const { options } = active;
    const min = parseIso(options.minDate);
    const max = parseIso(options.maxDate);
    const key = active.year * 12 + active.month;
    if (min && key < min.year * 12 + min.month) {
      active.year = min.year;
      active.month = min.month;
    }
    if (max && key > max.year * 12 + max.month) {
      active.year = max.year;
      active.month = max.month;
    }
  };

  const render = () => {
    if (!active) return;
    clamp();
    const { options, year, month } = active;
    const labels = options.monthLabels ?? KOREAN_MONTHS;
    const base = options.monthValueBase ?? 0;
    const years: number[] = [];
    for (let y = options.yearRange[0]; y <= options.yearRange[1]; y += 1)
      years.push(y);
    const months = labels
      .map((label, index) => ({ label, index }))
      .filter(({ index }) => {
        const first = iso(year, index + 1, 1);
        const last = iso(year, index + 1, daysIn(year, index + 1));
        return (
          (!options.minDate || last >= options.minDate) &&
          (!options.maxDate || first <= options.maxDate)
        );
      });
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const cells: string[] = [];
    for (let i = 0; i < firstWeekday; i += 1)
      cells.push(
        options.showOtherMonths
          ? `<td class=" ui-datepicker-other-month" data-handler="selectDay" data-event="click" data-month="${month === 1 ? 11 : month - 2}" data-year="${month === 1 ? year - 1 : year}"><a class="ui-state-default ui-priority-secondary" href="#" data-date="${28 + i}">${28 + i}</a></td>`
          : `<td class=" ui-datepicker-other-month ui-datepicker-unselectable ui-state-disabled">&#xa0;</td>`,
      );
    for (let day = 1; day <= daysIn(year, month); day += 1) {
      const date = iso(year, month, day);
      const selectable =
        inRange(options, date) && !options.disabledDates?.includes(date);
      cells.push(
        selectable
          ? `<td class=" " data-handler="selectDay" data-event="click" data-month="${month - 1}" data-year="${year}"><a class="ui-state-default" href="${options.dayHref ?? "#"}" data-date="${day}">${day}</a></td>`
          : `<td class=" ui-datepicker-unselectable ui-state-disabled "><span class="ui-state-default">${day}</span></td>`,
      );
    }
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += 7)
      rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
    root.innerHTML = `
      <div class="ui-datepicker-header ui-widget-header ui-helper-clearfix ui-corner-all">
        <a class="ui-datepicker-prev ui-corner-all" data-handler="prev" data-event="click" title="이전달"><span class="ui-icon">이전달</span></a>
        <a class="ui-datepicker-next ui-corner-all" data-handler="next" data-event="click" title="다음달"><span class="ui-icon">다음달</span></a>
        <div class="ui-datepicker-title">
          <select class="ui-datepicker-year" data-handler="selectYear" data-event="change">${years
            .map(
              (y) =>
                `<option value="${y}"${y === year ? ' selected="selected"' : ""}>${y}</option>`,
            )
            .join("")}</select>년&#xa0;
          <select class="ui-datepicker-month" data-handler="selectMonth" data-event="change">${months
            .map(
              ({ label, index }) =>
                `<option value="${index + base}"${index + 1 === month ? ' selected="selected"' : ""}>${label}</option>`,
            )
            .join("")}</select>
        </div>
      </div>
      <table class="ui-datepicker-calendar"><thead><tr><th>일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
    root
      .querySelector<HTMLSelectElement>(".ui-datepicker-year")!
      .addEventListener("change", (event) => {
        if (!active) return;
        active.year = Number((event.target as HTMLSelectElement).value);
        render();
      });
    root
      .querySelector<HTMLSelectElement>(".ui-datepicker-month")!
      .addEventListener("change", (event) => {
        if (!active) return;
        active.month =
          Number((event.target as HTMLSelectElement).value) - base + 1;
        render();
      });
    root
      .querySelectorAll<HTMLTableCellElement>("td[data-handler='selectDay']")
      .forEach((cell) =>
        cell.addEventListener("click", (event) => {
          event.preventDefault();
          if (!active) return;
          const current = active;
          const date = iso(
            Number(cell.dataset.year),
            Number(cell.dataset.month) + 1,
            Number(cell.querySelector("a")!.textContent),
          );
          const chosen = current.options.mutateSelection?.(date) ?? date;
          current.input.value = format(chosen, current.options.dateFormat);
          current.input.dispatchEvent(new Event("change", { bubbles: true }));
          active = undefined;
          setTimeout(() => {
            root.style.display = "none";
          }, current.options.hideDelayMs ?? 0);
          if (current.options.clearAfterMs !== undefined)
            setTimeout(() => {
              current.input.value = "";
            }, current.options.clearAfterMs);
        }),
      );
  };

  const show = (input: HTMLInputElement, options: UiDatepickerOptions) => {
    const initial = parseIso(
      input.value.replaceAll(".", "-") || options.defaultDate,
    ) ?? { year: options.yearRange[1], month: 1, day: 1 };
    active = { input, options, year: initial.year, month: initial.month };
    render();
    root.style.display = "block";
  };

  return {
    root,
    attach(input, options) {
      input.classList.add("hasDatepicker");
      if (options.trigger) {
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "ui-datepicker-trigger";
        trigger.textContent = "...";
        trigger.addEventListener("click", () => show(input, options));
        input.after(trigger);
      } else {
        input.addEventListener("focus", () => show(input, options));
      }
    },
    isOpen: () => root.style.display !== "none",
  };
}
