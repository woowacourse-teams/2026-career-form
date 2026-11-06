import { useEffect, useRef, useState } from "react";
import { QuickStartPicker } from "./QuickStartSections";
import { QuickStartOverview } from "./QuickStartOverview";
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
  basicSummary,
  type SummaryValue,
  titles,
  type Chapter,
  type Step,
} from "./QuickStartFields";
import styles from "./QuickStart.module.css";
const properties = { surface: "extension_onboarding" } as const;
// A question counts as answered when any of its inputs holds text or one of
// its choices is pressed; the hidden calendar mirror is not a separate answer.
function hasAnswer(question: HTMLElement | null): boolean {
  if (!question) return false;
  return (
    Array.from(
      question.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([aria-hidden="true"]), textarea',
      ),
    ).some((field) => field.value.trim() !== "") ||
    question.querySelector('[aria-pressed="true"]') !== null
  );
}
const saveLabels = {
  idle: "자동 저장",
  saving: "저장 중",
  saved: "저장됨",
  error: "저장하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.",
  conflict: "확인 필요",
};
const basicSteps: Step[] = [
  "name",
  "email",
  "phone",
  "gender",
  "birthDate",
  "basics",
];
const educationSteps: Step[] = [
  "educationType",
  "school",
  "major",
  "completion",
  "educationSummary",
];
const experienceSteps: Step[] = [
  "experienceType",
  "experienceName",
  "experienceRole",
  "experienceSummary",
];
export function QuickStart({
  repository,
  track: injectedTrack = trackExtensionEvent,
  startAtOverview = false,
  onOpenProfile,
  onDone,
}: {
  repository: ProfileRepository;
  track?: TrackEvent;
  /** Open on 저장한 정보 even when nothing is saved yet. */
  startAtOverview?: boolean;
  onOpenProfile: () => void;
  /** Leaves the registration; the caller shows how to use autofill. */
  onDone: () => void;
}) {
  const { repository: trackedRepository, track } = useProfileSaveTracking(
    repository,
    injectedTrack,
    "extension_onboarding",
  );
  const editor = useProfileEditor(trackedRepository);
  const [step, setStep] = useState<Step>("name");
  const [initialized, setInitialized] = useState(false);
  const [returnTo, setReturnTo] = useState<Step | null>(null);
  const [history, setHistory] = useState<
    {
      step: Step;
      selection: { chapter: Chapter; entry: ProfileEntry };
      returnTo: Step | null;
    }[]
  >([]);
  const [pending, setPending] = useState(false);
  const [answered, setAnswered] = useState(false);
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
  const retryButton = useRef<HTMLButtonElement>(null);
  const [restoreRetryFocus, setRestoreRetryFocus] = useState(false);
  const busy = pending || editor.isReloading;
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
  const chapter =
    basicSteps.includes(step) ||
    step === "englishName" ||
    step === "nationality"
      ? 0
      : educationSteps.includes(step) ||
          step === "educationDates" ||
          step === "educationDetails"
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
    step === "overview" ||
    step === "basics" ||
    step === "educationSummary" ||
    step === "experienceSummary";
  const summaryValues: SummaryValue[] =
    step === "basics" ? basicSummary(editor.profile) : entrySummary(entry);
  const summaryHasValues =
    step === "overview"
      ? hasValues
      : summaryValues.some(([, value]) => value.trim());
  const missingFields: SummaryValue[] =
    step === "basics"
      ? basicSummary(editor.profile).filter(
          ([, , target]) =>
            target !== "englishName" && target !== "nationality",
        )
      : step === "educationSummary"
        ? [
            ["학교명", entry.values.schoolName ?? "", "school"],
            ...(entry.sectionId !== "highSchool"
              ? [
                  [
                    "주전공명",
                    entry.values.majorName ?? "",
                    "major",
                  ] as SummaryValue,
                ]
              : []),
            ["재학 상태", entry.values.completionStatus ?? "", "completion"],
          ]
        : step === "experienceSummary"
          ? selection.chapter === "careers"
            ? [
                ["직장명", entry.values.companyName ?? "", "experienceName"],
                [
                  "고용형태",
                  entry.values.employmentType ?? "",
                  "experienceRole",
                ],
                [
                  "재직 여부",
                  entry.values.employmentStatus ?? "",
                  "experienceRole",
                ],
              ]
            : [
                [
                  "프로젝트 이름",
                  entry.values.projectName ?? "",
                  "experienceName",
                ],
                ["담당 역할", entry.values.role ?? "", "experienceRole"],
              ]
          : [];
  const staleCareerDate =
    step === "experienceSummary" &&
    selection.chapter === "careers" &&
    entry.values.employmentStatus === "재직중" &&
    !!entry.values.endDate?.trim();
  const staleEducationDate =
    step === "educationSummary" &&
    ["재학중", "휴학"].includes(entry.values.completionStatus ?? "") &&
    !!entry.values.endDate?.trim();
  const choosing = step === "educationType" || step === "experienceType";
  useEffect(() => {
    if (editor.loadStatus === "ready" && !initialized) {
      setStep(startAtOverview || hasValues ? "overview" : "name");
      setInitialized(true);
    }
  }, [editor.loadStatus, initialized, hasValues, startAtOverview]);
  // Read after every render; typing inside a child field that keeps its own
  // draft (the date input) reports through the form's change event instead.
  useEffect(() => {
    setAnswered(hasAnswer(question.current));
  });
  useEffect(() => {
    if (!viewSent.current) {
      viewSent.current = true;
      track("quick_profile_viewed", properties);
    }
  }, [track]);
  useEffect(() => {
    if (editor.loadStatus !== "ready" || !initialized || pending) return;
    const screen = `${step}:${selection.chapter}:${selection.entry.id}`;
    if (focusedScreen.current === screen) return;
    const target = !summary
      ? question.current?.querySelector<HTMLElement>(
          "input:not(:disabled), textarea:not(:disabled), button:not(:disabled)",
        )
      : null;
    (target ?? heading.current)?.focus();
    focusedScreen.current = screen;
  }, [
    step,
    summary,
    pending,
    editor.loadStatus,
    initialized,
    selection.chapter,
    selection.entry.id,
  ]);
  useEffect(() => {
    if (!restoreRetryFocus || pending) return;
    setRestoreRetryFocus(false);
    const active = document.activeElement;
    if (editor.saveStatus === "error" && (!active || active === document.body))
      retryButton.current?.focus();
  }, [restoreRetryFocus, pending, editor.saveStatus]);
  function move(next: Step, origin: Step | null = null) {
    setHistory((current) => [...current, { step, selection, returnTo }]);
    setStep(next);
    setReturnTo(origin);
  }
  function editQuestion(target: Step) {
    void proceed(target, step);
  }
  async function proceed(
    destination: Step | "done" | "profile" | "retry",
    origin: Step | null = null,
  ) {
    if (transition.current || editor.isReloading) return false;
    const invalidDate = question.current?.querySelector<HTMLInputElement>(
      "input[data-date-input]:invalid",
    );
    if (invalidDate) {
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
      else if (destination === "done") onDone();
      else if (destination === returnTo) {
        setStep(destination);
        setReturnTo(null);
        setHistory((current) => current.slice(0, -1));
      } else if (destination !== "retry") move(destination, origin);
      return true;
    } catch {
      setNavigationFailed(true);
      return false;
    } finally {
      transition.current = false;
      setPending(false);
    }
  }
  async function reloadLatest() {
    if (transition.current || editor.isReloading) return;
    if (
      !globalThis.confirm(
        "저장되지 않은 편집이 사라집니다. 최신 프로필을 다시 불러올까요?",
      )
    )
      return;
    transition.current = true;
    setPending(true);
    try {
      if (!(await editor.reloadLatest())) return;
      setSelection({
        chapter: "education",
        entry: { id: "", sectionId: "university", values: {} },
      });
      createdIds.current.clear();
      setHistory([]);
      setReturnTo(null);
      setNavigationFailed(false);
      setStep("overview");
    } finally {
      transition.current = false;
      setPending(false);
    }
  }
  function next() {
    const following = returnTo ?? steps[steps.indexOf(step) + 1];
    if (following) void proceed(following);
  }
  async function selectEntry(
    chapter: Chapter,
    sectionId: string,
    existing?: ProfileEntry,
  ) {
    const destination = existing
      ? chapter === "education"
        ? "educationSummary"
        : "experienceSummary"
      : chapter === "education"
        ? "school"
        : "experienceName";
    if (!(await proceed(destination))) return;
    setSelection({
      chapter,
      entry: existing ?? { id: crypto.randomUUID(), sectionId, values: {} },
    });
  }

  function updateEntry(
    field: string,
    value: string,
    identity?: ProfileIdentity,
  ) {
    if (transition.current || editor.isReloading) return;
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
  if (editor.loadStatus !== "ready" || !initialized)
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
    <div className={summary ? styles.summaryExit : styles.after}>
      <button
        className={summary ? styles.primary : undefined}
        type="button"
        disabled={busy}
        aria-label="지금 자동 기입 사용하기"
        onClick={() => void proceed("done")}
      >
        지금 자동 기입 사용 <span aria-hidden="true">↗</span>
      </button>
      <span className={styles.tag}>이 브라우저에 저장</span>
    </div>
  );
  const counting = step !== "overview" && !returnTo;
  return (
    <main className={styles.page} id="main">
      <header className={styles.top}>
        <div className={styles.topIn}>
          <div className={styles.brand}>
            <img src="/side-panel-launcher-logo.png" alt="" />
            <span>Career Form</span>
          </div>
          <button
            type="button"
            className={styles.topLink}
            disabled={busy}
            onClick={() => void proceed("profile")}
          >
            전체 프로필 편집
          </button>
        </div>
      </header>
      <div className={styles.wrap}>
        <div className={styles.head}>
          <h1>첫 등록</h1>
          {counting && (
            <>
              <span className={styles.count} aria-hidden="true">
                {steps.indexOf(step) + 1}/{steps.length}
              </span>
              <progress
                className={styles.srOnly}
                aria-label="현재 묶음 진행"
                value={steps.indexOf(step) + 1}
                max={steps.length}
              />
            </>
          )}
          {editor.saveStatus !== "error" && (
            <p role="status" className={styles.saved}>
              {saveLabels[editor.saveStatus]}
            </p>
          )}
        </div>
        <div className={styles.grid}>
          <div>
            <section className={styles.card}>
              <h2 ref={heading} tabIndex={-1}>
                {titles[step]}
              </h2>
              <form
                noValidate
                onSubmit={(event) => event.preventDefault()}
                onChange={() => setAnswered(hasAnswer(question.current))}
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
                <fieldset
                  ref={question}
                  disabled={busy}
                  className={`${styles.question} ${step === "school" ? styles.schoolQuestion : ""}`}
                  key={step}
                >
                  {choosing ? (
                    <QuickStartPicker
                      education={step === "educationType"}
                      profile={editor.profile}
                      selectEntry={selectEntry}
                    />
                  ) : summary ? (
                    <>
                      {summaryHasValues &&
                        (editor.saveStatus === "idle" ||
                          editor.saveStatus === "saved") && (
                          <div className={styles.savedBadge}>
                            ✓ 여기까지 저장했어요
                          </div>
                        )}
                      {step === "overview" && autofillExit}
                      {step === "overview" ? (
                        <QuickStartOverview
                          profile={editor.profile}
                          onEditBasic={editQuestion}
                          onSelectEntry={(chapter, row) =>
                            selectEntry(chapter, row.sectionId, row)
                          }
                        />
                      ) : (
                        <Summary values={summaryValues} onEdit={editQuestion} />
                      )}
                      {(staleCareerDate || staleEducationDate) && (
                        <div className={styles.note}>
                          <p>
                            {staleCareerDate
                              ? "재직중인데 이전 퇴사일이 남아 있어요."
                              : "현재 재학 상태와 함께 이전 졸업일이 남아 있어요."}
                          </p>
                          <button
                            type="button"
                            onClick={() => updateEntry("endDate", "")}
                          >
                            {staleCareerDate
                              ? "퇴사일 지우기"
                              : "졸업일 지우기"}
                          </button>
                        </div>
                      )}
                      {step !== "overview" && autofillExit}
                      <p className={styles.continueLabel}>추가 항목</p>
                      <div className={styles.supplementActions}>
                        {missingFields
                          .filter(([, value]) => !value.trim())
                          .map(([label, , target]) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => target && editQuestion(target)}
                            >
                              {label} 추가
                            </button>
                          ))}
                        {step === "educationSummary" && (
                          <>
                            <button
                              type="button"
                              onClick={() => editQuestion("educationDates")}
                            >
                              입학·졸업일 추가
                            </button>
                            <button
                              type="button"
                              onClick={() => editQuestion("educationDetails")}
                            >
                              학위·학교 정보 추가
                            </button>
                          </>
                        )}
                        {step === "experienceSummary" && (
                          <>
                            <button
                              type="button"
                              onClick={() => editQuestion("experienceDates")}
                            >
                              기간 추가
                            </button>
                            <button
                              type="button"
                              onClick={() => editQuestion("experienceDetails")}
                            >
                              활동 내용 추가
                            </button>
                          </>
                        )}
                      </div>
                      {step === "basics" && (
                        <div className={styles.supplementActions}>
                          {summaryValues
                            .filter(
                              ([, value, target]) =>
                                (target === "englishName" ||
                                  target === "nationality") &&
                                !value.trim(),
                            )
                            .map(([label, , target]) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => target && editQuestion(target)}
                              >
                                {label} 추가
                              </button>
                            ))}
                        </div>
                      )}
                      <div className={styles.chapterChoices}>
                        <button
                          type="button"
                          aria-label="학력 추가하기"
                          onClick={() => void proceed("educationType")}
                        >
                          <strong>학력 추가하기</strong>
                          <span>학교·전공·재학 상태 →</span>
                        </button>
                        <button
                          type="button"
                          aria-label="경력·활동 추가하기"
                          onClick={() => void proceed("experienceType")}
                        >
                          <strong>경력·활동 추가하기</strong>
                          <span>직장경력 또는 프로젝트 →</span>
                        </button>
                      </div>
                      {step !== "overview" && (
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => void proceed("overview")}
                        >
                          저장한 정보 보기
                        </button>
                      )}
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
                {editor.saveStatus === "error" && (
                  <>
                    <p role="alert" className={styles.error}>
                      {saveLabels.error}
                    </p>
                    <button
                      ref={retryButton}
                      type="button"
                      disabled={busy}
                      onClick={async (event) => {
                        const ownedFocus =
                          event.currentTarget.matches(":focus");
                        if (!(await proceed("retry")) && ownedFocus)
                          setRestoreRetryFocus(true);
                      }}
                    >
                      다시 저장하기
                    </button>
                  </>
                )}
                {(!summary || history.length > 0) && (
                  <div className={styles.foot}>
                    {choosing && (
                      <button
                        type="button"
                        className={styles.quiet}
                        disabled={busy}
                        aria-label="이 묶음 건너뛰기"
                        onClick={async () => {
                          if (step === "educationType") {
                            void proceed("experienceType");
                            return;
                          }
                          if (await proceed("experienceSummary"))
                            setSelection({
                              chapter: "projects",
                              entry: {
                                id: crypto.randomUUID(),
                                sectionId: "project",
                                values: {},
                              },
                            });
                        }}
                      >
                        건너뛰기
                      </button>
                    )}
                    <div className={styles.footEnd}>
                      {history.length > 0 && (
                        <button
                          type="button"
                          className={styles.quiet}
                          disabled={busy}
                          onClick={async () => {
                            if (!(await proceed("retry"))) return;
                            setStep(history[history.length - 1].step);
                            setSelection(history[history.length - 1].selection);
                            setReturnTo(history[history.length - 1].returnTo);
                            setHistory(history.slice(0, -1));
                          }}
                        >
                          이전
                        </button>
                      )}
                      {!summary && !choosing && (
                        <button
                          type="button"
                          className={
                            returnTo || answered ? styles.primary : undefined
                          }
                          disabled={busy}
                          aria-label={
                            returnTo || answered
                              ? undefined
                              : "이 질문 건너뛰기"
                          }
                          onClick={() => next()}
                        >
                          {returnTo
                            ? "확인하고 돌아가기"
                            : answered
                              ? "다음"
                              : "건너뛰기"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </form>
              {editor.saveStatus === "conflict" && (
                <div role="alert" className={styles.error}>
                  <p>
                    다른 화면에서 프로필이 변경되었습니다. 현재 편집은 저장하지
                    않았습니다. 최신 프로필을 다시 불러온 뒤 편집해 주세요.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reloadLatest()}
                  >
                    {editor.isReloading
                      ? "불러오는 중…"
                      : "최신 프로필 다시 불러오기"}
                  </button>
                  {editor.reloadFailed && (
                    <p>
                      최신 프로필을 불러오지 못했습니다. 편집 내용은 유지됩니다.
                      다시 시도해 주세요.
                    </p>
                  )}
                </div>
              )}
              {navigationFailed && (
                <p role="alert" className={styles.error}>
                  화면을 열지 못했어요. 다시 시도해 주세요.
                </p>
              )}
            </section>
            {!summary && autofillExit}
          </div>
        </div>
      </div>
    </main>
  );
}
