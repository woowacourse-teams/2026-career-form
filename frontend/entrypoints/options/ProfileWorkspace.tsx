import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  PROFILE_CATEGORIES,
  type ProfileCategoryDefinition,
} from "../../src/profile/field-definitions";
import {
  CATEGORY_GUIDES,
  EDITOR_GROUPS,
  categoryMatches,
  categoryStatus,
  categoryFilledCount,
} from "../../src/profile/editor-presentation";
import type {
  LayoutPreference,
  ProfileCategoryId,
} from "../../src/profile/model";
import { ProfileForm } from "../../src/profile/components/ProfileForm";
import styles from "./App.module.css";

type FormProps = Omit<ComponentProps<typeof ProfileForm>, "category">;

function Accordion({
  category,
  status,
  initiallyOpen,
  children,
}: {
  category: ProfileCategoryDefinition;
  status: string;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className={styles.accordion}
      aria-label={category.label}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <strong>{category.label}</strong>
        <span className={styles.accordionStatus}>{status}</span>
        <span className={styles.accordionChevron} aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </summary>
      <div className={styles.accordionBody}>
        <p className={styles.categoryGuide}>{CATEGORY_GUIDES[category.id]}</p>
        {children}
      </div>
    </details>
  );
}

export function ProfileWorkspace({
  layout,
  formProps,
}: {
  layout: LayoutPreference;
  formProps: FormProps;
}) {
  const [activeCategory, setActiveCategory] =
    useState<ProfileCategoryId>("personal");
  const [query, setQuery] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const visibleCategories = PROFILE_CATEGORIES.filter((category) =>
    categoryMatches(category, query),
  );
  const activeIndex = PROFILE_CATEGORIES.findIndex(
    (category) => category.id === activeCategory,
  );
  const activeDefinition = PROFILE_CATEGORIES[activeIndex];
  const registeredCount = PROFILE_CATEGORIES.filter(
    (category) => categoryFilledCount(category, formProps.profile) > 0,
  ).length;

  const navigate = (id: ProfileCategoryId) => {
    setActiveCategory(id);
    setQuery("");
    heading.current?.focus({ preventScroll: true });
    const top = heading.current?.getBoundingClientRect().top;
    if (top !== undefined && (top < 0 || top > window.innerHeight - 100)) {
      heading.current?.scrollIntoView?.({ block: "start" });
    }
  };
  const search = (
    <div className={styles.categorySearch}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
      <input
        type="search"
        aria-label="입력 항목 찾기"
        placeholder="입력 항목 찾기"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </div>
  );
  const noResults = (
    <div className={styles.noResults} role="status">
      <p>일치하는 항목이 없어요.</p>
      <button type="button" onClick={() => setQuery("")}>
        검색 초기화
      </button>
    </div>
  );

  if (layout === "b")
    return (
      <main className={styles.layoutB}>
        <div className={styles.overviewHeader}>
          <span>필요한 항목을 펼쳐 입력하세요</span>
          {search}
        </div>
        {!visibleCategories.length && noResults}
        {visibleCategories.map((category) => (
          <Accordion
            key={`${category.id}-${query.trim() ? "search" : "browse"}`}
            category={category}
            status={categoryStatus(category, formProps.profile)}
            initiallyOpen={category.id === activeCategory || !!query}
          >
            <ProfileForm category={category} {...formProps} />
          </Accordion>
        ))}
      </main>
    );

  return (
    <main className={styles.layoutA}>
      <aside className={styles.sidebar}>
        <div className={styles.navOverview}>
          <p>나의 프로필</p>
          <strong>
            {registeredCount}
            <span> / {PROFILE_CATEGORIES.length}개 범주에 정보 입력</span>
          </strong>
          <p className={styles.optionalNote}>필요한 항목만 채워도 괜찮아요.</p>
        </div>
        {search}
        <nav className={styles.categoryNav} aria-label="프로필 범주">
          {EDITOR_GROUPS.map((group) => {
            const categories = visibleCategories.filter((category) =>
              group.categories.includes(category.id),
            );
            if (!categories.length) return null;
            return (
              <div className={styles.navGroup} key={group.label}>
                <p>{group.label}</p>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    aria-label={category.label}
                    aria-current={
                      activeCategory === category.id ? "page" : undefined
                    }
                    onClick={() => navigate(category.id)}
                  >
                    <span
                      className={styles.navDot}
                      data-filled={
                        categoryFilledCount(category, formProps.profile) > 0
                      }
                      aria-hidden="true"
                    />
                    <span className={styles.navLabel}>{category.label}</span>
                    <small>{categoryStatus(category, formProps.profile)}</small>
                  </button>
                ))}
              </div>
            );
          })}
          {!visibleCategories.length && noResults}
        </nav>
      </aside>
      <section
        className={styles.formPanel}
        aria-labelledby="profile-category-heading"
      >
        <div className={styles.sectionHeading}>
          <div className={styles.sectionMeta}>
            <span>
              {
                EDITOR_GROUPS.find((group) =>
                  group.categories.includes(activeCategory),
                )?.label
              }
            </span>
            <span className={styles.categoryBadge}>
              {categoryStatus(activeDefinition, formProps.profile)}
            </span>
          </div>
          <h2 id="profile-category-heading" tabIndex={-1} ref={heading}>
            {activeDefinition.label}
          </h2>
          <p className={styles.categoryGuide}>
            {CATEGORY_GUIDES[activeCategory]}
          </p>
        </div>
        <div className={styles.formBody}>
          <ProfileForm
            key={activeCategory}
            category={activeDefinition}
            {...formProps}
          />
        </div>
        <footer className={styles.formFooter}>
          {activeIndex > 0 ? (
            <button
              type="button"
              onClick={() => navigate(PROFILE_CATEGORIES[activeIndex - 1].id)}
            >
              <span aria-hidden="true">← </span>이전 항목
            </button>
          ) : (
            <span />
          )}
          {activeIndex < PROFILE_CATEGORIES.length - 1 ? (
            <button
              className={styles.nextButton}
              type="button"
              onClick={() => navigate(PROFILE_CATEGORIES[activeIndex + 1].id)}
            >
              다음: {PROFILE_CATEGORIES[activeIndex + 1].label}
              <span aria-hidden="true"> →</span>
            </button>
          ) : (
            <span className={styles.optionalNote}>
              필요한 정보는 언제든 다시 수정할 수 있어요.
            </span>
          )}
        </footer>
      </section>
    </main>
  );
}
