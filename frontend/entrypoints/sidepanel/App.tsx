import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  openAutofillOverlay,
  openOptionsPage,
  openPostingsPage,
} from "../../src/extension/navigation";
import type { TrackEvent } from "../../src/analytics/events";
import { trackExtensionEvent } from "../../src/analytics/extension-tracker";
import type { Profile, ProfileCategoryId } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import {
  buildSearchItems,
  searchProfileItems,
  type ProfileSearchItem,
} from "../../src/profile/profile-search";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import { PageImport } from "../../src/profile/page-import/PageImport";
import type { ImportCandidate } from "../../src/profile/page-import/reader";
import {
  unreadPostingsReader,
  type UnreadReader,
} from "../../src/job-postings/unread-postings";
import styles from "./App.module.css";
import panelCss from "./App.module.css?inline";
import { ProfileValueList } from "./ProfileValueList";

interface AppProps {
  track?: TrackEvent;
  repository?: ProfileRepository;
  copyText?: (value: string) => Promise<void>;
  closePanel?: () => void;
  openOptions?: () => Promise<void> | void;
  openPostings?: (create: boolean) => Promise<void>;
  openAutofill?: () => Promise<void>;
  inPage?: boolean;
  logoUrl?: string;
  autofillView?: ReactNode;
  returnToProfile?: () => void;
  actionPosition?: "top" | "bottom";
  showPostings?: boolean;
  unreadPostings?: UnreadReader;
  readImportCandidates?: () => Promise<readonly ImportCandidate[]>;
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
  track = trackExtensionEvent,
  repository: injectedRepository,
  copyText = (value) => navigator.clipboard.writeText(value),
  closePanel = () => window.close(),
  openOptions = openOptionsPage,
  openPostings = openPostingsPage,
  openAutofill = openAutofillOverlay,
  inPage = false,
  logoUrl = "/side-panel-launcher-logo.png",
  autofillView,
  returnToProfile,
  actionPosition = "top",
  showPostings = true,
  unreadPostings = unreadPostingsReader,
  readImportCandidates,
}: AppProps) {
  const repository = useMemo(
    () => injectedRepository ?? new ChromeProfileStorage(),
    [injectedRepository],
  );
  const [profile, setProfile] = useState<Profile>();
  const profileLoadGeneration = useRef(0);
  const [importActive, setImportActive] = useState(false);
  const [importSavedCount, setImportSavedCount] = useState<number>();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string>();
  const [copyFailed, setCopyFailed] = useState(false);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const [postingsFailed, setPostingsFailed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let active = true;
    void unreadPostings.count().then((count) => {
      if (active) setUnreadCount(count);
    });
    const unsubscribe = unreadPostings.subscribe((count) => {
      if (active) setUnreadCount(count);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [unreadPostings]);
  const [autofillFailed, setAutofillFailed] = useState(false);
  const [autofillPending, setAutofillPending] = useState(false);
  const startPending = useRef(false);
  const startButton = useRef<HTMLButtonElement>(null);
  const autofillActive = Boolean(autofillView);
  const previouslyActive = useRef(autofillActive);

  useEffect(() => {
    if (autofillActive) setImportActive(false);
  }, [autofillActive]);

  useEffect(() => {
    if (previouslyActive.current && !autofillActive)
      startButton.current?.focus();
    previouslyActive.current = autofillActive;
  }, [autofillActive]);
  const [openGroups, setOpenGroups] = useState<Set<PanelGroupId>>(
    () => new Set(DEFAULT_OPEN_GROUPS),
  );

  useEffect(() => {
    const generation = ++profileLoadGeneration.current;
    repository
      .load()
      .then((loadedProfile) => {
        if (generation !== profileLoadGeneration.current) return;
        setProfile(loadedProfile);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (generation === profileLoadGeneration.current)
          setLoadStatus("error");
      });
    return () => {
      ++profileLoadGeneration.current;
    };
  }, [repository]);

  const items = profile ? buildSearchItems(profile) : [];
  const results = searchProfileItems(items, query);
  const hasQuery = Boolean(query.trim());
  const visibleGroups = PANEL_GROUPS.filter(
    (group) => !hasQuery || itemsForGroup(results, group).length > 0,
  );

  const analyticsProperties = inPage
    ? { surface: "in_page_panel" as const, page_host: window.location.hostname }
    : { surface: "side_panel" as const };

  const copy = async (id: string, value: string) => {
    track("profile_copy_clicked", analyticsProperties);
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
    track("profile_management_clicked", analyticsProperties);
    try {
      setNavigationFailed(false);
      await openOptions();
    } catch {
      setNavigationFailed(true);
    }
  };

  const startAutofill = async () => {
    if (startPending.current) return;
    track("autofill_start_clicked", analyticsProperties);
    startPending.current = true;
    setAutofillPending(true);
    try {
      setAutofillFailed(false);
      await openAutofill();
      track("autofill_open_succeeded", analyticsProperties);
    } catch {
      track("autofill_open_failed", analyticsProperties);
      setAutofillFailed(true);
    } finally {
      startPending.current = false;
      setAutofillPending(false);
    }
  };

  return (
    <div
      className={`${styles.panel} ${inPage ? styles.inPagePanel : ""} ${actionPosition === "bottom" ? styles.bottomActionPanel : ""}`}
    >
      <style>{panelCss}</style>
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <div className={styles.brandIdentity}>
            <img
              className={styles.brandMark}
              src={logoUrl}
              alt="커리어폼"
              width={42}
              height={42}
            />
            <div>
              <p>CAREER FORM</p>
              <span>지원서 패널</span>
            </div>
          </div>
          <button
            className={styles.closeButton}
            type="button"
            aria-label="닫기"
            onClick={closePanel}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className={styles.titleRow}>
          {autofillActive && returnToProfile && (
            <button
              type="button"
              className={styles.returnButton}
              aria-label="수동 복사로 돌아가기"
              title="수동 복사로 돌아가기"
              onClick={returnToProfile}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                returnToProfile();
              }}
            >
              <span aria-hidden="true">←</span>
            </button>
          )}
          <h1>
            {autofillActive
              ? "자동 기입"
              : importActive
                ? "프로필 가져오기"
                : "내 지원 정보"}
          </h1>
          <button
            className={styles.profileButton}
            data-profile-management
            hidden={autofillActive || importActive}
            type="button"
            onClick={() => void openProfileManagement()}
          >
            프로필 관리 <span aria-hidden="true">↗</span>
          </button>
        </div>
        {!autofillActive && !importActive && showPostings && (
          <nav className={styles.postingsActions} aria-label="공고 관리">
            <button
              type="button"
              onClick={() => {
                setPostingsFailed(false);
                void openPostings(false).catch(() => setPostingsFailed(true));
              }}
            >
              지원 공고 관리 <span aria-hidden="true">↗</span>
              {unreadCount > 0 && (
                <span
                  className={styles.unreadBadge}
                  aria-label={`새 공고 ${unreadCount}건`}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          </nav>
        )}
        {!autofillActive && !importActive && actionPosition === "top" && (
          <section className={styles.autofillAction}>
            <button
              data-autofill-start
              ref={startButton}
              type="button"
              disabled={autofillPending}
              onClick={() => void startAutofill()}
            >
              자동 기입 <span aria-hidden="true">→</span>
            </button>

            {autofillFailed && (
              <p className={styles.autofillError} role="alert">
                현재 페이지에 자동 기입 화면을 열지 못했습니다. 지원서
                페이지에서 다시 시도해 주세요.
              </p>
            )}
          </section>
        )}
        {postingsFailed && (
          <p role="alert">
            공고 관리 화면을 열지 못했습니다. 다시 시도해 주세요.
          </p>
        )}
      </header>
      {importActive && readImportCandidates ? (
        <main className={styles.main} aria-label="프로필 가져오기 화면">
          <PageImport
            analytics={{ track, properties: analyticsProperties }}
            repository={repository}
            readCandidates={readImportCandidates}
            onClose={() => setImportActive(false)}
            onSaved={(saved, count) => {
              ++profileLoadGeneration.current;
              setProfile(saved);
              setLoadStatus("ready");
              setImportActive(false);
              setImportSavedCount(count);
            }}
          />
        </main>
      ) : autofillActive ? (
        <main className={styles.workflowMain} aria-label="지원서 작업 화면">
          {autofillView}
        </main>
      ) : (
        <>
          <main
            className={styles.main}
            aria-label="지원 정보 목록"
            data-panel-mode={inPage ? "in-page" : "side-panel"}
          >
            {navigationFailed && (
              <p className={styles.navigationError} role="alert">
                프로필 관리 화면을 열지 못했습니다. 다시 시도해 주세요.
              </p>
            )}

            {readImportCandidates && (
              <section className={styles.importAction}>
                <button
                  type="button"
                  onClick={() => {
                    setImportSavedCount(undefined);
                    setImportActive(true);
                    try {
                      track("greeting_import_viewed", analyticsProperties);
                    } catch {
                      // Reading and reviewing remain available without telemetry.
                    }
                  }}
                >
                  지원서에서 가져오기
                </button>
                <p>이미 작성한 Greeting 지원서로 프로필을 채워보세요.</p>
              </section>
            )}
            {importSavedCount !== undefined && (
              <section
                role="status"
                aria-label="가져오기 결과"
                className={styles.importResult}
              >
                <strong>프로필에 {importSavedCount}개를 저장했어요</strong>
                <p>
                  다른 지원서에서 자동 기입을 누르면 방금 저장한 정보로 채울 수
                  있어요
                </p>
              </section>
            )}
            <label className={styles.search}>
              <span className={styles.visuallyHidden}>프로필 검색</span>
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
                value={query}
                placeholder="이메일, 자격증, 학교 검색"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <section className={styles.groups} aria-label="프로필 범주">
              {loadStatus === "loading" && (
                <p className={styles.empty}>프로필을 불러오는 중입니다.</p>
              )}
              {loadStatus === "error" && (
                <p className={styles.empty} role="alert">
                  프로필을 불러오지 못했습니다. 프로필 관리에서 다시 시도해
                  주세요.
                </p>
              )}
              {loadStatus === "ready" && hasQuery && results.length === 0 && (
                <div className={styles.empty}>
                  <strong>검색 결과가 없습니다.</strong>
                  <span>
                    검색어를 지우거나 프로필 관리에서 정보를 추가하세요.
                  </span>
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
                          <ProfileValueList
                            items={groupItems}
                            showCategory={group.categoryIds.length > 1}
                            revealed={revealed}
                            copiedId={copiedId}
                            onCopy={(id, value) => void copy(id, value)}
                            onReveal={(id) =>
                              setRevealed((current) => new Set(current).add(id))
                            }
                          />
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
          {actionPosition === "bottom" && (
            <footer
              className={`${styles.autofillAction} ${styles.previewFooter}`}
            >
              <button
                data-autofill-start
                ref={startButton}
                type="button"
                disabled={autofillPending}
                onClick={() => void startAutofill()}
              >
                자동 기입 <span aria-hidden="true">→</span>
              </button>
              <p>선택 후 분석과 검토를 시작합니다</p>
            </footer>
          )}
        </>
      )}
    </div>
  );
}
