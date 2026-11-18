import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
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
  pendingDraft,
  strict = false,
  unsupportedImageUrl,
}: {
  file?: File;
  replies?: ResumeDraftResult[];
  repository?: ProfileRepository;
  readPdf?: (data: ArrayBuffer) => Promise<string>;
  /** Replaces the replies with one draft request the test settles itself. */
  pendingDraft?: Promise<ResumeDraftResult>;
  strict?: boolean;
  unsupportedImageUrl?: string;
} = {}) {
  const queue = [...replies];
  const requestDraft = vi.fn(async (_text: string) =>
    pendingDraft ? pendingDraft : queue.shift()!,
  );
  const track = vi.fn();
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const onPickFile = vi.fn();
  const view = (
    <ResumeImport
      file={file}
      repository={repository}
      readText={(picked) => readResumeText(picked, readPdf)}
      requestDraft={requestDraft}
      analytics={{ track, properties: { surface: "side_panel" } }}
      unsupportedImageUrl={unsupportedImageUrl}
      onPickFile={onPickFile}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
  render(strict ? <StrictMode>{view}</StrictMode> : view);
  return { requestDraft, track, onSaved, onClose, onPickFile };
}

const converting = () => screen.findByText("이력서를 정리하고 있어요");
const failureImage = () => document.querySelector("img");
const events = (track: ReturnType<typeof vi.fn>) =>
  track.mock.calls.map(([event]) => event);
const reviewReady = () => screen.findByText("프로필에 가져올 정보");
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ResumeImport", () => {
  it("sends the read text for a draft right away, without a notice or 계속", async () => {
    const state = setup();
    await reviewReady();
    expect(state.requestDraft).toHaveBeenCalledTimes(1);
    expect(state.requestDraft).toHaveBeenCalledWith(RESUME_TEXT);
    expect(screen.queryByText("문서 글자를 서버로 보내요")).toBeNull();
    expect(screen.queryByRole("button", { name: "계속" })).toBeNull();
    expect(state.track).toHaveBeenCalledWith("resume_import_viewed", {
      surface: "side_panel",
    });
    expect(events(state.track)).toEqual(["resume_import_viewed"]);
  });

  it("starts one conversion per file under StrictMode effect replay", async () => {
    const state = setup({ strict: true });
    await reviewReady();
    expect(state.requestDraft).toHaveBeenCalledTimes(1);
    expect(events(state.track)).toEqual(["resume_import_viewed"]);
  });

  it("says only the text is sent and closes from the converting screen", async () => {
    const state = setup({ pendingDraft: new Promise(() => {}) });
    await converting();
    expect(screen.getByText("글자만 전송 · 저장 안 함")).toBeVisible();
    expect(state.requestDraft).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(state.onClose).toHaveBeenCalledOnce();
  });

  const PDF_HINT = [
    "글자를 선택할 수 있는 PDF인지 확인해 주세요.",
    "스캔한 PDF(OCR)는 추후 지원할 예정이에요.",
  ];
  const failingPdf = async (): Promise<string> => {
    throw new Error("synthetic read failure");
  };

  it.each([
    [
      "unsupported type",
      new File(["synthetic"], "합성.docx"),
      undefined,
      "PDF · MD · TXT만 가져올 수 있어요",
      "합성.docx · 0.1MB",
      [],
    ],
    [
      "size over 5MB",
      new File([new Uint8Array(RESUME_MAX_BYTES + 1)], "합성.pdf"),
      undefined,
      "5MB까지 가져올 수 있어요",
      "합성.pdf · 5.0MB",
      [],
    ],
    [
      "PDF without text",
      new File(["%PDF-1.4"], "합성.pdf", { type: "application/pdf" }),
      undefined,
      "분석하지 못했어요",
      "합성.pdf · 0.1MB",
      PDF_HINT,
    ],
    [
      "text over the server limit",
      new File(["가".repeat(20_001)], "합성.txt"),
      undefined,
      "20,000자까지 가져올 수 있어요",
      "합성.txt · 20,001자",
      [],
    ],
    [
      "a file that cannot be read",
      new File(["%PDF-1.4"], "합성.pdf", { type: "application/pdf" }),
      failingPdf,
      "파일을 읽지 못했어요",
      "합성.pdf · 0.1MB",
      [],
    ],
    [
      "MD without text",
      new File([""], "합성.md"),
      undefined,
      "글자가 없는 파일이에요",
      "합성.md · 0.1MB",
      [],
    ],
  ])(
    "rejects %s locally on the capybara screen with no request",
    async (_name, file, readPdf, title, fileLine, body) => {
      const state = setup({ file, ...(readPdf && { readPdf }) });
      expect(await screen.findByRole("alert")).toHaveTextContent(title);
      expect(failureImage()).toHaveAttribute(
        "src",
        "/unsupported-capybara.jpg",
      );
      expect(failureImage()).toHaveAttribute("alt", "");
      for (const line of body) expect(screen.getByText(line)).toBeVisible();
      if (!body.length) expect(screen.queryByText(PDF_HINT[0]!)).toBeNull();
      expect(screen.getByText(fileLine)).toBeVisible();
      expect(screen.getByText("서버로 보내지 않았어요")).toBeVisible();
      expect(screen.queryByText("프로필은 그대로예요")).toBeNull();
      expect(screen.queryByRole("button", { name: "계속" })).toBeNull();
      expect(screen.queryByRole("button", { name: /다시 시도/ })).toBeNull();
      expect(state.requestDraft).not.toHaveBeenCalled();
      expect(events(state.track)).toEqual([
        "resume_import_viewed",
        "resume_import_failed",
      ]);
      fireEvent.click(screen.getByRole("button", { name: "다른 파일" }));
      expect(state.onPickFile).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "닫기" }));
      expect(state.onClose).toHaveBeenCalledOnce();
    },
  );

  it("loads the failure image from the URL its host passes", async () => {
    setup({
      file: new File(["synthetic"], "합성.docx"),
      unsupportedImageUrl:
        "chrome-extension://test-extension/unsupported-capybara.jpg",
    });
    await screen.findByRole("alert");
    expect(failureImage()).toHaveAttribute(
      "src",
      "chrome-extension://test-extension/unsupported-capybara.jpg",
    );
  });

  it("saves only the selected items through the existing import merge", async () => {
    const memory = memoryRepository();
    const state = setup({ repository: memory.repository });
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
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "초안을 만들지 못했어요",
    );
    expect(failureImage()).toHaveAttribute("src", "/unsupported-capybara.jpg");
    expect(
      screen.getByText(
        `${FILE_NAME} · ${RESUME_TEXT.length.toLocaleString("ko-KR")}자`,
      ),
    ).toBeVisible();
    expect(screen.getByText("프로필은 그대로예요")).toBeVisible();
    expect(screen.queryByText("서버로 보내지 않았어요")).toBeNull();
    expect(screen.queryByRole("button", { name: "다른 파일" })).toBeNull();
    expect(screen.getByRole("button", { name: "닫기" })).toBeEnabled();
    expect(memory.repository.save).not.toHaveBeenCalled();
    expect(state.track).toHaveBeenCalledWith("resume_import_failed", {
      surface: "side_panel",
    });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await reviewReady();
    expect(state.requestDraft).toHaveBeenCalledTimes(2);
    expect(state.requestDraft.mock.calls[1][0]).toBe(RESUME_TEXT);
  });

  it("offers another file when the server finds no text", async () => {
    const state = setup({ replies: [{ ok: false, code: "EMPTY" }] });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "글자가 없는 파일이에요",
    );
    expect(failureImage()).toHaveAttribute("src", "/unsupported-capybara.jpg");
    expect(screen.getByText("프로필은 그대로예요")).toBeVisible();
    expect(screen.queryByRole("button", { name: /다시 시도/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다른 파일" }));
    expect(state.onPickFile).toHaveBeenCalledOnce();
    expect(events(state.track)).toEqual([
      "resume_import_viewed",
      "resume_import_failed",
    ]);
  });

  it("offers retry on the same screen when the profile cannot be loaded", async () => {
    const memory = memoryRepository();
    vi.mocked(memory.repository.load).mockRejectedValueOnce(
      new Error("synthetic load failure"),
    );
    setup({
      repository: memory.repository,
      replies: [
        { ok: true, profile: draft() },
        { ok: true, profile: draft() },
      ],
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "프로필을 불러오지 못했어요",
    );
    expect(failureImage()).toHaveAttribute("src", "/unsupported-capybara.jpg");
    expect(screen.getByText("프로필은 그대로예요")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await reviewReady();
  });

  it("holds retry for the Retry-After seconds when rate limited", async () => {
    let reply: (value: ResumeDraftResult) => void = () => {};
    const state = setup({
      pendingDraft: new Promise((resolve) => {
        reply = resolve;
      }),
    });
    await converting();
    vi.useFakeTimers();
    await act(async () => {
      reply({ ok: false, code: "RATE_LIMITED", retryAfterSeconds: 3 });
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
    expect(state.requestDraft).toHaveBeenCalledTimes(1);
  });

  it("writes Console records for every step without any value, file name or text", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const state = setup();
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
    await converting();
    expect(screen.getByRole("status")).toHaveTextContent(
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
    expect(screen.getByText("글자만 전송 · 저장 안 함")).toBeVisible();
    expect(screen.getByRole("button", { name: "취소" })).toBeEnabled();
    await act(async () => finish({ ok: true, profile: draft() }));
    await reviewReady();
  });
});
