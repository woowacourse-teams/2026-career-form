import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEVELOPER_MODE_KEY,
  createDeveloperModeStore,
  isDeveloperBuild,
  syncAutofillDebugWithDeveloperMode,
  useDeveloperMode,
} from "./developer-mode";
import {
  isAutofillDebugEnabled,
  setAutofillDebugDeveloperMode,
  setAutofillDebugEnabled,
} from "./autofill-debug";

type Listener = (changes: Record<string, unknown>, area: string) => void;

function fakeStore(initial?: unknown, developerBuild = true) {
  const data: Record<string, unknown> =
    initial === undefined ? {} : { [DEVELOPER_MODE_KEY]: initial };
  const listeners = new Set<Listener>();
  const emit = (newValue: unknown) => {
    data[DEVELOPER_MODE_KEY] = newValue;
    listeners.forEach((listener) =>
      listener({ [DEVELOPER_MODE_KEY]: { newValue } }, "local"),
    );
  };
  const store = createDeveloperModeStore({
    developerBuild,
    storage: {
      get: async (key) => (key in data ? { [key]: data[key] } : {}),
      set: async (values) => {
        Object.assign(data, values);
        emit(values[DEVELOPER_MODE_KEY]);
      },
    },
    onChanged: {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
    },
  });
  return { store, data, emit, listeners };
}

afterEach(() => {
  setAutofillDebugEnabled(false);
  setAutofillDebugDeveloperMode(true);
});

describe("isDeveloperBuild", () => {
  it("is true for a dev server or the debug flag only", () => {
    expect(isDeveloperBuild({ DEV: true })).toBe(true);
    expect(isDeveloperBuild({ VITE_AUTOFILL_DEBUG: "true" })).toBe(true);
    expect(isDeveloperBuild({ DEV: false })).toBe(false);
    expect(isDeveloperBuild({ DEV: false, VITE_AUTOFILL_DEBUG: "false" })).toBe(
      false,
    );
    expect(isDeveloperBuild({})).toBe(false);
  });
});

describe("developer mode store", () => {
  it("is OFF in a non-developer build even when ON is stored", async () => {
    const { store } = fakeStore(true, false);
    expect(await store.read()).toBe(false);
  });

  it("defaults to ON in a developer build when nothing is stored", async () => {
    expect(await fakeStore(undefined).store.read()).toBe(true);
  });

  it("is OFF when OFF is stored in a developer build", async () => {
    expect(await fakeStore(false).store.read()).toBe(false);
  });

  it("persists the setter under one storage key", async () => {
    const { store, data } = fakeStore();
    await store.set(false);
    expect(data[DEVELOPER_MODE_KEY]).toBe(false);
    expect(await store.read()).toBe(false);
  });

  it("notifies subscribers on storage change and stops after unsubscribe", async () => {
    const { store, emit, listeners } = fakeStore();
    const seen: boolean[] = [];
    const unsubscribe = store.subscribe((value) => seen.push(value));
    emit(false);
    emit(true);
    expect(seen).toEqual([false, true]);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it("ignores changes to other storage keys and areas", () => {
    const { store, listeners } = fakeStore();
    const seen: boolean[] = [];
    store.subscribe((value) => seen.push(value));
    const [listener] = [...listeners];
    listener!({ other: { newValue: false } }, "local");
    listener!({ [DEVELOPER_MODE_KEY]: { newValue: false } }, "sync");
    expect(seen).toEqual([]);
  });
});

describe("useDeveloperMode", () => {
  it("starts from the build default, loads the stored value and live-updates", async () => {
    const { store, emit } = fakeStore(false);
    const { result } = renderHook(() => useDeveloperMode(store));
    expect(result.current[0]).toBe(true);
    await waitFor(() => expect(result.current[0]).toBe(false));
    act(() => emit(true));
    expect(result.current[0]).toBe(true);
  });

  it("stays OFF in a non-developer build", async () => {
    const { store } = fakeStore(true, false);
    const { result } = renderHook(() => useDeveloperMode(store));
    expect(result.current[0]).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current[0]).toBe(false);
  });

  it("exposes a setter that persists", async () => {
    const { store, data } = fakeStore();
    const { result } = renderHook(() => useDeveloperMode(store));
    await act(async () => {
      await result.current[1](false);
    });
    expect(data[DEVELOPER_MODE_KEY]).toBe(false);
    expect(result.current[0]).toBe(false);
  });
});

describe("console diagnostics follow developer mode", () => {
  it("turns diagnostics off while stored OFF and back on when ON", async () => {
    setAutofillDebugEnabled(true);
    expect(isAutofillDebugEnabled()).toBe(true);
    const { store, emit } = fakeStore(false);
    const stop = syncAutofillDebugWithDeveloperMode(store);
    await waitFor(() => expect(isAutofillDebugEnabled()).toBe(false));
    emit(true);
    expect(isAutofillDebugEnabled()).toBe(true);
    stop();
  });

  it("never enables diagnostics the build gate has disabled", () => {
    setAutofillDebugEnabled(false);
    setAutofillDebugDeveloperMode(true);
    expect(isAutofillDebugEnabled()).toBe(false);
  });
});
