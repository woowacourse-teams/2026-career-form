import styles from "./WorkflowLoading.module.css";
import type { WriteProgress, WorkflowActivity } from "./progress-model";
export type { WriteProgress } from "./progress-model";

export function WorkflowLoading({
  writing,
  currentCategory,
  activity = "matching",
  progress = [],
}: {
  writing: boolean;
  currentCategory?: string;
  activity?: WorkflowActivity;
  progress?: readonly WriteProgress[];
}) {
  const message = writing
    ? currentCategory
      ? `${currentCategory} 정보를 입력하고 있어요`
      : "지원서에 입력하고 있어요"
    : {
        matching: "지원서 항목과 프로필 정보를 맞추고 있어요",
        preparing: "필요한 입력란을 준비하고 있어요",
        address: "주소 검색 결과를 확인하고 있어요",
      }[activity];
  const categories = [
    ...new Set([
      ...progress.map((entry) => entry.category),
      ...(writing && currentCategory ? [currentCategory] : []),
    ]),
  ];
  const written = progress.filter((entry) => entry.status === "written").length;
  return (
    <>
      <p className={styles.announcement} role="status" aria-live="polite">
        {message}
      </p>
      <section
        className={styles.container}
        aria-label="자동 기입 작업 영역"
        aria-busy="true"
      >
        <p className={styles.status} aria-hidden="true">
          <span className={styles.activityDot} />
          {message}
        </p>
        <h2 className={styles.total}>
          {written > 0 ? `${written}개 항목 입력` : "자동 기입"}
        </h2>
        {categories.length > 0 && (
          <ol className={styles.progress} aria-label="범주별 입력 현황">
            {categories.map((category) => {
              const entries = progress.filter(
                (entry) => entry.category === category,
              );
              const count = entries.filter(
                (entry) => entry.status === "written",
              ).length;
              const active = writing && category === currentCategory;
              return (
                <li key={category} data-active={active}>
                  <strong>{category}</strong>
                  <span>
                    {count > 0
                      ? `${count}개 입력`
                      : active
                        ? "입력 중"
                        : "입력 보류"}
                    {active && count > 0 && <small>입력 중</small>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
