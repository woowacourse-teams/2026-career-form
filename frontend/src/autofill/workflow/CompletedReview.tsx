import { useId, useState } from "react";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { WorkflowResultsProps } from "./WorkflowResults";
import type { WriteProgress } from "./progress-model";
import { pendingResultPresentation } from "./pending-result-presentation";
import styles from "./WorkflowResults.module.css";

type Props = Pick<
  WorkflowResultsProps,
  "reviewItems" | "fieldStateFor" | "onLocate" | "progressIdFor"
> & { entries: readonly WriteProgress[] };
interface SummaryField {
  id: string;
  label: string;
  value: string;
  candidateId?: string;
}
interface SummaryRecord {
  id: string;
  label: string;
  fields: SummaryField[];
}
interface SummaryCategory {
  label: string;
  records: SummaryRecord[];
  count: number;
  signature: string;
}

function summarize({
  entries,
  reviewItems,
  fieldStateFor,
  progressIdFor,
}: Props): SummaryCategory[] {
  const groups = new Map<string, SummaryCategory>();
  for (const entry of entries) {
    // Historical candidate IDs can belong to another scan: only use current bindings.
    const item = reviewItems.find(
      (item) =>
        item.candidateId === entry.candidateId &&
        (!progressIdFor || progressIdFor(item.candidateId) === entry.id),
    );
    const key =
      item?.analysis?.valueBinding?.profileFieldKey ?? item?.profileFieldKey;
    const [categoryId, sectionId, fieldId] = key?.split(".") ?? [];
    const definition = PROFILE_CATEGORIES.find(
      (category) => category.id === categoryId,
    );
    const topLevel = definition?.topLevelFields?.find(
      (field) => field.id === fieldId,
    );
    const section = topLevel
      ? undefined
      : definition?.sections.find((section) => section.id === sectionId);
    const field =
      section?.fields.find((field) => field.id === fieldId) ??
      definition?.topLevelFields?.find((field) => field.id === fieldId);
    const category = entry.category.replaceAll("·", "/");
    const group = groups.get(category) ?? {
      label: category,
      records: [],
      count: 0,
      signature: "",
    };
    const identity =
      item?.itemIndex !== undefined
        ? `index:${item.itemIndex}`
        : item?.profileEntryId
          ? `entry:${item.profileEntryId}`
          : undefined;
    // Never join repeated records unless their binding supplies a record identity.
    const recordId =
      section && (!definition?.repeatable || identity)
        ? `${categoryId}:${sectionId}:${identity ?? "single"}`
        : entry.id;
    const recordLabel = section
      ? `${section.label.replaceAll("·", "/")}${definition?.repeatable && item?.itemIndex !== undefined ? ` ${item.itemIndex + 1}` : ""}`
      : entry.label.replaceAll("·", "/");
    const record = group.records.find((record) => record.id === recordId) ?? {
      id: recordId,
      label: recordLabel,
      fields: [],
    };
    const live = item ? fieldStateFor?.(item.candidateId) : undefined;
    const masked =
      !!item && pendingResultPresentation(item).sensitive && !item.revealed;
    const value = masked
      ? "값 가림"
      : live?.visible && live.value
        ? live.value
        : "지원서에서 확인";
    record.fields.push({
      id: entry.id,
      label: field?.label ?? entry.label.replaceAll("·", "/"),
      value,
      candidateId: item?.candidateId,
    });
    if (!group.records.includes(record)) group.records.push(record);
    group.count++;
    // Session memory only; raw sensitive values never enter markup, storage or logs.
    group.signature += JSON.stringify([
      entry.id,
      item?.candidateId,
      key,
      identity,
      item?.profileEntryId,
      live?.visible,
      live?.value,
      masked,
    ]);
    groups.set(category, group);
  }
  return [...groups.values()];
}

function RecordSummary({
  record,
  onLocate,
}: {
  record: SummaryRecord;
  onLocate?: Props["onLocate"];
}) {
  const descriptionId = useId();
  const [unavailable, setUnavailable] = useState(false);
  const targets = record.fields.flatMap((field) =>
    field.candidateId ? [field.candidateId] : [],
  );
  const content = (
    <>
      <span className={styles.recordTitle}>{record.label}</span>
      <span id={descriptionId} className={styles.recordValues}>
        {record.fields.map((field) => (
          <span key={field.id} className={styles.summaryFact}>
            {field.label !== record.label && (
              <>
                <span className={styles.factLabel}>{field.label}</span>{" "}
              </>
            )}
            <span className={styles.factValue}>{field.value}</span>{" "}
          </span>
        ))}
      </span>
      {onLocate && targets.length > 0 && !unavailable && (
        <span className={styles.recordArrow} aria-hidden="true">
          ↗
        </span>
      )}
    </>
  );
  return (
    <li>
      {onLocate && targets.length > 0 ? (
        <button
          type="button"
          className={styles.recordSummary}
          aria-label={`${record.label} 지원서에서 보기`}
          aria-describedby={descriptionId}
          disabled={unavailable}
          onClick={() => {
            if (!targets.some((id) => onLocate(id))) setUnavailable(true);
          }}
        >
          {content}
        </button>
      ) : (
        <div className={styles.recordSummary}>{content}</div>
      )}
      {unavailable && (
        <p className={styles.completedUnavailable} role="status">
          지원서에서 직접 확인해 주세요.
        </p>
      )}
    </li>
  );
}

export function CompletedReview(props: Props) {
  const categories = summarize(props);
  const signatures = Object.fromEntries(
    categories.map((category) => [category.label, category.signature]),
  );
  const snapshot = JSON.stringify(signatures);
  const [review, setReview] = useState<{
    snapshot: string;
    signatures: Record<string, string>;
    checked: string[];
  }>({ snapshot, signatures, checked: [] });
  const checked = review.checked.filter(
    (label) => signatures[label] === review.signatures[label],
  );
  // Reset changed/removed sections, including changes later reverted, without persisting private values.
  if (snapshot !== review.snapshot)
    setReview({ snapshot, signatures, checked });
  return (
    <section className={styles.completed} aria-label="입력 완료 내역">
      <div className={styles.completedIntro}>
        <span className={styles.reviewEyebrow}>
          {checked.length === categories.length
            ? "입력한 내용을 모두 살펴봤어요"
            : "입력은 끝났고, 검토가 남았어요"}
        </span>
        <h4>제출 전, 입력한 내용을 살펴보세요</h4>
        <p>
          이름·날짜·숫자를 살펴보고 확인한 구역에 표시해 주세요. 요약을 누르면
          지원서에서 볼 수 있어요.
        </p>
        <div className={styles.reviewProgress}>
          <span role="status">
            {checked.length} / {categories.length}개 구역 확인
          </span>
          <span>
            {checked.length === categories.length
              ? "모두 살펴봤어요"
              : "직접 확인한 구역만 표시돼요"}
          </span>
        </div>
        <div className={styles.reviewTrack} aria-hidden="true">
          {categories.map((category) => (
            <span
              key={category.label}
              data-checked={checked.includes(category.label)}
            />
          ))}
        </div>
      </div>
      <ul className={styles.categories} aria-label="범주별 입력 결과">
        {categories.map((category) => {
          const confirmed = checked.includes(category.label);
          return (
            <li
              key={category.label}
              className={styles.summaryCategory}
              data-reviewed={confirmed}
            >
              <div className={styles.categoryHeading}>
                <h4>{category.label}</h4>
                <strong>{category.count}개 입력</strong>
              </div>
              <ul className={styles.summaryRecords}>
                {category.records.map((record) => (
                  <RecordSummary
                    key={record.id}
                    record={record}
                    onLocate={props.onLocate}
                  />
                ))}
              </ul>
              <button
                type="button"
                className={styles.confirmReview}
                aria-pressed={confirmed}
                aria-label={`${category.label} ${confirmed ? "확인 취소" : "확인했어요"}`}
                onClick={() =>
                  setReview({
                    snapshot,
                    signatures,
                    checked: confirmed
                      ? checked.filter((label) => label !== category.label)
                      : [...checked, category.label],
                  })
                }
              >
                <span aria-hidden="true">{confirmed ? "✓" : "○"}</span>
                {confirmed ? "확인했어요" : "이 구역 확인했어요"}
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.completedFootnote}>
        이 표시는 이번 입력 내용의 검토용이에요. 저장과 제출은 지원서에서 직접
        진행해 주세요.
      </p>
    </section>
  );
}
