import { afterEach, describe, expect, it } from "vitest";
import { collectFieldsSnapshot } from "./collect";

afterEach(() => document.body.replaceChildren());

describe("generic dialog date buttons", () => {
  it("collects a dialog button with a date cue as a custom button field", () => {
    document.body.innerHTML = `<form><section><h3>경력</h3>
      <label>회사명 <input name="company"></label>
      <div><span>재직 기간</span>
        <button type="button" aria-haspopup="dialog" aria-expanded="false">시작일</button></div>
      <button type="button" aria-haspopup="dialog">주소 검색</button>
    </section></form>`;

    const { request, registry } = collectFieldsSnapshot(document);
    const fields = request.sections.flatMap((section) => section.fields);
    const date = fields.find((field) => field.control === "button");

    expect(fields).toHaveLength(2);
    expect(date).toMatchObject({
      element: "custom",
      control: "button",
      visibility: "visible",
      displayName: "시작일",
    });
    const lookup = registry.lookupField(date!.candidateId);
    expect(lookup.status).toBe("ready");
    expect(lookup.status === "ready" && lookup.handle.customElements).toEqual([
      document.querySelector("button[aria-haspopup]"),
    ]);
  });

  it("never sends a shown date as the button's name", () => {
    document.body.innerHTML = `<form><section><h3>경력</h3>
      <button type="button" aria-haspopup="dialog">2020-01-02</button></section></form>`;

    const fields = collectFieldsSnapshot(document).request.sections.flatMap(
      (section) => section.fields,
    );

    expect(fields).toHaveLength(1);
    expect(JSON.stringify(fields)).not.toContain("2020");
  });
});
