import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { JobCategoriesView } from "./job-roles";
import type { PushApiErrorCode } from "./push-api";
import styles from "./JobPostings.module.css";

interface Props {
  view: JobCategoriesView | undefined;
  loading: boolean;
  selected: readonly string[];
  busy: boolean;
  // Resolves false when the selection could not be saved.
  onChange(roles: string[]): Promise<boolean | void>;
  onReload(): Promise<void>;
}

const FAILURES: Partial<Record<PushApiErrorCode, string>> = {
  NOT_CONFIGURED: "알림 서버 없음",
  ENDPOINT_UNAVAILABLE: "서버 미지원",
};
export function categoryFailureText(code: PushApiErrorCode): string {
  return FAILURES[code] ?? "직무 분류를 불러오지 못했어요";
}
// Shown wherever the selection is empty: choosing nothing means everything.
export const ALL_ROLES_TEXT = "선택 없음 · 모든 공고 받는 중";
export const ROLES_HINT_TEXT =
  "직무를 고르면 그 직무의 공고만 받아요. 하나도 고르지 않으면 모든 공고를 받아요.";

/** Two-column picker: category tabs on the left, role checkboxes on the right.
 *  Every toggle saves at once; the boxes show the pending selection meanwhile. */
export function RoleSelector({
  view,
  loading,
  selected,
  busy,
  onChange,
  onReload,
}: Props) {
  const id = useId();
  const [draft, setDraft] = useState<string[]>();
  const [saveFailed, setSaveFailed] = useState(false);
  const [activeCode, setActiveCode] = useState<string>();
  const pending = useRef(0);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const categories = view?.categories?.categories;
  const current = draft ?? selected;
  const retry = (
    <button
      type="button"
      disabled={loading || busy}
      onClick={() => void onReload()}
    >
      다시 시도
    </button>
  );
  if (!categories) {
    if (!view || loading)
      return (
        <section className={styles.roles} aria-label="받을 직무">
          <h3>받을 직무</h3>
          <p className={styles.rolesHint} role="status">
            직무 분류 불러오는 중
          </p>
        </section>
      );
    const error = view.error ?? "INVALID_RESPONSE";
    return (
      <section className={styles.roles} aria-label="받을 직무">
        <h3>받을 직무</h3>
        <div className={styles.rolesFailure} role="status">
          <span>{categoryFailureText(error)}</span>
          {error !== "NOT_CONFIGURED" && retry}
        </div>
      </section>
    );
  }
  const known = new Set(categories.flatMap((c) => c.roles.map((r) => r.code)));
  const count = current.filter((code) => known.has(code)).length;
  const countIn = (codes: string[]) =>
    codes.filter((code) => current.includes(code)).length;
  // Open on the first category the user already picked from.
  const active =
    categories.find((c) => c.code === activeCode) ??
    categories.find((c) => countIn(c.roles.map((r) => r.code)) > 0) ??
    categories[0];
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const codes = categories.map((c) => c.code);
    // Step from the focused tab, which is the active one unless focus was
    // moved there by script.
    const focused = Object.entries(tabs.current).find(
      ([, element]) => element === event.target,
    )?.[0];
    const index = codes.indexOf(focused ?? active.code);
    const target = {
      ArrowDown: codes[(index + 1) % codes.length],
      ArrowUp: codes[(index + codes.length - 1) % codes.length],
      Home: codes[0],
      End: codes[codes.length - 1],
    }[event.key];
    if (!target) return;
    event.preventDefault();
    setActiveCode(target);
    tabs.current[target]?.focus();
  };
  const save = async (next: string[]) => {
    setDraft(next);
    pending.current += 1;
    const ok = (await onChange(next)) !== false;
    pending.current -= 1;
    // The stored selection is the truth again once no save is in flight.
    if (pending.current === 0) setDraft(undefined);
    setSaveFailed(!ok);
  };
  const toggle = (code: string) =>
    save(
      current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code],
    );
  // One box per category: all of its roles on, or all of them off.
  const activeCodes = active.roles.map((r) => r.code);
  const activeCount = countIn(activeCodes);
  const toggleAll = () =>
    save(
      activeCount === activeCodes.length
        ? current.filter((c) => !activeCodes.includes(c))
        : [...current, ...activeCodes.filter((c) => !current.includes(c))],
    );
  return (
    <section className={styles.roles} aria-labelledby={`${id}-title`}>
      <div className={styles.rolesHeading}>
        <h3 id={`${id}-title`}>받을 직무</h3>
        <span className={styles.rolesCount} role="status">
          {count ? `${count}개 선택` : ALL_ROLES_TEXT}
        </span>
      </div>
      <p className={styles.rolesHint}>{ROLES_HINT_TEXT}</p>
      {view.error && (
        <div className={styles.rolesNote}>
          <span>저장된 분류 사용 중 · {categoryFailureText(view.error)}</span>
          {retry}
        </div>
      )}
      {saveFailed && (
        <p className={styles.settingsError} role="alert">
          선택을 저장하지 못했어요
        </p>
      )}
      <div className={styles.rolePicker}>
        <div
          role="tablist"
          aria-label="대분류"
          aria-orientation="vertical"
          className={styles.roleCategories}
          onKeyDown={move}
        >
          {categories.map((category) => {
            const picked = countIn(category.roles.map((r) => r.code));
            return (
              <button
                key={category.code}
                ref={(element) => {
                  tabs.current[category.code] = element;
                }}
                id={`${id}-tab-${category.code}`}
                type="button"
                role="tab"
                aria-selected={active.code === category.code}
                aria-controls={`${id}-panel`}
                tabIndex={active.code === category.code ? 0 : -1}
                onClick={() => setActiveCode(category.code)}
              >
                {category.label}
                {picked > 0 && (
                  <>
                    {" "}
                    <span className={styles.roleCount}>{picked}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${active.code}`}
          className={styles.roleOptions}
        >
          <label className={`${styles.roleOption} ${styles.roleAll}`}>
            <input
              type="checkbox"
              checked={activeCount === activeCodes.length}
              ref={(element) => {
                if (element)
                  element.indeterminate =
                    activeCount > 0 && activeCount < activeCodes.length;
              }}
              onChange={() => void toggleAll()}
            />
            {active.label} 전체
          </label>
          {active.roles.map((role) => (
            <label key={role.code} className={styles.roleOption}>
              <input
                type="checkbox"
                checked={current.includes(role.code)}
                onChange={() => void toggle(role.code)}
              />
              {role.label}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
