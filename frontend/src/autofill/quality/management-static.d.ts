declare module "*backend/src/main/resources/static/quality/access.js" {
  export function setAccess(password: string, claimant: string): void;
}
declare module "*backend/src/main/resources/static/quality/app.js";
declare module "*backend/src/main/resources/static/quality/site-card.js" {
  export function siteCard(
    site: unknown,
    scopeCard: (row: unknown, ordinal: number) => HTMLElement,
  ): HTMLElement;
}
