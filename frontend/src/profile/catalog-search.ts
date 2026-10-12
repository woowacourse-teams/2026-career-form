export type CatalogKind =
  | "certificate"
  | "languageTest"
  | "highSchool"
  | "university"
  | "graduateSchool";

export interface CatalogEntry {
  readonly id: string;
  readonly kind: CatalogKind;
  readonly name: string;
  readonly detail: string;
  readonly aliases: readonly string[];
}

export function normalizeCatalogQuery(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/g, "");
}

export function catalogLabels(entry: CatalogEntry): readonly string[] {
  return [
    entry.name,
    ...entry.aliases,
    ...entry.aliases.map((alias) => `${entry.name}(${alias})`),
  ];
}

export function searchCatalog(
  entries: readonly CatalogEntry[],
  kind: CatalogKind,
  query: string,
): readonly CatalogEntry[] {
  const normalized = normalizeCatalogQuery(query);
  if (!normalized) return [];
  return entries.filter(
    (entry) =>
      entry.kind === kind &&
      [...catalogLabels(entry), `${entry.name} ${entry.detail}`].some((name) =>
        normalizeCatalogQuery(name).includes(normalized),
      ),
  );
}

export function catalogKindForField(
  sectionId: string,
  fieldId: string,
): CatalogKind | undefined {
  if (sectionId === "certificate" && fieldId === "name") return "certificate";
  if (sectionId === "languageTest" && fieldId === "testName")
    return "languageTest";
  if (fieldId !== "schoolName") return undefined;
  switch (sectionId) {
    case "highSchool":
    case "university":
    case "graduateSchool":
      return sectionId;
    default:
      return undefined;
  }
}
