import { collectFieldsSnapshot } from "../dom/collect";
import type { SegmentField, StyleOf } from "./section-segments";

/** Synthetic forms without personal data; class names are local to these fixtures. */
export const DIV_HEADING_FORM = `<form>
  <div class="box">
    <div class="box-head">학력</div>
    <div class="row"><label for="school">학교명</label><input id="school" type="text"></div>
    <div class="row"><label for="major">전공</label><input id="major" type="text"></div>
    <div class="row"><label for="status">졸업 구분</label><select id="status"><option value="a">졸업</option><option value="b">재학</option></select></div>
  </div>
  <div class="box">
    <div class="box-head">어학</div>
    <div class="row"><label for="exam">시험명</label><input id="exam" type="text"></div>
    <div class="row"><label for="score">점수</label><input id="score" type="text"></div>
  </div>
</form>`;

export const SIBLING_H3_FORM = `<form>
  <h3>인적 사항</h3>
  <div><span>이름</span><input type="text"></div>
  <div><span>이메일</span><input type="email"></div>
  <h3>경력</h3>
  <div><span>회사명</span><input type="text"></div>
  <div><span>담당 업무</span><textarea></textarea></div>
</form>`;

export const TABLE_FORM = `<form>
  <table>
    <caption>가족 사항</caption>
    <tr><th>관계</th><td><input type="text" aria-label="관계"></td><th>성명</th><td><input type="text" aria-label="성명"></td></tr>
  </table>
  <table>
    <tr><th colspan="4">병역 사항</th></tr>
    <tr><th>군별</th><td><select aria-label="군별"><option value="a">육군</option><option value="b">해군</option></select></td><th>계급</th><td><input type="text" aria-label="계급"></td></tr>
    <tr><th colspan="4">보훈 사항</th></tr>
    <tr><th>보훈 번호</th><td colspan="3"><input type="text" aria-label="보훈 번호"></td></tr>
  </table>
</form>`;

export const FLAT_FORM = `<form>
  <div><label for="name">이름</label><input id="name" type="text"></div>
  <div><label for="phone">연락처</label><input id="phone" type="tel"></div>
  <div><label for="message">메시지</label><textarea id="message"></textarea></div>
</form>`;

/** Two implicit repeat rows (one add action, same control structure) and a different section. */
export const REPEAT_ROWS_FORM = `<form>
  <h3>학력</h3>
  <div class="list">
    <div><input type="text" name="school1" aria-label="학교명"><input type="text" name="major1" aria-label="전공"></div>
    <div><input type="text" name="school2" aria-label="학교명"><input type="text" name="major2" aria-label="전공"></div>
    <button type="button">추가</button>
  </div>
  <h3>자격증</h3>
  <div><input type="text" aria-label="자격증명"><input type="text" aria-label="발급 기관"></div>
</form>`;

export const ACTIVE_TAB_FORM = `<div role="tablist">
  <button role="tab" aria-selected="false">기본 정보</button>
  <button role="tab" aria-selected="true">학력 정보</button>
</div>
<form>
  <h3>고등학교</h3>
  <div><label for="high">학교명</label><input id="high" type="text"></div>
  <h3>대학교</h3>
  <div><label for="univ">학교명</label><input id="univ" type="text"></div>
</form>`;

/** Deterministic stand-in for browser default heading and table header weights. */
export const defaultStyleOf: StyleOf = (element) => ({
  fontWeight: /^(H[1-6]|TH|STRONG|B|LEGEND|CAPTION)$/.test(element.tagName)
    ? "700"
    : "400",
  fontSize: "14px",
});

/** Fields of one collection pass (CF-198 labels), mapped to segment input. */
export function collectSegmentFields(document: Document): SegmentField[] {
  const { request, registry } = collectFieldsSnapshot(document);
  return request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ])
    .flatMap((candidate) => {
      const lookup = registry.lookupField(candidate.candidateId);
      if (lookup.status !== "ready" && lookup.status !== "blocked") return [];
      const element =
        lookup.handle.elements[0] ?? lookup.handle.customElements?.[0];
      if (!element) return [];
      return [
        {
          element,
          control: candidate.control,
          ...(candidate.displayName ? { label: candidate.displayName } : {}),
        },
      ];
    });
}
