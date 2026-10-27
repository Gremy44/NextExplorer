# Composants tiers

## Outil de construction de l’assistant Windows

Inno Setup 6.7.3, préparé en mode portable dans `.tools/inno`, produit `NextExplorer-Setup.exe`. La signature du téléchargement officiel est vérifiée avant exécution. Le compilateur affiche « Non-commercial use only » ; son fichier de licence local accorde un usage pour tout objectif, y compris les applications commerciales, sous ses conditions de redistribution. L’éditeur demande aux utilisateurs commerciaux d’acheter une licence sur son site. Aucun achat ni abonnement n’a été effectué pour cette distribution gratuite. [Licence du projet](https://github.com/jrsoftware/issrc/blob/main/license.txt), [présentation officielle](https://jrsoftware.org/isinfo.php). La signature du compilateur ne signe pas notre EXE : l’assistant produit reste non signé.

**Distribution 1.0.1 :** notices complètes des bibliothèques React/DOM/Scheduler, Lucide, TanStack, Readability, Marked, DOMPurify et Highlight.js ajoutées aux licences déjà embarquées. Go/runtime, fsnotify, BLAKE3, cpuid, x/sys et Inno Setup accompagnent le paquet Windows public. Un fichier `NextExplorer-1.0.1-NOTICES.txt` est publié avec l’installateur. La [licence NextExplorer](LICENSE) accorde l’utilisation gratuite des binaires sans changer les droits propres à ces tiers.

## Dépendances et moteurs

Les versions exactes JavaScript figurent dans `package-lock.json` et les versions Go dans `native/go.mod` / `native/go.sum`.

| Composant | Licence / source |
| --- | --- |
| React, React DOM | MIT — https://github.com/facebook/react |
| Lucide | ISC — https://github.com/lucide-icons/lucide |
| TanStack Virtual | MIT — https://github.com/TanStack/virtual |
| xterm.js, addon-fit | MIT — https://github.com/xtermjs/xterm.js |
| Marked | MIT — https://github.com/markedjs/marked |
| DOMPurify | Apache-2.0 / MPL-2.0 — https://github.com/cure53/DOMPurify |
| Highlight.js | BSD-3-Clause — https://github.com/highlightjs/highlight.js |
| Mozilla Readability | Apache-2.0 — https://github.com/mozilla/readability |
| PDF.js | Apache-2.0 — https://github.com/mozilla/pdf.js |
| PDF-LIB | MIT — https://github.com/Hopding/pdf-lib |
| @pdf-lib/standard-fonts, @pdf-lib/upng | MIT — https://github.com/Hopding |
| Pako | MIT / Zlib — https://github.com/nodeca/pako |
| tslib | 0BSD — https://github.com/microsoft/tslib |
| fsnotify | BSD-3-Clause — https://github.com/fsnotify/fsnotify |
| lukechampine/blake3 | MIT — https://github.com/lukechampine/blake3 |
| klauspost/cpuid | MIT — https://github.com/klauspost/cpuid |
| golang.org/x/sys | BSD-3-Clause — https://go.dev |
| pkg/sftp | BSD-2-Clause — https://github.com/pkg/sftp |
| jlaffaye/ftp | ISC — https://github.com/jlaffaye/ftp |
| kr/fs | BSD-3-Clause — https://github.com/kr/fs |
| golang.org/x/crypto | BSD-3-Clause — https://go.dev |

Les notices des bibliothèques de connexion distante sont conservées dans `public/licenses/Go-*.txt` et copiées dans `dist/licenses`. Le compagnon utilise leurs clients SFTP/SSH/FTP ; aucun code de l’autre projet NextExplorer n’est repris. Le guide [Dossiers distants](DOSSIERS_DISTANTS.md) distingue les sources disponibles des fonctions incluses dans le compagnon déjà distribué.

Les moteurs téléchargés sont distribués séparément par leurs éditeurs. Le paquet léger NextExplorer ne redistribue pas leurs exécutables ; `setup-engines.ps1` télécharge les distributions et conserve leurs fichiers de licence / empreintes disponibles.

- FFmpeg : https://ffmpeg.org/legal.html ; build utilisé : https://github.com/GyanD/codexffmpeg (GPL selon les codecs inclus).
- ImageMagick : https://imagemagick.org/script/license.php.
- ExifTool : licence Artistic ou GPL — https://exiftool.org ; distribution Windows via https://www.npmjs.com/package/exiftool-vendored.exe.
- 7-Zip : LGPL, BSD et restriction unRAR pour certaines parties — https://www.7-zip.org/license.txt.
- yt-dlp : Unlicense pour le projet ; les exécutables regroupent aussi des dépendances avec leurs licences — https://github.com/yt-dlp/yt-dlp.

Avant de redistribuer un paquet contenant les moteurs, conserver leurs licences et satisfaire les obligations de mise à disposition du code source correspondantes. Le code propre à NextExplorer est fourni dans ce dépôt sans choix de licence de redistribution imposé à son propriétaire.

### Version 7-Zip qualifiée

`scripts/setup-7zip.ps1`, appelé par `setup-engines.ps1`, prépare la distribution Windows x64 [7-Zip 26.03](https://github.com/ip7z/7zip/releases/tag/26.03). SHA256 du téléchargement `7z2603-x64.exe` : `0859c524b8a63551848f0c246abddcb1d0b7b656b0fbfe879f8d85e61a9e6edd`. Ce téléchargement n'est pas signé ; son empreinte publiée est vérifiée avant extraction. Notices et provenance sont conservées dans `native/tools/7zip-notices`. Les exécutables restent hors du paquet léger.

### Thèmes et polices de la console

Les palettes de la console sont adaptées de ces sources ; leurs notices sont incluses dans `dist/licenses` :

- **Ubuntu classique** : [Gogh, Clone Of Ubuntu](https://github.com/Gogh-Co/Gogh/blob/master/themes/Clone%20Of%20Ubuntu.yml), distribution sous MIT (`Gogh-Co-palette-MIT.txt`). Ce nom décrit uniquement l’apparence ; la console reste PowerShell.
- **Dracula** : [Dracula Xresources](https://github.com/dracula/xresources), MIT (`dracula-palette.txt`).
- **Nord** : [Nord Xresources](https://github.com/nordtheme/xresources), MIT (`nordtheme-palette.txt`).
- **Solarized** : [Ethan Schoonover, Solarized Xresources](https://github.com/altercation/solarized/blob/master/xresources/solarized), MIT (`altercation-palette.txt`), variantes sombre et claire.

Polices originales embarquées, sans modification des binaires ni service de polices distant :

| Police | Source et licence livrée |
|---|---|
| Ubuntu Mono, normal et gras | [Canonical](https://design.ubuntu.com/font), Ubuntu Font Licence 1.0 (`Ubuntu-Mono.txt`, mentions `Ubuntu-Mono-trademarks.txt`) |
| JetBrains Mono, variable | [JetBrains](https://www.jetbrains.com/lp/mono/), SIL Open Font License 1.1 (`JetBrains-Mono.txt`) |
| Cascadia Mono, variable | [Microsoft](https://github.com/microsoft/cascadia-code), SIL Open Font License 1.1 (`Cascadia-Mono.txt`) |

Les fichiers proviennent du dépôt primaire [Google Fonts, révision 47d54ca1ebb14fd864695f1d39dc734f39017c33](https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33). Sources exactes, tailles et SHA256 dans `public/fonts/provenance.json`, copié avec les polices dans `dist/fonts` et vérifié par `scripts/verify-package.mjs`. Consolas utilise la police déjà fournie par Windows et n’est pas redistribuée.

### Archives RAR5 de test

Les fixtures de `native/testdata/rar5` proviennent des tests de [libarchive, commit abaa707d92fce052f386b6cc2c8d0593ce61e639](https://github.com/libarchive/libarchive/tree/abaa707d92fce052f386b6cc2c8d0593ce61e639/libarchive/test), sous licence BSD à deux clauses, copyright 2018 Grzegorz Antoniak. Leur licence figure dans `native/testdata/rar5/LICENSE.txt`, leurs sources et empreintes dans `provenance.json`. Régénération : `node scripts/setup-rar5-fixtures.mjs`. Ces fichiers servent uniquement aux tests.
