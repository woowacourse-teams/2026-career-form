import type { ProfileEntry } from "../model";
import styles from "./PageImport.module.css";

interface Props {
  name?: string;
  primary: string;
  entries: readonly ProfileEntry[];
  targetValue: string;
  groupId: string;
  onChange(value: string): void;
}

export function ImportTargetChoices({
  name,
  primary,
  entries,
  targetValue,
  groupId,
  onChange,
}: Props) {
  return (
    <fieldset
      className={`${styles.group} ${!targetValue ? styles.needsReview : ""}`}
    >
      <legend>이 정보를 어디에 저장할까요?</legend>
      <p>{name || "이름 없는 항목"}</p>
      {!targetValue && (
        <p className={styles.hint}>
          확인 필요 · 같은 이름의 정보가 있거나 대표 이름이 없습니다. 저장
          방법을 선택해 주세요.
        </p>
      )}
      <label className={styles.targetChoice}>
        <input
          type="radio"
          name={`target-${groupId}`}
          value="new"
          checked={targetValue === "new"}
          disabled={!name}
          onChange={() => onChange("new")}
        />
        새 정보로 추가{name ? `: ${name}` : " (대표 이름 필요)"}
      </label>
      <small>기존 프로필은 유지하고 별도 항목을 만듭니다.</small>
      {entries.map((entry) => (
        <label className={styles.targetChoice} key={entry.id}>
          <input
            type="radio"
            name={`target-${groupId}`}
            value={`existing:${entry.id}`}
            checked={targetValue === `existing:${entry.id}`}
            onChange={() => onChange(`existing:${entry.id}`)}
          />
          기존 정보 업데이트: {entry.values[primary] || "이름 없음"} ·{" "}
          {entry.values.startDate ||
            entry.values.acquisitionDate ||
            "날짜 없음"}
          {entry.values.endDate ? ` ~ ${entry.values.endDate}` : ""}
        </label>
      ))}
      {entries.length > 0 && (
        <small>
          업데이트를 고르면 선택한 필드만 바뀌고 나머지는 유지됩니다.
        </small>
      )}
    </fieldset>
  );
}
