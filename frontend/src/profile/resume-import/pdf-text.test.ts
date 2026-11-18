// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createPdfTextReader, type PdfjsModule } from "./pdf-text";

/** A one-page PDF; offsets are computed so the xref is valid. Object 5 is the page font. */
function pdfWithObjects(content: string, font: readonly string[]): ArrayBuffer {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    ...font,
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

const syntheticPdf = (content: string) =>
  pdfWithObjects(content, ["<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"]);

// Synthetic Korean text only.
const KOREAN = "합성 이력서";
const ucs2Hex = (text: string) =>
  [...text]
    .map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"))
    .join("");

/** A non-embedded Korean CID font, as Korean office tools write it. */
const cidFont = (encoding: string, toUnicode?: string) => {
  const descendant =
    "<</Type/Font/Subtype/CIDFontType0/BaseFont/HYSMyeongJo-Medium" +
    "/CIDSystemInfo<</Registry(Adobe)/Ordering(Korea1)/Supplement 1>>/FontDescriptor 7 0 R/DW 1000>>";
  const descriptor =
    "<</Type/FontDescriptor/FontName/HYSMyeongJo-Medium/Flags 6/FontBBox[0 -148 1001 880]" +
    "/ItalicAngle 0/Ascent 880/Descent -120/CapHeight 880/StemV 60>>";
  const type0 = `<</Type/Font/Subtype/Type0/BaseFont/HYSMyeongJo-Medium/Encoding/${encoding}/DescendantFonts[6 0 R]${toUnicode ? "/ToUnicode 8 0 R" : ""}>>`;
  return toUnicode
    ? [
        type0,
        descendant,
        descriptor,
        `<</Length ${toUnicode.length}>>\nstream\n${toUnicode}\nendstream`,
      ]
    : [type0, descendant, descriptor];
};

/** Text shown through a predefined CMap name with no ToUnicode map in the file. */
const predefinedCMapPdf = () =>
  pdfWithObjects(
    `BT /F1 18 Tf 20 100 Td <${ucs2Hex(KOREAN)}> Tj ET`,
    cidFont("UniKS-UCS2-H"),
  );

/** Identity-H codes 1..n with an embedded ToUnicode map back to the same text. */
const toUnicodePdf = () => {
  const chars = [...KOREAN];
  const codes = chars.map((_, i) =>
    (i + 1).toString(16).toUpperCase().padStart(4, "0"),
  );
  const map = [
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
    "/CIDSystemInfo<</Registry(Adobe)/Ordering(UCS)/Supplement 0>> def",
    "/CMapName /Synthetic-UCS def /CMapType 2 def",
    "1 begincodespacerange <0000> <FFFF> endcodespacerange",
    `${chars.length} beginbfchar`,
    ...chars.map((c, i) => `<${codes[i]}> <${ucs2Hex(c)}>`),
    "endbfchar endcmap CMapName currentdict /CMap defineresource pop end end",
  ].join("\n");
  return pdfWithObjects(
    `BT /F1 18 Tf 20 100 Td <${codes.join("")}> Tj ET`,
    cidFont("Identity-H", map),
  );
};

// The packed CMaps the build copies from the pinned pdfjs-dist package.
const CMAP_DIR = fileURLToPath(
  new URL("../../../node_modules/pdfjs-dist/cmaps/", import.meta.url),
);

// The same library build the extension ships, run without a worker thread.
const loadLibrary = async (): Promise<PdfjsModule> => {
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  return (await import("pdfjs-dist/legacy/build/pdf.min.mjs")) as unknown as PdfjsModule;
};

const compact = (text: string) => text.replace(/\s+/g, "");

describe("createPdfTextReader", () => {
  it("reads the text layer of a synthetic PDF with the bundled library", async () => {
    const read = createPdfTextReader(loadLibrary);
    const text = await read(
      syntheticPdf("BT /F1 18 Tf 20 100 Td (Synthetic Resume) Tj ET"),
    );
    expect(text).toContain("Synthetic Resume");
  });

  it("returns no text for a page without a text layer", async () => {
    const read = createPdfTextReader(loadLibrary, { cMapUrl: CMAP_DIR });
    const text = await read(syntheticPdf("0 0 m 10 10 l S"));
    expect(text.trim()).toBe("");
  });

  it("reads Korean text shown through a predefined CMap with the bundled CMaps", async () => {
    const read = createPdfTextReader(loadLibrary, { cMapUrl: CMAP_DIR });
    expect(compact(await read(predefinedCMapPdf()))).toBe(compact(KOREAN));
  });

  it("reads Korean text from a font with an embedded ToUnicode map", async () => {
    const read = createPdfTextReader(loadLibrary, { cMapUrl: CMAP_DIR });
    expect(compact(await read(toUnicodePdf()))).toBe(compact(KOREAN));
  });

  it("passes the packed CMap location to pdf.js", async () => {
    const seen: unknown[] = [];
    const read = createPdfTextReader(
      async () => ({
        getDocument: (source) => {
          seen.push(source);
          return {
            promise: Promise.resolve({
              numPages: 0,
              getPage: async () => ({
                getTextContent: async () => ({ items: [] }),
              }),
            }),
            destroy: async () => {},
          };
        },
      }),
      { cMapUrl: "chrome-extension://synthetic/pdfjs/cmaps/" },
    );
    await read(new ArrayBuffer(1));
    expect(seen[0]).toMatchObject({
      cMapUrl: "chrome-extension://synthetic/pdfjs/cmaps/",
      cMapPacked: true,
      isEvalSupported: false,
    });
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
