import { describe, expect, it } from "vitest";
import { parseCjMajorResponse } from "./cj-major-response";
import template from "./cj-major-public-template.fixture.html?raw";
const selectionTitle = "선택 시 본창에 값이 들어가며 레이어창 닫힘";
const row = (code: string, label: string) =>
  `<li><a href="javascript:;" title="${selectionTitle}" onclick="setMajorData('${code}', '${label}', '')">${label}</a></li>`;
export const response = (rows: string, query = "합성전공", num = "2_0") =>
  template
    .replace('name="num" value="2_0"', `name="num" value="${num}"`)
    .replace(
      'id="dtl_nm" name="dtl_nm" value=""',
      `id="dtl_nm" name="dtl_nm" value="${query}"`,
    )
    .replace(
      '<p class="msg msg_noSch hide">검색 단어를 입력해주세요</p>',
      `<ul class="sch_list">${rows}</ul>`,
    );
describe("CJ major inert response", () => {
  it("accepts one exact match only from a complete reviewed list", () => {
    expect(
      parseCjMajorResponse(
        response(row("22WD", "합성전공") + row("22WE", "다른전공")),
        "합성전공",
        "2_0",
      ),
    ).toEqual({ code: "22WD", label: "합성전공" });
  });
  it.each([
    response(row("22WD", "합성전공"), "다른검색"),
    response(row("22WD", "합성전공"), "합성전공", "2_1"),
    response(row("22WD", "합성전공") + row("22WE", "합성전공")),
    response(row("", "합성전공")),
    response(row("22WD", "합성전공")).replace("</html>", ""),
    response(row("22WD", "합성전공")).replace(
      row("22WD", "합성전공"),
      `${row("22WD", "합성전공")}<li class="next">다음 페이지</li>`,
    ),
    response(row("22WD", "합성전공")).replace(
      'class="sch_list"',
      'class="sch_list loading"',
    ),
    response(row("22WD", "합성전공")).replace(
      "</ul>",
      "<li>다음 페이지</li></ul>",
    ),
    response(row("22WD", "합성전공")).replace(
      'title="선택 시 본창에 값이 들어가며 레이어창 닫힘"',
      'title="위조"',
    ),
    response(row("22WD", "합성전공")).replace(
      "</body>",
      "<button>다음 페이지</button></body>",
    ),
    response(row("22WD", "합성전공")).replace(
      "</body>",
      '<script>window.location="https://invalid.example"</script></body>',
    ),

    response(row("22WD", "합성전공")).replace(
      'name="num" value="2_0"',
      'name="num" value="2_0"><input name="private" value="secret"',
    ),
  ])("rejects tampered, ambiguous or incomplete results", (html) => {
    expect(() => parseCjMajorResponse(html, "합성전공", "2_0")).toThrow();
  });
});
