import { describe, it, expect } from "vitest";
import { PDFDocument, degrees, PDFName, PDFHexString } from "pdf-lib";
import { createDocument, DOCUMENT_FILE_LIMIT } from "./document-operations";
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);
async function fixture(width = 200, height = 300) {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]).drawText("Original conservé");
  return doc.save();
}
describe("documents locaux", () => {
  it("assemble images et PDF dans l’ordre sans modifier les sources", async () => {
    const first = await fixture(200, 300),
      second = await fixture(400, 500),
      before = first.slice();
    const result = await createDocument("combine", [
      { kind: "pdf", name: "a.pdf", data: first },
      { kind: "image", name: "b.png", data: png },
      { kind: "pdf", name: "c.pdf", data: second },
    ]);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((page) => Math.round(page.getWidth()))).toEqual([
      200, 595, 400,
    ]);
    expect(first).toEqual(before);
  });
  it("ajoute une annotation au PDF en préservant la rotation et les pages", async () => {
    const original = await PDFDocument.create();
    const page = original.addPage([200, 300]);
    page.setRotation(degrees(90));
    page.setCropBox(10, 20, 150, 200);
    page.drawText("Texte conservé");
    const data = await original.save(),
      before = data.slice();
    const result = await createDocument(
      "annotate",
      [{ kind: "pdf", name: "source.pdf", data }],
      [{ page: 0, data: png, x: 10, y: 20, width: 150, height: 200, angle: 0 }],
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(0).getCropBox()).toEqual({
      x: 10,
      y: 20,
      width: 150,
      height: 200,
    });
    expect(doc.getPage(0).node.get(PDFName.of("Contents"))).toBeTruthy();
    expect(data).toEqual(before);
  });
  it("refuse les documents corrompus, images démesurées et dépassements avant publication", async () => {
    await expect(
      createDocument("combine", [
        { kind: "pdf", name: "bad.pdf", data: new Uint8Array([1, 2, 3]) },
      ]),
    ).rejects.toThrow(/PDF/);
    const huge = png.slice();
    new DataView(huge.buffer).setUint32(16, 50000);
    new DataView(huge.buffer).setUint32(20, 50000);
    await expect(
      createDocument("combine", [
        { kind: "image", name: "huge.png", data: huge },
      ]),
    ).rejects.toThrow(/mégapixels/);
    await expect(
      createDocument("combine", [
        {
          kind: "pdf",
          name: "big.pdf",
          data: new Uint8Array(DOCUMENT_FILE_LIMIT + 1),
        },
      ]),
    ).rejects.toThrow();
    const doc = await PDFDocument.create();
    for (let i = 0; i < 101; i++) doc.addPage();
    await expect(
      createDocument("combine", [
        { kind: "pdf", name: "many.pdf", data: await doc.save() },
      ]),
    ).rejects.toThrow(/100 pages/);
    await expect(createDocument("combine", [])).rejects.toThrow();
  });
  it("refuse de réécrire un PDF avec champ de signature", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const field = doc.context.register(
      doc.context.obj({
        FT: PDFName.of("Sig"),
        T: PDFHexString.fromText("Signature"),
      }),
    );
    doc
      .getForm()
      .acroForm.dict.set(PDFName.of("Fields"), doc.context.obj([field]));
    await expect(
      createDocument("annotate", [
        { kind: "pdf", name: "signed.pdf", data: await doc.save() },
      ]),
    ).rejects.toThrow(/signature/);
  });
});
