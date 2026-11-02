import { describe, expect, it, vi } from "vitest";

import type { Posting } from "./model";
import { POSTINGS_KEY } from "./repository";
import {
  createSavedPostingsReader,
  daysUntil,
  deadlineSummary,
  isUrgent,
  upcomingPostings,
} from "./saved-postings";

const kst = (value: string) => Date.parse(`${value}+09:00`);

function posting(id: string, deadline: number, extra: Partial<Posting> = {}) {
  return {
    id,
    version: 1,
    company: `예시 회사 ${id}`,
    role: "프론트엔드",
    url: `https://example.test/${id}`,
    deadline,
    timeZone: "Asia/Seoul",
    status: "planned",
    reminders: [],
    updatedAt: 1,
    ...extra,
  } satisfies Posting;
}

describe("daysUntil", () => {
  const now = kst("2026-11-02T10:00:00");

  it.each([
    ["later today", "2026-11-02T23:59:00", 0],
    ["tomorrow's first minute", "2026-11-03T00:00:00", 1],
    ["the last minute of day three", "2026-11-05T23:59:00", 3],
    ["the first minute of day four", "2026-11-06T00:00:00", 4],
  ])("counts Korean calendar days for %s", (_, deadline, days) => {
    expect(daysUntil(kst(deadline), now)).toBe(days);
  });

  it("changes day at Korean midnight, not at UTC midnight", () => {
    expect(
      daysUntil(kst("2026-11-03T00:00:00"), kst("2026-11-02T23:59:00")),
    ).toBe(1);
    expect(
      daysUntil(kst("2026-11-03T23:59:00"), kst("2026-11-03T00:00:00")),
    ).toBe(0);
    // Both instants fall on different UTC dates but the same Korean date.
    expect(
      daysUntil(kst("2026-11-02T09:01:00"), kst("2026-11-02T08:59:00")),
    ).toBe(0);
  });
});

describe("isUrgent", () => {
  const now = kst("2026-11-02T10:00:00");

  it("includes today through D-3 and excludes D-4", () => {
    expect(isUrgent(kst("2026-11-02T18:00:00"), now)).toBe(true);
    expect(isUrgent(kst("2026-11-05T23:59:00"), now)).toBe(true);
    expect(isUrgent(kst("2026-11-06T00:00:00"), now)).toBe(false);
  });
});

describe("upcomingPostings", () => {
  const now = kst("2026-11-02T10:00:00");

  it("sorts by the nearest deadline and drops past and completed postings", () => {
    const later = posting("later", kst("2026-11-08T12:00:00"));
    const today = posting("today", kst("2026-11-02T18:00:00"));
    const passedToday = posting("passed", kst("2026-11-02T09:59:00"));
    const atThisMoment = posting("moment", now);
    const completed = posting("done", kst("2026-11-03T12:00:00"), {
      status: "completed",
    });

    expect(
      upcomingPostings(
        [later, passedToday, completed, today, atThisMoment],
        now,
      ).map((row) => row.id),
    ).toEqual(["today", "later"]);
  });
});

describe("deadlineSummary", () => {
  it("shows the role and the deadline in Korean time", () => {
    expect(deadlineSummary(posting("a", kst("2026-11-03T17:00:00")))).toBe(
      "프론트엔드, 11월 3일 17시",
    );
  });

  it("omits an absent role", () => {
    expect(
      deadlineSummary(posting("a", kst("2026-11-03T17:00:00"), { role: "" })),
    ).toBe("11월 3일 17시");
  });

  it("writes Korean midnight as hour zero", () => {
    expect(deadlineSummary(posting("a", kst("2026-11-03T00:00:00")))).toBe(
      "프론트엔드, 11월 3일 0시",
    );
  });

  it("keeps the minutes of a deadline that is not on the hour", () => {
    expect(deadlineSummary(posting("a", kst("2026-11-03T16:32:00")))).toBe(
      "프론트엔드, 11월 3일 16시 32분",
    );
  });
});

describe("createSavedPostingsReader", () => {
  function reader(stored: unknown) {
    const listeners = new Set<
      (changes: Record<string, unknown>, area: string) => void
    >();
    return {
      listeners,
      reader: createSavedPostingsReader({
        storage: { get: async () => ({ [POSTINGS_KEY]: stored }) },
        onChanged: {
          addListener: (listener) => listeners.add(listener),
          removeListener: (listener) => listeners.delete(listener),
        },
      }),
    };
  }

  it("reads saved postings from storage", async () => {
    const saved = posting("a", kst("2026-11-03T17:00:00"));
    await expect(
      reader({ schemaVersion: 1, postings: [saved] }).reader.list(),
    ).resolves.toEqual([saved]);
  });

  it("treats a storage without postings as empty", async () => {
    await expect(reader(undefined).reader.list()).resolves.toEqual([]);
  });

  it("rejects an unreadable stored format", async () => {
    await expect(reader({ schemaVersion: 99 }).reader.list()).rejects.toThrow();
  });

  it("notifies only for changes to saved postings and stops after unsubscribe", () => {
    const { reader: saved, listeners } = reader(undefined);
    const listener = vi.fn();
    const unsubscribe = saved.subscribe(listener);
    const [changed] = listeners;

    changed!({ other: {} }, "local");
    changed!({ [POSTINGS_KEY]: {} }, "sync");
    expect(listener).not.toHaveBeenCalled();
    changed!({ [POSTINGS_KEY]: {} }, "local");
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
