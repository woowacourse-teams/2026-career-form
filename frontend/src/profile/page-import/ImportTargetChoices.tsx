import { useId, useState } from "react";
import type { ProfileEntry } from "../model";
import review from "./ImportReview.module.css";

interface CompareProps {
  name?: string;
  primary: string;
  fields: readonly { fieldId: string; label: string; value: string }[];
  entries: readonly ProfileEntry[];
  /** "new", "skip" or `existing:<entry id>`; never chosen without a click. */
  onChoose(value: string): void;
}

const display = (value?: string) =>
  value ? value.replace(/^(\d{4})-(\d{2})-(\d{2})$/u, "$1.$2.$3") : "없음";

function period(entry: ProfileEntry) {
  const start = entry.values.startDate || entry.values.acquisitionDate;
  const end = entry.values.endDate;
  if (!start) return "기간 없음";
  return end ? `${display(start)} ~ ${display(end)}` : `${display(start)}부터`;
}

/** Side-by-side choice between updating a same-name entry, adding one or skipping. */
export function ImportTargetCompare({
  name,
  primary,
  fields,
  entries,
  onChoose,
}: CompareProps) {
  const id = useId();
  const [entryId, setEntryId] = useState(entries[0]?.id);
  const entry = entries.find((item) => item.id === entryId) ?? entries[0];
  const differences = fields.filter(
    (field) => (entry?.values[field.fieldId] ?? "") !== field.value,
  ).length;
  return (
    <>
      {entries.length > 1 && (
        <fieldset className={review.entryChoices}>
          <legend>비교할 항목을 골라 주세요</legend>
          {entries.map((item) => (
            <label key={item.id}>
              <input
                type="radio"
                name={`${id}-entry`}
                checked={item.id === entry?.id}
                onChange={() => setEntryId(item.id)}
              />
              {item.values[primary] || "이름 없음"} {period(item)}
            </label>
          ))}
        </fieldset>
      )}
      {entry && (
        <table className={review.compare}>
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">내 프로필</th>
              <th scope="col">이 지원서</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const current = entry.values[field.fieldId] ?? "";
              return (
                <tr
                  key={field.fieldId}
                  data-different={String(current !== field.value)}
                >
                  <th scope="row">{field.label}</th>
                  <td>{display(current)}</td>
                  <td>{display(field.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className={review.cardActions}>
        <button
          type="button"
          className={review.secondaryButton}
          disabled={!name}
          onClick={() => onChoose("new")}
        >
          다른 항목이에요
        </button>
        <button
          type="button"
          className={review.primaryButton}
          disabled={!entry}
          onClick={() => entry && onChoose(`existing:${entry.id}`)}
        >
          같은 항목이에요
          <small>바뀌는 값 {differences}개</small>
        </button>
        <button
          type="button"
          className={review.plainButton}
          onClick={() => onChoose("skip")}
        >
          이 항목은 가져오지 않을게요
        </button>
      </div>
      {!name && (
        <p className={review.cardHint}>
          이름이 없어서 새 항목으로는 추가할 수 없어요.
        </p>
      )}
    </>
  );
}
