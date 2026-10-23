import { useState, type KeyboardEvent } from "react";
import { formatProfileDate } from "../../autofill/profile/date-format";
import { ImportTargetCompare } from "./ImportTargetChoices";
import { NameSplitEditor } from "./NameSplitEditor";
import { NAME_GROUPS } from "./review-fields";
import type {
  Confirmation,
  NameDecision,
  ReviewDecisions,
} from "./review-model";
import styles from "./ImportReview.module.css";

interface Props {
  confirmations: readonly Confirmation[];
  decisions: ReviewDecisions;
  /** Selected repeated rows that saving would reject as duplicates. */
  duplicateCount: number;
  onDecide(next: ReviewDecisions): void;
  onPresent(source: string | undefined): void;
}

type CardProps<K extends Confirmation["kind"]> = {
  card: Extract<Confirmation, { kind: K }>;
  decisions: ReviewDecisions;
  onDecide(next: ReviewDecisions): void;
  onLater(): void;
};

const nameLabel = (language: "korean" | "english") =>
  language === "korean" ? "국문 이름" : "영문 이름";

const later = (onLater: () => void) => (
  <button type="button" className={styles.plainButton} onClick={onLater}>
    나중에 할게요
  </button>
);

function NameCard({ card, decisions, onDecide, onLater }: CardProps<"name">) {
  const suggestion = decisions.names[card.id] ?? {
    familyName: "",
    givenName: card.value,
    confirmed: false,
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion);
  const label = nameLabel(card.language);
  const confirm = (parts: NameDecision) =>
    onDecide({
      ...decisions,
      names: { ...decisions.names, [card.id]: { ...parts, confirmed: true } },
    });
  if (editing)
    return (
      <>
        <h4 className={styles.cardTitle}>성과 이름을 나눠 주세요</h4>
        <NameSplitEditor
          source={card.value}
          language={card.language}
          familyName={draft.familyName}
          givenName={draft.givenName}
          confirmed={false}
          confirmLabel="이렇게 저장할게요"
          onChange={(familyName, givenName) =>
            setDraft({ familyName, givenName, confirmed: false })
          }
          onConfirm={() => confirm(draft)}
        />
        <div className={styles.cardActions}>{later(onLater)}</div>
      </>
    );
  const complete = Boolean(
    suggestion.familyName.trim() && suggestion.givenName.trim(),
  );
  return (
    <>
      <h4 className={styles.cardTitle}>{label}을 이렇게 나누면 될까요?</h4>
      <div className={styles.split}>
        <div>
          <small>성</small>
          <b>{suggestion.familyName || "없음"}</b>
        </div>
        <div>
          <small>이름</small>
          <b>{suggestion.givenName || "없음"}</b>
        </div>
      </div>
      <p className={styles.cardText}>
        지원서에는 {label}이 ‘{card.value}’ 한 칸으로 적혀 있어요.
      </p>
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!complete}
          onClick={() => confirm(suggestion)}
        >
          맞아요
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setEditing(true)}
        >
          아니에요
        </button>
        {later(onLater)}
      </div>
    </>
  );
}

function monthParts(month: string) {
  const [year, value] = month.split("-");
  return { year, month: Number(value) };
}

function dateError(card: CardProps<"date">["card"], input: string) {
  if (!card.month)
    return formatProfileDate(input, "YYYY-MM-DD").status === "resolved"
      ? undefined
      : "날짜를 끝까지 입력해 주세요";
  const day = Number(input);
  if (!Number.isInteger(day) || day < 1 || day > 31)
    return "1부터 31 사이로 입력해 주세요";
  const { year, month } = monthParts(card.month);
  return formatProfileDate(fullDate(card.month, day), "YYYY-MM-DD").status ===
    "resolved"
    ? undefined
    : `${year}년 ${month}월에는 ${day}일이 없어요`;
}

const fullDate = (month: string, day: number) =>
  `${month}-${String(day).padStart(2, "0")}`;

function DateCard({ card, decisions, onDecide, onLater }: CardProps<"date">) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string>();
  const decide = (value: string | null) =>
    onDecide({ ...decisions, dates: { ...decisions.dates, [card.id]: value } });
  const submit = () => {
    const problem = dateError(card, input);
    setError(problem);
    if (!problem)
      decide(card.month ? fullDate(card.month, Number(input)) : input);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  };
  const parts = card.month ? monthParts(card.month) : undefined;
  return (
    <>
      <p className={styles.kicker}>{card.label}</p>
      <h4 className={styles.cardTitle}>
        {parts
          ? `${parts.year}년 ${parts.month}월 며칠인가요?`
          : "정확한 날짜를 입력해 주세요"}
      </h4>
      <p className={styles.cardText}>
        {parts
          ? `지원서에는 ${parts.year}년 ${parts.month}월까지만 적혀 있어요. 없는 날짜를 만들지 않으니, 기억나지 않으면 날짜만 빼고 저장해요.`
          : "지원서의 날짜를 정확히 읽지 못했어요. 기억나지 않으면 날짜만 빼고 저장해요."}
      </p>
      <div className={styles.dayInput}>
        {parts ? (
          <>
            {parts.year}년 {parts.month}월
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={input}
              aria-label={`${card.label}의 일`}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
            />
            일
          </>
        ) : (
          <input
            type="date"
            value={input}
            aria-label={card.label}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
          />
        )}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => decide(null)}
        >
          기억이 안 나요
        </button>
        <button type="button" className={styles.primaryButton} onClick={submit}>
          입력했어요
        </button>
        {later(onLater)}
      </div>
    </>
  );
}

function TargetCard({
  card,
  decisions,
  onDecide,
  onLater,
}: CardProps<"target">) {
  return (
    <>
      <p className={styles.kicker}>같은 이름의 항목이 있어요</p>
      <h4 className={styles.cardTitle}>
        {card.name ?? "이름 없는 항목"}, 프로필에 있는 항목과 같은가요?
      </h4>
      <p className={styles.cardText}>
        같은 항목이면 달라진 값만 새 값으로 바꿔요.
      </p>
      <ImportTargetCompare
        name={card.name}
        primary={card.primary}
        fields={card.fields}
        entries={card.entries}
        onChoose={(value) =>
          onDecide({
            ...decisions,
            targets: { ...decisions.targets, [card.id]: value },
          })
        }
      />
      <div className={styles.cardActions}>{later(onLater)}</div>
    </>
  );
}

function Card(props: CardProps<Confirmation["kind"]>) {
  const { card } = props;
  if (card.kind === "name") return <NameCard {...props} card={card} />;
  if (card.kind === "date") return <DateCard {...props} card={card} />;
  return <TargetCard {...props} card={card} />;
}

function ResolvedNames({
  decisions,
  onDecide,
}: Pick<Props, "decisions" | "onDecide">) {
  const confirmed = NAME_GROUPS.filter(
    (group) => decisions.names[group.source]?.confirmed,
  );
  if (!confirmed.length) return null;
  return (
    <ul className={styles.resolved}>
      {confirmed.map((group) => {
        const decision = decisions.names[group.source]!;
        const label = nameLabel(
          group.source === "basicInformation.name" ? "korean" : "english",
        );
        return (
          <li key={group.source}>
            <span className={styles.resolvedLabel}>{label}</span>
            <span>{`성 ${decision.familyName}, 이름 ${decision.givenName}`}</span>
            <button
              type="button"
              className={styles.textButton}
              aria-label={`${label} 수정`}
              onClick={() =>
                onDecide({
                  ...decisions,
                  names: {
                    ...decisions.names,
                    [group.source]: { ...decision, confirmed: false },
                  },
                })
              }
            >
              수정
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Asks one human decision at a time; deferred cards never block saving the rest. */
export function ImportConfirmCards({
  confirmations,
  decisions,
  duplicateCount,
  onDecide,
  onPresent,
}: Props) {
  const [deferred, setDeferred] = useState<ReadonlySet<string>>(new Set());
  const current = confirmations.find((card) => !deferred.has(card.id));
  const anyResolved = NAME_GROUPS.some(
    (group) => decisions.names[group.source]?.confirmed,
  );
  if (!confirmations.length && !anyResolved && !duplicateCount) return null;
  return (
    <section className={styles.queue} aria-label="확인이 필요한 정보">
      {duplicateCount > 0 && (
        <p role="status" className={styles.notice}>
          같은 정보가 두 번 들어 있어 {duplicateCount}개 항목은 저장하지 않아요.
        </p>
      )}
      {confirmations.length > 0 ? (
        <h3 className={styles.sectionTitle}>
          확인해 주세요
          <span className={styles.countPill}>{confirmations.length}</span>
        </h3>
      ) : (
        anyResolved && (
          <p className={styles.allDone}>확인할 정보를 모두 정리했어요</p>
        )
      )}
      {current && (
        <article
          key={current.id}
          className={styles.card}
          onPointerMove={() => onPresent(current.source)}
          onFocus={() => onPresent(current.source)}
        >
          <Card
            card={current}
            decisions={decisions}
            onDecide={onDecide}
            onLater={() =>
              setDeferred((previous) => new Set(previous).add(current.id))
            }
          />
        </article>
      )}
      {!current && confirmations.length > 0 && (
        <article className={styles.card}>
          <p className={styles.cardTitle}>
            <strong>나중에 하기로 한 {confirmations.length}개</strong>
          </p>
          <p className={styles.cardText}>확인하지 않은 정보만 빼고 저장해요.</p>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setDeferred(new Set())}
            >
              지금 확인할게요
            </button>
          </div>
        </article>
      )}
      <ResolvedNames decisions={decisions} onDecide={onDecide} />
    </section>
  );
}
