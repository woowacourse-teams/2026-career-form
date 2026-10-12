import entries from "./catalog-data/entries.json";
import type { CatalogEntry } from "./catalog-search";
import { LANGUAGE_TEST_OPTIONS } from "./standard-values";

export type { CatalogEntry, CatalogKind } from "./catalog-search";
export const CATALOG_VERSION = "2026-10-07";

function assertCatalogEntries(
  value: unknown,
): asserts value is readonly CatalogEntry[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "id" in entry &&
        typeof entry.id === "string" &&
        "name" in entry &&
        typeof entry.name === "string" &&
        "detail" in entry &&
        typeof entry.detail === "string" &&
        "kind" in entry &&
        (entry.kind === "certificate" ||
          entry.kind === "highSchool" ||
          entry.kind === "university" ||
          entry.kind === "graduateSchool") &&
        "aliases" in entry &&
        Array.isArray(entry.aliases) &&
        entry.aliases.every((alias: unknown) => typeof alias === "string"),
    )
  ) {
    throw new Error("Invalid bundled catalog");
  }
}

const catalog: unknown = entries;
assertCatalogEntries(catalog);
export const CATALOG: readonly CatalogEntry[] = [
  ...catalog,
  ...LANGUAGE_TEST_OPTIONS.map<CatalogEntry>((option) => ({
    id: `languageTest:${option.value}`,
    kind: "languageTest",
    name: option.label,
    detail: "어학 시험",
    aliases: option.aliases ?? [],
  })),
];
const entriesById = new Map(CATALOG.map((entry) => [entry.id, entry]));

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return entriesById.get(id);
}
