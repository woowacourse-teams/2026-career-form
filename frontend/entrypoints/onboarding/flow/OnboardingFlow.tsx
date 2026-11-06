import { useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../../../src/analytics/events";
import { useProfileSaveTracking } from "../../../src/analytics/use-profile-save-tracking";
import type { PushClient } from "../../../src/job-postings/push-client";
import { useProfileEditor } from "../../../src/profile/hooks/use-profile-editor";
import type { ProfileRepository } from "../../../src/profile/profile-repository";
import logo from "../../../site/landing/assets/logo.webp";
import { BasicStep } from "./BasicStep";
import { ProgressRail } from "./ProgressRail";
import {
  ONBOARDING_STEPS,
  STEP_LABELS,
  type OnboardingStep,
  type StepStore,
} from "./steps";
import styles from "./Flow.module.css";

const surface = "extension_onboarding";

export interface OnboardingFlowProps {
  repository: ProfileRepository;
  pushClient: PushClient;
  track: TrackEvent;
  stepStore: StepStore;
  /** Calls back when the stored profile changes; returns the unsubscribe. */
  watchProfile(listener: () => void): () => void;
  onOpenProfile(): void;
  onOpenPostings(): void;
}

/** The six first-install steps in one line, resumed from the stored step. */
export function OnboardingFlow({
  repository,
  track: injectedTrack,
  stepStore,
  onOpenProfile,
}: OnboardingFlowProps) {
  const { repository: trackedRepository, track } = useProfileSaveTracking(
    repository,
    injectedTrack,
    surface,
  );
  const editor = useProfileEditor(trackedRepository);
  const [step, setStep] = useState<OnboardingStep>();
  const [pending, setPending] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const viewed = useRef<OnboardingStep | undefined>(undefined);
  const transition = useRef(false);

  useEffect(() => {
    let active = true;
    void stepStore.read().then((stored) => {
      if (active) setStep(stored ?? "name");
    });
    return () => {
      active = false;
    };
  }, [stepStore]);
  useEffect(() => {
    if (!step || viewed.current === step) return;
    viewed.current = step;
    track("onboarding_step_viewed", { surface, step });
  }, [step, track]);
  const ready = editor.loadStatus === "ready" && step !== undefined;
  useEffect(() => {
    if (!ready || !moved.current) return;
    (
      content.current?.querySelector<HTMLElement>("input:not(:disabled)") ??
      heading.current
    )?.focus();
  }, [step, ready]);

  function go(next: OnboardingStep) {
    moved.current = true;
    setStep(next);
    void stepStore.write(next);
    window.scrollTo?.({ top: 0, behavior: "instant" });
  }
  // A pending edit is saved before leaving the step or the page.
  async function leave(action: () => void) {
    if (transition.current || editor.isReloading) return;
    transition.current = true;
    setPending(true);
    try {
      if (
        editor.saveStatus !== "idle" &&
        editor.saveStatus !== "saved" &&
        !(await editor.replaceProfile(editor.profile))
      )
        return;
      action();
    } finally {
      transition.current = false;
      setPending(false);
    }
  }

  if (!ready)
    return (
      <main className={styles.flow}>
        <p
          className={styles.message}
          role={editor.loadStatus === "error" ? "alert" : "status"}
        >
          {editor.loadStatus === "error"
            ? "프로필을 불러오지 못했어요. 페이지를 새로 열어 다시 시도해 주세요."
            : "프로필을 불러오는 중이에요."}
        </p>
      </main>
    );
  const index = ONBOARDING_STEPS.indexOf(step);
  const previous = index > 0 ? ONBOARDING_STEPS[index - 1] : undefined;
  const following = ONBOARDING_STEPS[index + 1];
  const busy = pending || editor.isReloading;
  const back = previous ? () => void leave(() => go(previous)) : undefined;
  const next = () => {
    if (following) void leave(() => go(following));
  };
  return (
    <div className={styles.flow}>
      <header className={styles.hd}>
        <span className={styles.logo}>
          <img src={logo} alt="" />
          Career Form
        </span>
        <button
          type="button"
          className={styles.lnk}
          disabled={busy}
          onClick={() => void leave(onOpenProfile)}
        >
          전체 프로필 편집
        </button>
      </header>
      <main id="main" className={styles.wrap}>
        <ProgressRail step={step} />
        <div ref={content}>
          {step === "name" || step === "email" ? (
            <BasicStep
              step={step}
              profile={editor.profile}
              updateSingle={editor.updateSingle}
              heading={heading}
              busy={busy}
              saved={editor.saveStatus === "saved"}
              onBack={back}
              onNext={next}
            />
          ) : (
            <section className={styles.card}>
              <h1 ref={heading} tabIndex={-1}>
                {STEP_LABELS[step]}
              </h1>
            </section>
          )}
          {editor.saveStatus === "error" && (
            <p role="alert" className={styles.error}>
              저장하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.
            </p>
          )}
          {editor.saveStatus === "conflict" && (
            <div role="alert" className={styles.error}>
              <p>
                다른 화면에서 프로필이 변경되었습니다. 최신 프로필을 다시 불러온
                뒤 편집해 주세요.
              </p>
              <button
                type="button"
                className={`${styles.btn} ${styles.soft} ${styles.small}`}
                disabled={busy}
                onClick={() => void editor.reloadLatest()}
              >
                최신 프로필 다시 불러오기
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
