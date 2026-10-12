import { useRef, useState } from "react";
import { CATALOG, CATALOG_VERSION } from "../catalog";
import {
  searchCatalog,
  type CatalogEntry,
  type CatalogKind,
} from "../catalog-search";
import type { ProfileIdentity } from "../model";
import styles from "./CatalogNameInput.module.css";

interface CatalogNameInputProps {
  readonly id: string;
  readonly label: string;
  readonly kind: CatalogKind;
  readonly value: string;
  readonly identity?: ProfileIdentity;
  readonly entries?: readonly CatalogEntry[];
  onChange(value: string, identity?: ProfileIdentity): void;
}

export function CatalogNameInput({
  id,
  label,
  kind,
  value,
  identity,
  entries = CATALOG,
  onChange,
}: CatalogNameInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = searchCatalog(entries, kind, value);
  const options = matches.slice(0, 30);
  const canUseManual = value.trim().length > 0;
  const optionCount = options.length + (canUseManual ? 1 : 0);
  const listId = `${id}-results`;
  const helpId = `${id}-help`;
  const selected =
    identity?.status === "selected" &&
    identity.catalogVersion === CATALOG_VERSION &&
    identity.displayName === value
      ? entries.find(
          (entry) =>
            entry.id === identity.catalogId &&
            entry.kind === kind &&
            entry.name === value,
        )
      : undefined;

  function choose(index: number) {
    const entry = options[index];
    if (entry) {
      onChange(entry.name, {
        status: "selected",
        catalogId: entry.id,
        displayName: entry.name,
        originalText: value,
        catalogVersion: CATALOG_VERSION,
      });
    } else if (index === options.length && canUseManual) {
      onChange(value, { status: "manual", originalText: value });
    } else {
      return;
    }
    inputRef.current?.focus();
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className={styles.control}>
      <input
        ref={inputRef}
        id={id}
        aria-label={label}
        role="combobox"
        type="text"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-describedby={helpId}
        aria-activedescendant={
          open && active >= 0 ? `${id}-option-${active}` : undefined
        }
        value={value}
        placeholder="이름을 검색하거나 직접 입력"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (optionCount) {
              const next =
                event.key === "ArrowDown"
                  ? Math.min(active + 1, optionCount - 1)
                  : active <= 0
                    ? optionCount - 1
                    : active - 1;
              setActive(next);
              document
                .getElementById(`${id}-option-${next}`)
                ?.scrollIntoView?.({ block: "nearest" });
            }
          } else if (event.key === "Enter" && open && active >= 0) {
            event.preventDefault();
            choose(active);
          }
        }}
      />
      {open && (
        <div>
          <ul
            className={styles.options}
            id={listId}
            role="listbox"
            aria-label={`${label} 검색 결과`}
          >
            {options.map((entry, index) => (
              <li
                id={`${id}-option-${index}`}
                key={entry.id}
                role="option"
                aria-selected={active === index}
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <strong>{entry.name}</strong>
                <span>{entry.detail}</span>
              </li>
            ))}
            {canUseManual && (
              <li
                id={`${id}-option-${options.length}`}
                role="option"
                aria-selected={active === options.length}
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(options.length)}
              >
                <strong>“{value}” 직접 입력</strong>
                <span>목록 선택 없이 원문을 저장합니다.</span>
              </li>
            )}
          </ul>
          <span role="status" className={styles.help}>
            {!value.trim()
              ? "이름을 입력하면 검색 결과가 표시됩니다."
              : matches.length === 0
                ? "검색 결과가 없습니다. 직접 입력할 수 있습니다."
                : matches.length > options.length
                  ? `${matches.length}개 중 30개 표시 · 이름이나 소재지를 더 입력하세요.`
                  : `${matches.length}개 검색 결과 · 방향키로 이동 후 Enter로 선택하세요.`}
          </span>
        </div>
      )}
      <div className={styles.footer}>
        <span id={helpId} className={styles.help}>
          {selected ? (
            <>
              <span>{selected.detail}</span>
              <br />
              목록에서 선택됨 · 이름 변경 시 선택이 해제됩니다.
            </>
          ) : identity?.status === "selected" ? (
            "선택 정보를 확인할 수 없습니다. 이름을 검색해 다시 선택하세요."
          ) : value ? (
            "직접 입력 · 미검증. 기존 문자열은 그대로 유지됩니다."
          ) : (
            "목록에 없는 항목도 직접 입력할 수 있습니다."
          )}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setActive(-1);
              inputRef.current?.focus();
            }}
          >
            이름 지우기
          </button>
        )}
      </div>
    </div>
  );
}
