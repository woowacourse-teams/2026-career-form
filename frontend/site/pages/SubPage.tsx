import type { ReactNode } from "react";
import {
  BrandFooter,
  BrandHeader,
  type InstallHandler,
} from "../landing/BrandChrome";
import brand from "../landing/brand.module.css";
import { SiteLink } from "../site-navigation";
import styles from "./SubPage.module.css";

/** Shared frame for 기술 소개 and the policy pages. */
export function SubPage({
  path,
  title,
  lead,
  art,
  artAlt = "",
  badge,
  heroExtra,
  onInstall,
  children,
}: {
  path: string;
  title: string;
  lead: string;
  art: string;
  artAlt?: string;
  badge?: string;
  heroExtra?: ReactNode;
  onInstall: InstallHandler;
  children: ReactNode;
}) {
  return (
    <div className={`${brand.brand} ${styles.page}`}>
      <BrandHeader onInstall={onInstall} />
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <SiteLink className={styles.back} href="/">
              ← 커리어폼 홈
            </SiteLink>
            <h1>{title}</h1>
            <p className={styles.lead}>{lead}</p>
            {badge && <span className={styles.badge}>{badge}</span>}
            {heroExtra}
          </div>
          <img className={styles.art} src={art} alt={artAlt} />
        </div>
      </section>
      <main id="main" className={styles.wrap}>
        {children}
      </main>
      <BrandFooter current={path} />
    </div>
  );
}
