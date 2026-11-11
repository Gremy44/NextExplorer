import {
  mkdirSync,
  copyFileSync,
  cpSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { readExtensionIdentity } from "./extension-identity.mjs";
const id = readExtensionIdentity();
const ext = process.platform === "win32" ? ".exe" : "";
const manifest = {
  name: "com.local.file_explorer",
  description: "NextExplorer Native Host",
  path: path.resolve("native/native-host" + ext),
  type: "stdio",
  allowed_origins: [`chrome-extension://${id}/`],
};
writeFileSync(
  "native/com.local.file_explorer.json",
  JSON.stringify(manifest, null, 2),
);
mkdirSync("release/NextExplorer/scripts", { recursive: true });
mkdirSync("release/NextExplorer/native", { recursive: true });
const releaseRoot = path.resolve("release/NextExplorer");
const releaseDist = path.join(releaseRoot, "dist");
if (path.dirname(releaseDist) !== releaseRoot)
  throw new Error("Destination du build invalide");
rmSync(releaseDist, { recursive: true, force: true });
cpSync("dist", "release/NextExplorer/dist", { recursive: true });
cpSync("store", "release/NextExplorer/store", { recursive: true });
mkdirSync("release/NextExplorer/distribution", { recursive: true });
copyFileSync(
  "distribution/INSTALLATION.md",
  "release/NextExplorer/distribution/INSTALLATION.md",
);
cpSync("native/security", "release/NextExplorer/native/security", {
  recursive: true,
});
copyFileSync(
  "native/native-host" + ext,
  "release/NextExplorer/native/native-host" + ext,
);
for (const file of [
  "install-host.ps1",
  "host-installation.ps1",
  "diagnose-host.ps1",
  "host-diagnostics.ps1",
  "repair-host.ps1",
  "host-repair.ps1",
  "setup-host.ps1",
  "setup-workflow.ps1",
  "install-host.mjs",
  "setup-engines.ps1",
  "setup-7zip.ps1",
  "drag-test-site.mjs",
])
  copyFileSync("scripts/" + file, "release/NextExplorer/scripts/" + file);
for (const file of [
  "README.md",
  "MCP.md",
  "SIGNATURE_WINDOWS.md",
  "VALIDATION_WINDOWS_NEUF.md",
  "LICENSE",
  "GUIDE_UTILISATION.md",
  "DESIGN.md",
  "PANNEAU_LATERAL.md",
  "AUDIT_UI_UX.md",
  "REVUE_ERGONOMIE_OUTILS.md",
  "APERCUS_100_FORMATS.md",
  "APERCUS_V1.md",
  "PROTECTION_TRAVAIL_V1.md",
  "PARCOURS_V1.md",
  "COHERENCE_UI_V1.md",
  "extension-id.txt",
  "FEATURES.md",
  "FEATURES_DOCUMENTS_LOCAUX.md",
  "IDEES_OUTILS_SYSTEMES.md",
  "GLISSER_DEPOSER_WEB.md",
  "RECETTE_INSTALLATEUR.md",
  "RECETTE_HYBRIDE.md",
  "EVALUATION_CLASSEMENT.md",
  "J4_ORGANISATION_RECHERCHE.md",
  "V1_GRATUITE.md",
  "C2_COPIES_IDENTIQUES.md",
  "J5_MEDIAS_TACHES.md",
  "AMELIORATIONS_FINDER.md",
  "AMELIORATIONS_ERGONOMIE.md",
  "RETOURS_USAGE_01.md",
  "CONSOLE_INTEGREE.md",
  "DOSSIERS_DISTANTS.md",
  "THIRD_PARTY.md",
])
  copyFileSync(file, "release/NextExplorer/" + file);
console.log("Paquet disponible dans release/NextExplorer");
