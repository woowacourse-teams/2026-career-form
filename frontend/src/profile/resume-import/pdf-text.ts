import { browser } from "wxt/browser";
// Both files ship inside the extension, so no code is fetched from outside it.
import {
  PDFJS_CMAP_PATH,
  PDFJS_LIBRARY_PATH,
  PDFJS_WORKER_PATH,
} from "./pdfjs-paths";

interface TextItem {
  str?: string;
  hasEOL?: boolean;
}
interface PdfPage {
  getTextContent(): Promise<{ items: readonly TextItem[] }>;
}
interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}
/** The part of pdf.js this reader uses. */
export interface PdfjsModule {
  getDocument(source: {
    data: Uint8Array;
    isEvalSupported: boolean;
    disableFontFace: boolean;
    useWorkerFetch: boolean;
    verbosity: number;
    cMapUrl?: string;
    cMapPacked?: boolean;
  }): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
  GlobalWorkerOptions?: { workerSrc: string };
}

// Same form the in-page panel uses for its other packaged files.
const extensionUrl = (path: string) =>
  `chrome-extension://${browser.runtime.id}${path}`;

/**
 * Extension pages run the parser in a same-origin worker. The in-page panel is a
 * content script whose page origin cannot start that worker, so it loads the
 * worker module on the main thread (pdf.js reads `globalThis.pdfjsWorker`).
 */
async function loadBundledPdfjs(): Promise<PdfjsModule> {
  const library = (await import(
    /* @vite-ignore */ extensionUrl(PDFJS_LIBRARY_PATH)
  )) as PdfjsModule;
  const workerUrl = extensionUrl(PDFJS_WORKER_PATH);
  const scope = globalThis as { pdfjsWorker?: unknown };
  if (globalThis.location?.origin === new URL(workerUrl).origin) {
    if (library.GlobalWorkerOptions)
      library.GlobalWorkerOptions.workerSrc = workerUrl;
  } else {
    scope.pdfjsWorker ??= await import(/* @vite-ignore */ workerUrl);
  }
  return library;
}

/** Text items keep their order; a line end becomes "\n" and pages are split by a blank line. */
export function createPdfTextReader(
  load: () => Promise<PdfjsModule>,
  { cMapUrl }: { cMapUrl?: string } = {},
) {
  let library: Promise<PdfjsModule> | undefined;
  return async (data: ArrayBuffer): Promise<string> => {
    library ??= load().catch((error: unknown) => {
      library = undefined;
      throw error;
    });
    const pdfjs = await library;
    const task = pdfjs.getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      disableFontFace: true,
      useWorkerFetch: false,
      // Errors only: font warnings would otherwise reach the page console.
      verbosity: 0,
      // Fetched by this thread (useWorkerFetch: false) from the extension's own files.
      ...(cMapUrl ? { cMapUrl, cMapPacked: true } : {}),
    });
    try {
      const document = await task.promise;
      const pages: string[] = [];
      for (let number = 1; number <= document.numPages; number += 1) {
        const { items } = await (
          await document.getPage(number)
        ).getTextContent();
        pages.push(
          items
            .map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : ""))
            .join("")
            .trimEnd(),
        );
      }
      return pages.join("\n\n");
    } finally {
      await task.destroy();
    }
  };
}

let bundledReader: ((data: ArrayBuffer) => Promise<string>) | undefined;
/** Built on first use, so importing this module needs no extension runtime. */
export const readPdfText = (data: ArrayBuffer) =>
  (bundledReader ??= createPdfTextReader(loadBundledPdfjs, {
    cMapUrl: extensionUrl(PDFJS_CMAP_PATH),
  }))(data);
