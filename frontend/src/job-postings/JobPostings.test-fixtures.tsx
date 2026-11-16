// Shared page setup for the JobPostings test files.
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { JobPostings } from "./JobPostings";
import type { JobCategoriesView } from "./job-roles";
import type { Posting } from "./model";
import { PostingService } from "./service";
import type { ServerPosting } from "./push-api";
import type { PushClient } from "./push-client";
import type { PushStateView } from "./push-messages";

export const NOW = Date.parse("2026-10-06T06:00Z");
export const kst = (value: string) => Date.parse(`${value}+09:00`);
export const seenState: PushStateView = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: NOW, attempts: 0 },
  permission: "granted",
  visibility: { result: "seen", checkedAt: NOW, source: "test" },
  unread: 0,
  roles: [],
};
export const categoriesView: JobCategoriesView = {
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
export function setup(
  options: {
    inbox?: () => Promise<ServerPosting[]>;
    pushState?: PushStateView;
    categories?: () => Promise<JobCategoriesView>;
    /** Report storage writes to subscribers like chrome.storage.onChanged. */
    live?: boolean;
  } = {},
) {
  let rows: Posting[] = [];
  let failure: Error | undefined;
  let clock = NOW;
  let seq = 0;
  let writes = 0;
  const listeners = new Set<() => void>();
  const service = new PostingService(
    {
      load: async () => structuredClone(rows),
      save: async (next) => {
        if (failure) throw failure;
        rows = structuredClone(next);
        writes++;
        if (options.live)
          queueMicrotask(() => listeners.forEach((listener) => listener()));
      },
    },
    {
      now: () => clock,
      id: () => `id-${seq++}`,
      permission: async () => true,
      schedule: async () => {},
      notify: async () => {},
      clearNotification: async () => {},
    },
  );
  const client = {
    list: () => service.list(),
    save: service.save.bind(service),
    setCompleted: service.setCompleted.bind(service),
    remove: service.remove.bind(service),
    retry: () => service.recover(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const inbox: ServerPosting[] = [];
  let pushState = options.pushState ?? seenState;
  // Default: a backend without the category API (older than CF-394).
  const categories: () => Promise<JobCategoriesView> =
    options.categories ??
    (async () => ({ categories: null, error: "ENDPOINT_UNAVAILABLE" }));
  const pushClient = {
    state: vi.fn(async () => pushState),
    setEnabled: vi.fn(async (enabled: boolean) => ({ ...pushState, enabled })),
    test: vi.fn(async () => pushState),
    record: vi.fn(async () => pushState),
    later: vi.fn(async () => pushState),
    setRoles: vi.fn(async (roles: readonly string[]) => {
      pushState = { ...pushState, roles: [...roles] };
      return pushState;
    }),
    inbox: vi.fn(options.inbox ?? (async () => [...inbox])),
    categories: vi.fn(categories),
    subscribe: () => () => {},
  } satisfies PushClient;
  return {
    client,
    pushClient,
    inbox,
    failWith: (error?: Error) => {
      failure = error;
    },
    /** One clock for the service and the page. */
    now: () => clock,
    setNow: (at: number) => {
      clock = at;
    },
    /** Storage as written, bypassing list() and its own cleanup. */
    stored: () => structuredClone(rows),
    seed: (next: Posting[]) => {
      rows = structuredClone(next);
    },
    writes: () => writes,
  };
}
export function inboxPosting(
  company = "공지 회사",
  extra: Partial<ServerPosting> = {},
): ServerPosting {
  return {
    id: "a".repeat(32),
    company,
    role: "데이터",
    link: "https://careers.example.test/jobs/notice",
    opensAt: NOW - 3600000,
    closesAt: NOW + 3 * 86400000,
    ...extra,
  };
}
export const savedInput = (
  company: string,
  extra: { deadline?: number } = {},
) => ({
  company,
  role: "개발",
  url: `https://example.test/jobs/${encodeURIComponent(company)}`,
  deadline: extra.deadline ?? Date.parse("2026-10-08T18:00Z"),
  timeZone: "Asia/Seoul",
  minutes: [],
});
export const basePosting: Posting = {
  id: "future",
  version: 1,
  company: "다가올 회사",
  role: "개발",
  url: "https://example.com/jobs",
  deadline: NOW + 3600000,
  timeZone: "Asia/Seoul",
  status: "planned",
  updatedAt: NOW,
  reminders: [{ minutes: 30, at: NOW + 1800000, state: "pending" }],
};
export function renderPage(
  env: ReturnType<typeof setup>,
  props: {
    track?: (...args: unknown[]) => void;
    now?: number;
    openSettings?: boolean;
    onSettingsOpened?: () => void;
  } = {},
) {
  return render(
    <JobPostings
      client={env.client}
      pushClient={env.pushClient}
      now={() => props.now ?? env.now()}
      track={props.track ?? (() => undefined)}
      openSettings={props.openSettings}
      onSettingsOpened={props.onSettingsOpened}
    />,
  );
}
export const tab = (name: RegExp | string) => screen.getByRole("tab", { name });
export const panel = () => screen.getByRole("tabpanel");
