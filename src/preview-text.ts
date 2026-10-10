export const TEXT_PREVIEW_BYTES = 64 * 1024;
export const TEXT_PREVIEW_LINES = 1000;

export function previewText(bytes: Uint8Array, size: number) {
  const utf16 =
    bytes[0] === 255 && bytes[1] === 254
      ? "utf-16le"
      : bytes[0] === 254 && bytes[1] === 255
        ? "utf-16be"
        : null;
  const probe = bytes.subarray(0, 4096);
  const controls = Array.from(probe).filter(
    (byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 13,
  ).length;
  if (!utf16 && (probe.includes(0) || controls > probe.length / 100))
    return { text: "", binary: true, truncated: false };
  const decoded = new TextDecoder(utf16 || "utf-8").decode(bytes);
  const lines = decoded.split("\n");
  return {
    text: lines.slice(0, TEXT_PREVIEW_LINES).join("\n"),
    binary: false,
    truncated: size > bytes.length || lines.length > TEXT_PREVIEW_LINES,
  };
}
