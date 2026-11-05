import { useId, useState } from "react";
import { PROFILE_CATEGORIES } from "../field-definitions";
import { optionLabel } from "../field-display";
import { IMPORT_SENSITIVE_CATEGORIES } from "./review-fields";
import {
  isSelectable,
  plainLabel,
  type ReviewDecisions,
  type ReviewRow,
} from "./review-model";
import styles from "./ImportReview.module.css";

interface Props {
  rows: readonly ReviewRow[];
  chosen: Readonly<Record<string, boolean>>;
  decisions: ReviewDecisions;
  onToggle(keys: readonly string[], checked: boolean): void;
  onPresent(source: string | undefined): void;
  onDecide(next: ReviewDecisions): void;
}
type Shared = Omit<Props, "rows">;

const PENDING_TEXT = {
  name: "위에서 이름을 확인하면 함께 저장돼요",
  date: "위에서 날짜를 정하면 함께 저장돼요",
  target: "위에서 저장 위치를 정하면 함께 저장돼요",
} as const;

function displayValue(row: ReviewRow, value: string) {
  return (
    optionLabel(row.field?.options, value) ??
    (value.replace(/^(\d{4})-(\d{2})-(\d{2})$/u, "$1.$2.$3") || "없음")
  );
}

const fullLabel = (row: ReviewRow) =>
  row.groupLabel ? `${row.groupLabel} ${row.label}` : row.label;

function Switch({
  rows,
  chosen,
  label,
  onToggle,
}: Pick<Props, "rows" | "chosen" | "onToggle"> & { label: string }) {
  const eligible = rows.filter(isSelectable);
  const on = eligible.filter((row) => chosen[row.key]).length;
  const state = !on
    ? "false"
    : on === eligible.length
      ? "true"
      : ("mixed" as const);
  return (
    <button
      type="button"
      role="switch"
      className={styles.switch}
      aria-checked={state}
      aria-label={`${label} 가져오기`}
      disabled={!eligible.length}
      onClick={() =>
        onToggle(
          eligible.map((row) => row.key),
          state !== "true",
        )
      }
    />
  );
}

function Row({
  row,
  chosen,
  decisions,
  onToggle,
  onPresent,
  onDecide,
}: Shared & { row: ReviewRow }) {
  const id = useId();
  const decidedDate = decisions.dates[row.source] !== undefined;
  const value =
    row.status === "pending"
      ? PENDING_TEXT[row.pending!]
      : displayValue(row, row.value);
  return (
    <div
      className={styles.row}
      data-status={row.status}
      onPointerMove={() => onPresent(row.source)}
      onFocus={() => onPresent(row.source)}
    >
      <label className={styles.rowMeta} htmlFor={id}>
        <span className={styles.rowLabel}>{row.label}</span>
        <span className={styles.rowValue}>{value}</span>
        {row.status === "changed" && (
          <span className={styles.rowOld}>
            기존 <s>{displayValue(row, row.current)}</s>
          </span>
        )}
        {row.status === "excluded" && (
          <span className={styles.rowOld}>저장하지 않아요</span>
        )}
      </label>
      {decidedDate && (
        <button
          type="button"
          className={styles.textButton}
          aria-label={`${fullLabel(row)} 다시 정하기`}
          onClick={() => {
            const { [row.source]: _removed, ...dates } = decisions.dates;
            onDecide({ ...decisions, dates });
          }}
        >
          다시 정하기
        </button>
      )}
      <input
        id={id}
        type="checkbox"
        className={styles.check}
        checked={Boolean(chosen[row.key])}
        disabled={!isSelectable(row)}
        aria-label={`${fullLabel(row)} 가져오기`}
        onChange={(event) => onToggle([row.key], event.target.checked)}
      />
    </div>
  );
}

function entryMode(rows: readonly ReviewRow[]) {
  if (rows.some((row) => row.pending === "target"))
    return { text: "확인 필요", tone: styles.modePending };
  if (rows.every((row) => row.status === "excluded"))
    return { text: "가져오지 않음", tone: styles.modeSkip };
  if (rows.some((row) => row.targetId))
    return { text: "기존 항목에 반영", tone: styles.modeExisting };
  return { text: "새 항목", tone: styles.modeNew };
}

function Entry({
  rows,
  visible,
  ...shared
}: Shared & { rows: readonly ReviewRow[]; visible: readonly ReviewRow[] }) {
  const { decisions, onDecide, onPresent } = shared;
  const title = rows.find((row) => row.primary)?.value || "이름 없는 항목";
  const key = rows[0].groupKey!;
  const mode = entryMode(rows);
  return (
    <div role="group" aria-label={title} className={styles.entry}>
      <div
        className={styles.entryHead}
        onPointerMove={() => onPresent(rows[0].source)}
      >
        <div className={styles.entryTitle}>
          <b>{title}</b>
          <span className={`${styles.mode} ${mode.tone}`}>{mode.text}</span>
          <small>{rows[0].groupLabel}</small>
        </div>
        {decisions.targets[key] === undefined &&
          rows[0].linkable &&
          mode.text === "새 항목" && (
            <button
              type="button"
              className={styles.textButton}
              aria-label={`${title} 저장 위치 바꾸기`}
              onClick={() =>
                onDecide({
                  ...decisions,
                  targets: { ...decisions.targets, [key]: "" },
                })
              }
            >
              저장 위치 바꾸기
            </button>
          )}
        {decisions.targets[key] !== undefined && (
          <button
            type="button"
            className={styles.textButton}
            aria-label={`${title} 저장 위치 다시 정하기`}
            onClick={() => {
              const { [key]: _removed, ...targets } = decisions.targets;
              onDecide({ ...decisions, targets });
            }}
          >
            다시 정하기
          </button>
        )}
        <Switch
          rows={rows}
          chosen={shared.chosen}
          label={title}
          onToggle={shared.onToggle}
        />
      </div>
      {visible.map((row) => (
        <Row key={row.key} row={row} {...shared} />
      ))}
    </div>
  );
}

function categoryNote(
  rows: readonly ReviewRow[],
  chosen: Props["chosen"],
  sensitive: boolean,
) {
  const eligible = rows.filter(isSelectable);
  const on = eligible.filter((row) => chosen[row.key]).length;
  if (!eligible.length && !rows.some((row) => row.status === "pending"))
    return "바뀌는 정보가 없어요";
  if (sensitive && !on) return "직접 켜야 저장돼요";
  return `${on}개 선택`;
}

function Category({
  categoryId,
  rows,
  ...shared
}: Shared & { categoryId: string; rows: readonly ReviewRow[] }) {
  const [open, setOpen] = useState(false);
  const [showSame, setShowSame] = useState(false);
  const definition = PROFILE_CATEGORIES.find((item) => item.id === categoryId)!;
  const label = plainLabel(definition.label);
  const sensitive = IMPORT_SENSITIVE_CATEGORIES.has(categoryId);
  const same = rows.filter((row) => row.status === "same");
  const visible = rows.filter((row) => showSame || row.status !== "same");
  const changed = rows.filter((row) => row.status === "changed").length;
  const pending = rows.some((row) => row.status === "pending");
  const groups = [...new Set(rows.map((row) => row.groupKey))];
  return (
    <div
      className={styles.category}
      data-category={categoryId}
      data-open={open}
    >
      <div className={styles.categoryHead}>
        <button
          type="button"
          className={styles.categoryToggle}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <b>
            {label}
            {sensitive && <span className={styles.tagWarn}>민감 정보</span>}
            {changed > 0 && <span className={styles.tag}>변경 {changed}</span>}
            {pending && <span className={styles.tagWarn}>확인 필요</span>}
          </b>
          <span>{categoryNote(rows, shared.chosen, sensitive)}</span>
        </button>
        <Switch
          rows={rows}
          chosen={shared.chosen}
          label={label}
          onToggle={shared.onToggle}
        />
      </div>
      {open && (
        <div className={styles.categoryBody}>
          {groups.map((group) => {
            const groupRows = rows.filter((row) => row.groupKey === group);
            const shown = visible.filter((row) => row.groupKey === group);
            return group ? (
              <Entry key={group} rows={groupRows} visible={shown} {...shared} />
            ) : (
              shown.map((row) => <Row key={row.key} row={row} {...shared} />)
            );
          })}
          {same.length > 0 && (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setShowSame(!showSame)}
            >
              {showSame
                ? "변경 없는 정보 숨기기"
                : `변경 없는 ${same.length}개 보기`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Collapsed categories with switches; unchanged values stay folded away. */
export function ImportCategoryList({ rows, ...shared }: Props) {
  const categories = PROFILE_CATEGORIES.filter((category) =>
    rows.some((row) => row.categoryId === category.id),
  );
  return (
    <section className={styles.categories} aria-label="가져올 정보">
      {categories.map((category) => (
        <Category
          key={category.id}
          categoryId={category.id}
          rows={rows.filter((row) => row.categoryId === category.id)}
          {...shared}
        />
      ))}
    </section>
  );
}
