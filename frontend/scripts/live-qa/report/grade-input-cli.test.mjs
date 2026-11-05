// @vitest-environment node
// Runs `cli.mjs grade-input` as a subprocess against a temporary state and
// output directory with a hand-made, value-free census. No browser involved.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../cli.mjs");
const census = (url) => [
  {
    frame: url,
    main: true,
    url,
    controls: [
      {
        i: 0,
        tag: "input",
        type: "text",
        name: "applicantName",
        id: "",
        label: "이름",
        section: "기본",
        hasValue: false,
      },
      {
        i: 1,
        tag: "select",
        type: "select",
        name: "gender",
        id: "",
        label: "성별",
        section: "기본",
        selectOptions: ["선택", "A", "B"],
        hasValue: false,
      },
    ],
  },
];
const fakeFinal = (label) => ({
  label,
  controls: [
    {
      i: 0,
      category: "AUTOFILLABLE",
      profileKey: "p",
      expected: "X",
      note: "",
    },
    {
      i: 1,
      category: "AUTOFILLABLE",
      profileKey: "g",
      expected: "A",
      note: "",
    },
  ],
  rowExpansion: [],
  summary: "fake",
});

let root;
let out;
let env;
const gradeInput = (args) =>
  run(process.execPath, [cli, "grade-input", ...args], { env }).then(
    ({ stdout }) => stdout.trim().split("\n"),
  );

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "live-qa-cli-"));
  out = join(root, "out");
  await mkdir(join(root, "state"));
  await mkdir(out);
  const profile = join(root, "profile.json");
  const content = '{"schemaVersion":1,"synthetic":true}';
  await writeFile(profile, content);
  await writeFile(
    join(root, "state/live-qa-profile.json"),
    JSON.stringify({
      sha256: createHash("sha256").update(content).digest("hex"),
      path: profile,
    }),
  );
  env = { ...process.env, LIVE_QA_STATE_DIR: join(root, "state") };
  for (const [label, url] of [
    ["gr-a", "https://x.example/a"],
    ["gr-b", "https://x.example/b"],
  ])
    await writeFile(
      join(out, `${label}.census.json`),
      JSON.stringify(census(url)),
    );
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("cli grade-input", () => {
  it("writes the hash, asks for grading once and reuses the final for the same structure", async () => {
    const first = await gradeInput(["gr-a", "--out", out]);
    expect(first[0]).toMatch(
      /^gr-a controls=2 hash=[0-9a-f]{12} grading-needed$/,
    );
    expect(first[1]).toMatch(
      /^pregrade: 1 pages need grading \(labels: \["gr-a"\]\), 0 reused; agents=3; est-tokens≈[\d,]+$/,
    );
    expect(first[2]).toBe('labelsToGrade: ["gr-a"]');
    const input = JSON.parse(
      await readFile(join(out, "grade/gr-a.input.json"), "utf8"),
    );
    expect(input.structureHash).toMatch(/^[0-9a-f]{64}$/);
    const index = JSON.parse(
      await readFile(join(out, "grade/structure-index.json"), "utf8"),
    );
    expect(index[input.structureHash]).toMatchObject({ label: "gr-a" });

    // The pre-grading workflow would write this.
    await writeFile(
      join(out, "grade/gr-a.final.json"),
      JSON.stringify(fakeFinal("gr-a")),
    );
    const second = await gradeInput(["gr-a", "gr-b", "--out", out]);
    expect(second[0]).toMatch(/^gr-a controls=2 hash=[0-9a-f]{12} unchanged$/);
    expect(second[1]).toMatch(
      /^gr-b controls=2 hash=[0-9a-f]{12} reused-from=gr-a$/,
    );
    expect(second[2]).toBe(
      "pregrade: 0 pages need grading (labels: []), 1 reused, 1 unchanged; agents=0; est-tokens≈0",
    );
    expect(second[3]).toBe("labelsToGrade: []");
    const copied = JSON.parse(
      await readFile(join(out, "grade/gr-b.final.json"), "utf8"),
    );
    expect(copied).toMatchObject({
      label: "gr-b",
      structureHash: input.structureHash,
      reusedFrom: { label: "gr-a", hash: input.structureHash },
    });
    expect(copied.controls).toEqual(fakeFinal("gr-a").controls);
  });

  it("reuses a final from an earlier result directory given with --reuse-from", async () => {
    await gradeInput(["gr-a", "--out", out]);
    await writeFile(
      join(out, "grade/gr-a.final.json"),
      JSON.stringify(fakeFinal("gr-a")),
    );
    const later = join(root, "later");
    await mkdir(later);
    await writeFile(
      join(later, "sk-c.census.json"),
      JSON.stringify(census("https://y.example/c")),
    );
    const lines = await gradeInput([
      "sk-c",
      "--out",
      later,
      "--reuse-from",
      out,
    ]);
    expect(lines[0]).toMatch(
      /^sk-c controls=2 hash=[0-9a-f]{12} reused-from=gr-a$/,
    );
    expect(lines.at(-1)).toBe("labelsToGrade: []");
  });
});
