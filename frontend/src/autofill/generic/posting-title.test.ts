import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { recordGenericCalls } from "../../evaluation/capture/record-calls";
import type { GenericFieldsRequest } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { segmentGenericSections } from "./section-segments";
import { collectSegmentFields } from "./section-segments.test-fixtures";
import {
  mount,
  type PostingPage,
  titleAboveFieldsPage,
  titleAboveFormPage,
} from "./posting-title.test-fixtures";

const POSTING = "플랫폼 엔지니어 (서버)";
const OTHER_POSTING = "데이터 분석가(신입 & 경력)";
const FIELDS_ENDPOINT = "/api/v1/generic/fields/analyze";

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "https://apply.example.test/job/1/apply" });
});
afterEach(() => {
  document.title = "";
  document.body.replaceChildren();
});

function sectionTitles(page: PostingPage) {
  mount(document, page);
  return segmentGenericSections(document, collectSegmentFields(document)).map(
    (section) => ({ title: section.title, fields: section.fields.length }),
  );
}

/** 칸 이름별 섹션 머리 라벨. 제품 범용 수집과 같은 옵션으로 읽는다. */
function sectionHeadings(page: PostingPage) {
  mount(document, page);
  const { request } = collectFieldsSnapshot(document, undefined, {
    recoverBrokenLabels: true,
    titleNameCues: true,
    mixedSectionDetection: false,
  });
  return Object.fromEntries(
    request.sections
      .flatMap((section) => section.fields)
      .map((field) => [
        field.displayName,
        (field.semanticContext?.labels ?? [])
          .filter((label) => label.source === "section-heading")
          .map((label) => label.text),
      ]),
  );
}

/** 제품 범용 흐름이 서버로 보내려던 요청 전부와, 칸 분석 요청의 식별자를 뺀 지문. */
async function requestsOf(page: PostingPage) {
  mount(document, page);
  const calls = await recordGenericCalls(document, createEmptyProfile(), {
    category: () => "NONE",
    decide: () => null,
  });
  const fields = calls.filter((call) => call.endpoint === FIELDS_ENDPOINT);
  return {
    serialized: calls.map((call) => call.serializedRequest),
    fieldsDigests: fields.map((call) => call.requestDigest),
    fieldsRequests: fields.map(
      (call) => JSON.parse(call.serializedRequest) as GenericFieldsRequest,
    ),
  };
}

describe("공고 제목이 첫 칸 묶음 바로 위에 있는 양식", () => {
  it("구간 제목에 공고 제목이 없고 다른 구간 제목은 그대로다", () => {
    expect(sectionTitles(titleAboveFieldsPage(POSTING))).toEqual([
      { title: "지원서 작성", fields: 3 },
      { title: "포트폴리오", fields: 1 },
    ]);
  });

  it("칸 분석 요청의 섹션 displayName에 공고 제목이 없다", async () => {
    const { fieldsRequests, serialized } = await requestsOf(
      titleAboveFieldsPage(POSTING),
    );
    expect(
      fieldsRequests.flatMap((request) =>
        request.sections.map((section) => section.displayName),
      ),
    ).toEqual(["지원서 작성", "포트폴리오"]);
    expect(serialized.join("\n")).not.toContain(POSTING);
  });

  it("공고 제목만 다른 두 화면의 칸 분석 요청은 같다", async () => {
    const first = await requestsOf(titleAboveFieldsPage(POSTING));
    const second = await requestsOf(titleAboveFieldsPage(OTHER_POSTING));
    expect(first.fieldsDigests).toHaveLength(1);
    expect(second.fieldsDigests).toEqual(first.fieldsDigests);
  });

  it("회사가 달라도 공고 제목 때문에 요청이 달라지지 않는다", async () => {
    const first = await requestsOf(titleAboveFieldsPage(POSTING, "가나다상사"));
    const second = await requestsOf(
      titleAboveFieldsPage(OTHER_POSTING, "라마바테크"),
    );
    expect(second.fieldsDigests).toEqual(first.fieldsDigests);
  });
});

describe("공고 제목이 양식 위의 제목 요소인 양식", () => {
  it("섹션 밖 문항의 섹션 머리 라벨에 공고 제목이 없고 섹션 안 칸은 그대로다", () => {
    expect(sectionHeadings(titleAboveFormPage(POSTING))).toEqual({
      이메일: ["인적사항필수"],
      "휴대폰 번호": ["인적사항필수"],
      학교명: ["학력필수"],
      전공: ["학력필수"],
      "위 내용은 사실과 다름없습니까?": [],
    });
  });

  it("구간 제목은 섹션 제목 그대로이고 섹션 밖 문항에는 제목이 없다", () => {
    expect(
      sectionTitles(titleAboveFormPage(POSTING)).map(({ title }) => title),
    ).toEqual(["인적사항필수", "학력필수", undefined]);
  });

  it("어떤 요청에도 공고 제목이 없고, 공고 제목만 다른 두 화면의 칸 분석 요청은 같다", async () => {
    const first = await requestsOf(titleAboveFormPage(POSTING));
    const second = await requestsOf(titleAboveFormPage(OTHER_POSTING));
    expect(first.serialized.join("\n")).not.toContain(POSTING);
    expect(first.fieldsDigests).toHaveLength(1);
    expect(second.fieldsDigests).toEqual(first.fieldsDigests);
  });
});

describe("공고 제목이 아닌 제목", () => {
  it("문서 제목이 단계 이름이어도 양식 용어인 섹션 제목은 지우지 않는다", () => {
    mount(document, {
      title: "학력 | 가나다상사",
      body: `<form>
        <h3>학력</h3>
        <div><label for="school">학교명</label><input id="school" type="text"></div>
        <div><label for="major">전공</label><input id="major" type="text"></div>
        <h3>경력</h3>
        <div><label for="company">회사명</label><input id="company" type="text"></div>
      </form>`,
    });
    expect(
      segmentGenericSections(document, collectSegmentFields(document)).map(
        (section) => section.title,
      ),
    ).toEqual(["학력", "경력"]);
  });

  it("첫 칸 묶음 바로 위 제목은 문서의 첫 제목이어도 섹션 머리 라벨로 남는다", () => {
    expect(
      sectionHeadings({
        title: "가나다 채용",
        body: `<main>
          <section><h2>보호자 정보</h2><div><label for="name">이름</label><input id="name" type="text"></div></section>
          <section><h2>학력</h2><div><label for="school">학교명</label><input id="school" type="text"></div></section>
        </main>`,
      }),
    ).toEqual({ 이름: ["보호자 정보"], 학교명: ["학력"] });
  });
});
