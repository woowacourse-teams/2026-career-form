import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEEDS,
  bool,
  forAllSeeded,
  int,
  mulberry32,
  pick,
  shuffle,
  string,
  subset,
} from "./seeded-generators";

function sequence(seed: number, length = 16): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length }, () => rng());
}

describe("mulberry32", () => {
  it("repeats the same sequence for the same seed", () => {
    expect(sequence(0x5eed0001)).toEqual(sequence(0x5eed0001));
  });

  it("produces different sequences for different seeds", () => {
    expect(sequence(0x5eed0001)).not.toEqual(sequence(0x5eed0002));
  });

  it("returns values in [0, 1)", () => {
    for (const value of sequence(0, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("int", () => {
  it("reaches both inclusive bounds and stays inside them", () => {
    const rng = mulberry32(DEFAULT_SEEDS[0] as number);
    const seen = new Set<number>();
    for (let run = 0; run < 500; run++) {
      const value = int(rng, -2, 2);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
      seen.add(value);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });

  it("returns the single value of a degenerate range", () => {
    expect(int(mulberry32(1), 3, 3)).toBe(3);
  });

  it("rejects inverted or fractional ranges", () => {
    expect(() => int(mulberry32(1), 2, 1)).toThrow(RangeError);
    expect(() => int(mulberry32(1), 0, 1.5)).toThrow(RangeError);
  });
});

describe("bool", () => {
  it("honours probability extremes", () => {
    const rng = mulberry32(7);
    for (let run = 0; run < 50; run++) {
      expect(bool(rng, 0)).toBe(false);
      expect(bool(rng, 1)).toBe(true);
    }
  });
});

describe("string", () => {
  it("respects length bounds and uses only alphabet symbols", () => {
    const rng = mulberry32(11);
    const alphabet = "가나다ab";
    const lengths = new Set<number>();
    for (let run = 0; run < 300; run++) {
      const value = string(rng, alphabet, 1, 3);
      const symbols = Array.from(value);
      lengths.add(symbols.length);
      for (const symbol of symbols) expect(alphabet).toContain(symbol);
    }
    expect([...lengths].sort()).toEqual([1, 2, 3]);
  });

  it("allows an empty result when min and max are zero", () => {
    expect(string(mulberry32(1), "", 0, 0)).toBe("");
  });
});

describe("collection helpers", () => {
  const items = ["a", "b", "c", "d", "e"] as const;

  it("pick returns only input items and rejects empty input", () => {
    const rng = mulberry32(3);
    for (let run = 0; run < 100; run++)
      expect(items).toContain(pick(rng, items));
    expect(() => pick(rng, [])).toThrow(RangeError);
  });

  it("subset keeps input order and only input items", () => {
    const rng = mulberry32(5);
    for (let run = 0; run < 100; run++) {
      const chosen = subset(rng, items);
      expect(chosen).toEqual(items.filter((item) => chosen.includes(item)));
    }
  });

  it("shuffle is a permutation and does not mutate the input", () => {
    const rng = mulberry32(9);
    const input = [...items];
    for (let run = 0; run < 100; run++) {
      const result = shuffle(rng, input);
      expect([...result].sort()).toEqual([...items]);
    }
    expect(input).toEqual([...items]);
  });
});

describe("forAllSeeded", () => {
  it("runs every seed for the requested number of runs", () => {
    let calls = 0;
    forAllSeeded(
      "counts",
      { seeds: [1, 2], runs: 7 },
      (rng) => rng(),
      () => {
        calls++;
      },
    );
    expect(calls).toBe(14);
  });

  it("defaults to the fixed seeds and 200 runs", () => {
    let calls = 0;
    forAllSeeded(
      "defaults",
      {},
      (rng) => rng(),
      () => {
        calls++;
      },
    );
    expect(calls).toBe(DEFAULT_SEEDS.length * 200);
  });

  it("reports seed, run index and input summary on a thrown failure", () => {
    let run = 0;
    expect(() =>
      forAllSeeded(
        "throws",
        { seeds: [0x5eed0002], runs: 10, describe: (n) => `n=${n}` },
        () => run++,
        (n) => {
          if (n === 3) throw new Error("boom");
        },
      ),
    ).toThrow(
      /Property "throws" failed \(seed=0x5eed0002, run=3\): boom\ninput: n=3/,
    );
  });

  it("treats a false return as a failure", () => {
    expect(() =>
      forAllSeeded(
        "false",
        { seeds: [0x5eed0001], runs: 5 },
        () => ({ rows: 2 }),
        () => false,
      ),
    ).toThrow(
      /seed=0x5eed0001, run=0\): check returned false\ninput: \{"rows":2\}/,
    );
  });

  it("replays the same inputs for the same seed", () => {
    const collect = () => {
      const values: number[] = [];
      forAllSeeded(
        "replay",
        { seeds: [42], runs: 20 },
        (rng) => int(rng, 0, 1000),
        (value) => {
          values.push(value);
        },
      );
      return values;
    };
    expect(collect()).toEqual(collect());
  });
});
