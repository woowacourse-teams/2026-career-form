import type { CSSProperties } from "react";
const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  puzzle:
    "M9 4V3a3 3 0 0 1 6 0v1h5v5h1a3 3 0 0 1 0 6h-1v5H4v-6h2a2 2 0 0 0 0-4H4V4Z",
  pin: "M9 3h6l-1 6 4 4v2H6v-2l4-4ZM12 15v7",
  document: "M14 2H5v20h14V7ZM14 2v5h5M8 12h8M8 16h6",
  panel: "M3 4h18v16H3ZM15 4v16M6 8h5M6 12h5M6 16h3",
  check: "M8 12l3 3 5-6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
};
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
