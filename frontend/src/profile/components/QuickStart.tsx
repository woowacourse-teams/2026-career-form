import { useEffect, useRef, useState } from "react";
import { QuickStartGuide, QuickStartPicker } from "./QuickStartSections";
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
  conflict: "최신 프로필 확인이 필요해요.",
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
  const [initialized, setInitialized] = useState(false);
  const [returnTo, setReturnTo] = useState<Step | null>(null);
  const [history, setHistory] = useState<
    {
      step: Step;
      selection: { chapter: Chapter; entry: ProfileEntry };
      returnTo: Step | null;
    }[]
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
      setStep(hasValues ? "overview" : "name");
      setInitialized(true);
    }
  }, [editor.loadStatus, initialized, hasValues]);
  useEffect(() => {
    if (!viewSent.current) {
      viewSent.current = true;
      track("quick_profile_viewed", properties);
    }
  }, [track]);
  useEffect(() => {
    if (editor.loadStatus !== "ready" || !initialized || pending) return;
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
  }, [step, guide, summary, pending, editor.loadStatus, initialized]);
  function move(next: Step, origin: Step | null = null) {
    setHistory((current) => [...current, { step, selection, returnTo }]);
    setStep(next);
    setReturnTo(origin);
  }
  function editQuestion(target: Step) {
    void proceed(target, false, step);
  }
  async function proceed(
    destination: Step | "guide" | "profile" | "retry",
    skipIncompleteDates = false,
    origin: Step | null = null,
  ) {
    if (transition.current || editor.isReloading) return false;
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
      } else if (destination === returnTo) {
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
      setGuide(false);
      setNavigationFailed(false);
      setStep("overview");
    } finally {
      transition.current = false;
      setPending(false);
    }
  }
  function next(skipIncompleteDates = false) {
    const following = returnTo ?? steps[steps.indexOf(step) + 1];
    if (following) void proceed(following, skipIncompleteDates);
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
    <div className={`${styles.exit} ${summary ? styles.summaryExit : ""}`}>
      <button
        className={summary ? styles.primary : undefined}
        type="button"
        disabled={busy}
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
              aria-current={
                !guide && step !== "overview" && index === chapter
                  ? "step"
                  : undefined
              }
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
                : step === "overview"
                  ? "내가 준비한 정보"
                  : returnTo
                    ? "필요한 정보만 보충해요"
                    : `${["나를 소개하는 첫걸음", "학교에서 쌓은 시간", "나만의 경험"][chapter]} · ${steps.indexOf(step) + 1} / ${steps.length}`}
            </p>
            {!guide && (
              <button
                type="button"
                className={styles.textButton}
                disabled={busy}
                onClick={() => void proceed("profile")}
              >
                전체 프로필 편집
              </button>
            )}
          </div>
          {!guide && step !== "overview" && !returnTo && (
            <progress
              aria-label="현재 묶음 진행"
              value={steps.indexOf(step) + 1}
              max={steps.length}
            />
          )}
          <h1 ref={heading} tabIndex={-1}>
            {guide
              ? "지원서에서 자동 기입을 시작하세요"
              : summary && step !== "overview" && !summaryHasValues
                ? "필요한 정보는 나중에 채워도 좋아요"
                : titles[step]}
          </h1>
          {guide ? (
            <QuickStartGuide
              hasValues={hasValues}
              pending={busy}
              onBack={() => {
                if (!transition.current && !editor.isReloading) setGuide(false);
              }}
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
                disabled={busy}
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
                          {staleCareerDate ? "퇴사일 지우기" : "졸업일 지우기"}
                        </button>
                      </div>
                    )}
                    {step !== "overview" && autofillExit}
                    <p className={styles.continueLabel}>
                      조금 더 준비하고 싶다면 <span>선택</span>
                    </p>
                    <div className={styles.supplementActions}>
                      {missingFields
                        .filter(([, value]) => !value.trim())
                        .map(([label, , target]) => (
                          <button
                            key={label}
                            type="button"
                            aria-label={`${label} 수정`}
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
                              aria-label={`${label} 수정`}
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
                  disabled={busy}
                  onClick={() => void proceed("retry")}
                >
                  다시 저장하기
                </button>
              )}
              <div className={styles.actions}>
                {history.length > 0 && (
                  <button
                    type="button"
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
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => next()}
                  >
                    {returnTo ? "확인하고 돌아가기" : "다음"}
                  </button>
                )}
              </div>
              {!summary && (
                <button
                  type="button"
                  className={styles.skip}
                  disabled={busy}
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
                        entry: {
                          id: crypto.randomUUID(),
                          sectionId: "project",
                          values: {},
                        },
                      });
                  }}
                >
                  {choosing ? "이 묶음 건너뛰기" : "이 질문 건너뛰기"}
                </button>
              )}
              {!summary && autofillExit}
            </form>
          )}
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
        <p className={styles.footer}>내 정보는 현재 브라우저에 보관돼요.</p>
      </div>
    </main>
  );
}
