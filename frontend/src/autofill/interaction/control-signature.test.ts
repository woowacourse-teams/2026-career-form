import { describe, expect, it } from "vitest";

import { controlSignature } from "./readonly-search";

describe("control signature", () => {
  it("ignores the value attribute a page mirrors while text is typed", () => {
    document.body.innerHTML = '<input id="query" type="text" value="">';
    const query = document.querySelector<HTMLInputElement>("#query")!;
    const before = controlSignature(query);
    query.setAttribute("value", "typed");
    expect(controlSignature(query)).toBe(before);
  });

  it("still tracks the value attribute of a button", () => {
    document.body.innerHTML = '<input id="action" type="button" value="A">';
    const action = document.querySelector<HTMLInputElement>("#action")!;
    const before = controlSignature(action);
    action.setAttribute("value", "B");
    expect(controlSignature(action)).not.toBe(before);
  });
});
