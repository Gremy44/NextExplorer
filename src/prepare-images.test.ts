import { expect, it } from "vitest";
import {
  checkPreparedImage,
  imageConstraints,
  imageFormatsForField,
  preparableImage,
} from "./prepare-images";
import type { Entry } from "./types";
const constraints = {
  format: "jpg" as const,
  width: 1600,
  quality: 85,
  maxBytes: 2 * 1024 * 1024,
  strip: true,
};
const entry = { type: "file", name: "photo.jpg", size: 1000 } as Entry;
it("vérifie le format réel, les dimensions et le poids avant de proposer la copie", () => {
  expect(preparableImage(entry)).toBe(true);
  expect(preparableImage({ ...entry, name: "photo.jpg.exe" })).toBe(false);
  expect(preparableImage({ ...entry, type: "directory" })).toBe(false);
  const metadata = [{ FileType: "JPEG", ImageWidth: 1600, ImageHeight: 1200 }];
  expect(checkPreparedImage(entry, metadata, constraints).compatible).toBe(
    true,
  );
  expect(
    checkPreparedImage(
      { ...entry, size: constraints.maxBytes + 1 },
      [{ ...metadata[0], FileType: "PNG", ImageWidth: 1601 }],
      constraints,
    ).reasons,
  ).toHaveLength(3);
  expect(() =>
    checkPreparedImage(entry, [{ FileType: "JPEG" }], constraints),
  ).toThrow("non vérifiables");
  expect(() => imageConstraints({ ...constraints, width: NaN })).toThrow();
  expect(() =>
    imageConstraints({ ...constraints, maxBytes: Infinity }),
  ).toThrow();
});
it("offers only the generated extensions or MIME types declared by the chosen field", () => {
  const field = (accept: string) => ({ accept, disabled: false });
  expect(imageFormatsForField(field(" IMAGE/PNG , .WebP "))).toEqual([
    "png",
    "webp",
  ]);
  expect(imageFormatsForField(field("image/jpeg"))).toEqual(["jpg"]);
  expect(imageFormatsForField(field(".jpg,.pdf"))).toEqual(["jpg"]);
  expect(imageFormatsForField(field("image/*"))).toEqual([
    "jpg",
    "png",
    "webp",
  ]);
  expect(imageFormatsForField(field(""))).toEqual(["jpg", "png", "webp"]);
});
it("does not promise a format for unsupported, disabled or differently named outputs", () => {
  for (const accept of [".pdf", "image/avif", ".jpeg", "application/x-unknown"])
    expect(imageFormatsForField({ accept, disabled: false })).toEqual([]);
  expect(imageFormatsForField({ accept: "image/*", disabled: true })).toEqual(
    [],
  );
});
it("recognizes ExifTool's extended WebP format for transparent copies without accepting a renamed PNG", () => {
  const metadata = {
    FileType: "Extended WEBP",
    FileTypeExtension: "WEBP",
    MIMEType: "image/webp",
    ImageWidth: 64,
    ImageHeight: 64,
  };
  expect(
    checkPreparedImage(entry, [metadata], { ...constraints, format: "webp" })
      .compatible,
  ).toBe(true);
  expect(
    checkPreparedImage(entry, [{ ...metadata, FileType: "PNG" }], {
      ...constraints,
      format: "webp",
    }).compatible,
  ).toBe(false);
});
