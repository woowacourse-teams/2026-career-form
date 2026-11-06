import {
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "../../../src/analytics/events";

export { ONBOARDING_STEPS, type OnboardingStep };

export const STEP_LABELS: Record<OnboardingStep, string> = {
  name: "이름",
  email: "이메일",
  roles: "직무 선택",
  alerts: "알림 안내",
  greeting: "Greeting",
  usage: "사용법",
};

// Only the step name is kept; what the user typed lives in the profile.
export const ONBOARDING_STEP_KEY = "careerForm.onboarding.step";

export interface StepStore {
  read(): Promise<OnboardingStep | undefined>;
  write(step: OnboardingStep): Promise<void>;
}
interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Losing the position only restarts the flow, so storage failures are quiet. */
export function createStepStore(storage: StorageArea): StepStore {
  return {
    async read() {
      try {
        const stored = (await storage.get(ONBOARDING_STEP_KEY))[
          ONBOARDING_STEP_KEY
        ];
        return ONBOARDING_STEPS.find((step) => step === stored);
      } catch {
        return undefined;
      }
    },
    async write(step) {
      try {
        await storage.set({ [ONBOARDING_STEP_KEY]: step });
      } catch {
        /* The flow keeps working from memory. */
      }
    },
  };
}
