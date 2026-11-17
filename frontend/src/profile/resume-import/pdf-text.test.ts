// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPdfTextReader, type PdfjsModule } from "./pdf-text";

/** A one-page PDF with a standard font; offsets are computed so the xref is valid. */
function syntheticPdf(content: string): ArrayBuffer {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body).buffer;
}

// The same library build the extension ships, run without a worker thread.
const loadLibrary = async (): Promise<PdfjsModule> => {
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  return (await import("pdfjs-dist/legacy/build/pdf.min.mjs")) as unknown as PdfjsModule;
};

describe("createPdfTextReader", () => {
  it("reads the text layer of a synthetic PDF with the bundled library", async () => {
    const read = createPdfTextReader(loadLibrary);
    const text = await read(
      syntheticPdf("BT /F1 18 Tf 20 100 Td (Synthetic Resume) Tj ET"),
    );
    expect(text).toContain("Synthetic Resume");
  });

  it("returns no text for a page without a text layer", async () => {
    const read = createPdfTextReader(loadLibrary);
    const text = await read(syntheticPdf("0 0 m 10 10 l S"));
    expect(text.trim()).toBe("");
  });

  it("joins items, line ends and pages in order", async () => {
    const pages = [
      [
        { str: "A", hasEOL: false },
        { str: " B", hasEOL: true },
        { str: "C", hasEOL: false },
      ],
      [{ str: "D", hasEOL: false }],
    ];
    const destroyed: boolean[] = [];
    const read = createPdfTextReader(async () => ({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: pages.length,
          getPage: async (n: number) => ({
            getTextContent: async () => ({ items: pages[n - 1] }),
          }),
        }),
        destroy: async () => {
          destroyed.push(true);
        },
      }),
    }));
    await expect(read(new ArrayBuffer(1))).resolves.toBe("A B\nC\n\nD");
    expect(destroyed).toEqual([true]);
  });
});
