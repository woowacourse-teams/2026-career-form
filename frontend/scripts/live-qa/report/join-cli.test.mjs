// @vitest-environment node
// Runs `cli.mjs join` as a subprocess: a run with captures also gets a
// capture-input file holding only expected values. No browser involved.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../cli.mjs");
const control = (i, name, extra = {}) => ({
  i,
  tag: "input",
  type: "text",
  name,
  id: "",
  label: name,
  section: "S",
  hasValue: false,
  ...extra,
});
const frames = (controls) => [
  {
    frame: "https://x.example/f",
    main: true,
    url: "https://x.example/f",
    controls,
  },
];
const final = {
  label: "sk-a",
  controls: [
    {
      i: 0,
      category: "AUTOFILLABLE",
      profileKey: "p",
      expected: "A",
      note: "",
    },
    {
      i: 1,
      category: "NO_PROFILE_KEY",
      profileKey: "",
      expected: "",
      note: "",
    },
  ],
  rowExpansion: [],
};
const runResult = (captures) => ({
  testAccount: true,
  after: frames([
    control(0, "a", { hasValue: true, changed: true, shown: "A" }),
    control(1, "b"),
  ]),
  before: frames([control(0, "a"), control(1, "b")]),
  ...(captures ? { captures } : {}),
});

let root;
let out;
const joinCli = (labels) =>
  run(process.execPath, [cli, "join", ...labels, "--out", out], {
    env: { ...process.env, LIVE_QA_STATE_DIR: join(root, "state") },
  }).then(({ stdout }) => stdout.trim().split("\n"));

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "live-qa-join-"));
  out = join(root, "out");
  await mkdir(join(out, "grade"), { recursive: true });
  await mkdir(join(root, "state"));
  for (const label of ["sk-a", "sk-b"]) {
    await writeFile(
      join(out, `${label}.census.json`),
      JSON.stringify(frames([control(0, "a"), control(1, "b")])),
    );
    await writeFile(
      join(out, `grade/${label}.final.json`),
      JSON.stringify({ ...final, label }),
    );
  }
  await writeFile(
    join(out, "sk-a.run.json"),
    JSON.stringify(
      runResult([
        {
          file: "sk-a.captures/01.png",
          name: "S",
          frame: "main",
          controls: [0, 1],
        },
      ]),
    ),
  );
  await writeFile(join(out, "sk-b.run.json"), JSON.stringify(runResult(null)));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("cli join", () => {
  it("writes capture-input.json for runs with captures and lists those labels", async () => {
    const lines = await joinCli(["sk-a", "sk-b"]);
    expect(lines).toEqual([
      "sk-a rows=2 new=0 captures=1",
      "sk-b rows=2 new=0 captures=0",
      'captureLabels: ["sk-a"]',
    ]);
    const input = JSON.parse(
      await readFile(join(out, "grade/sk-a.capture-input.json"), "utf8"),
    );
    expect(input).toEqual({
      label: "sk-a",
      captures: [
        {
          file: join(out, "sk-a.captures/01.png"),
          name: "S",
          controls: [0, 1],
        },
      ],
      expected: [
        { i: 0, section: "S", label: "a", type: "text", expected: "A" },
      ],
    });
    await expect(
      readFile(join(out, "grade/sk-b.capture-input.json")),
    ).rejects.toThrow();
  });
});
