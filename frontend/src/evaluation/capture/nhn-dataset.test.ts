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

// 평가 데이터셋 generic-matching v4의 NHN Careers 사례를 현재 제품 코드로 다시 만들어 저장본과 비교한다.
// v4는 v3의 우아한형제들 사례·정답을 바이트 그대로 두고 NHN 지원서 1단계 최초 화면 하나를 더한다.
// 저장본을 새로 만들 때만 CF356_WRITE_DATASET=1로 실행한다.
const RESOURCES = join(process.cwd(), "../backend/src/main/resources");
const DATASET = join(RESOURCES, "evaluation/datasets/generic-matching/v4");
const PREVIOUS = join(RESOURCES, "evaluation/datasets/generic-matching/v3");
const PROFILE = join(
  RESOURCES,
  "evaluation/profiles/v1/synthetic-01-basic.json",
);
const FIXTURE = "nhn-presales-initial";
const write = process.env.CF356_WRITE_DATASET === "1";

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "https://careers.nhn.com/apply" });
});
afterEach(() => document.body.replaceChildren());

const truth = () =>
  JSON.parse(
    readFileSync(join(DATASET, `ground-truth/${FIXTURE}.json`), "utf8"),
  ) as StateTruth;

function build() {
  return buildCase(document, {
    caseId: `${FIXTURE}-synthetic-01`,
    siteId: "nhn-careers",
    split: "final",
    fixtureId: FIXTURE,
    fixtureHtml: readFileSync(
      join(process.cwd(), `fixtures/dom-snapshots/${FIXTURE}/sanitized.html`),
      "utf8",
    ),
    profileId: "synthetic-01-basic",
    profile: parseProfileImport(readFileSync(PROFILE, "utf8")),
    truth: truth(),
  });
}

// 사례를 다시 만드는 데 CI에서 15초 넘게 걸리므로 한 번만 만들어 두 테스트가 나눠 쓰고, 시간 제한을 넉넉히 둔다.
const BUILD_TIMEOUT_MS = 90_000;
let cached: ReturnType<typeof build> | undefined;
const builtOnce = () => (cached ??= build());

describe("평가 데이터셋 generic-matching v4", () => {
  it("NHN 사례는 현재 제품 코드가 만드는 요청과 같다", async () => {
    const built = await builtOnce();
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
  }, BUILD_TIMEOUT_MS);

  it("NHN 화면은 준비(섹션 분류 → 학력 행 추가 결정) → 매핑(섹션 분류 → 필드 매핑)이고 정답이 모든 칸을 덮는다", async () => {
    const built = await builtOnce();
    expect(built.calls.map((call) => `${call.phase}:${call.kind}`)).toEqual([
      "PREPARATION:SECTION_CLASSIFY",
      "PREPARATION:INTERACTION_DECISION",
      "MAPPING:SECTION_CLASSIFY",
      "MAPPING:GENERIC_FIELDS",
    ]);
    const fields = built.calls.find((call) => call.kind === "GENERIC_FIELDS")!;
    expect(Object.keys(fields.expected).sort()).toEqual(
      Object.keys(truth().fieldMapping).sort(),
    );
  }, BUILD_TIMEOUT_MS);

  it("우아한형제들 사례·정답은 v3와 바이트까지 같다", () => {
    for (const dir of ["cases", "ground-truth"]) {
      const names = ["initial", "high-school", "university", "ged"].map(
        (state) =>
          dir === "cases"
            ? `woowahan-r2605009-${state}-synthetic-01.json`
            : `woowahan-r2605009-${state}.json`,
      );
      for (const name of names)
        expect(readFileSync(join(DATASET, dir, name), "utf8")).toBe(
          readFileSync(join(PREVIOUS, dir, name), "utf8"),
        );
    }
  });

  it("manifest의 파일 해시가 저장본과 같다(쓰기 모드에서는 다시 계산한다)", () => {
    const path = "evaluation/datasets/generic-matching/v4/manifest.json";
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
    expect(manifest.cases).toHaveLength(5);
    for (const entry of manifest.cases) {
      expect(sha256(readFileSync(join(RESOURCES, entry.file), "utf8"))).toBe(
        entry.sha256,
      );
      expect(
        sha256(readFileSync(join(RESOURCES, entry.groundTruth.file), "utf8")),
      ).toBe(entry.groundTruth.sha256);
    }
  });
});
