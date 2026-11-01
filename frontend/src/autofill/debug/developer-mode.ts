/**
 * 개발자 모드 설정.
 *
 * 자동 기입 중 상세 진행 화면과 Console 진단 로그를 보일지 정한다.
 * 개발자 빌드(`DEV` 또는 `VITE_AUTOFILL_DEBUG=true`)에서만 켤 수 있고,
 * 저장된 값이 없으면 개발자 빌드에서는 켜진 상태다. 일반 빌드는 저장값과
 * 관계없이 항상 꺼져 있다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { setAutofillDebugDeveloperMode } from "./autofill-debug";

export const DEVELOPER_MODE_KEY = "careerForm.developerMode";

export function isDeveloperBuild(env: {
  DEV?: boolean;
  VITE_AUTOFILL_DEBUG?: string;
}): boolean {
  return env.DEV === true || env.VITE_AUTOFILL_DEBUG === "true";
}

type ChangeListener = (changes: Record<string, unknown>, area: string) => void;

interface DeveloperModePorts {
  developerBuild: boolean;
  storage: {
    get(key: string): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
  };
  onChanged: {
    addListener(listener: ChangeListener): void;
    removeListener(listener: ChangeListener): void;
  };
}

export interface DeveloperModeStore {
  /** 개발자 빌드 여부만으로 정해지는, 저장값을 읽기 전의 값. */
  readonly initial: boolean;
  read(): Promise<boolean>;
  set(value: boolean): Promise<void>;
  subscribe(listener: (value: boolean) => void): () => void;
}

export function createDeveloperModeStore(
  ports: DeveloperModePorts,
): DeveloperModeStore {
  const resolve = (stored: unknown) => ports.developerBuild && stored !== false;
  return {
    initial: ports.developerBuild,
    read: async () => {
      try {
        const stored = await ports.storage.get(DEVELOPER_MODE_KEY);
        return resolve(stored[DEVELOPER_MODE_KEY]);
      } catch {
        return resolve(undefined);
      }
    },
    set: (value) => ports.storage.set({ [DEVELOPER_MODE_KEY]: value }),
    subscribe: (listener) => {
      const changed: ChangeListener = (changes, area) => {
        if (area !== "local" || !(DEVELOPER_MODE_KEY in changes)) return;
        const change = changes[DEVELOPER_MODE_KEY];
        listener(
          resolve(
            typeof change === "object" && change !== null
              ? (change as { newValue?: unknown }).newValue
              : undefined,
          ),
        );
      };
      ports.onChanged.addListener(changed);
      return () => ports.onChanged.removeListener(changed);
    },
  };
}

export const developerModeStore: DeveloperModeStore = createDeveloperModeStore({
  developerBuild: isDeveloperBuild(import.meta.env),
  storage: {
    get: (key) => browser.storage.local.get(key),
    set: (values) => browser.storage.local.set(values),
  },
  onChanged: {
    addListener: (listener) => {
      try {
        browser.storage.onChanged.addListener(listener);
      } catch {
        /* Extension storage is unavailable here. */
      }
    },
    removeListener: (listener) => {
      try {
        browser.storage.onChanged.removeListener(listener);
      } catch {
        /* Extension storage is unavailable here. */
      }
    },
  },
});

export function useDeveloperMode(
  store: DeveloperModeStore = developerModeStore,
): readonly [boolean, (value: boolean) => Promise<void>] {
  const [enabled, setEnabled] = useState(store.initial);
  // 초기 읽기가 끝나기 전에 사용자가 바꾼 값을 오래된 읽기 결과가 덮어쓰지 않게 한다.
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    const startedAt = revision.current;
    void store.read().then((value) => {
      if (active && revision.current === startedAt) setEnabled(value);
    });
    const unsubscribe = store.subscribe((value) => {
      revision.current += 1;
      if (active) setEnabled(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [store]);
  const update = useCallback(
    async (value: boolean) => {
      revision.current += 1;
      await store.set(value);
      setEnabled(store.initial && value);
    },
    [store],
  );
  return [enabled, update];
}

/** 콘텐츠 스크립트 시작 시 저장된 개발자 모드를 Console 진단에 반영한다. */
export function syncAutofillDebugWithDeveloperMode(
  store: DeveloperModeStore = developerModeStore,
): () => void {
  void store.read().then(setAutofillDebugDeveloperMode);
  return store.subscribe(setAutofillDebugDeveloperMode);
}
