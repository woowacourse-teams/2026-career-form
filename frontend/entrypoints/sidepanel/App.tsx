import { useEffect, useMemo, useState } from "react";

import {
  openAutofillOverlay,
  openOptionsPage,
} from "../../src/extension/navigation";
import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";
import type { Profile, ProfileCategoryId } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import {
  buildSearchItems,
  searchProfileItems,
  type ProfileSearchItem,
} from "../../src/profile/profile-search";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import styles from "./App.module.css";

interface AppProps {
  repository?: ProfileRepository;
  copyText?: (value: string) => Promise<void>;
  closePanel?: () => void;
  openOptions?: () => Promise<void> | void;
  openAutofill?: () => Promise<void>;
}

type LoadStatus = "loading" | "ready" | "error";
type PanelGroupId =
  "personal" | "contact" | "education" | "credentials" | "additional";

interface PanelGroup {
  id: PanelGroupId;
  label: string;
  categoryIds: readonly ProfileCategoryId[];
  defaultOpen?: boolean;
  showRecordCount?: boolean;
  description?: string;
}

const PANEL_GROUPS: readonly PanelGroup[] = [
  {
    id: "personal",
    label: "기본 인적사항",
    categoryIds: ["personal"],
    defaultOpen: true,
  },
  {
    id: "contact",
    label: "연락처와 주소",
    categoryIds: ["contact"],
    defaultOpen: true,
  },
  {
    id: "education",
    label: "학력",
    categoryIds: ["education"],
    showRecordCount: true,
  },
  {
    id: "credentials",
    label: "어학, 자격증, 프로젝트",
    categoryIds: ["languages", "certifications", "projects"],
    showRecordCount: true,
  },
  {
    id: "additional",
    label: "병역, 보훈, 장애와 건강",
    categoryIds: ["military", "veteran", "disability", "health"],
  },
];

const DEFAULT_OPEN_GROUPS = new Set(
  PANEL_GROUPS.filter((group) => group.defaultOpen).map((group) => group.id),
);

function hasCategoryData(profile: Profile, categoryId: ProfileCategoryId) {
  const value = profile[categoryId];
  if (Array.isArray(value)) {
    return value.some((entry) =>
      Object.values(entry.values).some((field) => field.trim()),
    );
  }
  return Object.values(value).some((field) => field.trim());
}

function countGroupRecords(profile: Profile, group: PanelGroup) {
  return group.categoryIds.reduce((count, categoryId) => {
    const value = profile[categoryId];
    return count + (Array.isArray(value) ? value.length : 0);
  }, 0);
}

function itemsForGroup(items: readonly ProfileSearchItem[], group: PanelGroup) {
  return items.filter((item) => group.categoryIds.includes(item.categoryId));
}

export function App({
  repository: injectedRepository,
  copyText = (value) => navigator.clipboard.writeText(value),
  closePanel = () => window.close(),
  openOptions = openOptionsPage,
  openAutofill = openAutofillOverlay,
}: AppProps) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const [profile, setProfile] = useState<Profile>();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string>();
  const [copyFailed, setCopyFailed] = useState(false);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const [autofillFailed, setAutofillFailed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<PanelGroupId>>(
    () => new Set(DEFAULT_OPEN_GROUPS),
  );

  useEffect(() => {
    repository
      .load()
      .then((loadedProfile) => {
        setProfile(loadedProfile);
        setLoadStatus("ready");
      })
      .catch(() => setLoadStatus("error"));
  }, [repository]);

  const items = profile ? buildSearchItems(profile) : [];
  const results = searchProfileItems(items, query);
  const hasQuery = Boolean(query.trim());
  const registeredCategoryCount = profile
    ? PROFILE_CATEGORIES.filter((category) =>
        hasCategoryData(profile, category.id),
      ).length
    : 0;
  const visibleGroups = PANEL_GROUPS.filter(
    (group) => !hasQuery || itemsForGroup(results, group).length > 0,
  );

  const copy = async (id: string, value: string) => {
    try {
      setCopyFailed(false);
      await copyText(value);
      setCopiedId(id);
    } catch {
      setCopyFailed(true);
    }
  };

  const toggleGroup = (groupId: PanelGroupId) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const openProfileManagement = async () => {
    try {
      setNavigationFailed(false);
      await openOptions();
    } catch {
      setNavigationFailed(true);
    }
  };

  const startAutofill = async () => {
    try {
      setAutofillFailed(false);
      await openAutofill();
    } catch {
      setAutofillFailed(true);
    }
  };

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p>S-01, 브라우저 사이드 패널</p>
          <h1>내 지원 정보</h1>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.profileButton}
            type="button"
            onClick={() => void openProfileManagement()}
          >
            프로필 관리
          </button>
          <button type="button" onClick={closePanel}>
            닫기
          </button>
        </div>
      </header>
      <main className={styles.main} aria-label="지원 정보 목록">
        {navigationFailed && (
          <p className={styles.navigationError} role="alert">
            프로필 관리 화면을 열지 못했습니다. 다시 시도해 주세요.
          </p>
        )}
        <label className={styles.search}>
          <span className={styles.visuallyHidden}>프로필 검색</span>
          <input
            type="search"
            value={query}
            placeholder="정보 검색, 예: 이메일, 자격증, 학교"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {loadStatus === "ready" && (
          <p className={styles.readiness}>
            <span>{registeredCategoryCount} / 10 범주 등록</span>
            직접 복사하거나 자동 기입을 시작하세요
          </p>
        )}

        <section className={styles.groups} aria-label="프로필 범주">
          {loadStatus === "loading" && (
            <p className={styles.empty}>프로필을 불러오는 중입니다.</p>
          )}
          {loadStatus === "error" && (
            <p className={styles.empty} role="alert">
              프로필을 불러오지 못했습니다. 프로필 관리에서 다시 시도해 주세요.
            </p>
          )}
          {loadStatus === "ready" && hasQuery && results.length === 0 && (
            <div className={styles.empty}>
              <strong>검색 결과가 없습니다.</strong>
              <span>검색어를 지우거나 프로필 관리에서 정보를 추가하세요.</span>
            </div>
          )}
          {loadStatus === "ready" &&
            visibleGroups.map((group) => {
              const groupItems = itemsForGroup(results, group);
              const isOpen = hasQuery || openGroups.has(group.id);
              const recordCount = profile
                ? countGroupRecords(profile, group)
                : 0;
              const countLabel = group.showRecordCount
                ? `${recordCount}건 `
                : "";
              const actionLabel = hasQuery
                ? "검색 결과"
                : isOpen
                  ? "접기"
                  : "펼치기";
              const regionId = `profile-group-${group.id}`;

              return (
                <section className={styles.group} key={group.id}>
                  <button
                    className={styles.groupToggle}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={regionId}
                    aria-label={`${group.label} ${countLabel}${actionLabel}`}
                    disabled={hasQuery}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span>{group.label}</span>
                    <small>
                      {countLabel}
                      {actionLabel}
                    </small>
                  </button>
                  {isOpen && (
                    <div className={styles.groupValues} id={regionId}>
                      {groupItems.length === 0 && (
                        <p className={styles.groupEmpty}>
                          등록된 정보가 없습니다.
                        </p>
                      )}
                      {groupItems.map((item) => {
                        const isRevealed =
                          !item.sensitive || revealed.has(item.id);
                        return (
                          <article className={styles.valueRow} key={item.id}>
                            <div className={styles.valueMeta}>
                              {group.categoryIds.length > 1 && (
                                <span>{item.categoryLabel}</span>
                              )}
                              <strong>{item.fieldLabel}</strong>
                              <span
                                className={
                                  isRevealed ? styles.value : styles.masked
                                }
                              >
                                {isRevealed ? item.value : "••••••••, 값 가림"}
                              </span>
                            </div>
                            {isRevealed ? (
                              <button
                                type="button"
                                aria-label={`${item.fieldLabel} 복사`}
                                onClick={() => void copy(item.id, item.value)}
                              >
                                {copiedId === item.id ? "복사됨" : "복사"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                aria-label={`${item.fieldLabel} 펼치기`}
                                onClick={() =>
                                  setRevealed((current) =>
                                    new Set(current).add(item.id),
                                  )
                                }
                              >
                                펼치기
                              </button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          {copyFailed && (
            <p className={styles.copyError} role="alert">
              클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.
            </p>
          )}
        </section>
      </main>
      <footer className={styles.footer}>
        <button type="button" onClick={() => void startAutofill()}>
          자동 기입
        </button>
        <p>선택 후 분석과 검토를 시작합니다</p>
        {autofillFailed && (
          <p className={styles.autofillError} role="alert">
            현재 페이지에 자동 기입 화면을 열지 못했습니다. 지원서 페이지에서
            다시 시도해 주세요.
          </p>
        )}
      </footer>
    </div>
  );
}
