import { beforeEach, describe, expect, it } from "vitest";

import { collectionAdapterForHost } from "./collection";

describe("collection adapter selection", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("isolates Hyundai input-button and repeated-row behavior to its exact host", () => {
    document.body.innerHTML = `
      <article id="career" class="field-form-apply">
        <div class="field-content"><input /></div>
        <div class="field-content"><input hidden /></div>
        <button class="btn-group-add">추가</button>
      </article>
    `;
    const article = document.querySelector("article")!;
    const action = document.querySelector("button")!;
    const hyundai = collectionAdapterForHost("talent.hyundai.com");
    const generic = collectionAdapterForHost("careers.example.test");

    expect(hyundai.sectionSelectors).toEqual(["article.field-form-apply"]);
    expect(hyundai.collectsInputButtonFields).toBe(true);
    expect(hyundai.actionDomId(action)).toBe("hyundai:add:career");
    expect(hyundai.repeatableItemCandidates(article)).toHaveLength(2);
    expect(hyundai.requiresVisibleControl("fields", "adapter")).toBe(true);
    expect(hyundai.requiresVisibleControl("preparation", "adapter")).toBe(true);
    expect(hyundai.requiresVisibleControl("fields", "generic")).toBe(false);

    expect(generic.collectsInputButtonFields).toBe(false);
    expect(generic.sectionSelectors).toEqual([]);
    expect(generic.actionDomId(action)).toBeUndefined();
    expect(generic.repeatableItemCandidates(article)).toBeUndefined();
    expect(generic.requiresVisibleControl("fields", "generic")).toBe(false);
  });

  it("isolates SK hidden-row filtering to field collection", () => {
    const sk = collectionAdapterForHost("www.skcareers.com");
    const generic = collectionAdapterForHost("careers.example.test");

    expect(sk.requiresVisibleControl("fields", "generic")).toBe(true);
    expect(sk.requiresVisibleControl("preparation", "generic")).toBe(false);
    expect(generic.requiresVisibleControl("fields", "generic")).toBe(false);
  });

  it("derives Hyundai project and publication actions from verified row fields", () => {
    document.body.innerHTML = `
      <article class="field-form-apply">
        <div class="field-content">
          <input id="prjNm_1" name="prjNm" type="text" />
          <input id="prjStDt_1" name="prjStDt" type="text" />
          <input id="prjEndDt_1" name="prjEndDt" type="text" />
          <input id="prjRoleNm_1" name="prjRoleNm" type="text" />
          <textarea id="prjRoleDtl_1" name="prjRoleDtl"></textarea>
        </div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
      <article class="field-form-apply">
        <div class="field-content">
          <input id="typeGb_1" type="button" />
          <input id="title_1" name="title" />
          <textarea id="cont_1" name="cont"></textarea>
        </div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
      <article class="field-form-apply">
        <div class="field-content"><input id="adrCd_1" name="adrCd" /></div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
    `;
    const actions = document.querySelectorAll<HTMLButtonElement>("button");
    const hyundai = collectionAdapterForHost("talent.hyundai.com");

    expect(hyundai.actionDomId(actions[0]!)).toBe("hyundai:add:project");
    expect(hyundai.actionDomId(actions[1]!)).toBe("hyundai:add:publication");
    expect(hyundai.actionDomId(actions[2]!)).toBeUndefined();
  });

  it("rejects partial, split, ambiguous, and nested Hyundai action structures", () => {
    document.body.innerHTML = `
      <article class="field-form-apply">
        <div class="field-content"><input id="prjNm_1" name="prjNm" type="text" /></div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
      <article class="field-form-apply">
        <div class="field-content"><input id="typeGb_1" type="button" /></div>
        <div class="field-content">
          <input id="title_1" name="title" type="text" />
          <textarea id="cont_1" name="cont"></textarea>
        </div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
      <article class="field-form-apply">
        <div class="field-content">
          <input id="prjNm_1" name="prjNm" type="text" />
          <input id="prjStDt_1" name="prjStDt" type="text" />
          <input id="prjEndDt_1" name="prjEndDt" type="text" />
          <input id="prjRoleNm_1" name="prjRoleNm" type="text" />
          <textarea id="prjRoleDtl_1" name="prjRoleDtl"></textarea>
          <input id="typeGb_1" type="button" />
          <input id="title_1" name="title" type="text" />
          <textarea id="cont_1" name="cont"></textarea>
        </div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
      <article class="field-form-apply">
        <div class="field-content">
          <article class="field-form-apply">
            <div class="field-content">
              <input id="prjNm_1" name="prjNm" type="text" />
              <input id="prjStDt_1" name="prjStDt" type="text" />
              <input id="prjEndDt_1" name="prjEndDt" type="text" />
              <input id="prjRoleNm_1" name="prjRoleNm" type="text" />
              <textarea id="prjRoleDtl_1" name="prjRoleDtl"></textarea>
            </div>
          </article>
        </div>
        <button class="btn-group-add" type="button">추가</button>
      </article>
    `;
    const actions = document.querySelectorAll<HTMLButtonElement>("button");
    const hyundai = collectionAdapterForHost("talent.hyundai.com");

    expect(hyundai.actionDomId(actions[0]!)).toBeUndefined();
    expect(hyundai.actionDomId(actions[1]!)).toBeUndefined();
    expect(hyundai.actionDomId(actions[2]!)).toBeUndefined();
    expect(hyundai.actionDomId(actions[3]!)).toBeUndefined();
  });
});
