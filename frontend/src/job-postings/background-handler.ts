import { isRecord } from "./repository";
import {
  isPostingPage,
  OPEN_POSTINGS,
  parsePostingMessage,
  POSTING_MESSAGE,
} from "./messages";
import type { PostingService } from "./service";
export function createPostingHandler(
  service: PostingService,
  extensionId: string,
  openPage: (hash: string) => Promise<unknown>,
) {
  return (
    message: unknown,
    sender: { id?: string; url?: string },
  ): Promise<unknown> | undefined => {
    if (!isRecord(message)) return undefined;
    if (message.type === OPEN_POSTINGS) {
      if (sender.id !== extensionId || typeof message.create !== "boolean")
        return Promise.resolve({ ok: false });
      return openPage(message.create ? "#postings/new" : "#postings")
        .then(() => ({ ok: true }))
        .catch(() => ({
          ok: false,
          error: "공고 관리 화면을 열지 못했습니다.",
        }));
    }
    if (message.type !== POSTING_MESSAGE) return undefined;
    const command = parsePostingMessage(message);
    if (!command || !isPostingPage(sender, extensionId))
      return Promise.resolve({
        ok: false,
        error: "관리 페이지에서 다시 시도해 주세요.",
      });
    const execute = () => {
      switch (command.action) {
        case "list":
          return service.list();
        case "retry":
          return service.recover();
        case "save":
          return service.save(command.input, command.id, command.version);
        case "remove":
          return service.remove(command.id, command.version);
        case "complete":
          return service.setCompleted(
            command.id,
            command.version,
            command.completed,
          );
      }
    };
    return execute()
      .then((snapshot) => ({ ok: true, snapshot }))
      .catch((error: unknown) => ({ ok: false, error: publicError(error) }));
  };
}
function publicError(error: unknown): string {
  if (
    error instanceof Error &&
    /^(다른 화면에서|회사명과 직무|HTTP\(S\)|앞으로 남은|알림은 최대|시간대를 확인|저장된 공고 형식)/.test(
      error.message,
    )
  )
    return error.message;
  return "공고 저장 또는 조회에 실패했습니다. 목록을 다시 불러온 뒤 시도해 주세요.";
}
