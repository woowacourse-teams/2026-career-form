import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { basicAnalysis } from "../adapters/hplace/basic.test-fixtures";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { input, mountRun1, profile, run } from "./hplace-run1.test-fixtures";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("replaces only empty-group HTML false defaults and fills their conditional children", async () => {
  const { policy } = mountRun1();
  run(policy);
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  for (const name of ["patriot.patriotYn", "handicap.handicapYn"])
    expect(
      document.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)
        ?.value,
    ).toBe("true");
  expect(input("patriot.patriotNumber").value).toBe("SYNTHETIC-001");
  expect(input("handicap.handicapGradeCode").value).toBe("100");
  expect(input("handicap.handicapContentsCode").value).toBe("17");
});
it.each([
  "patriot.patriotNumber",
  "patriot.relationship",
  "patriot.patriotRate",
  "handicap.handicapGradeCode",
  "handicap.handicapContentsCode",
])(
  "protects HTML false default when dependent %s is populated",
  async (name) => {
    const { policy } = mountRun1();
    if (name === "patriot.patriotRate")
      input("patriot.patriotNumber").insertAdjacentHTML(
        "afterend",
        '<select name="patriot.patriotRate" data-rel-target="patriot" disabled><option value="">선택</option><option value="0" selected>0%</option><option value="5">5%</option><option value="10">10%</option></select>',
      );
    else
      input(name).value = name.includes("Grade")
        ? "100"
        : name.includes("Contents")
          ? "17"
          : "기존 합성값";
    run(policy);
    await screen.findByText("기입 결과", {}, { timeout: 15000 });
    const group = name.startsWith("patriot")
      ? "patriot.patriotYn"
      : "handicap.handicapYn";
    expect(
      document.querySelector<HTMLInputElement>(`[name="${group}"]:checked`)
        ?.value,
    ).toBe("false");
  },
);
it("keeps a profile false HTML default as already entered without clicking", async () => {
  const { policy } = mountRun1();
  const p = createEmptyProfile();
  p.veteran.veteranStatus = "비대상";
  p.disability.disabilityStatus = "비대상";
  const clicks = vi.fn();
  document
    .querySelectorAll('[name="patriot.patriotYn"],[name="handicap.handicapYn"]')
    .forEach((e) => e.addEventListener("click", clicks));
  run(policy, p);
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  expect(clicks).not.toHaveBeenCalled();
  expect(screen.queryByText(/자동으로 입력하지 못했어요/)).toBeNull();
});
it.each(["beforeMutation", "focus"])(
  "rechecks default dependents populated at %s before clicking",
  async (phase) => {
    mountRun1();
    const snap = collectFieldsSnapshot(document);
    const candidate = snap.request.sections
      .flatMap((s) => s.fields)
      .find((f) => f.domName === "hplace.detail.veteranStatus")!;
    const item = buildReviewPlan({
      registry: snap.registry,
      profile: profile(),
      analysis: basicAnalysis(snap.request),
      ignoreCurrentValueCandidateIds: new Set([candidate.candidateId]),
    }).items.find((i) => i.candidateId === candidate.candidateId)!;
    const lookup = snap.registry.lookupField(candidate.candidateId);
    if (lookup.status !== "ready") throw new Error("missing veteran fixture");
    const populate = () => {
      input("patriot.patriotNumber").value = "사용자 합성값";
    };
    if (phase === "focus")
      lookup.handle.optionElements
        .get("true")!
        .addEventListener("focus", populate, { once: true });
    const { writeBasic } = await import("../adapters/hplace/basic-write");
    expect(
      await writeBasic(
        lookup.handle,
        item,
        () => true,
        phase === "beforeMutation"
          ? async () => {
              populate();
              return true;
            }
          : undefined,
      ),
    ).toBe(false);
    expect(
      document.querySelector<HTMLInputElement>(
        '[name="patriot.patriotYn"]:checked',
      )?.value,
    ).toBe("false");
    expect(input("patriot.patriotNumber").value).toBe("사용자 합성값");
  },
);
