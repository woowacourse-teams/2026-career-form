import { matchesResultValue } from "../workflow/result-value-match";
import { afterEach, expect, it } from "vitest";
import {
  mountEducation,
  educationProfile,
  educationItem,
} from "./__fixtures__/hplace-mrs2-education.synthetic";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  nativeWriteAdapter,
  nativeValueMatches,
  settleNativeDriver,
} from "./native-form-write";
afterEach(() => installExecutionPolicy(document));
it.each(["3.75", "0"])(
  "writes numeric GPA %s then waits for its exact scale",
  async (score) => {
    mountEducation();
    const p = educationProfile();
    p.education[0].values.gpaScore = score;
    const a = educationItem(".score", 0, p);
    expect(a.item.disabled).toBe(false);
    expect(nativeWriteAdapter.tryWrite(a.handle, a.item)).toEqual({
      handled: true,
      written: true,
    });
    expect(
      await settleNativeDriver(a.handle, a.item, new AbortController().signal),
    ).toBe(true);
    const b = educationItem(".perfectScore", 0, p);
    expect(nativeWriteAdapter.tryWrite(b.handle, b.item)).toEqual({
      handled: true,
      written: true,
    });
    expect(
      document.querySelector<HTMLInputElement>('[name="college[0].score"]')!
        .value,
    ).toBe(score);
    expect(
      document.querySelector<HTMLSelectElement>(
        '[name="college[0].perfectScore"]',
      )!.value,
    ).toBe("4.5");
    expect(
      document.querySelector<HTMLInputElement>('[name="college[1].score"]')!
        .value,
    ).toBe("");
    expect(nativeValueMatches(a.handle, a.item)).toBe(true);
  },
);
it.each(["4.501", "-1", "NaN", "1e1", "3.1234"])(
  "blocks invalid numeric GPA %s before writing",
  (score) => {
    mountEducation();
    const p = educationProfile();
    p.education[0].values.gpaScore = score;
    const a = educationItem(".score", 0, p);
    expect(nativeWriteAdapter.tryWrite(a.handle, a.item)).toEqual({
      handled: true,
      written: false,
    });
    expect(
      document.querySelector<HTMLInputElement>('[name="college[0].score"]')!
        .value,
    ).toBe("");
  },
);
it("blocks the score when the paired scale is absent or forged", () => {
  mountEducation();
  document.querySelector<HTMLOptionElement>(
    '[name="college[0].perfectScore"] option[value="4.5"]',
  )!.value = "99";
  const a = educationItem(".score");
  expect(nativeWriteAdapter.tryWrite(a.handle, a.item)).toEqual({
    handled: true,
    written: false,
  });
});
it("invalidates the old pair on PASS/FAIL rename and never maps total credits as major credits", () => {
  mountEducation();
  const a = educationItem(".score");
  const input = document.querySelector<HTMLInputElement>(
    '[name="college[0].score"]',
  )!;
  input.name = "college[0].displayScore";
  input.type = "text";
  expect(nativeWriteAdapter.tryWrite(a.handle, a.item)).toEqual({
    handled: true,
    written: false,
  });
  expect(
    a.snapshot.request.sections
      .flatMap((s) => s.items ?? [])
      .flatMap((i) => i.fields)
      .some((f) => f.domName?.includes("majorCredits")),
  ).toBe(false);
});

it("does not report a GPA pair complete until scale commit and invalidates a changed option set", async () => {
  mountEducation();
  const a = educationItem(".score");
  expect(nativeWriteAdapter.tryWrite(a.handle, a.item)).toEqual({
    handled: true,
    written: true,
  });
  expect(nativeWriteAdapter.verifyRetained!(a.handle, a.item)).toBe(false);
  expect(matchesResultValue(a.item, "3.75", "3.75", a.handle)).toBe(false);
  const scale = document.querySelector<HTMLSelectElement>(
    '[name="college[0].perfectScore"]',
  )!;
  scale.insertAdjacentHTML("beforeend", '<option value="4.5">4.5</option>');
  expect(nativeValueMatches(a.handle, a.item)).toBe(false);
});

it.each(["max", "relation"])(
  "rechecks a changed GPA %s constraint before touching the score",
  (kind) => {
    mountEducation();
    const a = educationItem(".score");
    const score = document.querySelector<HTMLInputElement>(
      '[name="college[0].score"]',
    )!;
    if (kind === "max") score.max = "3";
    else score.dataset.relTarget = "college[1]";
    expect(nativeWriteAdapter.tryWrite(a.handle, a.item)).toEqual({
      handled: true,
      written: false,
    });
    expect(score.value).toBe("");
  },
);

it("reports absent GPA values as missing rather than an invalid pair", () => {
  mountEducation();
  const profile = educationProfile();
  delete profile.education[0].values.gpaScore;
  delete profile.education[0].values.gpaScale;
  for (const suffix of [".score", ".perfectScore"]) {
    document.querySelector<HTMLSelectElement>(
      '[name="college[0].perfectScore"]',
    )!.disabled = false;
    const { item } = educationItem(suffix, 0, profile);
    expect(item.reason).toBe("입력할 프로필 값이 없습니다.");
    expect(item.disabled).toBe(true);
  }
});
it.each([
  "college[0].collegeMajorSubject[0].displayScore",
  "college[0].collegeMajorSubject[0].displayPerfectScore",
])("does not treat subject grade %s as the school GPA", (name) => {
  mountEducation();
  const field = document.createElement("input");
  field.name = name;
  document.querySelector("[data-loop=college]")!.append(field);
  const { handle, item } = educationItem(".score");
  expect(nativeWriteAdapter.tryWrite(handle, item)).toEqual({
    handled: true,
    written: true,
  });
  expect(field.value).toBe("");
});
