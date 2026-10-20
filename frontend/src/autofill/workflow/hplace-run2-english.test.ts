import { afterEach, expect, it } from "vitest";
import { mountLive } from "./hplace-run2.test-fixtures";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { createEmptyProfile } from "../../profile/model";
import { writeDetail } from "../adapters/hplace/detail-write";
import type { FieldsAnalyzeResponse } from "../api/types";
afterEach(() => {
  resetHplacePage();
  installExecutionPolicy(document);
});
function setup(order: "givenFirst" | "familyFirst", given = "Gildong") {
  mountLive();
  const guide = document.querySelector(".guide.englishName")!;
  guide.textContent =
    order === "givenFirst" ? "- 이름 + 성 / ex) Gildong Hong" : "성 + 이름";
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((s) => s.fields)
    .find((f) => f.displayName === "영문이름")!;
  const p = createEmptyProfile();
  p.personal.englishGivenName = given;
  p.personal.englishFamilyName = "Hong";
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: candidate.candidateId,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        writePlan: { command: "SET_TEXT" },
        valueBinding: {
          type: "DERIVED",
          recipe:
            order === "givenFirst"
              ? "ENGLISH_FULL_NAME_GIVEN_FIRST"
              : "ENGLISH_FULL_NAME_FAMILY_FIRST",
        },
      },
    ],
  };
  const item = buildReviewPlan({
    registry: snapshot.registry,
    profile: p,
    analysis,
  }).items[0];
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  if (lookup.status !== "ready") throw Error("live English fixture not ready");
  return {
    guide,
    item,
    handle: lookup.handle,
    input: document.getElementById("englishName") as HTMLInputElement,
  };
}
it.each(["givenFirst", "familyFirst"] as const)(
  "writes approved %s derived names with a single space",
  async (order) => {
    const { item, handle, input } = setup(order);
    expect(await writeDetail(handle, item, () => true)).toBe(true);
    expect(input.value).toBe(
      order === "givenFirst" ? "Gildong Hong" : "Hong Gildong",
    );
  },
);
it.each(["guidance", "recipe", "maxlength", "existing", "focus-guidance"])(
  "protects English name when %s changes",
  async (fault) => {
    const { guide, item, handle, input } = setup(
      "givenFirst",
      fault === "maxlength" ? "A".repeat(60) : "Gildong",
    );
    if (fault === "guidance") guide.textContent = "성 + 이름";
    if (fault === "recipe" && item.analysis?.valueBinding?.type === "DERIVED")
      item.analysis.valueBinding.recipe = "ENGLISH_FULL_NAME_FAMILY_FIRST";
    if (fault === "existing") input.value = "Existing Name";
    if (fault === "focus-guidance")
      input.addEventListener("focus", () => guide.remove(), { once: true });
    const before = input.value;
    expect(await writeDetail(handle, item, () => true)).toBe(false);
    expect(input.value).toBe(before);
  },
);
it("accepts exactly maxlength 64 without truncation", async () => {
  const { item, handle, input } = setup("givenFirst", "A".repeat(59));
  expect(await writeDetail(handle, item, () => true)).toBe(true);
  expect(input.value).toHaveLength(64);
});

const fields = () =>
  collectFieldsSnapshot(document).request.sections.flatMap((s) => s.fields);
it.each(["이름 + 성", "이름+성", "First Last", "Given Family", "성 + 이름"])(
  "collects owned English order %s as a schemaVersion2 canonical name",
  (guide) => {
    mountLive(true);
    document.querySelector(".guide.englishName")!.textContent = guide;
    expect(fields().find((f) => f.displayName === "영문이름")?.domName).toBe(
      `hplace.detail.englishName.${guide === "성 + 이름" ? "familyFirst" : "givenFirst"}`,
    );
  },
);

it.each(["ambiguous", "foreign-subject", "duplicate"])(
  "keeps English order unsupported with a precise reason for %s guidance",
  async (fault) => {
    mountLive();
    const guide = document.querySelector(".wrapGuide")!;
    if (fault === "ambiguous")
      guide.firstElementChild!.textContent = "이름 + 성 / 성 + 이름";
    if (fault === "foreign-subject") {
      const other = document.createElement("div");
      other.className = "subject";
      other.append(guide);
      document.body.append(other);
    }
    if (fault === "duplicate")
      guide.append(guide.firstElementChild!.cloneNode(true));
    const snapshot = collectFieldsSnapshot(document);
    const english = snapshot.request.sections
      .flatMap((s) => s.fields)
      .find((f) => f.displayName === "영문이름")!;
    expect(english.domName).toBe("hplace.detail.englishName");
    const { buildReviewPlan } = await import("../review/review-plan");
    const plan = buildReviewPlan({
      registry: snapshot.registry,
      profile: createEmptyProfile(),
      analysis: {
        snapshotId: snapshot.request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId: english.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          },
        ],
      },
    });
    expect(plan.items[0].reason).toBe("영문 이름 순서 안내 없음");
  },
);

it("defaults to family-first when the page has no English-name guide at all", () => {
  mountLive();
  document.querySelector(".wrapGuide")!.remove();
  const english = collectFieldsSnapshot(document)
    .request.sections.flatMap((s) => s.fields)
    .find((f) => f.displayName === "영문이름")!;
  expect(english.domName).toBe("hplace.detail.englishName.familyFirst");
});

it.each([
  ["* Hong, Gildong (여권상 영문성명 기재)", ".familyFirst"],
  // The same order repeated is still one order.
  ["* Hong, Gildong (예: HONG GILDONG)", ".familyFirst"],
  ["예) HONG GILDONG", ".familyFirst"],
  ["ex) Gildong Hong", ".givenFirst"],
  ["예) Gil-dong Hong", ".givenFirst"],
  // Two different sample orders, or no standard sample: still ambiguous.
  ["Hong, Gildong 또는 Gildong Hong", ""],
  ["예) Kim, Minsu", ""],
])(
  "reads the order of the standard sample name in guide %j (KDI-type)",
  (text, suffix) => {
    mountLive();
    document.querySelector(".guide.englishName")!.textContent = text;
    const english = collectFieldsSnapshot(document)
      .request.sections.flatMap((s) => s.fields)
      .find((f) => f.displayName === "영문이름")!;
    expect(english.domName).toBe(`hplace.detail.englishName${suffix}`);
  },
);
