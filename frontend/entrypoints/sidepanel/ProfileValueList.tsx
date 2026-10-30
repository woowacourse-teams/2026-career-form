import {
  groupItemsByEntry,
  type ProfileSearchItem,
} from "../../src/profile/profile-search";
import styles from "./App.module.css";

interface ProfileValueListProps {
  items: readonly ProfileSearchItem[];
  /** Standalone values name their category when a group spans several. */
  showCategory: boolean;
  revealed: ReadonlySet<string>;
  copiedId?: string;
  onCopy(id: string, value: string): void;
  onReveal(id: string): void;
}

type RowProps = Omit<ProfileValueListProps, "items"> & {
  item: ProfileSearchItem;
};

function ValueRow({
  item,
  showCategory,
  revealed,
  copiedId,
  onCopy,
  onReveal,
}: RowProps) {
  const isRevealed = !item.sensitive || revealed.has(item.id);
  // Two schools both have a "학교명" copy button; the entry label tells them apart.
  const name = item.entry
    ? `${item.entry.label} ${item.fieldLabel}`
    : item.fieldLabel;
  return (
    <article className={styles.valueRow}>
      <div className={styles.valueMeta}>
        {showCategory && !item.entry && <span>{item.categoryLabel}</span>}
        <strong>{item.fieldLabel}</strong>
        <span className={isRevealed ? styles.value : styles.masked}>
          {isRevealed ? item.value : "••••••••, 값 가림"}
        </span>
      </div>
      {isRevealed ? (
        <button
          type="button"
          data-copied={copiedId === item.id}
          aria-label={`${name} 복사`}
          onClick={() => onCopy(item.id, item.value)}
        >
          {copiedId === item.id ? "복사됨" : "복사"}
        </button>
      ) : (
        <button
          type="button"
          aria-label={`${name} 펼치기`}
          onClick={() => onReveal(item.id)}
        >
          펼치기
        </button>
      )}
    </article>
  );
}

/** Saved values of one panel group, with each repeated record under its own heading. */
export function ProfileValueList({
  items,
  ...rowProps
}: ProfileValueListProps) {
  return groupItemsByEntry(items).map(({ entry, items: blockItems }) =>
    entry ? (
      <div
        role="group"
        aria-label={entry.label}
        className={styles.entry}
        key={`${blockItems[0].categoryId}-${entry.id}`}
      >
        <div className={styles.entryHead}>
          <strong>{entry.label}</strong>
          {entry.name && <span>{entry.name}</span>}
        </div>
        {blockItems.map((item) => (
          <ValueRow key={item.id} item={item} {...rowProps} />
        ))}
      </div>
    ) : (
      <ValueRow key={blockItems[0].id} item={blockItems[0]} {...rowProps} />
    ),
  );
}
