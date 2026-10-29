import type { ReactNode } from "react";
import { NotificationDemo } from "./NotificationDemo";
import styles from "./Site.module.css";

export type TechFigureKind =
  "matching-flow" | "confidence-scale" | "push-flow" | "notification-demo";

const ink = "var(--color-text-strong)";
const muted = "var(--color-text-muted)";
const line = "var(--color-border-strong)";
const soft = "var(--color-accent-soft)";
const brand = "var(--color-brand)";
const action = "var(--color-action)";
const strong = "var(--color-action-strong)";
const paper = "var(--color-surface)";

function Box({
  x,
  y,
  w,
  h,
  title,
  lines = [],
  tone = "paper",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines?: string[];
  tone?: "paper" | "soft" | "brand" | "action";
}) {
  const fill =
    tone === "action"
      ? action
      : tone === "brand"
        ? brand
        : tone === "soft"
          ? soft
          : paper;
  const color = tone === "action" ? "var(--color-on-action)" : ink;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="10"
        fill={fill}
        stroke={tone === "action" ? action : line}
      />
      <text
        x={x + w / 2}
        y={y + (lines.length ? 22 : h / 2 + 5)}
        textAnchor="middle"
        fontSize="13"
        fontWeight="650"
        fill={color}
      >
        {title}
      </text>
      {lines.map((text, i) => (
        <text
          key={text}
          x={x + w / 2}
          y={y + 40 + i * 16}
          textAnchor="middle"
          fontSize="11.5"
          fill={tone === "action" ? "var(--color-on-action)" : muted}
        >
          {text}
        </text>
      ))}
    </g>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  label,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}) {
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={line}
        strokeWidth="1.6"
        markerEnd="url(#tech-arrow)"
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={Math.min(y1, y2) - 8}
          textAnchor="middle"
          fontSize="11"
          fill={muted}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Diagram({
  label,
  height,
  children,
}: {
  label: string;
  height: number;
  children: ReactNode;
}) {
  return (
    <svg
      className={styles.techDiagram}
      viewBox={`0 0 640 ${height}`}
      role="img"
      aria-label={label}
      fontFamily="inherit"
    >
      <title>{label}</title>
      <defs>
        <marker
          id="tech-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill={line} />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

// Column layout: 지원서 | 섹션 | 섹션별 후보 | 선택. Gaps hold the arrow labels.
function MatchingFlow() {
  const sections = [
    ["인적사항", "칸 10개", "인적사항 후보만", "이름·연락처·생년월일"],
    ["학력", "칸 6개", "학력 후보만", "학교·전공·학위·기간"],
    ["경력", "칸 5개", "경력 후보만", "회사·직무·기간"],
  ] as const;
  return (
    <Diagram
      label="지원서를 섹션으로 나누고, 섹션의 종류를 정한 뒤, 칸마다 그 섹션의 후보 중 하나를 고르는 흐름"
      height={236}
    >
      <Box x={8} y={70} w={100} h={96} title="지원서" lines={["칸 67개"]} />
      <Arrow x1={108} y1={118} x2={164} y2={118} label="섹션 분할" />
      {sections.map(([title, count, candidate, keys], i) => {
        const y = 24 + i * 68;
        return (
          <g key={title}>
            <Box x={164} y={y} w={112} h={54} title={title} lines={[count]} />
            <Arrow
              x1={276}
              y1={y + 27}
              x2={332}
              y2={y + 27}
              label={i === 1 ? "JEV 분류" : undefined}
            />
            <Box
              x={332}
              y={y}
              w={128}
              h={54}
              title={candidate}
              lines={[keys]}
              tone="soft"
            />
          </g>
        );
      })}
      <Arrow x1={460} y1={118} x2={516} y2={118} label="칸별 선택" />
      <Box
        x={516}
        y={70}
        w={116}
        h={96}
        title="하나 고름"
        lines={["또는 기권", "신뢰도 포함"]}
        tone="action"
      />
    </Diagram>
  );
}

function ConfidenceScale() {
  return (
    <Diagram
      label="신뢰도 0.5 미만은 채우지 않고, 0.5에서 0.8 사이는 확인 뒤 채우고, 0.8 이상은 바로 채우는 눈금"
      height={132}
    >
      <rect x="16" y="52" width="296" height="18" rx="9" fill={brand} />
      <rect x="312" y="52" width="176" height="18" fill={soft} />
      <rect x="488" y="52" width="136" height="18" rx="9" fill={action} />
      {[
        [16, "0"],
        [312, "0.5"],
        [488, "0.8"],
        [624, "1.0"],
      ].map(([x, label]) => (
        <g key={label}>
          <line
            x1={x}
            y1="46"
            x2={x}
            y2="76"
            stroke={strong}
            strokeWidth="1.5"
          />
          <text
            x={x}
            y="36"
            textAnchor="middle"
            fontSize="12"
            fontWeight="650"
            fill={ink}
          >
            {label}
          </text>
        </g>
      ))}
      <text x="164" y="100" textAnchor="middle" fontSize="13" fill={ink}>
        채우지 않음
      </text>
      <text x="164" y="118" textAnchor="middle" fontSize="11.5" fill={muted}>
        사용자가 직접 입력
      </text>
      <text x="400" y="100" textAnchor="middle" fontSize="13" fill={ink}>
        값을 보여주고 확인 뒤 채움
      </text>
      <text x="400" y="118" textAnchor="middle" fontSize="11.5" fill={muted}>
        확인 필요 그룹에 표시
      </text>
      <text
        x="556"
        y="100"
        textAnchor="middle"
        fontSize="13"
        fontWeight="650"
        fill={strong}
      >
        바로 채움
      </text>
      <text x="556" y="118" textAnchor="middle" fontSize="11.5" fill={muted}>
        입력 완료 그룹
      </text>
    </Diagram>
  );
}

// Two lanes: the server lane ends at the service worker, the browser lane never leaves the browser.
function PushFlow() {
  return (
    <Diagram
      label="서버 경로는 팀 등록, 발송 기록, 발송기, 푸시 서비스, 서비스 워커를 거쳐 알림이 되고, 브라우저 경로는 마감 알림 저장이 chrome.alarms를 거쳐 알림이 되는 두 흐름"
      height={262}
    >
      <text x="8" y="18" fontSize="12" fontWeight="650" fill={strong}>
        서버 경로 · 팀이 고른 공고
      </text>
      <Box x={8} y={30} w={92} h={64} title="팀 등록" lines={["관리 화면"]} />
      <Arrow x1={100} y1={62} x2={140} y2={62} />
      <Box
        x={140}
        y={30}
        w={112}
        h={64}
        title="발송 기록"
        lines={["구독마다 1건", "MongoDB"]}
        tone="soft"
      />
      <Arrow x1={252} y1={62} x2={308} y2={62} label="60초마다" />
      <Box
        x={308}
        y={30}
        w={96}
        h={64}
        title="발송기"
        lines={["리스·재시도", "암호화·서명"]}
        tone="soft"
      />
      <Arrow x1={404} y1={62} x2={444} y2={62} />
      <Box
        x={444}
        y={30}
        w={96}
        h={64}
        title="푸시 서비스"
        lines={["FCM", "본문 못 읽음"]}
      />
      <Arrow x1={540} y1={62} x2={564} y2={62} />
      <Box
        x={564}
        y={30}
        w={68}
        h={64}
        title="알림"
        lines={["서비스 워커"]}
        tone="action"
      />

      <line
        x1="8"
        y1="128"
        x2="632"
        y2="128"
        stroke={line}
        strokeDasharray="4 6"
      />
      <text x="8" y="156" fontSize="12" fontWeight="650" fill={strong}>
        브라우저 경로 · 저장한 공고의 마감
      </text>
      <Box
        x={8}
        y={168}
        w={128}
        h={64}
        title="마감 알림 저장"
        lines={["알림 버튼·공고 열기"]}
      />
      <Arrow x1={136} y1={200} x2={176} y2={200} />
      <Box
        x={176}
        y={168}
        w={128}
        h={64}
        title="브라우저 저장소"
        lines={["chrome.storage.local"]}
        tone="soft"
      />
      <Arrow x1={304} y1={200} x2={344} y2={200} />
      <Box
        x={344}
        y={168}
        w={140}
        h={64}
        title="chrome.alarms"
        lines={["24시간 전 · 2시간 전"]}
        tone="soft"
      />
      <Arrow x1={484} y1={200} x2={564} y2={200} label="서버 없이" />
      <Box
        x={564}
        y={168}
        w={68}
        h={64}
        title="알림"
        lines={["확장이 직접"]}
        tone="action"
      />
    </Diagram>
  );
}

export function TechFigure({ kind }: { kind: TechFigureKind }) {
  if (kind === "notification-demo")
    return (
      <div className={styles.techDemo}>
        <NotificationDemo />
      </div>
    );
  const [figure, caption] =
    kind === "matching-flow"
      ? [<MatchingFlow key={kind} />, "후보를 좁히는 흐름 · 칸 수는 예시"]
      : kind === "confidence-scale"
        ? [
            <ConfidenceScale key={kind} />,
            "JEV가 돌려준 신뢰도로 세 갈래를 나눕니다",
          ]
        : [
            <PushFlow key={kind} />,
            "서버가 보내는 알림과 브라우저가 울리는 알림",
          ];
  return (
    <figure className={styles.techFigure}>
      {figure}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
