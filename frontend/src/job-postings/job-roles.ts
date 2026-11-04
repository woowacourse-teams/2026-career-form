import {
  isPushApiErrorCode,
  parseJobCategories,
  PushApiError,
  type JobCategories,
  type PushApi,
  type PushApiErrorCode,
} from "./push-api";
import { isRecord } from "./repository";

// Last job category list from the server, kept so the selector still works
// (and keeps the user's selection meaningful) while the server is unreachable.
export const PUSH_JOB_CATEGORIES_KEY = "careerForm.push.jobCategories";

export interface JobCategoriesView {
  // null when neither the server nor the cache has a list.
  categories: JobCategories | null;
  // Set when the latest server read failed; categories then come from the cache.
  error: PushApiErrorCode | null;
}

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
interface JobCategoryPorts {
  api: Pick<PushApi, "jobCategories">;
  storage: StorageArea;
  now(): number;
}

export class JobCategoryStore {
  constructor(private readonly ports: JobCategoryPorts) {}
  async cached(): Promise<JobCategories | undefined> {
    const stored = await this.ports.storage.get(PUSH_JOB_CATEGORIES_KEY);
    return parseJobCategories(stored[PUSH_JOB_CATEGORIES_KEY]);
  }
  // Fresh read first; the cache only fills in when the server is unavailable.
  async load(): Promise<JobCategoriesView> {
    try {
      const categories = await this.ports.api.jobCategories();
      await this.ports.storage.set({
        [PUSH_JOB_CATEGORIES_KEY]: {
          ...categories,
          fetchedAt: this.ports.now(),
        },
      });
      return { categories, error: null };
    } catch (error) {
      return {
        categories: (await this.cached()) ?? null,
        error: error instanceof PushApiError ? error.code : "NETWORK",
      };
    }
  }
}

export function parseJobCategoriesView(
  value: unknown,
): JobCategoriesView | undefined {
  if (!isRecord(value)) return undefined;
  const error =
    value.error === null || value.error === undefined ? null : value.error;
  if (error !== null && !isPushApiErrorCode(error)) return undefined;
  if (value.categories === null || value.categories === undefined)
    return { categories: null, error };
  const categories = parseJobCategories(value.categories);
  return categories ? { categories, error } : undefined;
}

export function roleCodesOf(categories: JobCategories): Set<string> {
  return new Set(
    categories.categories.flatMap((c) => c.roles.map((r) => r.code)),
  );
}
// Codes that left the category list are dropped rather than remapped.
export function pruneRoles(
  roles: readonly string[],
  categories: JobCategories,
): string[] {
  const known = roleCodesOf(categories);
  return roles.filter((code) => known.has(code));
}

// Postings registered before the category list carry no roles and reach
// everyone; tagged postings need an overlap with the selection, so a user who
// has not chosen yet sees none of them.
export function matchesSelectedRoles(
  postingRoles: readonly string[] | undefined,
  selected: readonly string[],
): boolean {
  if (postingRoles === undefined) return true;
  return postingRoles.some((code) => selected.includes(code));
}
