import { useId } from "react";
import styles from "./NameSplitEditor.module.css";
import cssText from "./NameSplitEditor.module.css?inline";

type Language = "korean" | "english";
type NameParts = { familyName: string; givenName: string };

function nameUnits(value: string, language: Language): string[] {
  if (!value.trim()) return [];
  return language === "english"
    ? value.trim().split(/\s+/u)
    : Array.from(
        new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(
          value.trim(),
        ),
        ({ segment }) => segment,
      );
}

export function initialNameParts(
  source: string,
  language: Language,
): NameParts {
  const units = nameUnits(source, language);
  if (units.length < 2) return { familyName: "", givenName: source.trim() };
  return {
    familyName: units[0]!,
    givenName: units.slice(1).join(language === "english" ? " " : ""),
  };
}

type Unit = { text: string; spaceAfter: boolean };

const graphemes = (value: string) =>
  Array.from(
    new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(value),
    ({ segment }) => segment,
  );
const squash = (value: string) => value.replace(/\s+/gu, "");

/**
 * The divider moves one character at a time so names written without a space
 * can still be split. English keeps the source spaces while they still match.
 */
function splitUnits(
  source: string,
  language: Language,
  familyName: string,
  givenName: string,
): { units: Unit[]; position: number } {
  const family = familyName.trim();
  const given = givenName.trim();
  const base =
    language === "english" && squash(source) === squash(family + given)
      ? source.trim()
      : [family, given].filter(Boolean).join(language === "english" ? " " : "");
  const chars = graphemes(base);
  const units = chars.flatMap((text, index) =>
    /\s/u.test(text)
      ? []
      : [{ text, spaceAfter: /\s/u.test(chars[index + 1] ?? "") }],
  );
  return { units, position: graphemes(squash(family)).length };
}

const joinUnits = (units: readonly Unit[]) =>
  units
    .map((unit) => unit.text + (unit.spaceAfter ? " " : ""))
    .join("")
    .trim();

type Props = {
  source: string;
  language: Language;
  familyName: string;
  givenName: string;
  confirmed: boolean;
  confirmLabel?: string;
  /** The owner must revoke confirmation and import selection whenever names change. */
  onChange: (familyName: string, givenName: string) => void;
  onConfirm: () => void;
};

export function NameSplitEditor({
  source,
  language,
  familyName,
  givenName,
  confirmed,
  confirmLabel = "이름 확인 완료",
  onChange,
  onConfirm,
}: Props) {
  const id = useId();
  const prefix = language === "korean" ? "국문" : "영문";
  const { units, position } = splitUnits(
    source,
    language,
    familyName,
    givenName,
  );
  const valid = Boolean(familyName.trim() && givenName.trim());
  const splitAt = (at: number) =>
    onChange(joinUnits(units.slice(0, at)), joinUnits(units.slice(at)));

  return (
    <section
      className={`${styles.editor} ${confirmed && valid ? styles.confirmed : styles.review}`}
      aria-label={`${prefix} 이름 나누기`}
    >
      <style>{cssText}</style>
      <p className={styles.source}>
        <small>지원서에 적힌 이름</small>
        <b>{source}</b>
      </p>
      <p id={`${id}-hint`} className={styles.hint}>
        구분선을 끌거나 방향키로 한 글자씩 옮겨 나눠요. 아래 칸에서 직접 고칠
        수도 있어요.
      </p>
      {units.length > 1 && (
        <div className={styles.splitArea}>
          <div className={styles.sides} aria-hidden="true">
            <span>성</span>
            <span>이름</span>
          </div>
          <div className={styles.splitter}>
            <div
              className={styles.units}
              aria-hidden="true"
              style={{
                gridTemplateColumns: `repeat(${units.length}, minmax(0, 1fr))`,
              }}
            >
              {units.map((unit, index) => (
                <span
                  key={index}
                  className={`${index < position ? styles.family : styles.given} ${unit.spaceAfter ? styles.space : ""}`}
                >
                  {unit.text}
                </span>
              ))}
            </div>
            <input
              className={styles.divider}
              type="range"
              min={0}
              max={units.length}
              step={1}
              value={position}
              aria-label={`${prefix} 성과 이름 구분선`}
              aria-describedby={`${id}-hint`}
              aria-valuetext={`성 ${familyName}, 이름 ${givenName}`}
              onChange={(event) => splitAt(Number(event.target.value))}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        className={styles.swap}
        onClick={() => onChange(givenName, familyName)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
          <path d="M4 4v4h4" />
          <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
          <path d="M20 20v-4h-4" />
        </svg>
        성과 이름 바꾸기
      </button>
      <div className={styles.fields}>
        <label>
          {prefix} 성
          <input
            value={familyName}
            onChange={(event) => onChange(event.target.value, givenName)}
          />
        </label>
        <label>
          {prefix} 이름
          <input
            value={givenName}
            onChange={(event) => onChange(familyName, event.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className={styles.confirm}
        disabled={!valid || confirmed}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
      <p role="status" className={styles.status}>
        {confirmed && valid
          ? "확인 완료, 가져올 이름을 확인했어요."
          : "확인 필요, 성과 이름을 확인하면 저장할 수 있어요."}
      </p>
    </section>
  );
}
