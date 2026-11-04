import type { TrackEvent } from "../analytics/events";
import styles from "./JobPostings.module.css";
import type { VisibilityAnswer } from "./notification-check";
import type { PushStateView, RecordSource } from "./push-messages";
import { MINIMUM_CHROME_VERSION } from "./push-subscription";
import { RoleSelector } from "./RoleSelector";
import type { JobCategoriesHandle } from "./use-job-categories";
import { VisibilityCheck } from "./VisibilityCheck";

const unsupportedText = `Chrome ${MINIMUM_CHROME_VERSION} 이상 필요`;
export function subscriptionStatusText(state: PushStateView | undefined) {
  if (!state) return "확인 중";
  if (!state.supported) return unsupportedText;
  if (!state.enabled) return "꺼짐";
  switch (state.status?.code) {
    case "registered":
      return "등록됨";
    case "failed":
      return "등록 실패 (자동 재시도)";
    case "not_configured":
      return "알림 서버 없음";
    case "endpoint_unavailable":
      return "서버 미지원";
    case "unsupported":
      return unsupportedText;
    default:
      return "등록 확인 중";
  }
}

const FACTS: readonly (readonly [string, string])[] = [
  ["마감 알림", "마감 24시간·2시간 전"],
  ["Chrome 종료 중", "알림 없음"],
  ["OS 알림 설정", "차단되거나 늦게 표시될 수 있음"],
  ["OS 알림 꺼짐", "아이콘 숫자와 새 공고 탭으로 확인"],
  ["놓친 알림", "다시 실행하면 공고당 1개"],
  ["저장 위치", "이 브라우저에만 저장 (암호화 안 됨, 서버 동기화 없음)"],
  ["확장 삭제 시", "저장한 공고도 삭제"],
  ["서버 전송", "푸시 구독 주소와 받을 직무 (프로필·지원서 내용 없음)"],
  ["구독 끄기", "서버에 구독 주소 삭제 요청 (받을 직무는 이 브라우저에 남음)"],
];

interface SwitchProps {
  state: PushStateView | undefined;
  busy: boolean;
  onEnabledChange(enabled: boolean): Promise<void>;
  track: TrackEvent;
}

export function SubscriptionSwitch({
  state,
  busy,
  onEnabledChange,
  track,
}: SwitchProps) {
  const toggle = async (enabled: boolean) => {
    await onEnabledChange(enabled);
    track(
      enabled ? "push_subscription_enabled" : "push_subscription_disabled",
      { surface: "options" },
    );
  };
  return (
    <label className={styles.switch}>
      새 공고 알림
      <input
        type="checkbox"
        role="switch"
        checked={state?.enabled ?? true}
        disabled={!state || busy || !state.supported}
        onChange={(event) => void toggle(event.target.checked)}
      />
    </label>
  );
}

interface Props {
  state: PushStateView | undefined;
  failed: boolean;
  busy: boolean;
  categories: JobCategoriesHandle;
  onEnabledChange(enabled: boolean): Promise<void>;
  onRolesChange(roles: string[]): Promise<boolean>;
  onTest(): Promise<void>;
  onAnswer(answer: VisibilityAnswer, source: RecordSource): Promise<void>;
  track: TrackEvent;
  userAgent?: string;
}

/** Body of the 알림 설정 dialog: status, roles, test, visibility check, facts. */
export function SubscriptionSettings({
  state,
  failed,
  busy,
  categories,
  onEnabledChange,
  onRolesChange,
  onTest,
  onAnswer,
  track,
  userAgent,
}: Props) {
  // Only the count leaves the browser; the codes stay a local preference.
  const saveRoles = async (roles: string[]) => {
    const ok = await onRolesChange(roles);
    if (ok)
      track("push_roles_saved", {
        surface: "options",
        role_count: roles.length,
      });
    return ok;
  };
  return (
    <div className={styles.settingsBody}>
      <dl className={`${styles.facts} ${styles.status}`}>
        <div>
          <dt>구독</dt>
          <dd role="status">{subscriptionStatusText(state)}</dd>
        </div>
      </dl>
      {failed && (
        <p className={styles.settingsError}>구독 상태를 불러오지 못했어요</p>
      )}
      {state?.enabled && state.status?.code === "failed" && (
        <button disabled={busy} onClick={() => void onEnabledChange(true)}>
          다시 등록
        </button>
      )}
      <RoleSelector
        view={categories.view}
        loading={categories.loading}
        selected={state?.roles ?? []}
        busy={busy}
        onChange={saveRoles}
        onReload={categories.reload}
      />
      <VisibilityCheck
        variant="settings"
        state={state}
        busy={busy}
        onTest={onTest}
        onAnswer={onAnswer}
        track={track}
        surface="options"
        userAgent={userAgent}
      />
      <dl className={styles.facts}>
        {FACTS.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
