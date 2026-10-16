import type { Profile } from "../model";
import { REPEATED_CATEGORY_IDS } from "../profile-repository";
import {
  ImportSelectionError,
  mergeImportSelection,
  type ImportEntrySelection,
  type ImportSelection,
} from "./merge";

/** Preflight uses the same validation as saving; earlier accepted rows take priority. */
export function findInvalidImportRows(
  profile: Profile,
  selection: ImportSelection,
): readonly ImportEntrySelection[] {
  const accepted: ImportEntrySelection[] = [];
  const rejected: ImportEntrySelection[] = [];
  const existingIds = new Set(
    REPEATED_CATEGORY_IDS.flatMap((category) =>
      profile[category].map((entry) => entry.id),
    ),
  );
  for (const row of selection.entries ?? []) {
    let sequence = 0;
    const createId = () => {
      let id: string;
      do {
        id = `import-review-${sequence++}`;
      } while (existingIds.has(id));
      return id;
    };
    try {
      mergeImportSelection(
        profile,
        { single: selection.single, entries: [...accepted, row] },
        createId,
      );
      accepted.push(row);
    } catch (error) {
      if (!(error instanceof ImportSelectionError)) throw error;
      rejected.push(row);
    }
  }
  return rejected;
}
