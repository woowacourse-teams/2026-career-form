import { useState } from "react";

import {
  createMockReviewItems,
  groupReviewItems,
  toggleReviewItem,
  type ReviewGroup,
  type ReviewItem,
  type ReviewStatus,
} from "./model";
import styles from "./AutofillDemo.module.css";

export type DemoStage =
  "analysis" | "review" | "confirmation" | "progress" | "result" | "exception";

type ExceptionId =
  "unsupported" | "analysis-failed" | "no-results" | "partial-failure";

interface AutofillDemoProps {
  onExit(): void;
  initialStage?: DemoStage;
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  available: "입력 가능",
  "needs-review": "확인 필요",
  conflict: "기존 값 충돌",
  sensitive: "민감정보",
  unavailable: "입력 불가",
};

const EXCEPTIONS: Record<ExceptionId, { title: string; description: string }> =
  {
    unsupported: {
      title: "지원하지 않는 페이지",
      description:
        "이 페이지에서는 자동 기입을 시작하지 않았습니다. 수동 복사는 계속 사용할 수 있습니다.",
    },
    "analysis-failed": {
      title: "분석 실패",
      description:
        "자동 기입은 완료하지 않았습니다. 조건부 선택 상태를 확인한 뒤 다시 시도하거나 수동 복사로 전환하세요.",
    },
    "no-results": {
      title: "검색 결과 없음",
      description: "검색 조건을 바꾸거나 프로필 범주를 다시 확인해 주세요.",
    },
    "partial-failure": {
      title: "일부 기입 실패",
      description:
        "성공한 항목과 실패한 항목을 구분했습니다. 실패 항목은 직접 입력해 주세요.",
    },
  };

function Header({ step, title }: { step: string; title: string }) {
  return (
    <header className={styles.header}>
      <span>{step}</span>
      <h2>{title}</h2>
    </header>
  );
}

function ReviewGroupSection({
  group,
  onChange,
}: {
  group: ReviewGroup;
  onChange(id: string): void;
}) {
  const headingId = `review-group-${group.id}`;
  return (
    <section className={styles.reviewGroup} aria-labelledby={headingId}>
      <div className={styles.reviewGroupHeader}>
        <h3 id={headingId}>
          {group.label} <span>{group.items.length}개</span>
        </h3>
        <p>{group.description}</p>
      </div>
      <div className={styles.reviewList}>
        {group.items.map((item) => (
          <label
            className={styles.reviewItem}
            data-status={item.status}
            key={item.id}
          >
            <input
              type="checkbox"
              checked={item.selected}
              disabled={item.disabled}
              onChange={() => onChange(item.id)}
            />
            <span className={styles.reviewCopy}>
              <strong>{item.fieldLabel}</strong>
              <span>{item.previewValue}</span>
              <small>{item.reason}</small>
            </span>
            <em>{STATUS_LABEL[item.status]}</em>
          </label>
        ))}
      </div>
    </section>
  );
}

function Review({
  items,
  onChange,
  onNext,
}: {
  items: ReviewItem[];
  onChange(id: string): void;
  onNext(): void;
}) {
  const groups = groupReviewItems(items);

  return (
    <div className={styles.screen}>
      <Header step="2 / 4" title="입력 예정 항목 검토" />
      <p className={styles.lead}>
        상태와 예정 값을 확인하고 변경할 항목만 선택하세요.
      </p>
      <div className={styles.reviewGroups}>
        {groups.map((group) => (
          <ReviewGroupSection
            group={group}
            key={group.id}
            onChange={onChange}
          />
        ))}
      </div>
      <button className={styles.primary} type="button" onClick={onNext}>
        선택한 항목 확인
      </button>
    </div>
  );
}

export function AutofillDemo({
  onExit,
  initialStage = "analysis",
}: AutofillDemoProps) {
  const [stage, setStage] = useState<DemoStage>(initialStage);
  const [items, setItems] = useState(createMockReviewItems);
  const [exceptionId, setExceptionId] = useState<ExceptionId>("unsupported");
  const selectedCount = items.filter((item) => item.selected).length;

  if (stage === "analysis") {
    return (
      <div className={styles.screen}>
        <Header step="1 / 4" title="지원서 분석 중" />
        <div className={styles.analysisGraphic} aria-hidden="true">
          <span />
        </div>
        <p className={styles.lead}>
          필드 탐지와 프로필 연결을 비식별 목업으로 확인합니다.
        </p>
        <aside className={styles.safety}>
          이 단계에서는 지원서 값을 변경하지 않습니다.
        </aside>
        <button
          className={styles.primary}
          type="button"
          onClick={() => setStage("review")}
        >
          분석 결과 보기
        </button>
      </div>
    );
  }

  if (stage === "review") {
    return (
      <Review
        items={items}
        onChange={(id) => setItems((current) => toggleReviewItem(current, id))}
        onNext={() => setStage("confirmation")}
      />
    );
  }

  if (stage === "confirmation") {
    return (
      <div className={styles.screen}>
        <Header step="3 / 4" title="최종 승인" />
        <div className={styles.countCard}>
          <strong>{selectedCount}개 항목</strong>
          <span>사용자가 선택한 값만 변경합니다.</span>
        </div>
        <ul className={styles.boundaries}>
          <li>지원서 저장을 실행하지 않음</li>
          <li>다음 단계와 미리보기로 이동하지 않음</li>
          <li>최종 제출을 실행하지 않음</li>
        </ul>
        <div className={styles.actions}>
          <button type="button" onClick={() => setStage("review")}>
            검토로 돌아가기
          </button>
          <button
            className={styles.primary}
            type="button"
            onClick={() => setStage("progress")}
          >
            기입하기
          </button>
        </div>
      </div>
    );
  }

  if (stage === "progress") {
    return (
      <div className={styles.screen}>
        <Header step="4 / 4" title="기입 중" />
        <div className={styles.progressList}>
          <span>완료 · 이메일주소</span>
          <strong>처리 중 · 선택한 항목</strong>
          <span>대기 · 결과 확인</span>
        </div>
        <p className={styles.lead}>승인된 항목만 처리하는 목업 화면입니다.</p>
        <button
          className={styles.primary}
          type="button"
          onClick={() => setStage("result")}
        >
          결과 보기
        </button>
      </div>
    );
  }

  if (stage === "result") {
    return (
      <div className={styles.screen}>
        <Header step="완료" title="기입 결과" />
        <div className={styles.resultGrid}>
          <div>
            <strong>{selectedCount}</strong>
            <span>기입 성공</span>
          </div>
          <div>
            <strong>1</strong>
            <span>직접 확인 필요</span>
          </div>
        </div>
        <p className={styles.safety}>지원서의 실제 값을 직접 확인해 주세요.</p>
        <button className={styles.primary} type="button" onClick={onExit}>
          수동 복사로 돌아가기
        </button>
        <button
          className={styles.linkButton}
          type="button"
          onClick={() => setStage("exception")}
        >
          예외 상태 보기
        </button>
      </div>
    );
  }

  const exception = EXCEPTIONS[exceptionId];
  return (
    <div className={styles.screen}>
      <div className={styles.exceptionTabs} aria-label="예외 상태 선택">
        {(
          Object.entries(EXCEPTIONS) as [
            ExceptionId,
            (typeof EXCEPTIONS)[ExceptionId],
          ][]
        ).map(([id, value]) => (
          <button
            type="button"
            key={id}
            aria-pressed={exceptionId === id}
            onClick={() => setExceptionId(id)}
          >
            {value.title}
          </button>
        ))}
      </div>
      <Header step="예외" title={exception.title} />
      <div className={styles.exceptionCard}>
        <p>{exception.description}</p>
      </div>
      {exceptionId === "analysis-failed" && (
        <button
          className={styles.primary}
          type="button"
          onClick={() => setStage("analysis")}
        >
          다시 시도
        </button>
      )}
      <button className={styles.linkButton} type="button" onClick={onExit}>
        수동 복사로 돌아가기
      </button>
    </div>
  );
}
