import { createRoot } from "react-dom/client";
import { SiteApp } from "./SiteApp";
import { createSiteTracker } from "./analytics";

const track = createSiteTracker({
  key: import.meta.env.VITE_POSTHOG_KEY,
  host: import.meta.env.VITE_POSTHOG_HOST,
});
createRoot(document.getElementById("root")!).render(<SiteApp track={track} />);
