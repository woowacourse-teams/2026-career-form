import type { ReactNode } from "react";
import { STORE_URL } from "../content";
import { SiteLink } from "../site-navigation";
import logo from "./assets/logo.webp";
import closingArt from "./assets/C5.webp";
import brand from "./brand.module.css";

export type InstallHandler = () => void;

export function InstallLink({
  onInstall,
  className = brand.primary,
  children = "Chrome에 추가",
}: {
  onInstall: InstallHandler;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <a
      className={className}
      href={STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onInstall}
    >
      {children}
    </a>
  );
}

export function BrandHeader({
  onInstall,
  fixed = false,
}: {
  onInstall: InstallHandler;
  fixed?: boolean;
}) {
  return (
    <header className={fixed ? brand.headerFixed : brand.headerSticky}>
      <div className={brand.headerInner}>
        <SiteLink className={brand.logo} href="/">
          <img src={logo} alt="" />
          커리어폼
        </SiteLink>
        <InstallLink onInstall={onInstall} className={brand.headerInstall} />
      </div>
    </header>
  );
}

const footerLinks = [
  ["/", "홈"],
  ["/tech/", "기술 소개"],
  ["/privacy/", "개인정보처리방침"],
  ["/terms/", "이용약관"],
] as const;

export function BrandFooter({ current }: { current?: string }) {
  return (
    <footer className={brand.footer}>
      <div className={brand.footerInner}>
        <span>© 2026 Career Form</span>
        <nav aria-label="안내 페이지">
          {footerLinks.map(([href, label]) => (
            <SiteLink
              key={href}
              href={href}
              aria-current={current === href ? "page" : undefined}
            >
              {label}
            </SiteLink>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function ClosingCta({ onInstall }: { onInstall: InstallHandler }) {
  return (
    <section className={brand.cta} aria-labelledby="closing-title">
      <div className={brand.ctaText}>
        <h2 id="closing-title">
          다음 지원서부터,
          <br />
          커리어폼이 채울게요.
        </h2>
        <InstallLink onInstall={onInstall} className={brand.ctaButton} />
      </div>
      <img
        className={brand.ctaArt}
        src={closingArt}
        alt="체크 표시를 든 카피바라"
      />
    </section>
  );
}
