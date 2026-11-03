import type { ReactNode } from "react";
import styles from "./TechPage.module.css";

export type TagKind = "problem" | "solve" | "result";
const tagClass: Record<TagKind, string> = {
  problem: styles.tagProblem,
  solve: styles.tagSolve,
  result: styles.tagResult,
};

export function Topic({
  id,
  label,
  title,
  lead,
  children,
}: {
  id: string;
  label: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.topic} aria-labelledby={`${id}-title`}>
      <div className={styles.topicHead}>
        <span>{label}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{lead}</p>
      </div>
      {children}
    </section>
  );
}

export function Block({
  tag,
  tagLabel,
  title,
  className,
  children,
}: {
  tag?: TagKind;
  tagLabel?: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={className ? `${styles.block} ${className}` : styles.block}
    >
      {tag && <span className={tagClass[tag]}>{tagLabel}</span>}
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className={styles.steps}>
      {items.map(([title, body]) => (
        <li key={title}>
          <b>{title}</b>
          <p>{body}</p>
        </li>
      ))}
    </ol>
  );
}

export function Note({ art, children }: { art: string; children: ReactNode }) {
  return (
    <div className={styles.note}>
      <img src={art} alt="" />
      <p>{children}</p>
    </div>
  );
}

export type FlowNode = { title: string; detail: string; tone?: "hot" | "end" };
export type FlowItem = FlowNode | { arrow: string } | { stack: FlowNode[] };

function Node({ node }: { node: FlowNode }) {
  const tone =
    node.tone === "hot"
      ? styles.nodeHot
      : node.tone === "end"
        ? styles.nodeEnd
        : "";
  return (
    <div className={`${styles.node} ${tone}`}>
      <b>{node.title}</b>
      <span>{node.detail}</span>
    </div>
  );
}

/** A left-to-right flow of boxes and labelled arrows; scrolls sideways when narrow. */
export function Flow({ items }: { items: FlowItem[] }) {
  return (
    <div className={styles.flowRow}>
      {items.map((item, i) =>
        "arrow" in item ? (
          <div key={i} className={styles.arrow}>
            {item.arrow}
          </div>
        ) : "stack" in item ? (
          <div key={i} className={styles.stack}>
            {item.stack.map((node) => (
              <Node key={node.title} node={node} />
            ))}
          </div>
        ) : (
          <Node key={i} node={item} />
        ),
      )}
    </div>
  );
}
