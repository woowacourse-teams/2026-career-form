import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseProfileImport } from "../../profile/profile-transfer";
import {
  buildCase,
  type CaseFile,
  refreshManifestDigests,
  type StateTruth,
  sha256,
} from "./dataset-case";

// 평가 데이터셋 generic-matching v2의 우아한형제들 사례를 현재 제품 코드로 다시 만들어 저장본과 비교한다.
// 저장본을 새로 만들 때만 CF356_WRITE_DATASET=1로 실행한다. v1은 이전 수집기의 요청이라 다시 만들지 않는다.
const DATASET = join(
  process.cwd(),
  "../backend/src/main/resources/evaluation/datasets/generic-matching/v2",
);
const PROFILE = join(
  process.cwd(),
  "../backend/src/main/resources/evaluation/profiles/v1/synthetic-01-basic.json",
);
const STATES = [
  { state: "initial", split: "tuning" },
  { state: "high-school", split: "final" },
  { state: "university", split: "final" },
] as const;
// 정제본은 선택 상태를 지운다. 수집 기록(review.md)의 화면 상태대로 학력 구분만 되살린다.
const SHOWN_STAGE: Record<string, string | undefined> = {
  "high-school": "고등학교",
  university: "대학교",
};

function restoreStage(state: string) {
  const stage = SHOWN_STAGE[state];
  if (!stage) return undefined;
  return (document: Document) => {
    const selects = [...document.querySelectorAll("select")].filter((select) =>
      [...select.options].some((option) => option.text === stage),
    );
    if (selects.length !== 1) throw new Error(`학력 구분 선택 칸이 하나가 아닙니다: ${state}`);
    const option = [...selects[0]!.options].find((candidate) => candidate.text === stage)!;
    selects[0]!.selectedIndex = option.index;
  };
}
const write = process.env.CF356_WRITE_DATASET === "1";
const RESOURCES = join(process.cwd(), "../backend/src/main/resources");

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://career.woowahan.com/recruitment/R2605009/form",
  });
});
afterEach(() => document.body.replaceChildren());

async function build(state: string, split: CaseFile["split"]) {
  const fixtureId = `woowahan-r2605009-${state}`;
  return buildCase(document, {
    caseId: `${fixtureId}-synthetic-01`,
    siteId: "woowahan-recruitment",
    split,
    fixtureId,
    fixtureHtml: readFileSync(
      join(process.cwd(), `fixtures/dom-snapshots/${fixtureId}/sanitized.html`),
      "utf8",
    ),
    profileId: "synthetic-01-basic",
    profile: parseProfileImport(readFileSync(PROFILE, "utf8")),
    truth: JSON.parse(
      readFileSync(join(DATASET, `ground-truth/${fixtureId}.json`), "utf8"),
    ) as StateTruth,
    restoreState: restoreStage(state),
  });
}

describe("평가 데이터셋 generic-matching v2 우아한형제들 사례", () => {
  it.each(STATES)(
    "$state 사례는 현재 제품 코드가 만드는 요청과 같다",
    async ({ state, split }) => {
      const built = await build(state, split);
      const file = join(DATASET, `cases/${built.caseId}.json`);
      if (write) writeFileSync(file, `${JSON.stringify(built, null, 2)}\n`);
      expect(existsSync(file)).toBe(true);
      const stored = JSON.parse(readFileSync(file, "utf8")) as CaseFile;
      expect(built.calls.map((call) => call.requestDigest)).toEqual(
        stored.calls.map((call) => call.requestDigest),
      );
      expect(built.calls.map((call) => call.expected)).toEqual(
        stored.calls.map((call) => call.expected),
      );
    },
  );

  it("manifest의 파일 해시가 저장본과 같다(쓰기 모드에서는 다시 계산한다)", () => {
    const path = "evaluation/datasets/generic-matching/v2/manifest.json";
    if (write) refreshManifestDigests(RESOURCES, path);
    const manifest = JSON.parse(
      readFileSync(join(RESOURCES, path), "utf8"),
    ) as {
      cases: {
        file: string;
        sha256: string;
        groundTruth: { file: string; sha256: string };
      }[];
    };
    for (const entry of manifest.cases) {
      expect(sha256(readFileSync(join(RESOURCES, entry.file), "utf8"))).toBe(
        entry.sha256,
      );
      expect(
        sha256(readFileSync(join(RESOURCES, entry.groundTruth.file), "utf8")),
      ).toBe(entry.groundTruth.sha256);
    }
  });

  it("호출 순서는 준비 → 매핑이고 매핑은 섹션 분류 → 필드 매핑 한 번씩이다", async () => {
    const initial = await build("initial", "tuning");
    expect(initial.calls.map((call) => `${call.phase}:${call.kind}`)).toEqual([
      "PREPARATION:SECTION_CLASSIFY",
      "PREPARATION:INTERACTION_DECISION",
      "MAPPING:SECTION_CLASSIFY",
      "MAPPING:GENERIC_FIELDS",
    ]);
    const university = await build("university", "final");
    expect(
      university.calls.map((call) => `${call.phase}:${call.kind}`),
    ).toEqual([
      "PREPARATION:SECTION_CLASSIFY",
      "MAPPING:SECTION_CLASSIFY",
      "MAPPING:GENERIC_FIELDS",
    ]);
  });

  it("필드 매핑 정답은 요청의 모든 칸을 덮고 정답 파일의 칸 수와 같다", async () => {
    for (const { state, split } of STATES) {
      const built = await build(state, split);
      const fields = built.calls.find(
        (call) => call.kind === "GENERIC_FIELDS",
      )!;
      const truth = JSON.parse(
        readFileSync(
          join(DATASET, `ground-truth/woowahan-r2605009-${state}.json`),
          "utf8",
        ),
      ) as StateTruth;
      expect(Object.keys(fields.expected).sort()).toEqual(
        Object.keys(truth.fieldMapping).sort(),
      );
    }
  });

  it("정답 파일이 다른 화면 기준이면 사례를 만들지 않는다", async () => {
    const truth = JSON.parse(
      readFileSync(
        join(DATASET, "ground-truth/woowahan-r2605009-initial.json"),
        "utf8",
      ),
    ) as StateTruth;
    await expect(
      buildCase(document, {
        caseId: "x",
        siteId: "woowahan-recruitment",
        split: "tuning",
        fixtureId: "x",
        fixtureHtml: "<main><input></main>",
        profileId: "synthetic-01-basic",
        profile: parseProfileImport(readFileSync(PROFILE, "utf8")),
        truth,
      }),
    ).rejects.toThrow("정답이 다른 화면 기준입니다");
    expect(sha256("<main><input></main>")).not.toBe(truth.candidateSha256);
  });
});
