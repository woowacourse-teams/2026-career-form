import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromeProfileStorage } from "../../storage/chrome-profile-storage";
import { CATALOG } from "../catalog";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import { readResumeText, RESUME_MAX_BYTES } from "./resume-file";
import type { ResumeDraft, ResumeDraftResult } from "./resume-import-client";
import { RESUME_IMPORT_LOG_PREFIX } from "./resume-log";
import { ResumeImport } from "./ResumeImport";

// Synthetic values only. The resume text holds a sentence that is never imported.
const UNIVERSITY = CATALOG.find((entry) => entry.kind === "university")!;
const RESUME_TEXT = [
  "합성 이력서",
  "synthetic.person@example.test",
  `${UNIVERSITY.name} 2015-03-02 입학`,
  "합성상사 근무",
  "자기소개 문장은 가져오지 않는 합성 원문입니다",
].join("\n");
const FILE_NAME = "합성_이력서_파일.txt";

const draft = (patch: Partial<ResumeDraft> = {}): ResumeDraft => ({
  personal: {},
  contact: { email: "synthetic.person@example.test" },
  education: [
    {
      sectionId: "university",
      values: { schoolName: UNIVERSITY.name, startDate: "2015-03-02" },
    },
  ],
  languages: [],
  certifications: [],
  careers: [{ sectionId: "career", values: { companyName: "합성상사" } }],
  projects: [],
  publications: [],
  compensation: {},
  military: {},
  veteran: {},
  disability: {},
  health: [],
  ...patch,
});

function memoryRepository(initial: Profile = createEmptyProfile()) {
  let stored = structuredClone(initial);
  const repository: ProfileRepository = {
    load: vi.fn(async () => structuredClone(stored)),
    save: vi.fn(async (profile: Profile) => {
      stored = structuredClone(profile);
    }),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  return { repository, stored: () => stored };
}

function setup({
  file = new File([RESUME_TEXT], FILE_NAME, { type: "text/plain" }),
  replies = [{ ok: true, profile: draft() } as ResumeDraftResult],
  repository = memoryRepository().repository,
  readPdf = vi.fn(async () => ""),
}: {
  file?: File;
  replies?: ResumeDraftResult[];
  repository?: ProfileRepository;
  readPdf?: (data: ArrayBuffer) => Promise<string>;
} = {}) {
  const queue = [...replies];
  const requestDraft = vi.fn(async (_text: string) => queue.shift()!);
  const track = vi.fn();
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const onPickFile = vi.fn();
  render(
    <ResumeImport
      file={file}
      repository={repository}
      readText={(picked) => readResumeText(picked, readPdf)}
      requestDraft={requestDraft}
      analytics={{ track, properties: { surface: "side_panel" } }}
      onPickFile={onPickFile}
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  return { requestDraft, track, onSaved, onClose, onPickFile };
}

const notice = () => screen.findByText("문서 글자를 서버로 보내요");
const proceed = async () => {
  await notice();
  fireEvent.click(screen.getByRole("button", { name: "계속" }));
};
const reviewReady = () => screen.findByText("프로필에 가져올 정보");
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ResumeImport", () => {
  it("shows the extracted size before sending and sends nothing until 계속", async () => {
    const state = setup();
    await notice();
    expect(
      screen.getByText(`글자 ${RESUME_TEXT.length.toLocaleString("ko-KR")}자`),
    ).toBeVisible();
    expect(screen.getByText("안 함")).toBeVisible();
    expect(screen.getByText(FILE_NAME)).toBeVisible();
    expect(state.requestDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "계속" }));
    await reviewReady();
    expect(state.requestDraft).toHaveBeenCalledTimes(1);
    expect(state.requestDraft).toHaveBeenCalledWith(RESUME_TEXT);
    expect(state.track).toHaveBeenCalledWith("resume_import_viewed", {
      surface: "side_panel",
    });
  });

  it("closes from the notice without a request", async () => {
    const state = setup();
    await notice();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(state.onClose).toHaveBeenCalledOnce();
    expect(state.requestDraft).not.toHaveBeenCalled();
  });

  it.each([
    [
      "unsupported type",
      new File(["synthetic"], "합성.docx"),
      "PDF · MD · TXT만 가져올 수 있어요",
      "",
    ],
    [
      "size over 5MB",
      new File([new Uint8Array(RESUME_MAX_BYTES + 1)], "합성.pdf"),
      "5MB까지 가져올 수 있어요",
      "",
    ],
    [
      "PDF without text",
      new File(["%PDF-1.4"], "합성.pdf", { type: "application/pdf" }),
      "글자를 읽을 수 없는 PDF예요",
      "",
    ],
    [
      "text over the server limit",
      new File(["가".repeat(20_001)], "합성.txt"),
      "20,000자까지 가져올 수 있어요",
      "",
    ],
  ])(
    "rejects %s locally with its own message and no request",
    async (_name, file, message) => {
      const state = setup({ file });
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByText("서버로 보내지 않았어요")).toBeVisible();
      expect(screen.queryByRole("button", { name: "계속" })).toBeNull();
      expect(state.requestDraft).not.toHaveBeenCalled();
      expect(state.track).toHaveBeenCalledWith("resume_import_failed", {
        surface: "side_panel",
      });
      fireEvent.click(screen.getByRole("button", { name: "다른 파일" }));
      expect(state.onPickFile).toHaveBeenCalledOnce();
    },
  );

  it("saves only the selected items through the existing import merge", async () => {
    const memory = memoryRepository();
    const state = setup({ repository: memory.repository });
    await proceed();
    await reviewReady();
    const careers = screen
      .getAllByRole("switch")
      .find((element) =>
        /경력/.test(element.getAttribute("aria-label") ?? ""),
      )!;
    expect(careers).toHaveAttribute("aria-checked", "true");
    fireEvent.click(careers);
    save();
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    const saved = memory.stored();
    expect(saved.contact.email).toBe("synthetic.person@example.test");
    expect(saved.education).toHaveLength(1);
    expect(saved.education[0]).toMatchObject({
      sectionId: "university",
      values: { schoolName: UNIVERSITY.name, startDate: "2015-03-02" },
    });
    expect(saved.careers).toEqual([]);
    expect(state.onSaved).toHaveBeenCalledWith(saved, 3);
    expect(state.track).toHaveBeenCalledWith("resume_import_saved", {
      surface: "side_panel",
    });
  });

  it("keeps an existing different value unless the user turns it on, like the page import", async () => {
    const memory = memoryRepository({
      ...createEmptyProfile(),
      contact: { email: "kept@example.test" },
    });
    const state = setup({ repository: memory.repository });
    await proceed();
    await reviewReady();
    expect(screen.getByText("기존 값 변경")).toBeVisible();
    save();
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    expect(memory.stored().contact.email).toBe("kept@example.test");
    expect(memory.stored().careers).toHaveLength(1);
  });

  it("fills catalog fields only with catalog values and lists the emptied ones", async () => {
    const memory = memoryRepository();
    const state = setup({
      repository: memory.repository,
      replies: [
        {
          ok: true,
          profile: draft({
            education: [
              {
                sectionId: "university",
                values: { schoolName: "목록에없는합성대학교" },
              },
            ],
            certifications: [
              {
                sectionId: "certificate",
                values: { name: "목록에없는합성자격" },
              },
            ],
          }),
        },
      ],
    });
    await proceed();
    await reviewReady();
    expect(screen.getByText("가져올 수 없는 2개 보기")).toBeInTheDocument();
    expect(screen.queryByText("목록에없는합성대학교")).toBeNull();
    save();
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    expect(memory.stored().education).toEqual([]);
    expect(memory.stored().certifications).toEqual([]);
  });

  it("stores a month-only date as day 01 and tags it on the review screen", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const memory = memoryRepository();
    const state = setup({
      repository: memory.repository,
      replies: [
        {
          ok: true,
          profile: draft({
            careers: [
              {
                sectionId: "career",
                values: {
                  companyName: "합성상사",
                  startDate: "2019-07",
                  endDate: "2021-02-15",
                },
              },
            ],
          }),
        },
      ],
    });
    await proceed();
    await reviewReady();
    fireEvent.click(screen.getByRole("button", { name: /^직장경력/ }));
    const start = screen
      .getByRole("checkbox", { name: /입사일 가져오기$/ })
      .closest("div")!;
    expect(within(start).getByText("일 확인")).toBeVisible();
    expect(within(start).getByText("2019.07.01")).toBeVisible();
    const end = screen
      .getByRole("checkbox", { name: /퇴사일 가져오기$/ })
      .closest("div")!;
    expect(within(end).queryByText("일 확인")).toBeNull();
    expect(screen.getAllByText("일 확인")).toHaveLength(1);
    save();
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    expect(memory.stored().careers[0]!.values).toMatchObject({
      startDate: "2019-07-01",
      endDate: "2021-02-15",
    });
    const record = info.mock.calls.find(
      (call) =>
        call[0] === RESUME_IMPORT_LOG_PREFIX && call[1] === "catalog_match",
    )!;
    expect(record[2]).toMatchObject({ monthDates: 1 });
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/2019|2021/);
  });

  it("offers retry after a server failure and leaves the profile unchanged", async () => {
    const memory = memoryRepository();
    const state = setup({
      repository: memory.repository,
      replies: [
        { ok: false, code: "UNAVAILABLE" },
        { ok: true, profile: draft() },
      ],
    });
    await proceed();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "초안을 만들지 못했어요",
    );
    expect(screen.getByText("프로필은 그대로예요")).toBeVisible();
    expect(memory.repository.save).not.toHaveBeenCalled();
    expect(state.track).toHaveBeenCalledWith("resume_import_failed", {
      surface: "side_panel",
    });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await reviewReady();
    expect(state.requestDraft).toHaveBeenCalledTimes(2);
    expect(state.requestDraft.mock.calls[1][0]).toBe(RESUME_TEXT);
  });

  it("holds retry for the Retry-After seconds when rate limited", async () => {
    setup({
      replies: [
        { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 3 },
        { ok: true, profile: draft() },
      ],
    });
    await notice();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "계속" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const retry = screen.getByRole("button", { name: /다시 시도/ });
    expect(retry).toBeDisabled();
    expect(retry).toHaveTextContent("3초");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(retry).toHaveTextContent("1초");
    expect(retry).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
  });

  it("writes Console records for every step without any value, file name or text", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const state = setup();
    await proceed();
    await reviewReady();
    save();
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    const records = info.mock.calls.filter(
      (call) => call[0] === RESUME_IMPORT_LOG_PREFIX,
    );
    expect(records.map((call) => call[1])).toEqual([
      "file_read",
      "text_extract",
      "server_request",
      "catalog_match",
      "save",
    ]);
    expect(records[1][2]).toEqual({
      outcome: "ok",
      fileType: "txt",
      chars: RESUME_TEXT.length,
    });
    expect(records[2][2]).toMatchObject({
      outcome: "ok",
      draftCounts: { contact: 1, education: 1, careers: 1 },
    });
    expect(records[3][2]).toMatchObject({
      catalogMatched: 1,
      catalogEmptied: 0,
    });
    expect(records[4][2]).toEqual({ outcome: "ok", saved: 4 });
    const written = JSON.stringify(info.mock.calls);
    for (const secret of [
      "synthetic.person",
      UNIVERSITY.name,
      "합성상사",
      "2015-03-02",
      "합성_이력서",
      "자기소개",
    ])
      expect(written).not.toContain(secret);
  });

  it("logs the failure reason code of a rejected file", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    setup({ file: new File(["synthetic"], "합성.docx") });
    await screen.findByRole("alert");
    expect(
      info.mock.calls.filter((call) => call[0] === RESUME_IMPORT_LOG_PREFIX),
    ).toEqual([
      [
        RESUME_IMPORT_LOG_PREFIX,
        "file_read",
        { outcome: "failed", reason: "unsupported_type" },
      ],
    ]);
  });

  it("leaves no file content or extracted text in extension storage after saving", async () => {
    const area: Record<string, unknown> = {};
    const storage = {
      get: vi.fn(async (key: string) =>
        key in area ? { [key]: structuredClone(area[key]) } : {},
      ),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(area, structuredClone(items));
      }),
    };
    const state = setup({ repository: new ChromeProfileStorage(storage) });
    await proceed();
    await reviewReady();
    save();
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    expect(Object.keys(area)).toEqual(["careerForm.profile"]);
    const stored = JSON.stringify(area);
    expect(stored).toContain("synthetic.person@example.test");
    expect(stored).not.toContain(
      "자기소개 문장은 가져오지 않는 합성 원문입니다",
    );
    expect(stored).not.toContain(RESUME_TEXT);
    expect(stored).not.toContain(FILE_NAME);
  });

  it("shows the converting steps while the draft is made", async () => {
    let finish: (value: ResumeDraftResult) => void = () => {};
    const requestDraft = vi.fn(
      () =>
        new Promise<ResumeDraftResult>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <ResumeImport
        file={new File([RESUME_TEXT], FILE_NAME)}
        repository={memoryRepository().repository}
        readText={(picked) => readResumeText(picked, async () => "")}
        requestDraft={requestDraft}
        onPickFile={() => {}}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    await proceed();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "이력서를 정리하고 있어요",
    );
    const steps = screen.getByRole("list", { name: "진행 단계" });
    expect(
      within(steps)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      `글자 읽기${RESUME_TEXT.length.toLocaleString("ko-KR")}자`,
      "초안 만들기",
      "항목 맞추기",
    ]);
    await act(async () => finish({ ok: true, profile: draft() }));
    await reviewReady();
  });
});
