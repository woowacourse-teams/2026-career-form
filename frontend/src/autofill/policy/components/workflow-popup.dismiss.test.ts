import { usePolicyFixture } from "../../../test/fixtures/execution-policy";
usePolicyFixture("greeting");
import { afterEach, describe, expect, it } from "vitest";
import { dismissLeftoverComponentPopups } from "./workflow-popup";

afterEach(() => document.body.replaceChildren());

// An open Component forms popover marks the rest of the page aria-hidden; a
// driver that leaves one open makes the next snapshot see no visible fields.
function openCombobox(name: string) {
  document.body.innerHTML = `
    <div id="app" aria-hidden="true"><input name="basicInformation.name"></div>
    <div data-scope="combobox" data-part="root">
      <input name="${name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="majors" aria-expanded="true">
      <div data-scope="combobox" data-part="positioner"><div id="majors" role="listbox" data-state="open"></div></div>
    </div>`;
  const input = document.querySelector<HTMLInputElement>(
    "input[role='combobox']",
  )!;
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    input.setAttribute("aria-expanded", "false");
    document.getElementById("app")!.removeAttribute("aria-hidden");
  });
  input.focus();
  return input;
}

describe("dismissLeftoverComponentPopups", () => {
  it("escapes an open search combobox, blurs it and lets the page show again", () => {
    const input = openCombobox(
      "educationalBackground.graduateSchools.0.majors.2",
    );
    expect(document.activeElement).toBe(input);
    expect(dismissLeftoverComponentPopups(document)).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("app")!.hasAttribute("aria-hidden")).toBe(
      false,
    );
    expect(document.activeElement).not.toBe(input);
    expect(input.value).toBe("");
  });

  it("escapes an open calendar trigger and an expanded choice button", () => {
    document.body.innerHTML = `
      <button type="button" name="basicInformation.birthdate" data-scope="date-picker" data-part="trigger" aria-controls="calendar" data-state="open">날짜</button>
      <button type="button" name="x" aria-controls="menu" aria-expanded="true">선택</button>`;
    const escaped: string[] = [];
    document.querySelectorAll("button").forEach((button) =>
      button.addEventListener("keydown", (event) => {
        if (event.key === "Escape") escaped.push(button.getAttribute("name")!);
      }),
    );
    expect(dismissLeftoverComponentPopups(document)).toBe(true);
    expect(escaped.sort()).toEqual(["basicInformation.birthdate", "x"]);
  });

  it("does nothing when no widget is open", () => {
    document.body.innerHTML = `
      <input name="educationalBackground.universities.0.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="s" aria-expanded="false">
      <button type="button" data-scope="date-picker" data-part="trigger" aria-controls="c" data-state="closed">날짜</button>`;
    expect(dismissLeftoverComponentPopups(document)).toBe(false);
  });
});
