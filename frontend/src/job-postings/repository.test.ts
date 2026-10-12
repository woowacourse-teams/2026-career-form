import { expect, it } from "vitest";
import { LocalPostingRepository, POSTINGS_KEY } from "./repository";
import { createPosting } from "./model";
it("프로필과 다른 키에 저장하고 재시작해도 공고를 읽는다", async () => {
  const data: Record<string, unknown> = {
    "careerForm.profile": { keep: true },
  };
  const area = {
    get: async () => structuredClone(data),
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, structuredClone(items));
    },
  };
  const repository = new LocalPostingRepository(area);
  expect(await repository.load()).toEqual([]);
  const posting = createPosting(
    {
      company: "예시",
      role: "개발",
      url: "https://example.com",
      deadline: 20000000,
      timeZone: "Asia/Seoul",
      minutes: [120],
    },
    0,
    "job",
  );
  await repository.save([posting]);
  expect(await new LocalPostingRepository(area).load()).toEqual([posting]);
  expect(data["careerForm.profile"]).toEqual({ keep: true });
});
it.each([
  { schemaVersion: 2, postings: [] },
  { schemaVersion: 1, postings: [{}] },
  null,
])(
  "손상되거나 미지원 저장 형식을 빈 목록으로 덮어쓰지 않는다",
  async (value) => {
    const repository = new LocalPostingRepository({
      get: async () => ({ [POSTINGS_KEY]: value }),
      set: async () => {
        throw new Error("must not write");
      },
    });
    await expect(repository.load()).rejects.toThrow();
  },
);
it("저장 실패를 호출자에게 전달한다", async () => {
  const repository = new LocalPostingRepository({
    get: async () => ({}),
    set: async () => {
      throw new Error("quota");
    },
  });
  await expect(repository.save([])).rejects.toThrow();
});
