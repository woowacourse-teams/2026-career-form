// Chrome serves a valid PNG even when no site favicon is available.
// Compare against its own fallback at the same requested size, not a colour heuristic.
const defaults = new Map<string, Promise<Uint8Array>>();
async function readIcon(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.drawImage(image, 0, 0, 64, 64);
        resolve(new Uint8Array(context.getImageData(0, 0, 64, 64).data));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Favicon unavailable"));
    image.src = url;
  });
}
export async function isDefaultFavicon(src: string): Promise<boolean> {
  try {
    const fallback = new URL(src);
    fallback.searchParams.set(
      "pageUrl",
      "https://career-form-no-favicon.invalid/",
    );
    const key = fallback.href;
    let reference = defaults.get(key);
    if (!reference) {
      reference = readIcon(key).catch((error) => {
        defaults.delete(key);
        throw error;
      });
      defaults.set(key, reference);
    }
    const [actual, expected] = await Promise.all([readIcon(src), reference]);
    return (
      actual.length === expected.length &&
      actual.every((byte, index) => byte === expected[index])
    );
  } catch {
    return false;
  }
}
