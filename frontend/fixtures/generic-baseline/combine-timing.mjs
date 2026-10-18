// Combines per-provider timing files from run-baseline.mjs into one timing
// artifact. Shared measurement metadata must be identical across providers.
// Usage: node combine-timing.mjs --meta <meta.json> --out <timing.json> <timing-*.json>...
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args, positionals } = parseArgs({
  options: { meta: { type: "string" }, out: { type: "string" } },
  allowPositionals: true,
});
if (!args.meta || !args.out || positionals.length === 0) {
  throw new Error("--meta, --out and at least one provider timing file are required");
}

const SHARED = [
  "measured_revision",
  "product_source_state",
  "collection_tree",
  "collection_files",
  "inputs",
  "driver_files",
];
const files = positionals.map((path) => JSON.parse(readFileSync(path, "utf8")));
const shared = Object.fromEntries(SHARED.map((key) => [key, files[0][key]]));
for (const file of files.slice(1)) {
  for (const key of SHARED) {
    if (JSON.stringify(file[key]) !== JSON.stringify(shared[key])) {
      throw new Error(`Provider timing files differ in ${key}`);
    }
  }
}

const providers = Object.fromEntries(
  files.map((file) => {
    const own = Object.fromEntries(
      Object.entries(file).filter(([key]) => !SHARED.includes(key)),
    );
    return [file.config.provider, own];
  }),
);
const meta = JSON.parse(readFileSync(args.meta, "utf8"));
writeFileSync(
  args.out,
  `${JSON.stringify({ meta: { ...meta, ...shared }, providers }, null, 2)}\n`,
);
console.log(`combined ${Object.keys(providers).join(", ")} into ${args.out}`);
