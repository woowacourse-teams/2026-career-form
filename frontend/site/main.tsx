import { createRoot } from "react-dom/client";
import { SiteApp } from "./SiteApp";
import { createSiteTracker } from "./analytics";

// Every page opens at its top; only an explicit #anchor (e.g. /tech/#matching)
// moves it. Browsers otherwise restore the previous scroll position, which
// drops visitors mid-way into the pinned landing scenes.
history.scrollRestoration = "manual";
addEventListener("pageshow", () => {
  if (!location.hash) scrollTo({ top: 0, left: 0, behavior: "instant" });
});

const track = createSiteTracker({
  key: import.meta.env.VITE_POSTHOG_KEY,
  host: import.meta.env.VITE_POSTHOG_HOST,
});
createRoot(document.getElementById("root")!).render(<SiteApp track={track} />);
