import lockArt from "../landing/assets/O5.webp";
import { Block, Flow, Note, Steps, Topic } from "./TechParts";
import styles from "./TechPage.module.css";

const stack = [
  [
    "서버 → 푸시 서비스",
    ["Web Push", "VAPID", "aes128gcm"],
    "서명과 종단 간 암호화. 유효 기간은 공고 마감까지",
  ],
  [
    "발송 예약과 재시도",
    ["MongoDB findAndModify"],
    "조건부 갱신으로 리스를 걸어 중복 발송을 막음",
  ],
  ["발송 병렬화", ["가상 스레드", "Semaphore"], "동시 20건까지 푸시 호출"],
  [
    "브라우저 수신",
    ["서비스 워커 push 이벤트"],
    "Chrome이 켜지면 밀린 알림도 받음 (Chrome 121 이상)",
  ],
  [
    "마감 알림",
    ["chrome.alarms", "chrome.notifications"],
    "서버 없이 브라우저 안에서 시각에 맞춰 울림",
  ],
] as const;

export function TechNotifications() {
  return (
    <Topic
      id="notifications"
      label="공고 알림"
      title="마감 알림이 브라우저에 도착하는 방법"
      lead="팀이 고른 공고는 서버가 Web Push로 보내고, 마감 알림은 확장 프로그램이 브라우저 안에서 울려요. 두 경로에 쓴 기술을 정리했어요."
    >
      <Block tag="problem" tagLabel="문제" title="새 공고를 알릴 길이 없었어요">
        <p>
          커리어폼은 프로필을 브라우저에만 둬요. 서버에는 계정도 프로필도
          없어요. 그래서 팀이 좋은 공고를 모아도 사용자에게 전할 방법이
          없었어요.
        </p>
        <p>
          확장 프로그램이 10분마다 서버에 새 공고를 묻는 방식도 검토했어요.
          하지만 등록 뒤 최대 10분이 걸리고, 팀이 발송 진행을 볼 수 없어서
          택하지 않았어요.
        </p>
      </Block>

      <Block
        tag="solve"
        tagLabel="해결"
        title="Web Push로 보내고, 발송 기록으로 다시 보내요"
      >
        <figure
          className={styles.flow}
          aria-label="서버가 보내는 새 공고 알림과 브라우저가 울리는 마감 알림, 두 흐름"
        >
          <p className={styles.laneLabel}>서버가 보내는 새 공고 알림</p>
          <Flow
            items={[
              { title: "팀 등록", detail: "관리 화면" },
              { arrow: "구독마다" },
              {
                title: "발송 기록",
                detail: "구독마다 1건 · MongoDB",
                tone: "hot",
              },
              { arrow: "60초마다" },
              {
                title: "발송기",
                detail: "리스·재시도 · 암호화·서명",
                tone: "hot",
              },
              { arrow: "Web Push" },
              { title: "푸시 서비스", detail: "FCM · 본문 못 읽음" },
              { arrow: "push" },
              { title: "알림", detail: "서비스 워커", tone: "end" },
            ]}
          />
          <p className={styles.laneLabel}>브라우저가 울리는 마감 알림</p>
          <Flow
            items={[
              { title: "마감 알림 저장", detail: "알림 버튼 · 공고 열기" },
              { arrow: "저장" },
              {
                title: "브라우저 저장소",
                detail: "공고와 알림 시각",
                tone: "hot",
              },
              { arrow: "시각이 되면" },
              {
                title: "chrome.alarms",
                detail: "마감 24시간 전 · 2시간 전",
                tone: "hot",
              },
              { arrow: "서버 없이" },
              { title: "알림", detail: "확장이 직접", tone: "end" },
            ]}
          />
        </figure>
        <Steps
          items={[
            [
              "Web Push 표준을 그대로 써요.",
              "서버는 VAPID로 서명하고 본문을 종단 간 암호화(aes128gcm)해 Chrome의 푸시 서비스로 보내요. 그래서 푸시 서비스도 공고 내용을 읽지 못해요. 확장은 서비스 워커의 push 이벤트로 받아 알림을 띄워요.",
            ],
            [
              "메시지 큐 대신 발송 기록을 둬요.",
              "공고를 등록하면 구독 하나마다 발송 기록 한 건을 기존 DB에 만들어요. 발송기가 60초마다 차례가 된 기록을 집어 보내요. 새 인프라 없이 DB 문서가 큐의 역할을 맡아요.",
            ],
            [
              "실패 종류에 따라 다르게 다시 보내요.",
              "서버 오류나 시간 초과면 1, 2, 4, 8, 16, 32, 64분 뒤에 다시 보내 최대 8회 시도해요. 푸시 서비스가 “잠시 뒤에”라고 답하면 그 시각에 맞춰요. 구독이 사라졌다고 답하면 바로 포기하고 구독을 지워요. 마감이 지난 공고는 더 보내지 않아요.",
            ],
          ]}
        />
        <Note art={lockArt}>
          발송기가 보내는 도중에 멈춰도 기록은 남아요. 기록을 집을 때 120초짜리
          리스를 걸고, 결과를 쓸 때도 리스와 시도 횟수가 그대로일 때만 반영해요.
          그래서 발송기가 둘이어도 같은 건을 두 번 보내거나 서로 덮어쓰지
          않아요.
        </Note>
      </Block>

      <Block title="어디에 무엇을 썼나">
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                <th scope="col">구간</th>
                <th scope="col">기술</th>
                <th scope="col">역할</th>
              </tr>
            </thead>
            <tbody>
              {stack.map(([part, tech, role]) => (
                <tr key={part}>
                  <td>{part}</td>
                  <td>
                    {tech.map((t) => (
                      <code key={t}>{t}</code>
                    ))}
                  </td>
                  <td>{role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block title="마감 알림은 브라우저 안에서 울려요">
        <p>
          알림에서 ‘마감 알림 저장’을 누르거나 공고를 열면 확장 프로그램이 그
          공고를 브라우저에 저장해요. 그리고 마감 24시간 전과 2시간 전에 알람을
          걸어요. 이 알림은 서버가 보내지 않아요. 시점은 두 개까지 바꿀 수 있고,
          시간은 한국 시간 기준이에요.
        </p>
        <div className={styles.alarm}>
          <div>
            <b>마감 24시간 전</b>
            <span>첫 번째 알림</span>
          </div>
          <div>
            <b>마감 2시간 전</b>
            <span>두 번째 알림</span>
          </div>
          <div className={styles.alarmCancelled}>
            <b>남은 알림</b>
            <span>‘지원 완료’로 표시하면 취소돼요</span>
          </div>
        </div>
        <p>
          직접 저장한 공고도 같은 방식이에요. Chrome이 꺼져 있던 동안 지난
          알림은, 다시 켰을 때 마감 전이면 한 번 띄워요.
        </p>
      </Block>

      <Block title="서버는 누구인지 몰라요" className={styles.privacy}>
        <img src={lockArt} alt="" />
        <p>
          구독으로 서버에 남는 것은 푸시 주소, 브라우저가 만든 암호화 키 두 개,
          등록 시각뿐이에요. 계정도 프로필도 없어서, 어떤 사용자의 브라우저인지
          서버는 알 수 없어요. 로그와 지표에도 주소, 키, 공고 링크를 남기지
          않아요. ‘프로필은 내 브라우저에’라는 원칙을 알림 기능에서도 지켰어요.
        </p>
      </Block>
    </Topic>
  );
}
