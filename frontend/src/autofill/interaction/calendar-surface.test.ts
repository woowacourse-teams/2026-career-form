import { afterEach, describe, expect, it } from "vitest";
import { calendarSurfaceFor } from "./calendar-surface";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("calendar surface ownership", () => {
  it("proves ownership in a single field container", () => {
    document.body.innerHTML = `<section><input readonly type="text"><button type="button">월 선택</button><div role="dialog"><button>2026</button>${Array.from({ length: 12 }, (_, index) => `<button>${index + 1}월</button>`).join("")}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    expect(calendarSurfaceFor(target)?.opener.textContent).toBe("월 선택");
  });

  it("proves explicit ARIA ownership and rejects an unrelated calendar", () => {
    document.body.innerHTML = `<input id="date" readonly type="text"><button aria-controls="popup" aria-labelledby="date" type="button">월 선택</button><div id="popup" role="dialog">${Array.from({ length: 12 }, (_, index) => `<button>${index + 1}월</button>`).join("")}<button>2026</button></div><div role="dialog">${Array.from({ length: 12 }, (_, index) => `<button>${index + 1}월</button>`).join("")}<button>2026</button></div>`;
    const target = document.querySelector<HTMLInputElement>("#date")!;
    expect(calendarSurfaceFor(target)?.popup.id).toBe("popup");
    target.removeAttribute("id");
    expect(calendarSurfaceFor(target)).toBeUndefined();
  });

  it("proves a hidden ARIA-linked popup owns one complete month set without opening it", () => {
    document.body.innerHTML = `<section><input id="start-month" readonly type="text"><button type="button" aria-labelledby="start-month" aria-controls="month-picker">월 선택</button><div id="month-picker" role="dialog" hidden><button>2026</button>${Array.from({ length: 12 }, (_, index) => `<button>${index + 1}월</button>`).join("")}</div></section>`;
    const opener = document.querySelector<HTMLButtonElement>("button")!;
    let openings = 0;
    opener.addEventListener("click", () => openings++);

    const surface = calendarSurfaceFor(document.querySelector("input")!);

    expect(surface?.popup.id).toBe("month-picker");
    expect(
      surface &&
        calendarSurfaceFor(surface.target)?.popup.querySelectorAll("button")
          .length,
    ).toBe(13);
    expect(openings).toBe(0);
  });

  it("requires a complete unique month set", () => {
    document.body.innerHTML = `<section><input readonly type="text"><button type="button">월 선택</button><div role="dialog"><button>2026</button><button>1월</button></div></section>`;
    expect(
      calendarSurfaceFor(document.querySelector("input")!),
    ).toBeUndefined();
  });

  it("does not trust data-calendar without a calendar role or explicit ARIA link", () => {
    document.body.innerHTML = `<section><input readonly type="text"><button type="button">월 선택</button><div data-calendar><button>2026</button>${Array.from({ length: 12 }, (_, index) => `<button>${index + 1}월</button>`).join("")}</div></section>`;
    expect(
      calendarSurfaceFor(document.querySelector("input")!),
    ).toBeUndefined();
  });

  it("does not climb from an ambiguous field container to a broad page ancestor", () => {
    document.body.innerHTML = `<main><section><input readonly type="text"><input readonly type="text"><button type="button">월 선택</button></section><div role="dialog">${Array.from({ length: 12 }, (_, index) => `<button>${index + 1}월</button>`).join("")}<button>2026</button></div></main>`;
    expect(
      calendarSurfaceFor(document.querySelector("input")!),
    ).toBeUndefined();
  });
});
