/**
 * Prebuilt pdfjs-dist files the build copies into the extension (wxt.config.ts).
 * The legacy build keeps Chrome 121, the manifest minimum, supported. Both are
 * web-accessible because the in-page panel imports them from a content script.
 */
export const PDFJS_FILES = [
  {
    source: "node_modules/pdfjs-dist/legacy/build/pdf.min.mjs",
    path: "pdfjs/pdf.min.mjs",
  },
  {
    source: "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    path: "pdfjs/pdf.worker.min.mjs",
  },
] as const;
export const PDFJS_LIBRARY_PATH = `/${PDFJS_FILES[0].path}`;
export const PDFJS_WORKER_PATH = `/${PDFJS_FILES[1].path}`;
