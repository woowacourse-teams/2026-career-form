import type { Plugin } from "vite";

const form = `<form method="get" action="/__cf178/search/results" target="_self">
  <input type="hidden" name="route" value="major">
  <input name="keyword" type="text" aria-label="전공 검색어">
  <button type="submit" aria-label="검색">검색</button>
</form>`;

const submitted = `<script>
  document.querySelector("form").addEventListener("submit", () => {
    window.frameElement.dispatchEvent(new Event("fixture-submit"));
  });
</script>`;

const changeAction = `<script>
  document.querySelector("[name=keyword]").addEventListener("input", () => {
    document.querySelector("form").action = "/__cf178/search/other";
    window.frameElement.dispatchEvent(new Event("fixture-action-changed"));
  });
</script>`;

const selectResult = `<script>
  document.querySelector("button").addEventListener("click", () => {
    window.frameElement.dispatchEvent(new Event("fixture-select"));
  });
</script>`;

export function searchFixtureServer(): Plugin {
  return {
    name: "browser-search-fixture",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        let body: string;
        switch (url.pathname) {
          case "/__cf178/search/form":
            body = form + submitted;
            break;
          case "/__cf178/search/action-form":
            body = form + submitted + changeAction;
            break;
          case "/__cf178/search/results": {
            const exact =
              url.searchParams.get("route") === "major" &&
              url.searchParams.get("keyword") === "가상값";
            body = `<ul aria-label="검색 결과" data-result-count="1">
              <li><button type="button">${exact ? "가상값" : "다른 값"}</button></li>
            </ul>${selectResult}`;
            break;
          }
          case "/__cf178/search/other":
            body = "<p>Unexpected search destination</p>";
            break;
          default:
            next();
            return;
        }
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(`<!doctype html><html><body>${body}</body></html>`);
      });
    },
  };
}
