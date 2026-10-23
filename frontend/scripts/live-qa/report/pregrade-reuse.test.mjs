// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENTS_PER_PAGE,
  TOKENS_PER_AGENT,
  TOKENS_PER_CONTROL,
  estimatePregrade,
  formatPregradeLines,
  loadStructureIndex,
  reusePregrade,
  saveStructureIndex,
} from "./pregrade-reuse.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const final = (label) => ({
  label,
  controls: [{ i: 0, category: "AUTOFILLABLE", expected: "x" }],
  rowExpansion: [],
});
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

let root;
let out;
let previous;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "live-qa-reuse-"));
  out = join(root, "out");
  previous = join(root, "previous");
  await mkdir(join(out, "grade"), { recursive: true });
  await mkdir(join(previous, "grade"), { recursive: true });
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("reusePregrade", () => {
  it("asks for grading when nothing is known and records the label", async () => {
    const index = {};
    const result = await reusePregrade({
      outDir: out,
      label: "gr-a",
      hash: HASH_A,
      index,
      now: "T",
    });
    expect(result).toEqual({ status: "grading-needed", reusedFrom: null });
    expect(index).toEqual({
      [HASH_A]: {
        label: "gr-a",
        finalFile: join(out, "grade/gr-a.final.json"),
        at: "T",
      },
    });
  });

  it("copies the final of another label with the same hash in the same out dir", async () => {
    await writeFile(
      join(out, "grade/gr-a.final.json"),
      JSON.stringify(final("gr-a")),
    );
    const index = {};
    await reusePregrade({ outDir: out, label: "gr-a", hash: HASH_A, index });
    const result = await reusePregrade({
      outDir: out,
      label: "gr-b",
      hash: HASH_A,
      index,
    });
    expect(result).toEqual({ status: "reused", reusedFrom: "gr-a" });
    const copied = await readJson(join(out, "grade/gr-b.final.json"));
    expect(copied).toMatchObject({
      label: "gr-b",
      structureHash: HASH_A,
      reusedFrom: {
        label: "gr-a",
        finalFile: join(out, "grade/gr-a.final.json"),
        hash: HASH_A,
      },
    });
    expect(copied.controls).toEqual(final("gr-a").controls);
    // The index keeps pointing at the original grading.
    expect(index[HASH_A].label).toBe("gr-a");
  });

  it("reuses a final from a --reuse-from directory and indexes the copy", async () => {
    await writeFile(
      join(previous, "grade/sk-old.final.json"),
      JSON.stringify(final("sk-old")),
    );
    await saveStructureIndex(previous, {
      [HASH_A]: {
        label: "sk-old",
        finalFile: join(previous, "grade/sk-old.final.json"),
        at: "T0",
      },
    });
    const index = {};
    const result = await reusePregrade({
      outDir: out,
      label: "sk-new",
      hash: HASH_A,
      index,
      reuseDirs: [previous],
      now: "T1",
    });
    expect(result).toEqual({ status: "reused", reusedFrom: "sk-old" });
    expect(index[HASH_A]).toEqual({
      label: "sk-new",
      finalFile: join(out, "grade/sk-new.final.json"),
      at: "T1",
    });
    expect(await loadStructureIndex(out)).toEqual({});
    await saveStructureIndex(out, index);
    expect(await loadStructureIndex(out)).toEqual(index);
  });

  it("skips index entries whose final file is gone", async () => {
    await saveStructureIndex(previous, {
      [HASH_A]: {
        label: "sk-old",
        finalFile: join(previous, "grade/missing.final.json"),
        at: "T0",
      },
    });
    const result = await reusePregrade({
      outDir: out,
      label: "sk-new",
      hash: HASH_A,
      index: {},
      reuseDirs: [previous],
    });
    expect(result.status).toBe("grading-needed");
  });

  it("keeps an existing final whose hash is unchanged, also when it predates hashes", async () => {
    await writeFile(
      join(out, "grade/hp-a-s1.final.json"),
      JSON.stringify(final("hp-a-s1")),
    );
    const legacy = await reusePregrade({
      outDir: out,
      label: "hp-a-s1",
      hash: HASH_A,
      index: {},
    });
    expect(legacy.status).toBe("unchanged");
    const index = {
      [HASH_A]: {
        label: "hp-a-s1",
        finalFile: join(out, "grade/hp-a-s1.final.json"),
        at: "T",
      },
    };
    const same = await reusePregrade({
      outDir: out,
      label: "hp-a-s1",
      hash: HASH_A,
      index,
    });
    expect(same.status).toBe("unchanged");
    expect(await readJson(join(out, "grade/hp-a-s1.final.json"))).toEqual(
      final("hp-a-s1"),
    );
  });

  it("drops the old index entry and asks for grading when the structure changed", async () => {
    await writeFile(
      join(out, "grade/hp-a-s1.final.json"),
      JSON.stringify({ ...final("hp-a-s1"), structureHash: HASH_A }),
    );
    const index = {
      [HASH_A]: {
        label: "hp-a-s1",
        finalFile: join(out, "grade/hp-a-s1.final.json"),
        at: "T",
      },
    };
    const result = await reusePregrade({
      outDir: out,
      label: "hp-a-s1",
      hash: HASH_B,
      index,
      now: "T2",
    });
    expect(result.status).toBe("grading-needed");
    expect(Object.keys(index)).toEqual([HASH_B]);
  });
});

describe("estimatePregrade", () => {
  it("uses three agents per page with a base and a per-control cost", () => {
    expect(estimatePregrade([])).toEqual({ agents: 0, tokens: 0 });
    expect(estimatePregrade([10, 20])).toEqual({
      agents: 2 * AGENTS_PER_PAGE,
      tokens:
        AGENTS_PER_PAGE * (2 * TOKENS_PER_AGENT + 30 * TOKENS_PER_CONTROL),
    });
  });

  it("stays near the 2026-10-22 measurement it was calibrated on", () => {
    // 31 pages, 1,296 controls, 93 agents, about 7.1M tokens.
    const perPage = Array.from({ length: 31 }, (_, k) => (k < 25 ? 42 : 41));
    expect(perPage.reduce((a, n) => a + n, 0)).toBe(1296);
    const { agents, tokens } = estimatePregrade(perPage);
    expect(agents).toBe(93);
    expect(tokens).toBeGreaterThan(7_000_000);
    expect(tokens).toBeLessThan(7_600_000);
  });
});

describe("formatPregradeLines", () => {
  it("prints one line per label, a summary and the labels to grade as JSON", () => {
    const lines = formatPregradeLines([
      {
        label: "gr-a",
        controls: 10,
        hash: HASH_A,
        status: "grading-needed",
        reusedFrom: null,
      },
      {
        label: "gr-b",
        controls: 10,
        hash: HASH_A,
        status: "reused",
        reusedFrom: "gr-a",
      },
      {
        label: "sk-c",
        controls: 5,
        hash: HASH_B,
        status: "unchanged",
        reusedFrom: null,
      },
    ]);
    expect(lines).toEqual([
      `gr-a controls=10 hash=${"a".repeat(12)} grading-needed`,
      `gr-b controls=10 hash=${"a".repeat(12)} reused-from=gr-a`,
      `sk-c controls=5 hash=${"b".repeat(12)} unchanged`,
      'pregrade: 1 pages need grading (labels: ["gr-a"]), 1 reused, 1 unchanged; agents=3; est-tokens≈114,000',
      'labelsToGrade: ["gr-a"]',
    ]);
  });
});
