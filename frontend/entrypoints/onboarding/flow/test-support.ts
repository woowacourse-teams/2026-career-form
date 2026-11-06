import { vi } from "vitest";
import type { PushClient } from "../../../src/job-postings/push-client";
import type { PushStateView } from "../../../src/job-postings/push-messages";
import { createEmptyProfile, type Profile } from "../../../src/profile/model";
import type { ProfileRepository } from "../../../src/profile/profile-repository";
import type { OnboardingStep, StepStore } from "./steps";

export function createRepository(
  initial: Profile = createEmptyProfile(),
): ProfileRepository {
  let profile = initial;
  return {
    load: async () => structuredClone(profile),
    save: async (next) => {
      profile = structuredClone(next);
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
}

export function createStepMemory(initial?: OnboardingStep) {
  let step = initial;
  const written: OnboardingStep[] = [];
  const store: StepStore = {
    read: async () => step,
    write: async (next) => {
      step = next;
      written.push(next);
    },
  };
  return { store, written };
}

export const registeredState: PushStateView = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: 1, attempts: 0 },
  permission: "granted",
  visibility: { result: "unknown" },
  unread: 0,
  roles: [],
};

export const categoriesView = {
  categories: {
    version: 1,
    categories: [
      {
        code: "IT",
        label: "IT/개발",
        roles: [
          { code: "IT.BACKEND", label: "백엔드" },
          { code: "IT.FRONTEND", label: "프론트엔드" },
        ],
      },
      {
        code: "DESIGN",
        label: "디자인",
        roles: [{ code: "DESIGN.UX_UI", label: "UX/UI" }],
      },
    ],
  },
  error: null,
};

export function createPushClient(initial: PushStateView = registeredState) {
  let state = initial;
  const client = {
    state: vi.fn(async () => state),
    setEnabled: vi.fn(async (enabled: boolean) => {
      state = { ...state, enabled };
      return state;
    }),
    test: vi.fn(async () => state),
    record: vi.fn(async (answer: "seen" | "not_seen") => {
      state = {
        ...state,
        visibility: { result: answer, checkedAt: 1, source: "test" },
      };
      return state;
    }),
    later: vi.fn(async () => state),
    setRoles: vi.fn(async (roles: readonly string[]) => {
      state = { ...state, roles: [...roles] };
      return state;
    }),
    inbox: vi.fn(async () => []),
    categories: vi.fn(async () => categoriesView),
    subscribe: vi.fn(() => () => {}),
  } satisfies PushClient;
  return client;
}
