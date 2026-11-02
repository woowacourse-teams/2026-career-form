import { policies, type PolicyArt, type PolicyBlock } from "../policies";
import type { InstallHandler } from "../landing/BrandChrome";
import heroArt from "../landing/assets/C1.webp";
import profileArt from "../landing/assets/O1.webp";
import sparkleArt from "../landing/assets/O2.webp";
import clockArt from "../landing/assets/O4.webp";
import lockArt from "../landing/assets/O5.webp";
import checkArt from "../landing/assets/O6.webp";
import { SubPage } from "./SubPage";
import styles from "./SubPage.module.css";

const art: Record<PolicyArt, string> = {
  profile: profileArt,
  lock: lockArt,
  clock: clockArt,
  sparkle: sparkleArt,
  check: checkArt,
};

function Block({ block }: { block: PolicyBlock }) {
  if ("list" in block)
    return (
      <ul>
        {block.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  if ("callout" in block)
    return <p className={styles.callout}>{block.callout}</p>;
  if ("facts" in block)
    return (
      <dl className={styles.facts}>
        {block.facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    );
  return <p>{block.text}</p>;
}

export function PolicyPage({
  kind,
  onInstall,
}: {
  kind: "privacy" | "terms";
  onInstall: InstallHandler;
}) {
  const doc = policies[kind];
  return (
    <SubPage
      path={`/${kind}/`}
      title={doc.title}
      lead={doc.lead}
      art={kind === "privacy" ? lockArt : heroArt}
      badge="검토용 초안 · 시행일 미정"
      onInstall={onInstall}
    >
      <section className={styles.points} aria-label="핵심 요약">
        {doc.points.map((point) => (
          <article key={point.title} className={styles.point}>
            <img src={art[point.art]} alt="" />
            <h2>{point.title}</h2>
            <p>{point.body}</p>
          </article>
        ))}
      </section>
      <div className={styles.policy}>
        <nav className={styles.toc} aria-label="문서 목차">
          <b>목차</b>
          {doc.sections.map((section, i) => (
            <a key={section.title} href={`#section-${i + 1}`}>
              {section.title}
            </a>
          ))}
        </nav>
        <div className={styles.sections}>
          {doc.sections.map((section, i) => (
            <section
              key={section.title}
              id={`section-${i + 1}`}
              className={styles.section}
              aria-labelledby={`section-${i + 1}-title`}
            >
              <h2 id={`section-${i + 1}-title`}>
                <span>{i + 1}</span>
                {section.title}
              </h2>
              {section.blocks.map((block, j) => (
                <Block key={j} block={block} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </SubPage>
  );
}
