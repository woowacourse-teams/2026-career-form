import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  PROFILE_CATEGORIES,
  type ProfileCategoryDefinition,
} from "../../src/profile/field-definitions";
import {
  EDITOR_GROUPS,
  categoryMatches,
  categoryFilledCount,
} from "../../src/profile/editor-presentation";
import type {
  LayoutPreference,
  Profile,
  ProfileCategoryId,
} from "../../src/profile/model";
import { ProfileForm } from "../../src/profile/components/ProfileForm";
import styles from "./App.module.css";

type FormProps = Omit<ComponentProps<typeof ProfileForm>, "category">;

function categoryCount(category: ProfileCategoryDefinition, profile: Profile) {
  const count = categoryFilledCount(category, profile);
  return count ? `${count}${category.repeatable ? "건" : "개"}` : "미입력";
}

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
        <span
          className={styles.accordionStatus}
          data-empty={status === "미입력"}
        >
          {status}
        </span>
        <span className={styles.accordionChevron} aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </summary>
      <div className={styles.accordionBody}>{children}</div>
    </details>
  );
}

export function ProfileWorkspace({
  layout,
  formProps,
  sidebarFooter,
}: {
  layout: LayoutPreference;
  formProps: FormProps;
  sidebarFooter?: ReactNode;
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
  const activeCount = categoryCount(activeDefinition, formProps.profile);

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
        placeholder="항목 찾기"
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
        <div className={styles.overviewHeader}>{search}</div>
        {!visibleCategories.length && noResults}
        {visibleCategories.map((category) => (
          <Accordion
            key={`${category.id}-${query.trim() ? "search" : "browse"}`}
            category={category}
            status={categoryCount(category, formProps.profile)}
            initiallyOpen={category.id === activeCategory || !!query}
          >
            <ProfileForm category={category} {...formProps} />
          </Accordion>
        ))}
        {sidebarFooter}
      </main>
    );

  return (
    <main className={styles.layoutA}>
      <aside className={styles.sidebar}>
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
                {categories.map((category) => {
                  const count = categoryCount(category, formProps.profile);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-label={category.label}
                      aria-current={
                        activeCategory === category.id ? "page" : undefined
                      }
                      onClick={() => navigate(category.id)}
                    >
                      <span className={styles.navLabel}>{category.label}</span>
                      <small data-empty={count === "미입력"}>{count}</small>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {!visibleCategories.length && noResults}
        </nav>
        {sidebarFooter}
      </aside>
      <section
        className={styles.formPanel}
        aria-labelledby="profile-category-heading"
      >
        <div className={styles.sectionHeading}>
          <h2 id="profile-category-heading" tabIndex={-1} ref={heading}>
            {activeDefinition.label}
          </h2>
          <span
            className={styles.categoryCount}
            data-empty={activeCount === "미입력"}
          >
            {activeCount}
          </span>
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
              이전
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
            </button>
          ) : (
            <span />
          )}
        </footer>
      </section>
    </main>
  );
}
