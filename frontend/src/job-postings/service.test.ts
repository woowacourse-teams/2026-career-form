import { describe, expect, it } from "vitest";
import { PostingService, type ReminderDelivery } from "./service";
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
    expect(s.sent[0].message).toContain("2026");
    expect(s.sent[0].title).toContain("1시간");
    expect(s.next).toBeUndefined();
  });
  it("이미 마감됐으면 사전 알림을 보내지 않는다", async () => {
    const s = setup();
    await s.service.save(s.input);
    s.advance(31 * 3600000);
    await s.service.recover();
    expect(s.sent).toHaveLength(0);
    expect(s.next).toBeUndefined();
    expect((await s.service.list()).postings[0].status).toBe("planned");
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
  it("수정 뒤 이전 버전의 저장을 거부하고 이전 알림 시각에 발송하지 않는다", async () => {
    const s = setup();
    const p = (await s.service.save(s.input)).postings[0];
    await s.service.save(
      { ...s.input, deadline: s.input.deadline + 24 * 3600000 },
      p.id,
      1,
    );
    await expect(s.service.save(s.input, p.id, 1)).rejects.toThrow("변경");
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
it("발송 뒤 처리 기록 저장에 실패해도 다음 복구 기회를 예약한다", async () => {
  const s = setup();
  await s.service.save(s.input);
  s.advance(7 * 3600000);
  s.failSave(true);
  await expect(s.service.recover()).rejects.toThrow();
  expect(s.next).toBe(s.ports.now() + 60000);
  expect((await s.service.list()).problems).toContain("notification");
});
