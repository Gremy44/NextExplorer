import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EngineStatus } from "./EngineStatus";

it("keeps disconnected capabilities unknown instead of reporting missing installations", () => {
  const markup = renderToStaticMarkup(<EngineStatus onRefresh={() => {}} />);
  expect(markup).toContain("Vidéo et audio : À vérifier");
  expect(markup).not.toContain("À ajouter");
  expect(markup).toContain("disabled");
});
it("requires FFprobe as well as FFmpeg for the complete video workflow", () => {
  const markup = renderToStaticMarkup(
    <EngineStatus
      tools={{ ffmpeg: true, ffprobe: false }}
      onRefresh={() => {}}
    />,
  );
  expect(markup).toContain("Vidéo et audio : À ajouter");
  expect(markup).toContain("Manque : FFprobe");
  expect(markup).toContain("Les ZIP ordinaires fonctionnent sans ce moteur");
});
it("reports ready functions independently and preserves the optional installation guide", () => {
  const markup = renderToStaticMarkup(
    <EngineStatus
      tools={{ ffmpeg: true, ffprobe: true, "7z": true }}
      onRefresh={() => {}}
    />,
  );
  expect(markup).toContain("Vidéo et audio : Prêt");
  expect(markup).toContain("Archives avancées : Prêt");
  expect(markup).toContain("Images et TIFF : À ajouter");
  expect(markup).toContain("Comment ajouter les moteurs");
});
