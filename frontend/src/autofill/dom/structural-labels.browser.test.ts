import { afterEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "./collect";

afterEach(() => document.body.replaceChildren());

it("collects sanitized questions and choices in Chromium without display values", () => {
  document.body.innerHTML = `<style>.not-visible { display:none }</style><form>
    <div><div><p>추천인 연락 방법</p><p contenteditable="false">본인 연락처가 아닙니다.</p>
    <span class="not-visible">HIDDEN_VALUE</span><button>BUTTON_VALUE</button></div>
    <div><input value="PRIVATE_VALUE" placeholder="내용 입력"></div></div>
    <div><p>연락 가능 여부</p><div>
      <div style="cursor:pointer"><input type="radio"><span>가능</span></div>
      <div><input type="radio"><span>불가능</span></div>
    </div></div></form>`;
  const fields = collectFieldsSnapshot(document).request.sections.flatMap((section) => section.fields);
  expect(fields.map((field) => ({
    displayName: field.displayName,
    options: field.options?.map((option) => option.displayName),
    semanticContext: field.semanticContext,
  }))).toEqual([
    {
      displayName: "추천인 연락 방법",
      options: undefined,
      semanticContext: {
        inputType: "text",
        labels: [
          { source: "label", text: "추천인 연락 방법" },
          { source: "description", text: "본인 연락처가 아닙니다." },
          { source: "placeholder", text: "내용 입력" },
        ],
      },
    },
    {
      displayName: "연락 가능 여부",
      options: ["가능", "불가능"],
      semanticContext: { labels: [{ source: "label", text: "연락 가능 여부" }] },
    },
  ]);
  expect(JSON.stringify(fields)).not.toMatch(/PRIVATE_VALUE|HIDDEN_VALUE|BUTTON_VALUE/);
});
