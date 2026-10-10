# Composants tiers

## Outil de construction de l’assistant Windows

Inno Setup 6.7.3, préparé en mode portable dans `.tools/inno`, produit `NextExplorer-Setup.exe`. La signature du téléchargement officiel est vérifiée avant exécution. Le compilateur local affiche « Non-commercial use only » ; les conditions et la licence commerciale doivent être traitées avant un usage commercial. Aucun achat n’a été effectué. Sources : [distribution officielle](https://jrsoftware.org/isdl.php), [licences commerciales](https://jrsoftware.org/isbuy.php). La signature du compilateur ne signe pas notre EXE : l’assistant produit reste non signé.

## Dépendances et moteurs

Les versions exactes JavaScript figurent dans `package-lock.json` et les versions Go dans `native/go.mod` / `native/go.sum`.

| Composant | Licence / source |
| --- | --- |
| React, React DOM | MIT — https://github.com/facebook/react |
| Lucide | ISC — https://github.com/lucide-icons/lucide |
| TanStack Virtual | MIT — https://github.com/TanStack/virtual |
| Marked | MIT — https://github.com/markedjs/marked |
| DOMPurify | Apache-2.0 / MPL-2.0 — https://github.com/cure53/DOMPurify |
| Highlight.js | BSD-3-Clause — https://github.com/highlightjs/highlight.js |
| Mozilla Readability | Apache-2.0 — https://github.com/mozilla/readability |
| fsnotify | BSD-3-Clause — https://github.com/fsnotify/fsnotify |
| lukechampine/blake3 | MIT — https://github.com/lukechampine/blake3 |
| klauspost/cpuid | MIT — https://github.com/klauspost/cpuid |
| golang.org/x/sys | BSD-3-Clause — https://go.dev |

Les moteurs téléchargés sont distribués séparément par leurs éditeurs. Le paquet léger NextExplorer ne redistribue pas leurs exécutables ; `setup-engines.ps1` télécharge les distributions et conserve leurs fichiers de licence / empreintes disponibles.

- FFmpeg : https://ffmpeg.org/legal.html ; build utilisé : https://github.com/GyanD/codexffmpeg (GPL selon les codecs inclus).
- ImageMagick : https://imagemagick.org/script/license.php.
- ExifTool : licence Artistic ou GPL — https://exiftool.org ; distribution Windows via https://www.npmjs.com/package/exiftool-vendored.exe.
- 7-Zip : LGPL, BSD et restriction unRAR pour certaines parties — https://www.7-zip.org/license.txt.
- yt-dlp : Unlicense pour le projet ; les exécutables regroupent aussi des dépendances avec leurs licences — https://github.com/yt-dlp/yt-dlp.

Avant de redistribuer un paquet contenant les moteurs, conserver leurs licences et satisfaire les obligations de mise à disposition du code source correspondantes. Le code propre à NextExplorer est fourni dans ce dépôt sans choix de licence de redistribution imposé à son propriétaire.

### Version 7-Zip qualifiée

`scripts/setup-7zip.ps1`, appelé par `setup-engines.ps1`, prépare la distribution Windows x64 [7-Zip 26.03](https://github.com/ip7z/7zip/releases/tag/26.03). SHA256 du téléchargement `7z2603-x64.exe` : `0859c524b8a63551848f0c246abddcb1d0b7b656b0fbfe879f8d85e61a9e6edd`. Ce téléchargement n'est pas signé ; son empreinte publiée est vérifiée avant extraction. Notices et provenance sont conservées dans `native/tools/7zip-notices`. Les exécutables restent hors du paquet léger.

### Archives RAR5 de test

Les fixtures de `native/testdata/rar5` proviennent des tests de [libarchive, commit abaa707d92fce052f386b6cc2c8d0593ce61e639](https://github.com/libarchive/libarchive/tree/abaa707d92fce052f386b6cc2c8d0593ce61e639/libarchive/test), sous licence BSD à deux clauses, copyright 2018 Grzegorz Antoniak. Leur licence figure dans `native/testdata/rar5/LICENSE.txt`, leurs sources et empreintes dans `provenance.json`. Régénération : `node scripts/setup-rar5-fixtures.mjs`. Ces fichiers servent uniquement aux tests.
