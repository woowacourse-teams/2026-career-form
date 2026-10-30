import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { normalizedRequestDigest, recordGenericCalls } from "./record-calls";

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "https://apply.example.test/form" });
});
afterEach(() => document.body.replaceChildren());

const FORM = `<main>
  <section><h3>기본 정보</h3>
    <label for="a">이메일</label><input id="a" type="text">
    <label for="b">휴대폰 번호</label><input id="b" type="text">
  </section>
  <section><h3>경력</h3>
    <label for="c">회사명</label><input id="c" type="text">
  </section>
</main>`;

const oracle = {
  category: ({ title }: { title?: string }) =>
    title?.includes("경력") ? "CAREER" : "PERSONAL",
  decide: () => null,
};

describe("제품 범용 흐름의 요청 기록", () => {
  it("제품 코드가 보낸 요청 본문을 호출 순서대로 기록하고 후속 요청에는 정답 범주를 쓴다", async () => {
    document.body.innerHTML = FORM;

    const calls = await recordGenericCalls(
      document,
      createEmptyProfile(),
      oracle,
    );

    const mapping = calls.filter((call) => call.phase === "MAPPING");
    expect(mapping.map((call) => call.endpoint)).toEqual([
      "/api/v1/generic/sections/classify",
      "/api/v1/generic/fields/analyze",
    ]);
    expect(calls.map((call) => call.order)).toEqual(
      calls.map((_, index) => index + 1),
    );
    const fields = JSON.parse(mapping[1]!.serializedRequest);
    expect(
      fields.sections.map((section: { category: string }) => section.category),
    ).toEqual(["PERSONAL", "CAREER"]);
  });

  it("기록한 본문은 제품 요청 직렬화 결과와 같은 문자열이다", async () => {
    document.body.innerHTML = FORM;

    const [first] = (
      await recordGenericCalls(document, createEmptyProfile(), oracle)
    ).filter((call) => call.phase === "MAPPING");

    expect(first!.serializedRequest).toBe(
      JSON.stringify(JSON.parse(first!.serializedRequest)),
    );
    expect(JSON.parse(first!.serializedRequest).schemaVersion).toBe(1);
  });

  it("같은 화면을 두 번 기록하면 생성 ID를 뺀 요청 digest가 같다", async () => {
    document.body.innerHTML = FORM;
    const first = await recordGenericCalls(
      document,
      createEmptyProfile(),
      oracle,
    );
    document.body.innerHTML = FORM;
    const second = await recordGenericCalls(
      document,
      createEmptyProfile(),
      oracle,
    );

    expect(second.map((call) => call.requestDigest)).toEqual(
      first.map((call) => call.requestDigest),
    );
    expect(JSON.parse(first[0]!.serializedRequest).snapshotId).not.toBe(
      JSON.parse(second[0]!.serializedRequest).snapshotId,
    );
  });

  it("digest는 생성 ID만 무시하고 칸 하나가 바뀌면 달라진다", () => {
    const base = {
      schemaVersion: 1,
      snapshotId: "fields-1",
      sections: [{ sectionId: "gs1", labels: ["이메일"] }],
    };
    const sameButId = { ...base, snapshotId: "fields-2" };
    const changed = {
      ...base,
      sections: [{ sectionId: "gs1", labels: ["이메일 주소"] }],
    };

    expect(normalizedRequestDigest(JSON.stringify(sameButId))).toBe(
      normalizedRequestDigest(JSON.stringify(base)),
    );
    expect(normalizedRequestDigest(JSON.stringify(changed))).not.toBe(
      normalizedRequestDigest(JSON.stringify(base)),
    );
  });
});
