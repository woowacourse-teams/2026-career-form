import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Posting, PostingEnvelope } from "./model";
import { POSTINGS_KEY } from "./repository";

const fake = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  startup: [] as Array<() => void>,
  installed: [] as Array<(details: { reason: string }) => void>,
  alarm: [] as Array<(alarm: { name: string }) => void>,
  create: vi.fn(async (_name: string, _info: { when: number }) => {}),
  clear: vi.fn(async (_name: string) => true),
}));
vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: async (key: string) =>
          key in fake.store ? { [key]: structuredClone(fake.store[key]) } : {},
        set: async (items: Record<string, unknown>) => {
          Object.assign(fake.store, structuredClone(items));
        },
      },
    },
    runtime: {
      id: "own",
      onStartup: { addListener: (l: () => void) => fake.startup.push(l) },
      onInstalled: {
        addListener: (l: (details: { reason: string }) => void) =>
          fake.installed.push(l),
      },
    },
    alarms: {
      create: fake.create,
      clear: fake.clear,
      onAlarm: {
        addListener: (l: (alarm: { name: string }) => void) =>
          fake.alarm.push(l),
      },
    },
    notifications: {
      getPermissionLevel: async () => "granted",
      create: vi.fn(async () => ""),
      clear: vi.fn(async () => true),
      onPermissionLevelChanged: { addListener: vi.fn() },
      onClicked: { addListener: vi.fn() },
      onButtonClicked: { addListener: vi.fn() },
    },
    tabs: { create: vi.fn() },
  },
}));
import { installPostingBackground } from "./background";

const ALARM = "careerForm.jobPostings.next";
const NOW = Date.parse("2026-11-16T03:00:00Z");
const HOUR = 3600000;

function posting(
  id: string,
  company: string,
  deadline: number,
  extra: Partial<Posting> = {},
): Posting {
  return {
    id,
    version: 1,
    company,
    role: "개발",
    url: `https://example.com/jobs/${id}`,
    deadline,
    timeZone: "Asia/Seoul",
    status: "planned",
    updatedAt: NOW - 72 * HOUR,
    reminders: [],
    ...extra,
  };
}
function seed(postings: Posting[]) {
  const envelope: PostingEnvelope = { schemaVersion: 1, postings };
  fake.store[POSTINGS_KEY] = structuredClone(envelope);
}
const companies = () =>
  (fake.store[POSTINGS_KEY] as PostingEnvelope | undefined)?.postings.map(
    (p) => p.company,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const key of Object.keys(fake.store)) delete fake.store[key];
  fake.startup.length = 0;
  fake.installed.length = 0;
  fake.alarm.length = 0;
  fake.create.mockClear();
  fake.clear.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

it("업데이트 뒤 서비스워커의 첫 점검에서 이전 버전이 남긴 마감 지난 지원 예정 공고를 지운다", async () => {
  const open = posting("open", "남은 회사", NOW + 48 * HOUR, {
    reminders: [{ minutes: 1440, at: NOW + 24 * HOUR, state: "pending" }],
  });
  seed([
    posting("stale", "지난 회사", NOW - HOUR, {
      reminders: [{ minutes: 120, at: NOW - 3 * HOUR, state: "skipped" }],
    }),
    posting("done", "완료 회사", NOW - HOUR, { status: "completed" }),
    open,
  ]);
  installPostingBackground();
  await vi.waitFor(() =>
    expect(companies()).toEqual(["완료 회사", "남은 회사"]),
  );
  await vi.waitFor(() =>
    expect(fake.create).toHaveBeenLastCalledWith(ALARM, {
      when: NOW + 24 * HOUR,
    }),
  );
});

it("업데이트 설치 알림이 오면 다시 점검해 마감 지난 지원 예정 공고를 지운다", async () => {
  installPostingBackground();
  await vi.waitFor(() => expect(fake.clear).toHaveBeenCalledWith(ALARM));
  seed([posting("stale", "지난 회사", NOW - HOUR)]);
  for (const listener of fake.installed) listener({ reason: "update" });
  await vi.waitFor(() => expect(companies()).toEqual([]));
});

it("마감 시각 알람이 울리면 화면을 열지 않아도 저장소에서 지우고 남은 예약을 지운다", async () => {
  const deadline = NOW + HOUR;
  seed([posting("soon", "곧 마감 회사", deadline)]);
  installPostingBackground();
  await vi.waitFor(() =>
    expect(fake.create).toHaveBeenLastCalledWith(ALARM, { when: deadline }),
  );
  expect(companies()).toEqual(["곧 마감 회사"]);
  fake.clear.mockClear();
  vi.setSystemTime(deadline);
  for (const listener of fake.alarm) listener({ name: ALARM });
  await vi.waitFor(() => expect(companies()).toEqual([]));
  await vi.waitFor(() => expect(fake.clear).toHaveBeenCalledWith(ALARM));
});
