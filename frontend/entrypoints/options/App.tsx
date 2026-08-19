import { useEffect, useMemo, useState } from "react";

import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";
import type {
  LayoutPreference,
  ProfileCategoryId,
} from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { ProfileForm } from "../../src/profile/components/ProfileForm";
import { useProfileEditor } from "../../src/profile/hooks/use-profile-editor";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import styles from "./App.module.css";

interface AppProps {
  repository?: ProfileRepository;
  confirmDelete?: (message: string) => boolean;
}

const SAVE_STATUS_LABEL = {
  idle: "변경 사항 없음",
  saving: "저장 중",
  saved: "저장됨",
  error: "저장 실패",
} as const;

export function App({
  repository: injectedRepository,
  confirmDelete = (message) => globalThis.confirm(message),
}: AppProps) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const editor = useProfileEditor(repository);
  const [layout, setLayout] = useState<LayoutPreference | null>(null);
  const [layoutSaveFailed, setLayoutSaveFailed] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<ProfileCategoryId>("personal");

  useEffect(() => {
    repository
      .loadLayout()
      .then(setLayout)
      .catch(() => setLayout("a"));
  }, [repository]);

  if (editor.loadStatus === "loading" || layout === null) {
    return <p className={styles.loading}>프로필을 불러오는 중입니다.</p>;
  }

  if (editor.loadStatus === "error") {
    return <p className={styles.loading}>프로필을 불러오지 못했습니다.</p>;
  }

  const changeLayout = (nextLayout: LayoutPreference) => {
    setLayout(nextLayout);
    setLayoutSaveFailed(false);
    void repository
      .saveLayout(nextLayout)
      .catch(() => setLayoutSaveFailed(true));
  };
  const activeDefinition = PROFILE_CATEGORIES.find(
    (category) => category.id === activeCategory,
  )!;
  const formProps = {
    profile: editor.profile,
    onAddEntry: editor.addEntry,
    onRemoveEntry: editor.removeEntry,
    onUpdateEntry: editor.updateEntry,
    onUpdateSingle: editor.updateSingle,
    confirmDelete,
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CAREER FORM</p>
          <h1>프로필 관리</h1>
          <p className={styles.description}>
            필요한 정보만 입력하세요. 변경 내용은 이 브라우저에 자동 저장됩니다.
          </p>
        </div>
        <div className={styles.toolbar}>
          <div
            className={styles.layoutSwitch}
            aria-label="프로필 레이아웃 선택"
          >
            {(["a", "b"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={layout === candidate}
                onClick={() => changeLayout(candidate)}
              >
                {candidate.toUpperCase()}형
              </button>
            ))}
          </div>
          <div className={styles.saveState} role="status" aria-live="polite">
            <span data-status={editor.saveStatus} />
            {SAVE_STATUS_LABEL[editor.saveStatus]}
            {editor.saveStatus === "error" && (
              <button type="button" onClick={() => void editor.retrySave()}>
                다시 시도
              </button>
            )}
          </div>
        </div>
      </header>

      <aside className={styles.notice}>
        프로필은 암호화 없이 Chrome 로컬 저장소에 보관됩니다. 같은 브라우저
        프로필이나 기기에 접근할 수 있는 사람에게 보일 수 있습니다.
      </aside>
      {layoutSaveFailed && (
        <p className={styles.preferenceError} role="alert">
          레이아웃 선택을 저장하지 못했습니다. 현재 화면에서는 선택한 레이아웃을
          계속 사용할 수 있습니다.
        </p>
      )}

      {layout === "a" ? (
        <main className={styles.layoutA}>
          <nav className={styles.categoryNav} aria-label="프로필 범주">
            {PROFILE_CATEGORIES.map((category, index) => (
              <button
                key={category.id}
                type="button"
                aria-label={category.label}
                aria-current={
                  activeCategory === category.id ? "page" : undefined
                }
                onClick={() => setActiveCategory(category.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {category.label}
              </button>
            ))}
          </nav>
          <section className={styles.formPanel}>
            <div className={styles.sectionHeading}>
              <p>
                {activeDefinition.sensitive ? "개별 확인 정보" : "프로필 정보"}
              </p>
              <h2>{activeDefinition.label}</h2>
            </div>
            <ProfileForm category={activeDefinition} {...formProps} />
          </section>
        </main>
      ) : (
        <main className={styles.layoutB}>
          {PROFILE_CATEGORIES.map((category, index) => (
            <details
              className={styles.accordion}
              key={category.id}
              aria-label={category.label}
            >
              <summary>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{category.label}</strong>
                {category.sensitive && <em>개별 확인 정보</em>}
              </summary>
              <div className={styles.accordionBody}>
                <ProfileForm category={category} {...formProps} />
              </div>
            </details>
          ))}
        </main>
      )}
    </div>
  );
}
