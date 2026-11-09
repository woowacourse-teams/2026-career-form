import sparkleArt from "../landing/assets/O2.webp";
import { Block, Flow, Note, Steps, Topic } from "./TechParts";
import styles from "./TechPage.module.css";

const metrics = [
  ["분석 시간", "22.1초", "4.2초", "약 5배 빠름"],
  ["칸 연결 성공률", "82.1%", "91.0%", "+8.9%p"],
  ["틀린 값 입력률", "25.0%", "0%", "틀린 값 없음"],
] as const;

export function TechMatching() {
  return (
    <Topic
      id="matching"
      label="자동 기입"
      title="지원서 칸을 프로필 항목에 연결하는 방법"
      lead="자동 기입은 지원서의 각 칸이 프로필의 어떤 항목인지 찾는 일에서 시작해요. 이 연결을 빠르고 정확하게 만든 과정이에요."
    >
      <Block
        tag="problem"
        tagLabel="문제"
        title="AI가 칸을 느리고 부정확하게 연결했어요"
      >
        <p>
          지원서에는 칸이 많아요. 처음에는 범용 언어 모델(OpenAI)이 각 칸에 맞는
          프로필 항목을 찾았어요.
        </p>
        <div className={styles.split}>
          <ol className={styles.issues}>
            <li>큰 지원서 하나를 분석하는 데 약 22초가 걸렸어요.</li>
            <li>모델이 답을 자유롭게 써서 형식이 자주 달라졌어요.</li>
            <li>칸에 틀린 값을 넣는 경우가 있었어요.</li>
          </ol>
          <div className={styles.big}>
            <strong>22초</strong>
            <span>큰 지원서 하나를 분석하는 데 걸린 시간</span>
          </div>
        </div>
      </Block>

      <Block
        tag="solve"
        tagLabel="해결"
        title="정해진 후보 중에서만 고르게 했어요"
      >
        <Steps
          items={[
            [
              "선택형 AI(JEV)를 써요.",
              "JEV는 답을 쓰지 않고, 정해진 후보 중에서 하나를 골라요. 그래서 응답 형식이 항상 같아요.",
            ],
            [
              "후보를 좁혀요.",
              "먼저 지원서를 학력, 경력 같은 섹션으로 나눠요. 각 칸에는 그 섹션에 맞는 후보만 보내요.",
            ],
          ]}
        />
        <figure
          className={styles.flow}
          aria-label="지원서를 섹션으로 나누고, 섹션 종류를 정한 뒤, 칸마다 그 섹션의 후보 중 하나를 고르는 흐름"
        >
          <Flow
            items={[
              { title: "지원서", detail: "칸 67개" },
              { arrow: "섹션 분할" },
              {
                stack: [
                  {
                    title: "인적사항 · 칸 10개",
                    detail: "후보: 이름·연락처·생년월일",
                    tone: "hot",
                  },
                  {
                    title: "학력 · 칸 6개",
                    detail: "후보: 학교·전공·학위·기간",
                    tone: "hot",
                  },
                  {
                    title: "경력 · 칸 5개",
                    detail: "후보: 회사·직무·기간",
                    tone: "hot",
                  },
                ],
              },
              { arrow: "칸별 선택" },
              {
                title: "하나 고름",
                detail: "또는 기권 · 신뢰도 포함",
                tone: "end",
              },
            ]}
          />
          <figcaption>섹션 종류는 JEV가 분류해요. 칸 수는 예시예요.</figcaption>
        </figure>
        <Note art={sparkleArt}>
          JEV는 확신이 낮으면 답하지 않아요. 이런 칸은 사용자가 직접 확인해요.
          틀린 값을 넣는 것보다 빈칸으로 두는 것이 안전하기 때문이에요.
        </Note>
      </Block>

      <Block
        tag="result"
        tagLabel="결과"
        title="5배 빨라지고, 틀린 값은 넣지 않게 됐어요"
      >
        <div className={styles.metrics}>
          {metrics.map(([name, before, after, change]) => (
            <div key={name} className={styles.metric}>
              <h4>{name}</h4>
              <div>
                <span className={styles.before}>{before}</span>
                <span className={styles.after}>{after}</span>
              </div>
              <small>{change}</small>
            </div>
          ))}
        </div>
        <p className={styles.fine}>
          측정 조건: 칸 67개가 있는 합성 지원서 1개를 쓰고, 정답과 프로필을 같게
          두고, 각각 5회 실행했어요. 분석 시간은 p95(5회 중 가장 느린 값)예요.
          결과는 AI 교체와 섹션 분할을 함께 적용한 효과예요.
        </p>
      </Block>

      <Block
        tag="solve"
        tagLabel="제품에서"
        title="자동 기입을 누르면 이 순서로 움직여요"
      >
        <Steps
          items={[
            [
              "확장 프로그램이 지원서를 섹션으로 나눠요.",
              "반복되는 행, fieldset, 제목 요소를 경계로 삼아 문서 순서대로 이어진 칸 묶음을 만들어요.",
            ],
            [
              "서버가 섹션의 종류를 정해요.",
              "JEV에게 ‘이 묶음은 인적사항·학력·경력 중 무엇인가’를 물어요. 종류가 정해지면 그 섹션의 칸에는 해당 프로필 항목만 후보로 보내요.",
            ],
            [
              "칸마다 후보 하나를 고르고 신뢰도를 받아요.",
              "신뢰도에 따라 아래처럼 다르게 다뤄요. 섹션 종류가 불확실하면 한 단계 낮춰 다뤄요.",
            ],
          ]}
        />
        <div
          className={styles.scale}
          role="img"
          aria-label="신뢰도 0.5 미만은 채우지 않고, 0.5에서 0.8 사이는 확인 뒤 채우고, 0.8 이상은 바로 채워요"
        >
          <div className={styles.scaleNo}>
            <b>채우지 않아요</b>
            <span>신뢰도 0.5 미만</span>
          </div>
          <div className={styles.scaleAsk}>
            <b>확인 뒤 채워요</b>
            <span>0.5 ~ 0.8 · 값을 보여주고 확인 요청</span>
          </div>
          <div className={styles.scaleYes}>
            <b>바로 채워요</b>
            <span>0.8 이상</span>
          </div>
        </div>
      </Block>
    </Topic>
  );
}
