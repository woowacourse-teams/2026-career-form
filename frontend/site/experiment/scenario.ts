import { exampleFields } from "../demo/fixtures";
const values = [
  "김",
  "커리어",
  "career@example.com",
  "01000000000",
  "커리어대학교",
  "컴퓨터공학",
  "2026-02-20",
  "4.0",
  "정보처리기사",
  "2025-06-13",
];
export const scenarioFields = exampleFields.map(([id, label], index) => ({
  id,
  label,
  value: values[index]!,
  category:
    index < 2
      ? "인적사항"
      : index < 4
        ? "연락처"
        : index < 8
          ? "학력"
          : "자격증",
}));
export function startScenario({
  root,
  onProgress,
  onComplete,
  onError,
}: {
  root: HTMLElement;
  onProgress: (completed: number) => void;
  onComplete: (durationMs: number) => void;
  onError: () => void;
}): () => void {
  const inputs = scenarioFields.map((field) =>
    root.querySelector<HTMLInputElement>(`#${field.id}`),
  );
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  const stop = () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
  const fail = () => {
    stop();
    onError();
  };
  if (inputs.some((input) => !input)) {
    fail();
    return stop;
  }
  inputs.forEach((input) => {
    input!.value = "";
    delete input!.dataset.experimentFilled;
  });
  const started = performance.now();
  onProgress(0);
  scenarioFields.forEach((field, index) => {
    timers.push(
      setTimeout(
        () => {
          if (stopped) return;
          const input = inputs[index]!;
          if (!root.contains(input)) {
            fail();
            return;
          }
          input.value = field.value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          if (input.value !== field.value) {
            fail();
            return;
          }
          input.dataset.experimentFilled = "true";
          // Scroll only the form, keeping the panel and controls in place.
          const scroller =
            root.querySelector<HTMLElement>("[data-form-scroll]");
          if (scroller) {
            const bounds = input.getBoundingClientRect();
            const frame = scroller.getBoundingClientRect();
            if (bounds.bottom > frame.bottom || bounds.top < frame.top)
              scroller.scrollTop += bounds.top - frame.top - frame.height / 2;
          }
          onProgress(index + 1);
          if (index === scenarioFields.length - 1) {
            if (
              inputs.some(
                (element, i) =>
                  !element ||
                  !root.contains(element) ||
                  element.value !== scenarioFields[i]!.value,
              )
            ) {
              fail();
              return;
            }
            stopped = true;
            onComplete(performance.now() - started);
          }
        },
        (index + 1) * 2000,
      ),
    );
  });
  return stop;
}
