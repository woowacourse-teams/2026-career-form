import { captureSiteIcon } from "./site-favicon";
import { browser } from "wxt/browser";
import type { PostingInput } from "./model";
import { POSTING_MESSAGE, type PostingCommand } from "./messages";
import { POSTINGS_KEY, isRecord, parsePostings } from "./repository";
import type { PostingSnapshot } from "./service";
export interface PostingClient {
  list(): Promise<PostingSnapshot>;
  save(
    input: PostingInput,
    id?: string,
    version?: number,
  ): Promise<PostingSnapshot>;
  setCompleted(
    id: string,
    version: number,
    completed: boolean,
  ): Promise<PostingSnapshot>;
  remove(id: string, version: number): Promise<PostingSnapshot>;
  retry(): Promise<PostingSnapshot>;
  subscribe(listener: () => void): () => void;
}
async function request(command: PostingCommand): Promise<PostingSnapshot> {
  let response: unknown;
  try {
    response = await browser.runtime.sendMessage(command);
  } catch {
    throw new Error("공고 저장소에 연결하지 못했습니다. 다시 시도해 주세요.");
  }
  if (!isRecord(response) || response.ok !== true)
    throw new Error(
      isRecord(response) && typeof response.error === "string"
        ? response.error
        : "공고 요청에 실패했습니다.",
    );
  const snapshot = response.snapshot;
  if (
    !isRecord(snapshot) ||
    !Array.isArray(snapshot.problems) ||
    !snapshot.problems.every((p) =>
      ["permission", "schedule", "notification"].includes(String(p)),
    )
  )
    throw new Error("공고 응답을 읽지 못했습니다.");
  return {
    postings: parsePostings({ schemaVersion: 1, postings: snapshot.postings }),
    problems: snapshot.problems as PostingSnapshot["problems"],
  };
}
export const postingClient: PostingClient = {
  list: () => request({ type: POSTING_MESSAGE, action: "list" }),
  save: async (input, id, version) => {
    const icon = captureSiteIcon(input.url);
    const snapshot = await request({
      type: POSTING_MESSAGE,
      action: "save",
      input,
      id,
      version,
    });
    await icon;
    return snapshot;
  },
  setCompleted: (id, version, completed) =>
    request({
      type: POSTING_MESSAGE,
      action: "complete",
      id,
      version,
      completed,
    }),
  remove: (id, version) =>
    request({ type: POSTING_MESSAGE, action: "remove", id, version }),
  retry: () => request({ type: POSTING_MESSAGE, action: "retry" }),
  subscribe: (listener) => {
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && POSTINGS_KEY in changes) listener();
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  },
};
