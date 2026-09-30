// Phone photos are 2–5 MB; uploading them through the tunnel took long
// enough that saving looked stuck. Every photo is scaled down to at most
// 1600px on its longest side and re-encoded as JPEG before upload — a few
// hundred KB, still sharp enough to read a bill, an RC or a part number.
// Anything that isn't a photo (e.g. a video), or that doesn't get smaller,
// is uploaded as it is.
const MAX_DIMENSION = 1600;
const QUALITY = 0.8;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // White background, so transparent PNGs don't turn black as JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // A format the browser can't decode (e.g. some HEIC) — send as it is and
    // let the server decide.
    return file;
  }
}
