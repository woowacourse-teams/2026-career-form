// @vitest-environment node
import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { assertBuildInfo } from "./assert-build-info.mjs";
import { installedBuildScript, serializeBuildInfo } from "./build-info.ts";

const a = {
  schema_version: "1.0",
  revision: "a".repeat(40),
  source_state: "CLEAN",
};
const b = { ...a, revision: "b".repeat(40) };
describe("build and ZIP metadata assertions", () => {
  it("rejects a non-string revision even when its coercion looks like a SHA", () => {
    const malformed = { ...a, revision: [a.revision] };
    expect(() =>
      assertBuildInfo(
        serializeBuildInfo(malformed),
        installedBuildScript(malformed),
        malformed,
      ),
    ).toThrow("Invalid canonical");
  });
  it("compares canonical bytes, current build input and embedded loaded snapshot", () => {
    expect(() =>
      assertBuildInfo(serializeBuildInfo(a), installedBuildScript(a), a),
    ).not.toThrow();
    expect(() =>
      assertBuildInfo(serializeBuildInfo(a), installedBuildScript(b), a),
    ).toThrow("Installed snapshot");
    expect(() =>
      assertBuildInfo(serializeBuildInfo(a), installedBuildScript(a), b),
    ).toThrow("source input");
  });
  it.each([
    "",
    "not json",
    JSON.stringify({ ...a, schema_version: "2.0" }) + "\n",
    JSON.stringify({ ...a, revision: "not-a-sha" }) + "\n",
    JSON.stringify({ ...a, source_state: "UNVERIFIED" }) + "\n",
    JSON.stringify({ ...a, revision: null }) + "\n",
    JSON.stringify({ ...a, extra: "not-allowed" }) + "\n",
    JSON.stringify({
      revision: a.revision,
      schema_version: a.schema_version,
      source_state: a.source_state,
    }) + "\n",
    JSON.stringify(a),
    JSON.stringify(a, null, 2) + "\n",
  ])("rejects missing, invalid or noncanonical metadata %#", (metadata) => {
    expect(() =>
      assertBuildInfo(metadata, installedBuildScript(a), a),
    ).toThrow();
  });
  it("reads actual ZIP contents and rejects missing, corrupted and inconsistent metadata", () => {
    const archive = new AdmZip();
    archive.addFile(
      "build-info.json",
      Buffer.from(serializeBuildInfo(a), "utf8"),
    );
    archive.addFile(
      "background.js",
      Buffer.from(installedBuildScript(a), "utf8"),
    );
    const readArchive = () => new AdmZip(archive.toBuffer());
    const assertArchive = () => {
      const zip = readArchive();
      assertBuildInfo(
        zip.readAsText("build-info.json"),
        zip.readAsText("background.js"),
        a,
      );
    };
    expect(assertArchive).not.toThrow();
    archive.updateFile("build-info.json", Buffer.from(serializeBuildInfo(b)));
    expect(assertArchive).toThrow("source input");
    archive.updateFile("build-info.json", Buffer.from("corrupt"));
    expect(assertArchive).toThrow();
    archive.deleteFile("build-info.json");
    expect(assertArchive).toThrow();
  });
});
