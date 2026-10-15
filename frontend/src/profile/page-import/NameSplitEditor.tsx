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
  const familyUnits = nameUnits(familyName, language);
  const units = [...familyUnits, ...nameUnits(givenName, language)];
  const valid = Boolean(familyName.trim() && givenName.trim());
  const splitAt = (position: number) => {
    const separator = language === "english" ? " " : "";
    onChange(
      units.slice(0, position).join(separator),
      units.slice(position).join(separator),
    );
  };

  return (
    <section
      className={`${styles.editor} ${confirmed && valid ? styles.confirmed : styles.review}`}
      aria-label={`${prefix} 이름 나누기`}
    >
      <style>{cssText}</style>
      <p className={styles.source}>지원서 이름: {source}</p>
      <p id={`${id}-hint`} className={styles.hint}>
        구분선을 끌거나 방향키로 성과 이름을 나누세요. 아래 칸에 직접 입력할
        수도 있어요.
      </p>
      {units.length > 1 && (
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
                className={
                  index < familyUnits.length ? styles.family : styles.given
                }
              >
                {unit}
              </span>
            ))}
          </div>
          <input
            className={styles.divider}
            type="range"
            min={0}
            max={units.length}
            step={1}
            value={familyUnits.length}
            aria-label={`${prefix} 성과 이름 구분선`}
            aria-describedby={`${id}-hint`}
            aria-valuetext={`성 ${familyName}, 이름 ${givenName}`}
            onChange={(event) => splitAt(Number(event.target.value))}
          />
        </div>
      )}
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
      <div className={styles.actions}>
        <button type="button" onClick={() => onChange(givenName, familyName)}>
          성과 이름 순서 바꾸기
        </button>
        <button
          type="button"
          disabled={!valid || confirmed}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
      <p role="status" className={styles.hint}>
        {confirmed && valid
          ? "확인 완료 — 가져올 이름을 확인했어요."
          : "확인 필요 — 성과 이름을 확인해야 저장할 수 있어요."}
      </p>
    </section>
  );
}
