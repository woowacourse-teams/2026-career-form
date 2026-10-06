import {
  POSTING_SCHEMA_VERSION,
  validateInput,
  type Posting,
  type PostingEnvelope,
} from "./model";
export const POSTINGS_KEY = "careerForm.jobPostings";
export interface PostingRepository {
  load(): Promise<Posting[]>;
  save(postings: Posting[]): Promise<void>;
}
interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPosting(value: unknown): value is Posting {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !/^[\w-]+$/.test(value.id) ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1 ||
    !["planned", "completed"].includes(String(value.status)) ||
    !Number.isFinite(value.updatedAt) ||
    ![value.company, value.role, value.url, value.timeZone].every(
      (v) => typeof v === "string",
    ) ||
    !Array.isArray(value.reminders) ||
    value.reminders.length > 2
  )
    return false;
  if (
    !value.reminders.every(
      (r) =>
        isRecord(r) &&
        (r.deliveredAt === undefined || Number.isFinite(r.deliveredAt)) &&
        Number.isSafeInteger(r.minutes) &&
        (r.minutes as number) > 0 &&
        typeof value.deadline === "number" &&
        r.at === value.deadline - (r.minutes as number) * 60000 &&
        ["pending", "sent", "skipped"].includes(String(r.state)),
    )
  )
    return false;
  const posting = value as unknown as Posting;
  try {
    validateInput(
      { ...posting, minutes: posting.reminders.map((r) => r.minutes) },
      -Infinity,
    );
    return (
      new Set(posting.reminders.map((r) => r.minutes)).size ===
      posting.reminders.length
    );
  } catch {
    return false;
  }
}
export function parsePostings(value: unknown): Posting[] {
  if (value === undefined) return [];
  if (
    !isRecord(value) ||
    value.schemaVersion !== POSTING_SCHEMA_VERSION ||
    !Array.isArray(value.postings) ||
    !value.postings.every(isPosting) ||
    new Set(value.postings.map((p) => p.id)).size !== value.postings.length
  )
    throw new Error(
      "저장된 공고 형식을 읽을 수 없습니다. 데이터를 덮어쓰지 않았습니다.",
    );
  return structuredClone(value.postings);
}
export class LocalPostingRepository implements PostingRepository {
  constructor(private readonly storage: StorageArea) {}
  async load(): Promise<Posting[]> {
    const data = await this.storage.get(POSTINGS_KEY);
    return parsePostings(data[POSTINGS_KEY]);
  }
  async save(postings: Posting[]): Promise<void> {
    const envelope: PostingEnvelope = {
      schemaVersion: POSTING_SCHEMA_VERSION,
      postings,
    };
    parsePostings(envelope);
    await this.storage.set({ [POSTINGS_KEY]: envelope });
  }
}
