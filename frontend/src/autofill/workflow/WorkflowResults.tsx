import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { useId, useState } from "react";
import styles from "./WorkflowResults.module.css";
import resultCss from "./WorkflowResults.module.css?inline";
import type { Profile } from "../../profile/model";
import type { WriteProgress } from "./progress-model";
import { buildResultModel, profileGroups } from "./result-model";
import { CompletedReview } from "./CompletedReview";
import { PendingResultRow } from "./PendingResultRow";
import { pendingResultPresentation } from "./pending-result-presentation";

export interface WorkflowResultsProps {
  progress?: readonly WriteProgress[];
  wasWritten?(candidateId: string): boolean;
  progressIdFor?(candidateId: string): string | undefined;
  progressStateFor?(progressId: string): boolean;
  reviewItems: readonly ReviewPlanItem[];
  results: readonly ApprovedWriteResult[];
  profile?: Profile;
  fieldStateFor?(
    candidateId: string,
  ): { visible: boolean; value: string } | undefined;
  optionsFor?(candidateId: string): readonly string[];
  onLocate?(candidateId: string): boolean;
  operatedCategories?: readonly string[];
  onLocateSection?(candidateIds: readonly string[], category?: string): boolean;
  copyText?(value: string): Promise<void>;
  /** Generic path only: also list fields that have no saved value. */
  profileGroupsVisible?: boolean;
  onOpenProfile?(): void;
}
export function WorkflowResults({
  progress,
  wasWritten,
  progressIdFor,
  progressStateFor,
  reviewItems,
  results,
  profile,
  fieldStateFor,
  optionsFor,
  onLocate,
  onLocateSection,
  operatedCategories,
  profileGroupsVisible = false,
  onOpenProfile,
  copyText = (value) => navigator.clipboard.writeText(value),
}: WorkflowResultsProps) {
  const tabsId = useId();
  const [selectedTab, setSelectedTab] = useState<
    "pending" | "completed" | null
  >(null);
  const model = buildResultModel({
    reviewItems,
    results,
    progress,
    profile,
    wasWritten,
    progressIdFor,
    progressStateFor,
    fieldStateFor,
  });
  const { completed, pending } = model;
  const unlisted = profileGroupsVisible
    ? profileGroups(model, fieldStateFor)
    : undefined;
  const pendingGroups = new Map<string, typeof pending>();
  for (const entry of pending) {
    const category =
      progress
        ?.find((step) => `progress:${step.id}` === entry.id)
        ?.category.replaceAll("·", "/") ??
      pendingResultPresentation(entry.item).category;
    pendingGroups.set(category, [
      ...(pendingGroups.get(category) ?? []),
      entry,
    ]);
  }
  const activeTab =
    selectedTab ?? (pending.length > 0 ? "pending" : "completed");
  const noFieldResults = completed.length === 0 && pending.length === 0;
  return (
    <section className={styles.results}>
      {/* Keep scoped selectors with their markup when entry CSS is fetched later. */}
      <style>{resultCss}</style>
      <div
        className={`${styles.summary} ${noFieldResults ? "" : styles.visuallyHidden}`}
      >
        <div className={styles.summaryText} role="status" aria-atomic="true">
          <h3>
            {noFieldResults
              ? operatedCategories?.length
                ? "선택·검색 결과를 확인해 주세요"
                : "자동 기입으로 바뀐 값이 없어요"
              : "자동 기입을 마쳤어요"}
          </h3>
        </div>
      </div>
      <div className={styles.tiles} role="tablist" aria-label="기입 결과 구분">
        {(["pending", "completed"] as const).map((tab, index) => (
          <button
            key={tab}
            type="button"
            role="tab"
            data-state={tab}
            data-count={tab === "pending" ? pending.length : completed.length}
            id={`${tabsId}-${tab}-tab`}
            aria-controls={`${tabsId}-${tab}-panel`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            aria-label={`${tab === "pending" ? "확인 필요" : "입력 완료"} ${tab === "pending" ? pending.length : completed.length}개`}
            onClick={() => setSelectedTab(tab)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const nextIndex =
                event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
              const next = nextIndex === 0 ? "pending" : "completed";
              setSelectedTab(next);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [nextIndex]?.focus();
            }}
          >
            {tab === "pending" ? "확인 필요" : "입력 완료"}{" "}
            <strong>
              {tab === "pending" ? pending.length : completed.length}
            </strong>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-pending-panel`}
        aria-labelledby={`${tabsId}-pending-tab`}
        tabIndex={0}
        hidden={activeTab !== "pending"}
      >
        {pending.length > 0 ? (
          <section className={styles.review} aria-label="확인 필요한 항목">
            <p className={styles.reviewHint}>
              항목명으로 입력칸을 찾고, 값을 복사해 채워 주세요.
            </p>
            <div className={styles.reviewList}>
              {[...pendingGroups].map(([category, entries]) => (
                <section
                  key={category}
                  className={styles.pendingGroup}
                  aria-label={category}
                >
                  <h4 className={styles.pendingCategory}>{category}</h4>
                  {entries.map((entry) => {
                    const name = pendingResultPresentation(entry.item).label;
                    const same = entries.filter(
                      ({ item }) =>
                        pendingResultPresentation(item).label === name,
                    );
                    return (
                      <PendingResultRow
                        key={entry.id}
                        entry={entry}
                        profile={profile}
                        options={optionsFor?.(entry.id)}
                        onLocate={onLocate}
                        copyText={copyText}
                        position={
                          same.length > 1
                            ? {
                                index: same.indexOf(entry) + 1,
                                total: same.length,
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </section>
              ))}
            </div>
          </section>
        ) : (
          <p className={styles.empty}>확인할 항목이 없어요.</p>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-completed-panel`}
        aria-labelledby={`${tabsId}-completed-tab`}
        tabIndex={0}
        hidden={activeTab !== "completed"}
      >
        {completed.length > 0 || !!operatedCategories?.length ? (
          <CompletedReview
            entries={completed}
            reviewItems={reviewItems}
            fieldStateFor={fieldStateFor}
            progressIdFor={progressIdFor}
            onLocateSection={onLocateSection}
            operatedCategories={operatedCategories}
          />
        ) : (
          <p className={styles.empty}>
            {noFieldResults
              ? "수동 복사로 돌아가 필요한 값을 복사해 주세요."
              : "입력 완료된 항목이 없어요."}
          </p>
        )}
      </div>
      {unlisted && (
        <div className={styles.profileGroups}>
          {(
            [
              ["프로필에 없는 항목", unlisted.notInProfile, false],
              ["프로필 미입력", unlisted.profileUnset, true],
            ] as const
          ).map(
            ([title, entries, canOpenProfile]) =>
              entries.length > 0 && (
                <details key={title} className={styles.profileGroup}>
                  <summary>
                    {title} <strong>{entries.length}</strong>
                  </summary>
                  <ul className={styles.profileGroupList}>
                    {entries.map((entry) => (
                      <li key={entry.id}>
                        {pendingResultPresentation(entry.item).label}
                      </li>
                    ))}
                  </ul>
                  {canOpenProfile && onOpenProfile && (
                    <button
                      type="button"
                      className={styles.profileGroupLink}
                      onClick={onOpenProfile}
                    >
                      프로필 채우기
                    </button>
                  )}
                </details>
              ),
          )}
        </div>
      )}
    </section>
  );
}
