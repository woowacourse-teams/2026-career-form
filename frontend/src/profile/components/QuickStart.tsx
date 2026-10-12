import { useEffect, useRef, useState } from "react";
import { OpeningGuide } from "../../../site/Guide";
import type { TrackEvent } from "../../analytics/events";
import { useProfileSaveTracking } from "../../analytics/use-profile-save-tracking";
import { trackExtensionEvent } from "../../analytics/extension-tracker";
import { useProfileEditor } from "../hooks/use-profile-editor";
import type { ProfileRepository } from "../profile-repository";
import styles from "./QuickStart.module.css";

const fields = [
  {
    category: "personal",
    id: "koreanFamilyName",
    label: "국문 성",
    type: "text",
    autocomplete: "family-name",
  },
  {
    category: "personal",
    id: "koreanGivenName",
    label: "국문 이름",
    type: "text",
    autocomplete: "given-name",
  },
  {
    category: "contact",
    id: "email",
    label: "이메일",
    type: "email",
    autocomplete: "email",
  },
  {
    category: "contact",
    id: "phoneNumber",
    label: "전화번호",
    type: "tel",
    autocomplete: "tel",
  },
] as const;
const properties = { surface: "extension_onboarding" } as const;
const saveLabels = {
  idle: "입력한 정보는 이 브라우저에 자동 저장돼요.",
  saving: "저장 중이에요…",
  saved: "이 브라우저에 저장했어요.",
  error: "저장하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.",
};

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
  const [guide, setGuide] = useState(false);
  const [pending, setPending] = useState(false);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const viewSent = useRef(false);
  const transition = useRef(false);
  const hasValues = fields.some(({ category, id }) =>
    editor.profile[category][id]?.trim(),
  );

  useEffect(() => {
    if (!viewSent.current) {
      viewSent.current = true;
      track("quick_profile_viewed", properties);
    }
  }, [track]);
  useEffect(() => {
    if (editor.loadStatus === "ready") heading.current?.focus();
  }, [guide, editor.loadStatus]);

  const proceed = async (destination: "guide" | "profile" | "retry") => {
    if (transition.current) return;
    transition.current = true;
    setPending(true);
    setNavigationFailed(false);
    try {
      // replaceProfile cancels the debounce and waits behind any active save.
      // Keep the loaded profile intact; only the four edited fields changed.
      if (editor.saveStatus !== "idle") {
        if (!(await editor.replaceProfile(editor.profile))) return;
      }
      if (destination === "profile") onOpenProfile();
      if (destination === "guide") {
        if (!hasValues) track("quick_profile_skipped", properties);
        setGuide(true);
      }
    } catch {
      setNavigationFailed(true);
    } finally {
      transition.current = false;
      setPending(false);
    }
  };

  if (editor.loadStatus === "loading")
    return (
      <main className={styles.page}>
        <p role="status">프로필을 불러오는 중이에요.</p>
      </main>
    );
  if (editor.loadStatus === "error")
    return (
      <main className={styles.page}>
        <p role="alert">
          프로필을 불러오지 못했어요. 페이지를 새로 열어 다시 시도해 주세요.
        </p>
      </main>
    );

  return (
    <main className={styles.page} id="main">
      <div className={styles.shell}>
        <header className={styles.brand}>
          <img src="/side-panel-launcher-logo.png" alt="" /> CAREER FORM{" "}
          <span>첫 자동 기입 준비</span>
        </header>
        <ol className={styles.steps} aria-label="시작 단계">
          <li aria-current={!guide ? "step" : undefined}>
            <span>1</span> 기본 정보
          </li>
          <li aria-current={guide ? "step" : undefined}>
            <span>2</span> 지원서에서 사용
          </li>
        </ol>
        <section className={styles.card}>
          <p className={styles.eyebrow}>
            {guide ? "다음은 실제 지원서에서" : "필요한 만큼만, 가볍게"}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {guide
              ? "지원서에서 자동 기입을 시작하세요"
              : "이름과 연락처부터 등록하세요"}
          </h1>
          {guide ? (
            <>
              <p className={styles.description}>
                {hasValues
                  ? "등록한 정보로 시작하고, 나머지는 필요할 때 추가하세요."
                  : "저장한 정보가 없다면 입력할 항목이 없을 수 있어요. 필요한 정보는 언제든 추가할 수 있어요."}
              </p>
              <ol className={styles.instructions}>
                <li>
                  <strong>작성 중인 지원서 탭을 열어 주세요.</strong>
                  <span>
                    지금 지원서가 없다면, 다음에 작성할 때 시작해도 괜찮아요.
                  </span>
                </li>
                <li>
                  <strong>
                    Chrome 확장 프로그램에서 Career Form을 여세요.
                  </strong>
                  <span>
                    페이지의 커리어폼 아이콘으로도 패널을 열 수 있어요.
                  </span>
                </li>
                <li>
                  <strong>패널의 ‘자동 기입’을 누르세요.</strong>
                  <span>
                    입력 예정 값과 항목을 확인하고, 원하는 항목만 선택해
                    적용하세요.
                  </span>
                </li>
              </ol>
              <OpeningGuide />
              <p className={styles.note}>
                지원서 저장과 제출은 직접 해 주세요.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setGuide(false)}
                >
                  기본 정보 수정
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void proceed("profile")}
                >
                  전체 프로필 편집
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void proceed("guide");
              }}
            >
              <p className={styles.description} id="quick-start-help">
                나머지는 필요할 때 추가할 수 있어요. 모든 항목은 선택
                사항이에요.
              </p>
              <div className={styles.fields}>
                {fields.map(({ category, id, label, type, autocomplete }) => (
                  <label
                    key={id}
                    className={styles.field}
                    htmlFor={`quick-${id}`}
                  >
                    {label}
                    <input
                      id={`quick-${id}`}
                      type={type}
                      autoComplete={autocomplete}
                      aria-describedby="quick-start-help"
                      value={editor.profile[category][id] ?? ""}
                      disabled={pending}
                      onChange={(event) =>
                        editor.updateSingle(category, id, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
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
                {hasValues ? (
                  <button
                    className={styles.primary}
                    type="submit"
                    disabled={pending}
                  >
                    저장하고 사용 방법 보기
                  </button>
                ) : (
                  <button
                    className={styles.primary}
                    type="button"
                    disabled={pending}
                    onClick={() => void proceed("guide")}
                  >
                    나중에 입력하기
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void proceed("profile")}
                >
                  전체 프로필 편집
                </button>
              </div>
            </form>
          )}
          {navigationFailed && (
            <p role="alert" className={styles.error}>
              화면을 열지 못했어요. 다시 시도해 주세요.
            </p>
          )}
        </section>
        <p className={styles.footer}>
          내 정보는 현재 브라우저에 보관돼요. 전체 프로필을 채우지 않아도 시작할
          수 있어요.
        </p>
      </div>
    </main>
  );
}
