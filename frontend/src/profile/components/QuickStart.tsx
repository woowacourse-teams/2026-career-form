import { useEffect, useRef, useState } from "react";
import { QuickStartGuide, QuickStartPicker } from "./QuickStartSections";
import type { TrackEvent } from "../../analytics/events";
import { useProfileSaveTracking } from "../../analytics/use-profile-save-tracking";
import { trackExtensionEvent } from "../../analytics/extension-tracker";
import { useProfileEditor } from "../hooks/use-profile-editor";
import type { ProfileEntry, ProfileIdentity } from "../model";
import type { ProfileRepository } from "../profile-repository";
import {
  QuickStartFields,
  Summary,
  entrySummary,
  titles,
  descriptions,
  type Chapter,
  type Step,
} from "./QuickStartFields";
import styles from "./QuickStart.module.css";
const properties = { surface: "extension_onboarding" } as const;
const saveLabels = {
  idle: "입력한 정보는 이 브라우저에 자동 저장돼요.",
  saving: "저장 중이에요…",
  saved: "이 브라우저에 저장했어요.",
  error: "저장하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.",
};
const basicSteps: Step[] = ["name", "email", "phone", "basics"];
const educationSteps: Step[] = [
  "educationType",
  "school",
  "major",
  "completion",
  "educationDates",
  "educationSummary",
];
const experienceSteps: Step[] = [
  "experienceType",
  "experienceName",
  "experienceRole",
  "experienceDates",
  "experienceDetails",
  "experienceSummary",
];
export function QuickStart({
  repository,
  track: injectedTrack = trackExtensionEvent,
  onOpenProfile,
}: {
  repository: ProfileRepository;
  track?: TrackEvent;
  onOpenProfile: () => void;
}) {
  const { repository: trackedRepository, track } = useProfileSaveTracking(
    repository,
    injectedTrack,
    "extension_onboarding",
  );
  const editor = useProfileEditor(trackedRepository);
  const [step, setStep] = useState<Step>("name");
  const [history, setHistory] = useState<
    { step: Step; selection: { chapter: Chapter; entry: ProfileEntry } }[]
  >([]);
  const [guide, setGuide] = useState(false);
  const [pending, setPending] = useState(false);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const [selection, setSelection] = useState<{
    chapter: Chapter;
    entry: ProfileEntry;
  }>({
    chapter: "education",
    entry: { id: "", sectionId: "university", values: {} },
  });
  const createdIds = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const question = useRef<HTMLFieldSetElement>(null);
  const focusedScreen = useRef<string | null>(null);
  const viewSent = useRef(false);
  const transition = useRef(false);
  const entry = editor.profile[selection.chapter].find(
    (row) => row.id === selection.entry.id,
  ) ?? {
    id: selection.entry.id,
    sectionId: selection.entry.sectionId,
    values: {},
  };
  const hasValues = Object.values(editor.profile).some((value) =>
    Array.isArray(value)
      ? value.some((row) =>
          Object.values(row.values).some(
            (v) => typeof v === "string" && v.trim(),
          ),
        )
      : Object.values(value).some((v) => typeof v === "string" && v.trim()),
  );
  const chapter = basicSteps.includes(step)
    ? 0
    : educationSteps.includes(step)
      ? 1
      : 2;
  const steps =
    chapter === 0
      ? basicSteps
      : chapter === 1
        ? educationSteps.filter(
            (item) => entry.sectionId !== "highSchool" || item !== "major",
          )
        : experienceSteps;
  const summary =
    step === "basics" ||
    step === "educationSummary" ||
    step === "experienceSummary";
  const summaryValues: [string, string][] =
    step === "basics"
      ? [
          [
            "이름",
            `${editor.profile.personal.koreanFamilyName ?? ""}${editor.profile.personal.koreanGivenName ?? ""}`,
          ],
          ["이메일", editor.profile.contact.email ?? ""],
          ["전화번호", editor.profile.contact.phoneNumber ?? ""],
        ]
      : entrySummary(entry);
  const summaryHasValues = summaryValues.some(([, value]) => value.trim());
  const choosing = step === "educationType" || step === "experienceType";
  useEffect(() => {
    if (!viewSent.current) {
      viewSent.current = true;
      track("quick_profile_viewed", properties);
    }
  }, [track]);
  useEffect(() => {
    if (editor.loadStatus !== "ready" || pending) return;
    const screen = guide ? "guide" : step;
    if (focusedScreen.current === screen) return;
    const target =
      !guide && !summary
        ? question.current?.querySelector<HTMLElement>(
            "input:not(:disabled), textarea:not(:disabled), button:not(:disabled)",
          )
        : null;
    (target ?? heading.current)?.focus();
    focusedScreen.current = screen;
  }, [step, guide, summary, pending, editor.loadStatus]);
  function move(next: Step) {
    setHistory((current) => [...current, { step, selection }]);
    setStep(next);
  }
  async function proceed(
    destination: Step | "guide" | "profile" | "retry",
    skipIncompleteDates = false,
  ) {
    if (transition.current) return false;
    const invalidDate = question.current?.querySelector<HTMLInputElement>(
      "input[data-date-input]:invalid",
    );
    if (invalidDate && !skipIncompleteDates) {
      invalidDate.focus();
      invalidDate.reportValidity();
      return false;
    }
    transition.current = true;
    setPending(true);
    setNavigationFailed(false);
    try {
      if (
        editor.saveStatus !== "idle" &&
        !(await editor.replaceProfile(editor.profile))
      )
        return false;
      if (destination === "profile") onOpenProfile();
      else if (destination === "guide") {
        if (!hasValues) track("quick_profile_skipped", properties);
        setGuide(true);
      } else if (destination !== "retry") move(destination);
      return true;
    } catch {
      setNavigationFailed(true);
      return false;
    } finally {
      transition.current = false;
      setPending(false);
    }
  }
  function next(skipIncompleteDates = false) {
    const following = steps[steps.indexOf(step) + 1];
    if (following) void proceed(following, skipIncompleteDates);
  }
  function selectEntry(
    chapter: Chapter,
    sectionId: string,
    existing?: ProfileEntry,
  ) {
    setSelection({
      chapter,
      entry: existing ?? { id: crypto.randomUUID(), sectionId, values: {} },
    });
    move(chapter === "education" ? "school" : "experienceName");
  }
  function updateEntry(
    field: string,
    value: string,
    identity?: ProfileIdentity,
  ) {
    const current = editor.profile[selection.chapter].find(
      (row) => row.id === entry.id,
    );
    const values = { ...entry.values, [field]: value };
    if (
      !Object.values(values).some((v) => typeof v === "string" && v.trim()) &&
      (!current || createdIds.current.has(entry.id))
    ) {
      if (current) editor.removeEntry(selection.chapter, entry.id);
      setSelection({
        ...selection,
        entry: { ...entry, values: {}, identity: undefined },
      });
      return;
    }
    if (current) {
      editor.updateEntry(selection.chapter, entry.id, field, value, identity);
      return;
    }
    const newEntry = {
      ...entry,
      values,
      ...(field === "schoolName"
        ? {
            identity: identity ?? {
              status: "manual" as const,
              originalText: value,
            },
          }
        : {}),
    };
    createdIds.current.add(entry.id);
    setSelection({ ...selection, entry: newEntry });
    void editor.replaceProfile({
      ...editor.profile,
      [selection.chapter]: [...editor.profile[selection.chapter], newEntry],
    });
  }
  if (editor.loadStatus !== "ready")
    return (
      <main className={styles.page}>
        <p role={editor.loadStatus === "error" ? "alert" : "status"}>
          {editor.loadStatus === "error"
            ? "프로필을 불러오지 못했어요. 페이지를 새로 열어 다시 시도해 주세요."
            : "프로필을 불러오는 중이에요."}
        </p>
      </main>
    );
  const autofillExit = (
    <div className={`${styles.exit} ${summary ? styles.summaryExit : ""}`}>
      <button
        className={summary ? styles.primary : undefined}
        type="button"
        disabled={pending}
        onClick={() => void proceed("guide")}
      >
        지금 자동 기입 사용하기 <span aria-hidden="true">↗</span>
      </button>
      <span>지원서에서 사용하는 방법을 안내해 드려요</span>
    </div>
  );
  return (
    <main className={styles.page} id="main">
      <div className={styles.shell}>
        <header className={styles.brand}>
          <img src="/side-panel-launcher-logo.png" alt="" />
          CAREER FORM<span>내 속도로 준비하는 지원서</span>
        </header>
        <ol className={styles.steps} aria-label="등록 묶음">
          {["기본 정보", "학력", "경력·활동"].map((label, index) => (
            <li
              key={label}
              aria-current={!guide && index === chapter ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {label}
              <small>{index > 0 ? "선택" : "시작"}</small>
            </li>
          ))}
        </ol>
        <section className={styles.card}>
          <div className={styles.topline}>
            <p className={styles.eyebrow}>
              {guide
                ? "다음은 실제 지원서에서"
                : `${["나를 소개하는 첫걸음", "학교에서 쌓은 시간", "나만의 경험"][chapter]} · ${steps.indexOf(step) + 1} / ${steps.length}`}
            </p>
            {!guide && (
              <button
                type="button"
                className={styles.textButton}
                disabled={pending}
                onClick={() => void proceed("profile")}
              >
                전체 프로필 편집
              </button>
            )}
          </div>
          {!guide && (
            <progress
              aria-label="현재 묶음 진행"
              value={steps.indexOf(step) + 1}
              max={steps.length}
            />
          )}
          <h1 ref={heading} tabIndex={-1}>
            {guide
              ? "지원서에서 자동 기입을 시작하세요"
              : summary && !summaryHasValues
                ? "필요한 정보는 나중에 채워도 좋아요"
                : titles[step]}
          </h1>
          {guide ? (
            <QuickStartGuide
              hasValues={hasValues}
              pending={pending}
              onBack={() => setGuide(false)}
              onOpenProfile={() => void proceed("profile")}
            />
          ) : (
            <form
              noValidate
              onSubmit={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                const target = event.target as HTMLElement;
                if (
                  event.key !== "Enter" ||
                  event.defaultPrevented ||
                  event.nativeEvent.isComposing ||
                  event.keyCode === 229 ||
                  target.tagName !== "INPUT" ||
                  target.getAttribute("role") === "combobox"
                )
                  return;
                event.preventDefault();
                const inputs = Array.from(
                  question.current?.querySelectorAll<HTMLInputElement>(
                    'input:not(:disabled):not([aria-hidden="true"])',
                  ) ?? [],
                );
                const following =
                  inputs[inputs.indexOf(target as HTMLInputElement) + 1];
                if (following) following.focus();
                else next();
              }}
            >
              <p className={styles.description}>{descriptions[step]}</p>
              <fieldset
                ref={question}
                disabled={pending}
                className={`${styles.question} ${step === "school" ? styles.schoolQuestion : ""}`}
                key={step}
              >
                {!summary && (
                  <p className={styles.optional}>
                    선택 입력 · 건너뛰어도 괜찮아요
                  </p>
                )}
                {choosing ? (
                  <QuickStartPicker
                    education={step === "educationType"}
                    profile={editor.profile}
                    selectEntry={selectEntry}
                  />
                ) : summary ? (
                  <>
                    {summaryHasValues && (
                      <div className={styles.savedBadge}>
                        ✓ 여기까지 저장했어요
                      </div>
                    )}
                    <Summary values={summaryValues} />
                    {autofillExit}
                    <p className={styles.continueLabel}>
                      조금 더 준비하고 싶다면 <span>선택</span>
                    </p>
                    <div className={styles.chapterChoices}>
                      {step !== "educationSummary" && (
                        <button
                          type="button"
                          aria-label="학력 추가하기"
                          onClick={() => move("educationType")}
                        >
                          <strong>학력 추가하기</strong>
                          <span>학교·전공·재학 상태 →</span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="경력·활동 추가하기"
                        onClick={() => move("experienceType")}
                      >
                        <strong>경력·활동 추가하기</strong>
                        <span>직장경력 또는 프로젝트 →</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <QuickStartFields
                    step={step}
                    profile={editor.profile}
                    entry={entry}
                    chapter={selection.chapter}
                    updateSingle={editor.updateSingle}
                    updateEntry={updateEntry}
                  />
                )}
              </fieldset>
              <p
                role={editor.saveStatus === "error" ? "alert" : "status"}
                className={
                  editor.saveStatus === "error" ? styles.error : styles.note
                }
              >
                {saveLabels[editor.saveStatus]}
              </p>
              {editor.saveStatus === "error" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void proceed("retry")}
                >
                  다시 저장하기
                </button>
              )}
              <div className={styles.actions}>
                {history.length > 0 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={async () => {
                      if (!(await proceed("retry"))) return;
                      setStep(history[history.length - 1].step);
                      setSelection(history[history.length - 1].selection);
                      setHistory(history.slice(0, -1));
                    }}
                  >
                    이전
                  </button>
                )}
                {!summary && !choosing && (
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={pending}
                    onClick={() => next()}
                  >
                    다음
                  </button>
                )}
              </div>
              {!summary && (
                <button
                  type="button"
                  className={styles.skip}
                  disabled={pending}
                  onClick={async () => {
                    if (!choosing) {
                      next(true);
                      return;
                    }
                    if (step === "educationType") {
                      void proceed("experienceType");
                      return;
                    }
                    if (await proceed("experienceSummary"))
                      setSelection({
                        chapter: "projects",
                        entry: { id: "", sectionId: "project", values: {} },
                      });
                  }}
                >
                  {choosing ? "이 묶음 건너뛰기" : "이 질문 건너뛰기"}
                </button>
              )}
              {!summary && autofillExit}
            </form>
          )}
          {navigationFailed && (
            <p role="alert" className={styles.error}>
              화면을 열지 못했어요. 다시 시도해 주세요.
            </p>
          )}
        </section>
        <p className={styles.footer}>내 정보는 현재 브라우저에 보관돼요.</p>
      </div>
    </main>
  );
}
