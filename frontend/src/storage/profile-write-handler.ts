import { PROFILE_SCHEMA_VERSION, type Profile } from "../profile/model";
import { profilesEqual } from "../profile/profile-repository";
import { parseProfileImport } from "../profile/profile-transfer";
import {
  ChromeProfileStorage,
  PROFILE_WRITE_MESSAGE,
  type StorageArea,
} from "./chrome-profile-storage";

type WriteResult = { status: "saved" | "conflict" | "invalid" | "error" };

/** The single background instance serializes all production profile writes across extension contexts. */
export function createProfileWriteHandler(
  storage: StorageArea,
  extensionId: string,
) {
  const repository = new ChromeProfileStorage(storage);
  let queue: Promise<unknown> = Promise.resolve();
  return (
    message: unknown,
    sender: { id?: string },
  ): Promise<WriteResult> | undefined => {
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      message.type !== PROFILE_WRITE_MESSAGE
    )
      return undefined;
    if (sender.id !== extensionId)
      return Promise.resolve({ status: "invalid" });
    let expected: Profile;
    let next: Profile;
    try {
      if (!("expected" in message) || !("next" in message))
        return Promise.resolve({ status: "invalid" });
      expected = parseProfileImport(
        JSON.stringify({
          schemaVersion: PROFILE_SCHEMA_VERSION,
          profile: message.expected,
        }),
      );
      next = parseProfileImport(
        JSON.stringify({
          schemaVersion: PROFILE_SCHEMA_VERSION,
          profile: message.next,
        }),
      );
    } catch {
      return Promise.resolve({ status: "invalid" });
    }
    const operation = queue
      .catch(() => undefined)
      .then(async (): Promise<WriteResult> => {
        try {
          const current = await repository.load();
          if (!profilesEqual(current, expected)) return { status: "conflict" };
          await repository.save(next);
          return { status: "saved" };
        } catch {
          return { status: "error" };
        }
      });
    queue = operation;
    return operation;
  };
}
