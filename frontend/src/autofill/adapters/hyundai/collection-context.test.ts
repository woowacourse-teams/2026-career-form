import { afterEach, beforeEach, expect, it } from "vitest";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../../dom/collect";
beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
});
afterEach(() => document.body.replaceChildren());
it("collects the verified readonly address trigger as a dedicated action without making its field writable", () => {
  document.body.innerHTML =
    '<article class="field-form-apply"><input id="inExGb" name="inExGb" type="radio" checked><input id="postCd" name="postCd" readonly data-modal="modal-address"><input id="addr" name="addr" readonly><input id="addrDtl" name="addrDtl"></article><div class="modal-address"></div>';
  const prep = collectPreparationSnapshot(document);
  const action = prep.request.sections
    .flatMap((s) => s.actionCandidates)
    .find((a) => a.domId === "hyundai:search:address");
  expect(action).toMatchObject({
    element: "input",
    control: "button",
    domName: "postCd",
  });
  expect(prep.registry.lookupAction(action!.candidateId)).toMatchObject({
    status: "blocked",
    reason: "readonly",
  });
  const fields = collectFieldsSnapshot(document);
  const postal = fields.request.sections
    .flatMap((s) => s.fields)
    .find((f) => f.domId === "postCd")!;
  expect(fields.registry.lookupField(postal.candidateId)).toMatchObject({
    status: "blocked",
    reason: "readonly",
  });
  document.querySelector<HTMLInputElement>("#addr")!.readOnly = false;
  expect(
    collectPreparationSnapshot(document)
      .request.sections.flatMap((s) => s.actionCandidates)
      .some((a) => a.domId === "hyundai:search:address"),
  ).toBe(false);
});
it("groups mixed education rows by verified selected kind with independent profile indexes", () => {
  document.body.innerHTML =
    '<article id="academic" class="field-form-apply">' +
    ["3", "5", "6", "5"]
      .map(
        (code, i) =>
          `<div class="field-content"><div class="field-group"><div class="field"><div class="select-wrap"><input type="hidden" name="schGb" class="js-field" value="${code}"><input type="button" id="schGb_${i + 1}" value="${({ 3: "고등학교", 5: "학사", 6: "석사" } as Record<string, string>)[code]}"><div class="select-option education-option"><button type="button" data-code="${code}" class="selected">${({ 3: "고등학교", 5: "학사", 6: "석사" } as Record<string, string>)[code]}</button></div></div></div><input id="whiStDt_${i + 1}" name="whiStDt"></div></div>`,
      )
      .join("") +
    "</article>";
  const snapshot = collectFieldsSnapshot(document);
  const items = snapshot.request.sections.flatMap((s) => s.items ?? []);
  expect(items.map((i) => (i as { itemGroupId?: string }).itemGroupId)).toEqual(
    [
      "educationhighschool",
      "educationuniversity",
      "educationgraduateschool",
      "educationuniversity",
    ],
  );
  const fields = items.map((i) =>
    i.fields.find((f) => f.domName === "whiStDt")!,
  );
  expect(
    fields.map((f) => {
      const h = snapshot.registry.lookupField(f.candidateId);
      return h.status === "ready" ? h.handle.itemIndex : -1;
    }),
  ).toEqual([0, 0, 0, 1]);
  expect(
    fields.map((f) => snapshot.registry.fieldItemCount(f.candidateId)),
  ).toEqual([1, 2, 1, 2]);
  document.querySelector<HTMLInputElement>("input[name=schGb]")!.value = "6";
  expect(snapshot.registry.lookupField(fields[0].candidateId).status).toBe(
    "stale",
  );
});
