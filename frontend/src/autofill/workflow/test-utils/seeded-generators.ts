/**
 * Deterministic, dependency-free generators for seed-fixed property tests.
 * Failures report the seed and run index so any case can be replayed exactly.
 * Shrinking is intentionally not supported.
 */
export type Rng = () => number;

export const DEFAULT_SEEDS: readonly number[] = [
  0x5eed0001, 0x5eed0002, 0x5eed0003,
];
export const DEFAULT_RUNS = 200;
const SUMMARY_LIMIT = 200;

/** 32-bit state PRNG returning values in [0, 1). */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in the inclusive range [min, max]. */
export function int(rng: Rng, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max)
    throw new RangeError(`Invalid integer range: ${min}..${max}`);
  return min + Math.floor(rng() * (max - min + 1));
}

export function bool(rng: Rng, p = 0.5): boolean {
  return rng() < p;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError("Cannot pick from empty list");
  return items[int(rng, 0, items.length - 1)] as T;
}

/** Keeps each item with probability 1/2, preserving input order. */
export function subset<T>(rng: Rng, items: readonly T[]): T[] {
  return items.filter(() => bool(rng));
}

/** Fisher-Yates shuffle of a copy; the input is not mutated. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = int(rng, 0, index);
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

/** String of `min`..`max` code points drawn from `alphabet`. */
export function string(
  rng: Rng,
  alphabet: string,
  min: number,
  max: number,
): string {
  const symbols = Array.from(alphabet);
  if (symbols.length === 0 && max > 0)
    throw new RangeError("Alphabet must not be empty");
  const length = int(rng, min, max);
  let result = "";
  for (let index = 0; index < length; index++) result += pick(rng, symbols);
  return result;
}

export interface ForAllSeededOptions<T> {
  readonly seeds?: readonly number[];
  readonly runs?: number;
  /** De-identified summary of a generated input for failure messages. */
  readonly describe?: (input: T) => string;
}

function defaultDescribe(input: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(input) ?? String(input);
  } catch {
    text = Object.prototype.toString.call(input);
  }
  return text.length > SUMMARY_LIMIT
    ? `${text.slice(0, SUMMARY_LIMIT)}…`
    : text;
}

function hex(seed: number): string {
  return `0x${(seed >>> 0).toString(16)}`;
}

/**
 * Runs `check` for `runs` generated inputs per seed. `check` fails by
 * throwing or returning `false`; the error names the seed and run index.
 */
export function forAllSeeded<T>(
  name: string,
  options: ForAllSeededOptions<T>,
  generate: (rng: Rng) => T,
  check: (input: T) => boolean | void,
): void {
  const seeds = options.seeds ?? DEFAULT_SEEDS;
  const runs = options.runs ?? DEFAULT_RUNS;
  const describe = options.describe ?? defaultDescribe;
  for (const seed of seeds) {
    const rng = mulberry32(seed);
    for (let run = 0; run < runs; run++) {
      const input = generate(rng);
      let failure: unknown;
      try {
        if (check(input) === false) failure = "check returned false";
      } catch (error) {
        failure = error;
      }
      if (failure === undefined) continue;
      const reason =
        failure instanceof Error ? failure.message : String(failure);
      throw new Error(
        `Property "${name}" failed (seed=${hex(seed)}, run=${run}): ${reason}\n` +
          `input: ${describe(input)}`,
        { cause: failure },
      );
    }
  }
}
