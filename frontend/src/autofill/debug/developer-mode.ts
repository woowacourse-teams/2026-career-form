/**
 * 개발자 모드 설정.
 *
 * 자동 기입 중 상세 진행 화면과 Console 진단 로그를 보일지 정한다.
 * 개발자 빌드(`DEV` 또는 `VITE_AUTOFILL_DEBUG=true`)에서만 켤 수 있고,
 * 저장된 값이 없으면 개발자 빌드에서는 켜진 상태다. 일반 빌드는 저장값과
 * 관계없이 항상 꺼져 있다.
 *
 * "확인 필요 포함"은 실측용 개발자 설정이다. 저장값이 없으면 꺼져 있고,
 * 개발자 모드가 켜져 있을 때만 적용한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { setAutofillDebugDeveloperMode } from "./autofill-debug";

export const DEVELOPER_MODE_KEY = "careerForm.developerMode";
export const INCLUDE_NEEDS_REVIEW_KEY = "careerForm.includeNeedsReview";

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
  /** 이 빌드에서 저장값이 실제로 뜻하는 값. */
  resolve(stored: unknown): boolean;
  read(): Promise<boolean>;
  set(value: boolean): Promise<void>;
  subscribe(listener: (value: boolean) => void): () => void;
}

function createDeveloperSettingStore(
  key: string,
  resolve: (stored: unknown) => boolean,
  ports: DeveloperModePorts,
): DeveloperModeStore {
  return {
    initial: resolve(undefined),
    resolve,
    read: async () => {
      try {
        const stored = await ports.storage.get(key);
        return resolve(stored[key]);
      } catch {
        return resolve(undefined);
      }
    },
    set: (value) => ports.storage.set({ [key]: value }),
    subscribe: (listener) => {
      const changed: ChangeListener = (changes, area) => {
        if (area !== "local" || !(key in changes)) return;
        const change = changes[key];
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

export function createDeveloperModeStore(
  ports: DeveloperModePorts,
): DeveloperModeStore {
  return createDeveloperSettingStore(
    DEVELOPER_MODE_KEY,
    (stored) => ports.developerBuild && stored !== false,
    ports,
  );
}

export function createIncludeNeedsReviewStore(
  ports: DeveloperModePorts,
): DeveloperModeStore {
  return createDeveloperSettingStore(
    INCLUDE_NEEDS_REVIEW_KEY,
    (stored) => ports.developerBuild && stored === true,
    ports,
  );
}

const extensionPorts: DeveloperModePorts = {
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
};

export const developerModeStore = createDeveloperModeStore(extensionPorts);
export const includeNeedsReviewStore =
  createIncludeNeedsReviewStore(extensionPorts);

/** 실행 시점의 저장값을 읽어 이번 분석에 "확인 필요 포함"을 적용할지 정한다. */
export async function readIncludeNeedsReview(
  modeStore: DeveloperModeStore = developerModeStore,
  includeStore: DeveloperModeStore = includeNeedsReviewStore,
): Promise<boolean> {
  return (await modeStore.read()) && (await includeStore.read());
}

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
      setEnabled(store.resolve(value));
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
