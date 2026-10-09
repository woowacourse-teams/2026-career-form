import {
  generateBuildInfo,
  installedBuildScript,
  serializeBuildInfo,
} from "./build-info.ts";

export function assertBuildInfo(
  metadataText,
  backgroundScript,
  expected = generateBuildInfo(process.cwd()),
) {
  const parsed = JSON.parse(metadataText);
  if (
    Object.keys(parsed).join(",") !== "schema_version,revision,source_state" ||
    parsed.schema_version !== "1.0" ||
    !(
      parsed.revision === null ||
      (typeof parsed.revision === "string" &&
        /^[0-9a-f]{40}$/.test(parsed.revision))
    ) ||
    !["CLEAN", "DIRTY", "UNKNOWN"].includes(parsed.source_state) ||
    (parsed.source_state !== "UNKNOWN" && parsed.revision === null) ||
    metadataText !== serializeBuildInfo(parsed)
  )
    throw new Error("Invalid canonical build-info.json");
  if (metadataText !== serializeBuildInfo(expected))
    throw new Error("Build metadata does not match source input");
  if (!backgroundScript.startsWith(installedBuildScript(parsed)))
    throw new Error("Installed snapshot does not match build metadata");
}
