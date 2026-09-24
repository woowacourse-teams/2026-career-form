import { useId, useRef, useState } from "react";
import type { WorkflowResultsProps } from "./WorkflowResults";
import type { WriteProgress } from "./progress-model";
import styles from "./WorkflowResults.module.css";

type Props = Pick<
  WorkflowResultsProps,
  "reviewItems" | "fieldStateFor" | "onLocateSection" | "progressIdFor"
> & { entries: readonly WriteProgress[] };
interface SummaryCategory {
  label: string;
  targets: string[];
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
    // Never bind an earlier scan's candidate ID to a new field.
    const item = reviewItems.find(
      (item) =>
        item.candidateId === entry.candidateId &&
        (!progressIdFor || progressIdFor(item.candidateId) === entry.id),
    );
    const category = entry.category.replaceAll("·", "/");
    const group = groups.get(category) ?? {
      label: category,
      targets: [],
      count: 0,
      signature: "",
    };
    if (item) group.targets.push(item.candidateId);
    group.count++;
    const live = item ? fieldStateFor?.(item.candidateId) : undefined;
    // Values are used only to invalidate a previous check, never rendered or persisted.
    group.signature += JSON.stringify([
      entry.id,
      item?.candidateId,
      item?.analysis?.valueBinding?.profileFieldKey ?? item?.profileFieldKey,
      item?.itemIndex,
      item?.profileEntryId,
      live?.visible,
      live?.value,
    ]);
    groups.set(category, group);
  }
  return [...groups.values()];
}

function CategorySummary({
  category,
  confirmed,
  onConfirm,
  onLocateSection,
}: {
  category: SummaryCategory;
  confirmed: boolean;
  onConfirm(): void;
  onLocateSection?: Props["onLocateSection"];
}) {
  const contentId = useId();
  const heading = useRef<HTMLButtonElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [previousConfirmed, setPreviousConfirmed] = useState(confirmed);
  const [unavailable, setUnavailable] = useState(false);
  if (previousConfirmed !== confirmed) {
    setPreviousConfirmed(confirmed);
    setCollapsed(confirmed);
  }
  const targets = category.targets;
  const canLocate = !!onLocateSection && targets.length > 0 && !unavailable;
  return (
    <li className={styles.summaryCategory} data-reviewed={confirmed}>
      <div className={styles.categoryHeading}>
        <h4>
          <button
            ref={heading}
            type="button"
            className={styles.categoryLocate}
            aria-label={
              collapsed
                ? `${category.label} ${confirmed ? "확인 완료, " : ""}요약 펼치기`
                : `${category.label} 구역 보기`
            }
            disabled={!collapsed && !canLocate}
            onClick={() => {
              if (collapsed) setCollapsed(false);
              else if (!onLocateSection?.(targets)) setUnavailable(true);
            }}
          >
            {category.label}
            <span aria-hidden="true">
              {confirmed ? "✓" : !collapsed && canLocate ? "↗" : ""}
            </span>
          </button>
        </h4>
        <button
          type="button"
          ref={toggle}
          className={styles.toggleSummary}
          aria-label={`${category.label} 요약 ${collapsed ? "펼치기" : "접기"}`}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={() => setCollapsed(!collapsed)}
        >
          {confirmed ? "확인 완료" : `${category.count}개 입력`}{" "}
          <span aria-hidden="true">{collapsed ? "⌄" : "⌃"}</span>
        </button>
      </div>
      <div id={contentId} hidden={collapsed}>
        {unavailable && (
          <p className={styles.completedUnavailable} role="status">
            이 구역으로 이동할 수 없어요. 지원서에서 직접 확인해 주세요.
          </p>
        )}
        <button
          type="button"
          className={styles.confirmReview}
          aria-pressed={confirmed}
          aria-label={`${category.label} ${confirmed ? "확인 취소" : "확인했어요"}`}
          onClick={() => {
            if (!confirmed)
              (heading.current?.disabled
                ? toggle.current
                : heading.current
              )?.focus({ preventScroll: true });
            onConfirm();
          }}
        >
          <span aria-hidden="true">{confirmed ? "✓" : "○"}</span>
          {confirmed ? "확인 취소" : "이 구역 확인했어요"}
        </button>
      </div>
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
          구역을 눌러 지원서에서 내용을 살펴보세요. 확인했어요를 누르면 해당
          구역이 접혀요.
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
            <CategorySummary
              key={category.label}
              category={category}
              confirmed={confirmed}
              onLocateSection={props.onLocateSection}
              onConfirm={() =>
                setReview({
                  snapshot,
                  signatures,
                  checked: confirmed
                    ? checked.filter((label) => label !== category.label)
                    : [...checked, category.label],
                })
              }
            />
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
