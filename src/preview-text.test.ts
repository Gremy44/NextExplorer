import { expect, it } from "vitest";
import { previewText, TEXT_PREVIEW_BYTES } from "./preview-text";
import { mediaType, type Entry } from "./types";

it("limite les aperçus sans transformer le binaire en code", () => {
  const bytes = new TextEncoder().encode("ligne\n".repeat(2000));
  const result = previewText(bytes, bytes.length);
  expect(result.text.split("\n")).toHaveLength(1000);
  expect(result.truncated).toBe(true);
  expect(previewText(new Uint8Array([73, 73, 42, 0]), 100000000).binary).toBe(
    true,
  );
  expect(
    previewText(new TextEncoder().encode("Bonjour"), 500000).truncated,
  ).toBe(true);
  expect(previewText(new Uint8Array([255, 254, 65, 0]), 4).text).toBe("A");
  expect(TEXT_PREVIEW_BYTES).toBe(65536);
  expect(mediaType({ ext: ".tiff" } as Entry)).toBe("image");
  expect(mediaType({ ext: ".psd" } as Entry)).toBe("binary");
});
