// @vitest-environment node
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INSTALL_LOCK_FILE,
  canonicalJson,
  extensionIdFor,
  installLockHeldByOther,
  manifestApiHosts,
  processAlive,
  readInstallLock,
  sessionChain,
  statePaths,
  validateProfileEnvelope,
  writeInstallLock,
} from "./browser.mjs";

describe("browser helpers", () => {
  it("compares stored profiles regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ y: 1, x: 2 }], c: 0 } })).toBe(
      canonicalJson({ a: { c: 0, d: [{ x: 2, y: 1 }] }, b: 1 }),
    );
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it("accepts only a schemaVersion 1 export envelope", () => {
    expect(() =>
      validateProfileEnvelope({ schemaVersion: 1, profile: {} }),
    ).not.toThrow();
    for (const bad of [
      null,
      {},
      { schemaVersion: 2, profile: {} },
      { schemaVersion: 1, profile: null },
    ])
      expect(() => validateProfileEnvelope(bad)).toThrow(/schemaVersion 1/);
  });

  it("derives the unpacked extension id like Chrome", () => {
    expect(extensionIdFor("/x")).toMatch(/^[a-p]{32}$/);
    expect(extensionIdFor("/x")).toBe(extensionIdFor("/x"));
  });

  it("uses LIVE_QA_STATE_DIR when set and keeps reports beside the profile", () => {
    const p = statePaths({ LIVE_QA_STATE_DIR: "/tmp/qa-state" });
    expect(p).toMatchObject({
      root: "/tmp/qa-state",
      isolated: true,
      profile: "/tmp/qa-state/profile",
      extension: "/tmp/qa-state/extension",
      reports: "/tmp/qa-state/live-qa",
    });
  });
});

describe("manifestApiHosts", () => {
  it("reads sorted hosts from host_permissions and tolerates a missing manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "live-qa-manifest-"));
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({
        host_permissions: [
          "https://b.example/*",
          "https://a.example/*",
          "nope",
        ],
      }),
    );
    expect(await manifestApiHosts(dir)).toEqual(["a.example", "b.example"]);
    expect(await manifestApiHosts(join(dir, "missing"))).toEqual([]);
  });
});

describe("install lock", () => {
  it("round-trips through <state root>/extension.lock.json with the session chain", async () => {
    const root = await mkdtemp(join(tmpdir(), "live-qa-lock-"));
    const paths = statePaths({ LIVE_QA_STATE_DIR: root });
    expect(await readInstallLock(paths)).toBeNull();
    const written = await writeInstallLock(
      paths,
      { revision: "abc123", apiHosts: ["api.example"] },
      { pid: 11, ppid: 12, sessionPid: 13 },
    );
    expect(written).toMatchObject({
      pid: 11,
      ppid: 12,
      sessionPid: 13,
      revision: "abc123",
      apiHosts: ["api.example"],
    });
    expect(await readInstallLock(paths)).toEqual(written);
    expect((await stat(join(root, INSTALL_LOCK_FILE))).mode & 0o777).toBe(
      0o600,
    );
  });

  it("is held by another session only while one of its processes is alive", () => {
    const chain = { pid: 1, ppid: 2, sessionPid: 3 };
    const alive = (pid) => [3, 20].includes(pid);
    const other = { pid: 10, ppid: 11, sessionPid: 20 };
    expect(installLockHeldByOther(other, { chain, alive })).toBe(true);
    // Every process of this lock has exited: ignored.
    const dead = { pid: 30, ppid: 31, sessionPid: 32 };
    expect(installLockHeldByOther(dead, { chain, alive })).toBe(false);
    // Shares the grandparent with this process: our own session.
    const own = { pid: 40, ppid: 41, sessionPid: 3 };
    expect(installLockHeldByOther(own, { chain, alive })).toBe(false);
    expect(installLockHeldByOther(null, { chain, alive })).toBe(false);
  });

  it("uses the real process table by default", () => {
    const chain = sessionChain();
    expect(chain.pid).toBe(process.pid);
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(0)).toBe(false);
    // Our own chain never counts as another session.
    expect(installLockHeldByOther({ ...chain })).toBe(false);
  });
});
