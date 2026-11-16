import { describe, expect, it, vi } from "vitest";
import {
  EXPIRED_REVERT_MESSAGE,
  PostingService,
  type ReminderDelivery,
} from "./service";
import type { Posting, PostingInput } from "./model";

function setup() {
  let now = Date.parse("2026-10-06T06:00:00Z");
  let data: Posting[] = [];
  let next: number | undefined;
  let permission = true;
  let failSchedule = false;
  let failSave = false;
  let failSend = false;
  const sent: ReminderDelivery[] = [];
  let seq = 0;
  const repository = {
    load: async () => structuredClone(data),
    save: async (p: Posting[]) => {
      if (failSave) throw Error("disk");
      data = structuredClone(p);
    },
  };
  const ports = {
    now: () => now,
    id: () => `job-${++seq}`,
    permission: async () => permission,
    schedule: async (at: number | undefined) => {
      if (failSchedule) throw Error("alarms");
      next = at;
    },
    notify: async (delivery: ReminderDelivery) => {
      if (failSend) throw Error("notification");
      sent.push(delivery);
    },
    clearNotification: async () => {},
  };
  const service = new PostingService(repository, ports);
  const input: PostingInput = {
    company: "예시",
    role: "개발",
    url: "https://example.com/jobs",
    deadline: now + 30 * 3600000,
    timeZone: "Asia/Seoul",
    minutes: [1440, 120],
  };
  return {
    service,
    input,
    sent,
    repository,
    ports,
    get next() {
      return next;
    },
    advance: (ms: number) => {
      now += ms;
    },
    permission: (allowed: boolean) => {
      permission = allowed;
    },
    failSchedule: (v: boolean) => {
      failSchedule = v;
    },
    failSave: (v: boolean) => {
      failSave = v;
    },
    failSend: (v: boolean) => {
      failSend = v;
    },
  };
}
describe("공고 알림 서비스", () => {
  it.each([1, 90, 1440])(
    "%i분 전 알림은 짧은 마감 시각과 지원 행동 문구만 표시한다",
    async (minutes) => {
      const s = setup();
      await s.service.save({ ...s.input, minutes: [minutes] });
      s.advance(30 * 3600000 - minutes * 60000);
      await s.service.recover();
      expect(s.sent[0].title).toBe(
        `${minutes <= 60 ? "🚨" : "⏰"} 예시 (~10/7 21:00)`,
      );
      expect(s.sent[0].message).not.toContain("한국 시간");
      expect(s.sent[0].message).toBe("\n지금 바로 지원하기 →");
    },
  );
  it("다음 해 마감은 짧은 날짜 앞에 연도를 남긴다", async () => {
    const s = setup();
    const deadline = Date.parse("2027-01-01T00:30:00+09:00");
    await s.service.save({ ...s.input, deadline, minutes: [120] });
    s.advance(deadline - 120 * 60000 - Date.parse("2026-10-06T06:00:00Z"));
    await s.service.recover();
    expect(s.sent[0].title).toBe("⏰ 예시 (~2027/1/1 00:30)");
  });
  it("미래 알림을 예약하고 재시작에서 사라진 예약을 복구한다", async () => {
    const s = setup();
    await s.service.save(s.input);
    expect(s.next).toBe(s.input.deadline - 1440 * 60000);
    await new PostingService(s.repository, s.ports).recover();
    expect(s.sent).toHaveLength(0);
    expect(s.next).toBe(s.input.deadline - 1440 * 60000);
  });
  it("놓친 여러 알림을 한 번으로 묶고 반복 복구에서 다시 보내지 않는다", async () => {
    const s = setup();
    await s.service.save(s.input);
    s.advance(29 * 3600000);
    await Promise.all([s.service.recover(), s.service.recover()]);
    await new PostingService(s.repository, s.ports).recover();
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].message).toBe("\n지금 바로 지원하기 →");
    expect(s.sent[0].title).toBe("🚨 예시 (~10/7 21:00)");
    expect(s.sent[0].message).not.toContain("한국 시간");
    // No reminder is left, so the next wake-up is the deadline cleanup.
    expect(s.next).toBe(s.input.deadline);
  });
  it("마감 시각이 되면 사전 알림 없이 지원 예정 공고를 저장소에서 지운다", async () => {
    const s = setup();
    await s.service.save(s.input);
    s.advance(30 * 3600000);
    await s.service.recover();
    expect(s.sent).toHaveLength(0);
    expect(await s.repository.load()).toEqual([]);
    expect(s.next).toBeUndefined();
  });
  it.each(["complete", "remove"])(
    "%s 후 대기 중인 알림 이벤트는 보내지 않는다",
    async (action) => {
      const s = setup();
      const result = await s.service.save(s.input);
      const p = result.postings[0];
      s.advance(7 * 3600000);
      if (action === "complete")
        await s.service.setCompleted(p.id, p.version, true);
      else await s.service.remove(p.id, p.version);
      await s.service.recover();
      expect(s.sent).toHaveLength(0);
      expect(s.next).toBeUndefined();
    },
  );
  it("완료 되돌리기는 지난 알림을 재생하지 않고 미래 알림만 복원한다", async () => {
    const s = setup();
    const p = (await s.service.save(s.input)).postings[0];
    await s.service.setCompleted(p.id, 1, true);
    s.advance(7 * 3600000);
    await s.service.setCompleted(p.id, 2, false);
    await s.service.recover();
    expect(s.sent).toHaveLength(0);
    expect(s.next).toBe(s.input.deadline - 120 * 60000);
  });
  it("상태가 바뀐 뒤 이전 버전의 변경을 거부하고 알림을 발송하지 않는다", async () => {
    const s = setup();
    const p = (await s.service.save(s.input)).postings[0];
    await s.service.setCompleted(p.id, 1, true);
    await expect(s.service.setCompleted(p.id, 1, false)).rejects.toThrow(
      "변경",
    );
    await expect(s.service.remove(p.id, 1)).rejects.toThrow("변경");
    s.advance(7 * 3600000);
    await s.service.recover();
    expect(s.sent).toHaveLength(0);
  });
  it("저장 실패는 예약이나 알림 상태를 변경하지 않는다", async () => {
    const s = setup();
    s.failSave(true);
    await expect(s.service.save(s.input)).rejects.toThrow();
    expect(s.next).toBeUndefined();
    expect(s.sent).toHaveLength(0);
  });
  it("예약 실패여도 저장 성공을 보존하고 재시도로 복구한다", async () => {
    const s = setup();
    s.failSchedule(true);
    const result = await s.service.save(s.input);
    expect(result.postings).toHaveLength(1);
    expect(result.problems).toContain("schedule");
    s.failSchedule(false);
    expect((await s.service.recover()).problems).not.toContain("schedule");
  });
  it("차단된 알림을 발송 완료로 표시하지 않고 설정 복구 뒤 재시도한다", async () => {
    const s = setup();
    await s.service.save(s.input);
    s.permission(false);
    s.advance(7 * 3600000);
    expect((await s.service.recover()).problems).toContain("permission");
    expect(s.sent).toHaveLength(0);
    s.permission(true);
    await s.service.recover();
    expect(s.sent).toHaveLength(1);
  });
  it("알림 표시 실패를 기록하고 재시도한다", async () => {
    const s = setup();
    await s.service.save(s.input);
    s.advance(7 * 3600000);
    s.failSend(true);
    expect((await s.service.recover()).problems).toContain("notification");
    s.failSend(false);
    await s.service.recover();
    expect(s.sent).toHaveLength(1);
  });
  it("병렬 등록을 직렬화해 다른 공고를 덮어쓰지 않는다", async () => {
    const s = setup();
    await Promise.all([
      s.service.save(s.input),
      s.service.save({ ...s.input, company: "다른 예시" }),
    ]);
    expect((await s.service.list()).postings).toHaveLength(2);
  });
});

it("늦은 알림의 전달 시각을 저장해 목록에서 놓친 일정으로 확인할 수 있다", async () => {
  const s = setup();
  await s.service.save(s.input);
  s.advance(29 * 3600000);
  await s.service.recover();
  const p = (await s.service.list()).postings[0];
  expect(
    p.reminders.every((r) => r.deliveredAt === s.input.deadline - 3600000),
  ).toBe(true);
});

it("복구 시 가까운 미래 알림을 임의로 1분 뒤로 미루지 않는다", async () => {
  const s = setup();
  await s.service.save(s.input);
  s.advance(6 * 3600000 - 10000);
  await s.service.recover();
  expect(s.next).toBe(s.input.deadline - 1440 * 60000);
});
describe("마감 지난 지원 예정 공고 정리", () => {
  it("화면을 열면 마감 지난 지원 예정 공고를 저장소와 목록에서 뺀다", async () => {
    const s = setup();
    await s.service.save(s.input);
    s.advance(31 * 3600000);
    expect((await s.service.list()).postings).toEqual([]);
    expect(await s.repository.load()).toEqual([]);
    expect(s.next).toBeUndefined();
  });
  it("지울 공고가 없으면 목록을 읽기만 하고 예약도 바꾸지 않는다", async () => {
    const s = setup();
    await s.service.save(s.input);
    const done = (
      await s.service.save({
        ...s.input,
        company: "완료 회사",
        deadline: s.ports.now() + 2 * 3600000,
        minutes: [],
      })
    ).postings[1];
    await s.service.setCompleted(done.id, done.version, true);
    s.advance(3 * 3600000);
    const save = vi.spyOn(s.repository, "save");
    const schedule = vi.spyOn(s.ports, "schedule");
    expect((await s.service.list()).postings).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
  it("지울 공고도 보낼 알림도 없으면 점검은 저장소에 쓰지 않는다", async () => {
    const s = setup();
    await s.service.save(s.input);
    const save = vi.spyOn(s.repository, "save");
    await s.service.recover();
    expect(save).not.toHaveBeenCalled();
  });
  it("이전 버전에서 마감 지남에 쌓인 공고는 새 워커의 첫 점검에서 지우고 지원 완료와 마감 전 공고는 남긴다", async () => {
    const s = setup();
    const [stale] = (await s.service.save(s.input)).postings;
    const done = (await s.service.save({ ...s.input, company: "완료 회사" }))
      .postings[1];
    await s.service.setCompleted(done.id, done.version, true);
    const open = {
      ...s.input,
      company: "남은 회사",
      deadline: s.input.deadline + 10 * 3600000,
      minutes: [600],
    };
    await s.service.save(open);
    // Shaped like a posting the previous version left in the 마감 지남 tab.
    const legacy: Posting = {
      ...stale,
      id: "legacy",
      company: "옛 회사",
      url: "https://example.com/old",
      reminders: stale.reminders.map((r, i) => ({
        ...r,
        state: i === 0 ? "sent" : "skipped",
        ...(i === 0 ? { deliveredAt: r.at } : {}),
      })),
    };
    await s.repository.save([...(await s.repository.load()), legacy]);
    s.advance(31 * 3600000);
    await new PostingService(s.repository, s.ports).recover();
    const left = await s.repository.load();
    expect(left.map((p) => p.company)).toEqual(["완료 회사", "남은 회사"]);
    expect(left[0]).toMatchObject({ status: "completed", version: 2 });
    expect(left[1]).toMatchObject({ status: "planned", version: 1 });
    expect(left[1].reminders[0].state).toBe("sent");
    expect(s.sent.map((d) => d.title)).toEqual([
      expect.stringContaining("남은 회사"),
    ]);
    expect(s.next).toBe(open.deadline);
  });
  it("지원 완료 공고는 마감이 지나도 남기고 깨우기 예약에 넣지 않는다", async () => {
    const s = setup();
    const p = (await s.service.save(s.input)).postings[0];
    await s.service.setCompleted(p.id, 1, true);
    s.advance(31 * 3600000);
    await s.service.recover();
    expect((await s.service.list()).postings).toMatchObject([
      { id: p.id, status: "completed", version: 2 },
    ]);
    expect(s.next).toBeUndefined();
  });
  it("알림 없는 지원 예정 공고도 마감 시각에 깨워 지운다", async () => {
    const s = setup();
    await s.service.save({ ...s.input, minutes: [] });
    expect(s.next).toBe(s.input.deadline);
    s.advance(30 * 3600000);
    await s.service.recover();
    expect(await s.repository.load()).toEqual([]);
    expect(s.next).toBeUndefined();
  });
  it("지운 공고의 알림 시각과 마감은 다음 알람에 남지 않는다", async () => {
    const s = setup();
    await s.service.save(s.input);
    const later = {
      ...s.input,
      company: "다음 회사",
      deadline: s.input.deadline + 48 * 3600000,
      minutes: [1440],
    };
    await s.service.save(later);
    s.advance(31 * 3600000);
    await s.service.recover();
    expect(s.sent).toHaveLength(0);
    expect((await s.repository.load()).map((p) => p.company)).toEqual([
      "다음 회사",
    ]);
    expect(s.next).toBe(later.deadline - 1440 * 60000);
  });
  it("마감이 지난 뒤 정리 전에 다른 공고를 저장하면 1분 뒤 다시 점검해 지운다", async () => {
    const s = setup();
    await s.service.save({ ...s.input, minutes: [] });
    s.advance(31 * 3600000);
    const other = {
      ...s.input,
      company: "새 회사",
      deadline: s.ports.now() + 30 * 3600000,
    };
    await s.service.save(other);
    expect(s.next).toBe(s.ports.now() + 60000);
    s.advance(60000);
    await s.service.recover();
    expect((await s.repository.load()).map((p) => p.company)).toEqual([
      "새 회사",
    ]);
    expect(s.next).toBe(other.deadline - 1440 * 60000);
  });
  it("마감 직후 정리 전에 누른 지원 완료는 유지한다", async () => {
    const s = setup();
    const p = (await s.service.save(s.input)).postings[0];
    s.advance(30 * 3600000 + 1);
    await s.service.setCompleted(p.id, 1, true);
    await s.service.recover();
    expect((await s.service.list()).postings).toMatchObject([
      { id: p.id, status: "completed" },
    ]);
  });
  it("마감이 지난 지원 완료 공고는 지원 예정으로 되돌리지 않고 저장소를 바꾸지 않는다", async () => {
    const s = setup();
    const p = (await s.service.save(s.input)).postings[0];
    await s.service.setCompleted(p.id, 1, true);
    s.advance(30 * 3600000);
    const before = await s.repository.load();
    await expect(s.service.setCompleted(p.id, 2, false)).rejects.toThrow(
      EXPIRED_REVERT_MESSAGE,
    );
    expect(await s.repository.load()).toEqual(before);
    await s.service.recover();
    expect((await s.service.list()).postings).toMatchObject([
      { id: p.id, status: "completed", version: 2 },
    ]);
  });
  it("정리 저장에 실패해도 목록을 돌려주고 1분 뒤 다시 점검한다", async () => {
    const s = setup();
    await s.service.save(s.input);
    s.advance(31 * 3600000);
    s.failSave(true);
    expect((await s.service.list()).postings).toHaveLength(1);
    expect(s.next).toBe(s.ports.now() + 60000);
    s.failSave(false);
    s.advance(60000);
    await s.service.recover();
    expect(await s.repository.load()).toEqual([]);
  });
  it("정리 저장에 실패해도 다른 공고의 알림은 보낸다", async () => {
    const s = setup();
    await s.service.save({ ...s.input, minutes: [] });
    await s.service.save({
      ...s.input,
      company: "다음 회사",
      deadline: s.input.deadline + 2 * 3600000,
      minutes: [120],
    });
    s.advance(31 * 3600000);
    s.failSave(true);
    await expect(s.service.recover()).rejects.toThrow();
    expect(s.sent.map((d) => d.title)).toEqual([
      expect.stringContaining("다음 회사"),
    ]);
    expect(s.next).toBe(s.ports.now() + 60000);
  });
  it("알림을 보내는 사이 마감이 지난 공고에는 늦은 알림을 보내지 않고 1분 뒤 지운다", async () => {
    const s = setup();
    await s.service.save({ ...s.input, minutes: [120] });
    const closing = {
      ...s.input,
      company: "곧 마감 회사",
      deadline: s.ports.now() + 28.5 * 3600000,
      minutes: [60],
    };
    await s.service.save(closing);
    s.advance(28.5 * 3600000 - 1000);
    const notify = s.ports.notify;
    s.ports.notify = async (delivery) => {
      s.advance(2000);
      await notify(delivery);
    };
    await s.service.recover();
    expect(s.sent.map((d) => d.title)).toEqual([
      expect.stringContaining("예시"),
    ]);
    expect(s.next).toBe(s.ports.now() + 60000);
    s.advance(60000);
    await s.service.recover();
    expect((await s.repository.load()).map((p) => p.company)).toEqual(["예시"]);
    expect(s.next).toBe(s.input.deadline);
  });
});
it("발송 뒤 처리 기록 저장에 실패해도 다음 복구 기회를 예약한다", async () => {
  const s = setup();
  await s.service.save(s.input);
  s.advance(7 * 3600000);
  s.failSave(true);
  await expect(s.service.recover()).rejects.toThrow();
  expect(s.next).toBe(s.ports.now() + 60000);
  expect((await s.service.list()).problems).toContain("notification");
});
