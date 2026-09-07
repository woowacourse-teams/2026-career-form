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
});
