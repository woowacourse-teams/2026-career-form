import { useEffect, useMemo, useRef, useState } from "react";
import { collectFieldsSnapshot } from "../../src/autofill/dom/collect";
import { createFieldPresentation } from "../../src/autofill/write/field-presentation";
import { WorkflowResults } from "../../src/autofill/workflow/WorkflowResults";
import type { ReviewPlanItem } from "../../src/autofill/review/review-plan";
import styles from "./ReviewPreview.module.css";

const examples = [
  {
    id: "company",
    label: "직장명",
    category: "직장경력",
    key: "careers.career.companyName",
    value: "예시컴퍼니",
    written: true,
  },
  {
    id: "department",
    label: "근무부서",
    category: "직장경력",
    key: "careers.career.department",
    value: "서비스개발팀",
    written: true,
  },
  {
    id: "test",
    label: "시험명",
    category: "어학",
    key: "languages.languageTest.testName",
    value: "TOEIC",
    written: true,
  },
  {
    id: "grade",
    label: "등급·점수",
    category: "어학",
    key: "languages.languageTest.grade",
    value: "900",
    written: true,
  },
  {
    id: "address",
    label: "기본주소",
    category: "직접 채울 항목",
    key: "contact.contact.addressLine1",
    value: "예시시 가상로 100",
    written: false,
  },
  {
    id: "major",
    label: "주전공명",
    category: "직접 채울 항목",
    key: "education.university.majorName",
    value: "컴퓨터공학",
    written: false,
  },
];

/** Synthetic, read-only form. Uses production result and highlight components without profile access. */
export function ReviewPreview() {
  const root = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const scale = Math.min(1, viewportWidth / 760);
  const [cursor, setCursor] = useState({
    x: 320,
    y: 75,
    visible: false,
    pressed: false,
  });
  const [run, setRun] = useState(0);
  const [step, setStep] = useState(0);
  const [explored, setExplored] = useState(false);
  const [feedback, setFeedback] = useState("아래 패널을 직접 눌러보세요");
  const form = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] =
    useState<ReturnType<typeof collectFieldsSnapshot>>();
  const presentation = useMemo(() => createFieldPresentation(document), []);
  useEffect(() => {
    // All example fields stay visible above the results; never scroll the enclosing guide.
    form.current
      ?.querySelectorAll<HTMLElement>("section, input")
      .forEach((element) => {
        element.scrollIntoView = () => {};
      });
    setSnapshot(collectFieldsSnapshot(document));
    return () => presentation.clear();
  }, [presentation]);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const selectStep = (next: number) => {
    setStep(next);
    setRun((value) => value + 1);
  };
  useEffect(() => {
    if (!step || !snapshot) return;
    presentation.clear();
    setCursor((current) => ({ ...current, visible: true, pressed: false }));
    const find = (selector: string) =>
      root.current?.querySelector<HTMLElement>(selector);
    const click = (selector: string) => find(selector)?.click();
    const move = (selector: string) => {
      const target = find(selector)?.getBoundingClientRect();
      const origin = root.current?.getBoundingClientRect();
      if (target && origin)
        setCursor({
          x: (target.left - origin.left + target.width * 0.45) / scale,
          y: (target.top - origin.top + target.height * 0.5) / scale,
          visible: true,
          pressed: false,
        });
    };
    const target =
      step === 1
        ? '[aria-label="기본주소 필드로 이동"]'
        : step === 2
          ? '[aria-label="기본주소 복사"]'
          : '[aria-label="직장경력 구역 보기"]';
    const timers = [
      window.setTimeout(
        () =>
          click(
            `[role="tab"][data-state="${step === 3 ? "completed" : "pending"}"]`,
          ),
        20,
      ),
      window.setTimeout(() => move(target), 100),
      window.setTimeout(() => {
        click(target);
        setCursor((current) => ({ ...current, pressed: true }));
      }, 750),
    ];
    return () => {
      timers.forEach(window.clearTimeout);
      presentation.clear();
    };
  }, [step, run, snapshot, presentation, scale]);
  const candidates =
    snapshot?.request.sections.flatMap((section) => section.fields) ?? [];
  const bound = examples.flatMap((example) => {
    const candidate = candidates.find(
      (field) => field.domId === `review-demo-${example.id}`,
    );
    return candidate
      ? [{ ...example, candidateId: candidate.candidateId }]
      : [];
  });
  const items: ReviewPlanItem[] = bound.map((example) => ({
    candidateId: example.candidateId,
    fieldLabel: example.label,
    profileFieldKey: example.key,
    profileValue: example.value,
    previewValue: example.value,
    currentValue: "",
    status: example.written ? "available" : "unavailable",
    selected: example.written,
    disabled: !example.written,
    revealed: true,
    reason: example.written ? "" : "직접 확인 필요",
  }));
  return (
    <div
      ref={root}
      className={styles.preview}
      data-step={step}
      style={{ width: `${Math.max(760, viewportWidth)}px`, zoom: scale }}
    >
      <div className={styles.story}>
        <div className={styles.storyHeading}>
          <strong>입력 후에는 이렇게 확인해요</strong>
          <span>숫자에 마우스를 올려보세요</span>
        </div>
        <ol aria-label="결과 확인 시연 단계">
          {["남은 항목 찾기", "값 복사하기", "입력 완료 살펴보기"].map(
            (label, index) => (
              <li
                key={label}
                aria-current={step === index + 1 ? "step" : undefined}
              >
                <button
                  type="button"
                  onMouseEnter={() => selectStep(index + 1)}
                  onFocus={() => selectStep(index + 1)}
                  onClick={() => selectStep(index + 1)}
                  aria-label={`${index + 1}. ${label}`}
                  aria-pressed={step === index + 1}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              </li>
            ),
          )}
        </ol>
      </div>
      <svg
        className={styles.cursor}
        aria-hidden="true"
        data-visible={cursor.visible}
        data-pressed={cursor.pressed}
        style={{ left: cursor.x, top: cursor.y }}
        width="32"
        height="40"
        viewBox="0 0 32 40"
      >
        <path
          d="M3 2 L3 29 L10 23 L16 36 L22 33 L16 21 L27 21 Z"
          fill="#594637"
          stroke="white"
          strokeWidth="2"
        />
      </svg>
      <div ref={form} className={styles.form} aria-label="가상 지원서">
        <div className={styles.caption}>
          <strong>예시 지원서</strong>
          <span>가상 정보 · 읽기 전용</span>
        </div>
        {["직장경력", "어학", "직접 채울 항목"].map((category) => (
          <section key={category} className={styles.category}>
            <h3>{category}</h3>
            <div className={styles.fields}>
              {examples
                .filter((example) => example.category === category)
                .map((example) => (
                  <div className={styles.control} key={example.id}>
                    <label htmlFor={`review-demo-${example.id}`}>
                      {example.label}
                    </label>
                    <input
                      id={`review-demo-${example.id}`}
                      name={`review-demo-${example.id}`}
                      value={example.written ? example.value : ""}
                      placeholder={
                        example.written ? undefined : "직접 검색·선택"
                      }
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
      <div
        className={styles.results}
        aria-label="결과 체험"
        data-guided={!explored}
        onClickCapture={(event) => {
          if (event.nativeEvent.isTrusted) {
            setStep(0);
            setCursor((current) => ({ ...current, visible: false }));
          }
          if ((event.target as HTMLElement).closest('[role="tab"]'))
            setExplored(false);
        }}
      >
        <h3>
          <span className={styles.demoBadge}>동작 예시</span> 기입 결과
        </h3>
        <p className={styles.hint} role="status">
          {step
            ? [
                "",
                "확인 필요 항목을 누르면 입력칸으로 이동해요",
                "값을 복사한 뒤 검색·선택은 직접 마무리해요",
                "입력 완료에서 구역별로 입력한 내용을 살펴보세요",
              ][step]
            : feedback}
        </p>
        {snapshot && (
          <WorkflowResults
            key={run}
            copyText={async (value) => {
              // Simulated hover clicks never change the reader's clipboard.
              if (!step) await navigator.clipboard.writeText(value);
            }}
            reviewItems={items}
            results={bound.map((example) =>
              example.written
                ? {
                    candidateId: example.candidateId,
                    status: "written" as const,
                  }
                : {
                    candidateId: example.candidateId,
                    status: "skipped" as const,
                    reason: "직접 확인 필요",
                    failureCode:
                      example.id === "address"
                        ? ("FIELD_READONLY" as const)
                        : ("SEARCH_NO_RESULTS" as const),
                  },
            )}
            fieldStateFor={(id) => {
              const example = bound.find(
                (example) => example.candidateId === id,
              );
              return example
                ? { visible: true, value: example.written ? example.value : "" }
                : undefined;
            }}
            onLocate={(id) => {
              const shown = presentation.show(snapshot.registry, id);
              if (shown) {
                const field = bound.find(
                  (example) => example.candidateId === id,
                );
                const input = document.getElementById(
                  `review-demo-${field?.id}`,
                );
                input?.style.setProperty("outline-offset", "-2px", "important");
                setExplored(true);
                setFeedback(
                  `↑ 위 지원서의 ${field?.label ?? "입력칸"}을 찾아드렸어요`,
                );
              }
              return shown;
            }}
            onLocateSection={(ids) => {
              const shown = presentation.showSection(snapshot.registry, ids);
              if (shown) {
                setExplored(true);
                const field = bound.find((example) =>
                  ids.includes(example.candidateId),
                );
                setFeedback(
                  `↑ 위 지원서에서 ${field?.category ?? "선택한 구역"} 입력칸을 확인하세요`,
                );
              }
              return shown;
            }}
          />
        )}
      </div>
    </div>
  );
}
