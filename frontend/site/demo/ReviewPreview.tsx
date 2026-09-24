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
    <div className={styles.preview}>
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
          if ((event.target as HTMLElement).closest('[role="tab"]'))
            setExplored(false);
        }}
      >
        <h3>
          <span className={styles.demoBadge}>직접 체험</span> 기입 결과
        </h3>
        <p className={styles.hint} role="status">
          {feedback}
        </p>
        {snapshot && (
          <WorkflowResults
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
