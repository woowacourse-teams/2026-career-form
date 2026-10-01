import { SCENARIO_DURATION_MS } from "./scenario";
export type Variant = "A" | "B" | "C";
export type Ratings = { comfort: number; trust: number; wait: number };
export type Trial = {
  variant: Variant;
  ratings: Ratings;
  durationMs: number;
  reducedMotion: boolean;
};
export type Study = {
  version: string;
  order: Variant[];
  trials: Trial[];
  final?: { preference: Preference; reason: string };
};
export type Preference = Variant | "none";
const VERSION = "panel-study-v17";
const KEY = "career-form-panel-study-v17";
export const VARIANT_COUNT = 3;
export const sequences: Variant[][] = [
  ["A", "B", "C"],
  ["A", "C", "B"],
  ["B", "A", "C"],
  ["B", "C", "A"],
  ["C", "A", "B"],
  ["C", "B", "A"],
];
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export function createStudy(random = Math.random()): Study {
  if (!Number.isFinite(random) || random < 0 || random >= 1)
    throw Error("Invalid assignment");
  return {
    version: VERSION,
    order: [...sequences[Math.floor(random * sequences.length)]!],
    trials: [],
  };
}
function cleanTrial(trial: Trial): Trial {
  if (
    !trial ||
    !trial.ratings ||
    ![trial.ratings.comfort, trial.ratings.trust, trial.ratings.wait].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= 5,
    ) ||
    !Number.isFinite(trial.durationMs) ||
    trial.durationMs < SCENARIO_DURATION_MS ||
    typeof trial.reducedMotion !== "boolean"
  )
    throw Error("Invalid trial");
  return {
    variant: trial.variant,
    ratings: {
      comfort: trial.ratings.comfort,
      trust: trial.ratings.trust,
      wait: trial.ratings.wait,
    },
    durationMs: trial.durationMs,
    reducedMotion: trial.reducedMotion,
  };
}
function cleanStudy(study: Study): Study {
  if (
    !study ||
    study.version !== VERSION ||
    !Array.isArray(study.order) ||
    !sequences.some(
      (order) =>
        order.join("") === study.order.join("") &&
        study.order.length === VARIANT_COUNT,
    ) ||
    !Array.isArray(study.trials) ||
    study.trials.length > VARIANT_COUNT
  )
    throw Error("Invalid study");
  const trials = study.trials.map((trial, index) => {
    if (trial.variant !== study.order[index])
      throw Error("Invalid trial order");
    return cleanTrial(trial);
  });
  const final = study.final;
  if (
    final &&
    (trials.length !== VARIANT_COUNT ||
      ![...study.order, "none"].includes(final.preference) ||
      typeof final.reason !== "string" ||
      final.reason.length > 2000)
  )
    throw Error("Invalid final response");
  return {
    version: VERSION,
    order: [...study.order],
    trials,
    ...(final
      ? { final: { preference: final.preference, reason: final.reason } }
      : {}),
  };
}
export function recordTrial(study: Study, trial: Trial): Study {
  const clean = cleanStudy(study);
  if (
    clean.trials.length >= VARIANT_COUNT ||
    trial.variant !== clean.order[clean.trials.length]
  )
    throw Error("Invalid trial order");
  return { ...clean, trials: [...clean.trials, cleanTrial(trial)] };
}
export function loadStudy(storage?: StorageAccess): Study | null {
  try {
    const raw = (storage ?? window.sessionStorage).getItem(KEY);
    return raw ? cleanStudy(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function saveStudy(study: Study, storage?: StorageAccess): void {
  const serialized = JSON.stringify(cleanStudy(study));
  try {
    (storage ?? window.sessionStorage).setItem(KEY, serialized);
  } catch {
    /* Memory state remains usable when storage is disabled. */
  }
}
export function exportStudy(
  study: Study & Record<string, unknown>,
  preference: Preference,
  reason: string,
) {
  const clean = cleanStudy(study);
  if (
    clean.trials.length !== VARIANT_COUNT ||
    ![...clean.order, "none"].includes(preference) ||
    typeof reason !== "string" ||
    reason.length > 2000
  )
    throw Error("Incomplete result");
  return {
    version: clean.version,
    order: clean.order,
    trials: clean.trials,
    preference,
    reason: reason.trim(),
  };
}
