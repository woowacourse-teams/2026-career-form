import type { CSSProperties } from "react";
const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  puzzle:
    "M9 4V3a3 3 0 0 1 6 0v1h5v5h1a3 3 0 0 1 0 6h-1v5H4v-6h2a2 2 0 0 0 0-4H4V4Z",
  pin: "M9 3h6l-1 6 4 4v2H6v-2l4-4ZM12 15v7",
  document: "M14 2H5v20h14V7ZM14 2v5h5M8 12h8M8 16h6",
  panel: "M3 4h18v16H3ZM15 4v16M6 8h5M6 12h5M6 16h3",
  check: "M8 12l3 3 5-6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  lock: "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5ZM12 15v2",
  database:
    "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  threads: "M4 6h16M4 12h10M4 18h16M18 9v6m-3-3h6",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4ZM10 21h4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2",
};
export type IconName = keyof typeof paths;
export function Icon({
  name,
  style,
}: {
  name: keyof typeof paths;
  style?: CSSProperties;
}) {
  return (
    <svg
      style={style}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
