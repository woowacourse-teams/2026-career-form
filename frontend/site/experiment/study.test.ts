import { expect, it } from "vitest";
import {
  createStudy,
  recordTrial,
  loadStudy,
  saveStudy,
  exportStudy,
} from "./study";
it.each([
  [0, "ABC"],
  [1 / 6, "ACB"],
  [2 / 6, "BAC"],
  [3 / 6, "BCA"],
  [4 / 6, "CAB"],
  [5 / 6, "CBA"],
] as const)("assigns a balanced sequence at %s", (random, order) => {
  expect(createStudy(random).order.join("")).toBe(order);
});
const ratings = { comfort: 4, trust: 3, wait: 2 };
it("restores the assigned order and completed ratings", () => {
  const study = recordTrial(createStudy(0), {
    variant: "A",
    ratings,
    durationMs: 6618,
    reducedMotion: false,
  });
  saveStudy(study, sessionStorage);
  expect(loadStudy(sessionStorage)).toEqual(study);
  expect(() =>
    recordTrial(study, {
      variant: "A",
      ratings,
      durationMs: 6615,
      reducedMotion: false,
    }),
  ).toThrow();
});
it.each([0, 6, NaN])("rejects out-of-range ratings %s", (score) => {
  expect(() =>
    recordTrial(createStudy(0), {
      variant: "A",
      ratings: { ...ratings, comfort: score },
      durationMs: 6615,
      reducedMotion: false,
    }),
  ).toThrow();
});
it("discards corrupted storage and continues without storage access", () => {
  sessionStorage.clear();
  saveStudy(createStudy(0), sessionStorage);
  const key = sessionStorage.key(0)!;
  sessionStorage.setItem(key, '{"order":["A","A"]}');
  expect(loadStudy(sessionStorage)).toBeNull();
  const blocked = {
    getItem: () => {
      throw Error();
    },
    setItem: () => {
      throw Error();
    },
  };
  expect(loadStudy(blocked)).toBeNull();
  expect(() => saveStudy(createStudy(0), blocked)).not.toThrow();
});
it("exports complete results using an allowlist and preserves the none preference", () => {
  let study = createStudy(0);
  expect(() => exportStudy(study, "none", "")).toThrow();
  for (const variant of study.order)
    study = recordTrial(study, {
      variant,
      ratings,
      durationMs: 6615,
      reducedMotion: true,
    });
  const result = exportStudy(
    { ...study, secret: "not exported" },
    "none",
    "비슷했어요",
  );
  expect(result.preference).toBe("none");
  expect(result.order).toEqual(["A", "B", "C"]);
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(result.trials.map((t) => t.variant)).toEqual(["A", "B", "C"]);
});

it("restores final preference and strips unknown fields from nested responses", () => {
  let study = createStudy(0);
  for (const variant of study.order)
    study = recordTrial(study, {
      variant,
      ratings,
      durationMs: 6615,
      reducedMotion: false,
    });
  const final = { preference: "B" as const, reason: "화면", secret: "omit" };
  saveStudy({ ...study, final }, sessionStorage);
  const restored = loadStudy(sessionStorage)!;
  expect(restored.final).toEqual({ preference: "B", reason: "화면" });
  expect(exportStudy(restored, "B", "화면")).not.toHaveProperty("final");
});

it("does not restore responses from the previous four-condition experiment", () => {
  sessionStorage.clear();
  saveStudy(createStudy(0), sessionStorage);
  const key = sessionStorage.key(0)!;
  const old = JSON.parse(sessionStorage.getItem(key)!);
  old.version = "panel-study-v10";
  sessionStorage.setItem(key, JSON.stringify(old));
  expect(loadStudy(sessionStorage)).toBeNull();
});
