import { expect, it } from "vitest";
import { acceptsFile, uploadIssue, UPLOAD_TOTAL_BYTES } from "./uploads";
import { fileMime } from "./file-mime";

const field = { accept: ".txt", multiple: true, disabled: false };
const file = { name: "notes.txt", type: "file" as const, size: 100 };

it("matches declared extensions, MIME types and media families without reading contents", () => {
  expect(acceptsFile("PHOTO.JPEG", " .pdf , IMAGE/* ")).toBe(true);
  expect(acceptsFile("archive.TAR.GZ", ".tar.gz")).toBe(true);
  expect(acceptsFile("report.PDF", "application/pdf")).toBe(true);
  expect(acceptsFile("notes.txt", "text/plain")).toBe(true);
  expect(acceptsFile("scan.tiff", "image/*")).toBe(true);
  expect(acceptsFile("notes.txt.exe", ".txt,text/plain")).toBe(false);
  expect(acceptsFile("unknown.xyz", "application/pdf")).toBe(false);
  expect(acceptsFile("unknown.xyz", "  ")).toBe(true);
  expect(fileMime("report.DOCX")).toContain("wordprocessingml");
  expect(fileMime("unknown.xyz")).toBe("");
});
it("enforces the complete selection budget including zero-byte and boundary cases", () => {
  expect(uploadIssue([], field)).toContain("au moins");
  expect(uploadIssue(Array(21).fill(file), field)).toContain("20 fichiers");
  expect(
    uploadIssue([{ ...file, size: UPLOAD_TOTAL_BYTES }], field),
  ).toBeNull();
  expect(
    uploadIssue([{ ...file, size: UPLOAD_TOTAL_BYTES }, file], field),
  ).toContain("20 Mo au total");
  expect(uploadIssue(Array(20).fill({ ...file, size: 0 }), field)).toBeNull();
  expect(uploadIssue([{ ...file, size: NaN }], field)).toContain(
    "non vérifiable",
  );
  expect(uploadIssue([{ ...file, size: -1 }], field)).toContain(
    "non vérifiable",
  );
  expect(uploadIssue([{ ...file, type: "symlink" }], field)).toContain(
    "symbolique",
  );
});
it("explains why the chosen form field prevents insertion", () => {
  expect(uploadIssue([file], { ...field, disabled: true })).toContain(
    "désactivé",
  );
  expect(uploadIssue([file, file], { ...field, multiple: false })).toContain(
    "un seul",
  );
  expect(uploadIssue([file], { ...field, accept: "image/*" })).toContain(
    "notes.txt",
  );
  expect(uploadIssue([file], field)).toBeNull();
});
