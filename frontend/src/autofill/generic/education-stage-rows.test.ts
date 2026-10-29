import { afterEach, describe, expect, it } from "vitest";
import { stageRowsAround } from "./education-stage-rows";

const KIND = `<select><option value="">학력구분</option><option value="H">고등학교</option><option value="U">대학(4년제 이상)</option></select>`;
const fields = `<select><option value="">소재지</option><option value="1">서울</option></select><input placeholder="학교명">`;
const row = (head: string, extra = "") =>
  `<div class="row"><div class="head">${head}</div><div class="body">${fields}${extra}</div></div>`;

afterEach(() => document.body.replaceChildren());

function mount(html: string) {
  document.body.innerHTML = `<section><h3>학력사항</h3><div id="area">${html}</div></section>`;
  return {
    area: document.querySelector("#area")!,
    select: document.querySelector<HTMLSelectElement>("#area select")!,
    rows: [...document.querySelectorAll("#area > .row")],
  };
}

describe("stageRowsAround", () => {
  it("splits a kind-select row from a sibling row that shows a fixed stage of the same list", () => {
    const { area, select, rows } = mount(
      row(KIND, '<input placeholder="전공명">') + row("<span>고등학교</span>"),
    );
    expect(stageRowsAround(select, area)).toEqual({
      selectRow: rows[0],
      fixedRows: [{ row: rows[1], label: "고등학교" }],
    });
  });

  it("ignores a sibling whose fixed text is not one of the select's stages", () => {
    const { area, select } = mount(row(KIND) + row("<span>비고</span>"));
    expect(stageRowsAround(select, area)).toBeUndefined();
  });

  it("ignores a sibling row that has its own kind select", () => {
    const { area, select } = mount(row(KIND) + row(KIND));
    expect(stageRowsAround(select, area)).toBeUndefined();
  });

  it("ignores a fixed stage word inside a control's options", () => {
    const { area, select } = mount(
      row(KIND) +
        row("<select><option>고등학교</option><option>대학</option></select>"),
    );
    expect(stageRowsAround(select, area)).toBeUndefined();
  });
});
