import { beforeEach, describe, expect, it } from "vitest";

import { genericFormGroupFor, genericFormGroups } from "./generic-form-groups";

describe("generic form groups", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("binds one marked multi-field row to the unique nearby add action and title", () => {
    document.body.innerHTML = `
      <div class="panel-random">
        <div class="heading-random"><h3>자격 및 면허</h3></div>
        <div class="body-random">
          <div class="row-random" ismultirow="true">
            <input name="credentialName0" />
            <input name="credentialDate0" />
          </div>
          <div class="controls-random"><button type="button">항목 추가</button></div>
        </div>
      </div>
    `;

    const groups = genericFormGroups(document);
    const input = document.querySelector("input")!;
    const action = document.querySelector("button")!;

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      displayName: "자격 및 면허",
      rows: [document.querySelector("[ismultirow]")],
      action,
    });
    expect(genericFormGroupFor(input)?.action).toBe(action);
    expect(genericFormGroupFor(action)?.rows).toHaveLength(1);
  });

  it("does not accept a marker without a title, multiple fields, or unique add action", () => {
    document.body.innerHTML = `
      <div>
        <div ismultirow="true"><input /></div>
        <button type="button">항목 추가</button>
        <button type="button">행 추가</button>
      </div>
    `;

    expect(genericFormGroups(document)).toEqual([]);
  });

  it("reports only a unique explicit row limit", () => {
    document.body.innerHTML = `
      <section data-max-items="4"><h3>자격</h3>
        <div ismultirow="true"><input /><input /></div><button>추가</button>
      </section>
    `;
    expect(genericFormGroups(document)[0]?.maximumRows).toBe(4);

    document.body.innerHTML = `
      <section data-max-items="4" data-max-rows="5"><h3>자격</h3>
        <div ismultirow="true"><input /><input /></div><button>추가</button>
      </section>
    `;
    expect(genericFormGroups(document)[0]?.maximumRows).toBe("ambiguous");
  });

  it("does not treat an arbitrary multi-field div as a repeat row", () => {
    document.body.innerHTML = `
      <section><h3>자격</h3><div><input /><input /></div><button>추가</button></section>
    `;

    expect(genericFormGroups(document)).toEqual([]);
  });
});
