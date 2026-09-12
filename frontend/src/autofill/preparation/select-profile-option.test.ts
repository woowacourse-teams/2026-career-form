import { afterEach, expect, it, vi } from "vitest";
import { selectNativeProfileOption } from "./select-profile-option";

afterEach(() => document.body.replaceChildren());

function setup(
  options = '<option value="yes">군필</option><option value="no">미필</option>',
) {
  document.body.innerHTML = `<section><select name="status"><option value="">선택하세요</option>${options}</select></section>`;
  const select = document.querySelector("select")!;
  const change = vi.fn();
  select.addEventListener("change", change);
  return { select, change };
}

it("selects one exact live option and is idempotent without an adapter hint", () => {
  const { select, change } = setup();
  expect(selectNativeProfileOption(select, "군필")).toBe("selected");
  expect(select.value).toBe("yes");
  expect(change).toHaveBeenCalledTimes(1);
  expect(selectNativeProfileOption(select, "군필")).toBe("selected");
  expect(change).toHaveBeenCalledTimes(1);
});

it.each([
  '<option value="yes">군필</option><option value="other">군필</option>',
  '<option value="yes">군필</option><option value="yes">미필</option>',
  '<option value="yes" disabled>군필</option>',
  '<optgroup disabled><option value="yes">군필</option></optgroup>',
])("rejects ambiguous or disabled options without mutations: %s", (options) => {
  const { select, change } = setup(options);
  expect(selectNativeProfileOption(select, "군필")).not.toBe("selected");
  expect(select.value).toBe("");
  expect(change).not.toHaveBeenCalled();
});

it.each(["disabled", "hidden", "inert", "fieldset", "css-hidden", "detached"])(
  "rejects a stale %s control without events",
  (state) => {
    const { select, change } = setup();
    if (state === "disabled") select.disabled = true;
    if (state === "hidden") select.parentElement!.hidden = true;
    if (state === "inert") select.parentElement!.setAttribute("inert", "");
    if (state === "css-hidden") select.parentElement!.style.display = "none";
    if (state === "fieldset") {
      const fieldset = document.createElement("fieldset");
      fieldset.disabled = true;
      select.replaceWith(fieldset);
      fieldset.append(select);
    }
    if (state === "detached") select.remove();
    expect(selectNativeProfileOption(select, "군필")).not.toBe("selected");
    expect(select.value).toBe("");
    expect(change).not.toHaveBeenCalled();
  },
);

it("preserves a nonempty opposite selection even with adapter permission", () => {
  const { select, change } = setup();
  select.value = "no";
  expect(selectNativeProfileOption(select, "군필", true)).not.toBe("selected");
  expect(select.value).toBe("no");
  expect(change).not.toHaveBeenCalled();
});

it("does not report success if the page reverts the code during change", () => {
  const { select, change } = setup();
  select.addEventListener("change", () => {
    select.value = "";
  });
  expect(selectNativeProfileOption(select, "군필")).toBe("action-not-ready");
  expect(select.value).toBe("");
  expect(change).toHaveBeenCalledTimes(1);
});

it("does not report success if a change handler swaps the selected option", () => {
  const { select } = setup();
  select.addEventListener("change", () => {
    select.innerHTML = '<option value="yes">미필</option>';
  });
  expect(selectNativeProfileOption(select, "군필")).toBe("action-not-ready");
});
