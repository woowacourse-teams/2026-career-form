// Reuses an earlier pre-grading for a page whose structure hash is already
// known, and estimates the grading work that is left.
//
// `grade/structure-index.json` maps a structure hash to the label whose
// `final.json` holds its grading: { "<hash>": { label, finalFile, at } }.
// The index of the current --out directory is searched first, then the
// indexes of the directories given with --reuse-from, in order.

import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { structureHash } from "./structure-hash.mjs";
import { resolve } from "node:path";

export const STRUCTURE_INDEX = "grade/structure-index.json";

// Calibration (2026-10-22 measurement): 31 pages with 1,296 controls took 93
// pre-grading agents (two graders and one reconciler per page) and about 7.1M
// tokens. 3 agents × (25k base + 1.3k per control) over those pages gives
// about 7.4M, so the estimate errs slightly high.
export const AGENTS_PER_PAGE = 3;
export const TOKENS_PER_AGENT = 25_000;
export const TOKENS_PER_CONTROL = 1_300;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 1), { mode: 0o600 });

export async function loadStructureIndex(dir) {
  const path = resolve(dir, STRUCTURE_INDEX);
  return existsSync(path) ? await readJson(path) : {};
}

// A result directory written before structure hashes existed has no index:
// its gradings are found by hashing each `grade/<label>.input.json` that has
// a `final.json` beside it. Entries of a real index win.
export async function reuseIndexOf(dir) {
  const index = await loadStructureIndex(dir);
  const grade = resolve(dir, "grade");
  if (!existsSync(grade)) return index;
  for (const name of await readdir(grade)) {
    const label = /^(.+)\.input\.json$/.exec(name)?.[1];
    if (!label) continue;
    const finalFile = resolve(grade, `${label}.final.json`);
    if (!existsSync(finalFile)) continue;
    const input = await readJson(resolve(grade, name));
    const hash = input.structureHash ?? structureHash(input);
    index[hash] ??= { label, finalFile, at: null };
  }
  return index;
}

export function saveStructureIndex(dir, index) {
  return writeJson(resolve(dir, STRUCTURE_INDEX), index);
}

// Decides what to do with `grade/<label>.final.json` for the given hash and
// updates `index` (the caller saves it). Returns
// { status: "unchanged" | "reused" | "grading-needed", reusedFrom }.
export async function reusePregrade({
  outDir,
  label,
  hash,
  index,
  reuseDirs = [],
  now = new Date().toISOString(),
}) {
  const finalFile = resolve(outDir, `grade/${label}.final.json`);
  const previousHash =
    Object.keys(index).find((h) => index[h]?.label === label) ?? null;
  if (existsSync(finalFile)) {
    const final = await readJson(finalFile);
    // A final written before hashes existed is adopted as is.
    const known = final.structureHash ?? previousHash;
    if (known === undefined || known === null || known === hash) {
      index[hash] ??= { label, finalFile, at: now };
      return { status: "unchanged", reusedFrom: null };
    }
  }
  // The page structure changed: the old grading no longer applies.
  if (previousHash && previousHash !== hash) delete index[previousHash];
  const sources = [index];
  for (const dir of reuseDirs) sources.push(await reuseIndexOf(dir));
  for (const source of sources) {
    const entry = source[hash];
    if (!entry || entry.finalFile === finalFile || !existsSync(entry.finalFile))
      continue;
    const final = await readJson(entry.finalFile);
    await writeJson(finalFile, {
      ...final,
      label,
      structureHash: hash,
      reusedFrom: { label: entry.label, finalFile: entry.finalFile, hash },
    });
    index[hash] ??= { label, finalFile, at: now };
    return { status: "reused", reusedFrom: entry.label };
  }
  index[hash] = { label, finalFile, at: now };
  return { status: "grading-needed", reusedFrom: null };
}

export function estimatePregrade(controlCounts) {
  const agents = controlCounts.length * AGENTS_PER_PAGE;
  const tokens = controlCounts.reduce(
    (a, n) => a + AGENTS_PER_PAGE * (TOKENS_PER_AGENT + TOKENS_PER_CONTROL * n),
    0,
  );
  return { agents, tokens };
}

// results: [{ label, controls, hash, status, reusedFrom }]
export function formatPregradeLines(results) {
  const lines = results.map(
    (r) =>
      `${r.label} controls=${r.controls} hash=${r.hash.slice(0, 12)} ${
        r.status === "reused" ? `reused-from=${r.reusedFrom}` : r.status
      }`,
  );
  const toGrade = results.filter((r) => r.status === "grading-needed");
  const labels = toGrade.map((r) => r.label);
  const reused = results.filter((r) => r.status === "reused").length;
  const unchanged = results.filter((r) => r.status === "unchanged").length;
  const { agents, tokens } = estimatePregrade(toGrade.map((r) => r.controls));
  lines.push(
    `pregrade: ${toGrade.length} pages need grading (labels: ${JSON.stringify(labels)}), ${reused} reused${unchanged ? `, ${unchanged} unchanged` : ""}; agents=${agents}; est-tokens≈${tokens.toLocaleString("en-US")}`,
    `labelsToGrade: ${JSON.stringify(labels)}`,
  );
  return lines;
}
