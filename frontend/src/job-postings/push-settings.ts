export const PUSH_AUTO_SAVE_KEY = "careerForm.push.autoSave";

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
export interface AutoSaveSetting {
  read(): Promise<boolean>;
  write(enabled: boolean): Promise<void>;
}
// "Save a deadline reminder when a posting is opened": on by default,
// independent of the push subscription switch.
export function createAutoSaveSetting(storage: StorageArea): AutoSaveSetting {
  return {
    read: async () =>
      (await storage.get(PUSH_AUTO_SAVE_KEY))[PUSH_AUTO_SAVE_KEY] !== false,
    write: async (enabled) => {
      await storage.set({ [PUSH_AUTO_SAVE_KEY]: enabled });
    },
  };
}
