import { afterEach, expect, it } from "vitest";
import {
  collectFieldsSnapshot as collectNativeFieldsSnapshot,
  collectFieldsSnapshotWithDropdowns as collectFieldsSnapshot,
} from "./collect";
import { mountButtonDropdowns } from "./button-dropdown.fixture";

afterEach(() => {
  document.body.onmousedown = null;
  document.body.replaceChildren();
});

it("collects four owned DIV dropdowns with analysis options and closes the probe menus", async () => {
  const { menus } = mountButtonDropdowns();

  const snapshot = await collectFieldsSnapshot(document);

  const fields = snapshot.request.sections.flatMap((section) => section.fields);
  const dropdowns = fields.filter((field) => field.control === "select");
  expect(dropdowns).toHaveLength(4);
  expect(
    dropdowns.map((field) => field.options?.map((o) => o.displayName)),
  ).toEqual(Array.from({ length: 4 }, () => ["해당", "비해당"]));
  expect(menus.every((menu) => menu.hidden)).toBe(true);
  expect(document.querySelector("input")?.value).toBe("기존 합성값");
  expect(JSON.stringify(snapshot.request)).not.toContain("기존 합성값");
});

it.each(["ambiguous", "detached", "search"] as const)(
  "does not collect a dropdown whose menu is %s",
  async (mode) => {
    const { menus } = mountButtonDropdowns({ count: 2, mode });

    const snapshot = await collectFieldsSnapshot(document);

    expect(
      snapshot.request.sections
        .flatMap((section) => section.fields)
        .filter((field) => field.control === "select"),
    ).toHaveLength(0);
    expect(menus.every((menu) => menu.hidden)).toBe(true);
  },
);

it("preserves an already open unowned menu without clicking another trigger", async () => {
  const { menus } = mountButtonDropdowns();
  const first = menus[0];
  if (!first) throw new Error("Missing fixture menu");
  first.hidden = false;

  const snapshot = await collectFieldsSnapshot(document);

  expect(
    snapshot.request.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.control === "select"),
  ).toHaveLength(0);
  expect(first.hidden).toBe(false);
});

it.each(["", "ant-dropdown-trigger"])(
  "restores a field changed by a rejected collection probe with class %s",
  async (className) => {
    const { triggers, menus } = mountButtonDropdowns({ count: 1 });
    const input = document.querySelector("input");
    if (!input || !triggers[0]) throw new Error("Missing fixture input");
    input.className = className;
    triggers[0].addEventListener(
      "click",
      () => {
        input.value = "SIDE_EFFECT";
      },
      { once: true },
    );

    const snapshot = await collectFieldsSnapshot(document);

    expect(
      snapshot.request.sections
        .flatMap((section) => section.fields)
        .filter((field) => field.control === "select"),
    ).toHaveLength(0);
    expect(input.value).toBe("기존 합성값");
    expect(menus.every((menu) => menu.hidden)).toBe(true);
  },
);

it("closes the probed menu even when opening it synchronously aborts collection", async () => {
  const { triggers, menus } = mountButtonDropdowns({ count: 1 });
  const controller = new AbortController();
  triggers[0]?.addEventListener("click", () => controller.abort(), {
    once: true,
  });

  const snapshot = await collectFieldsSnapshot(document, controller.signal);

  expect(
    snapshot.request.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.control === "select"),
  ).toHaveLength(0);
  expect(menus.every((menu) => menu.hidden)).toBe(true);
});

it("rejects and closes all menus introduced by one staggered opening action", async () => {
  const { triggers, menus } = mountButtonDropdowns({ count: 2 });
  const first = menus[0];
  const second = menus[1];
  if (!first || !second) throw new Error("Missing fixture menus");
  triggers[0]?.addEventListener("click", () => {
    if (!first.hidden)
      queueMicrotask(() => {
        second.hidden = false;
      });
  });

  const snapshot = await collectFieldsSnapshot(document);

  expect(
    snapshot.request.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.control === "select"),
  ).toHaveLength(0);
  expect(menus.every((menu) => menu.hidden)).toBe(true);
});

it("does not probe a navigation dropdown in a role-less DIV header", async () => {
  mountButtonDropdowns();
  const header = document.createElement("div");
  header.id = "navigation-container";
  header.innerHTML =
    '<a href="/company">회사 소개</a><div class="ant-dropdown-trigger">KR</div>';
  document.body.prepend(header);
  let clicks = 0;
  header
    .querySelector(".ant-dropdown-trigger")
    ?.addEventListener("click", () => {
      clicks += 1;
    });

  const snapshot = await collectFieldsSnapshot(document);

  expect(clicks).toBe(0);
  expect(
    snapshot.request.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.control === "select"),
  ).toHaveLength(4);
});

it("restores native checkbox activation caused by a programmatic probe, not by a user", async () => {
  const { triggers } = mountButtonDropdowns({ count: 1 });
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", "기존 체크박스");
  document.getElementById("application-root")?.append(checkbox);
  triggers[0]?.addEventListener("click", () => checkbox.click(), {
    once: true,
  });

  const snapshot = await collectFieldsSnapshot(document);

  expect(
    snapshot.request.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.control === "select"),
  ).toHaveLength(0);
  expect(checkbox.checked).toBe(false);
});

it("preserves an explicit combobox collector without probing or duplicating it", async () => {
  const { triggers, menus } = mountButtonDropdowns({ count: 1 });
  const old = triggers[0];
  const trigger = document.createElement("input");
  trigger.className = "ant-dropdown-trigger";
  trigger.setAttribute("aria-label", "기존 콤보박스");
  const menu = menus[0];
  if (!old || !menu) throw new Error("Missing fixture combobox");
  old.replaceWith(trigger);
  trigger.setAttribute("role", "combobox");
  menu.id = "existing-combobox-options";
  menu.setAttribute("role", "listbox");
  trigger.setAttribute("aria-controls", menu.id);
  menu
    .querySelectorAll("li")
    .forEach((option) => option.setAttribute("role", "option"));
  let clicks = 0;
  trigger.addEventListener("click", () => {
    clicks += 1;
  });
  const native = collectNativeFieldsSnapshot(document);

  const snapshot = await collectFieldsSnapshot(document);

  expect(clicks).toBe(0);
  expect(snapshot.request.sections).toEqual(native.request.sections);
  expect(
    snapshot.request.sections
      .flatMap((section) => section.fields)
      .find((field) => field.options)?.options,
  ).toHaveLength(2);
  expect(menu.hidden).toBe(true);
});
