# Aperçus locaux — audit des 100 formats

Audit du 18 octobre 2026, à partir de la liste demandée par l’utilisateur. Les numéros reprennent exactement ses 100 entrées. Il s’agit de **consulter un aperçu dans NextExplorer**, sans éditeur complet, sans service distant et sans modifier l’original.

## Résultat de la lecture du code

| État | Entrées | Ce que cela signifie |
| --- | ---: | --- |
| **I — Intégré** | **40** | Au moins une extension de la ligne possède un parcours d’aperçu raccordé. Certaines lectures sont textuelles, statiques, limitées à une fenêtre ou dépendantes d’un moteur/codec. |
| **B — Branchement incomplet** | **6** | Interface et compagnon ne concordent pas : quatre extensions sont reconnues mais refusées ensuite, deux sont admissibles côté compagnon sans entrée d’aperçu côté interface. |
| **N — Non intégré** | **54** | Pas de parcours d’aperçu du contenu depuis cette extension. La présence d’une icône, d’un type MIME, de métadonnées ou d’une conversion ne compte pas comme aperçu. |

Les 40 entrées intégrées se répartissent en **18 textes/codes, 7 images, 9 médias audio/vidéo, 1 PDF et 5 archives**. Ce décompte décrit le raccordement du code, **pas 40 formats entièrement qualifiés** ni un pourcentage des fichiers des utilisateurs.

### Ce qui est réellement réutilisable

- [Classification des extensions](src/types.ts) et [composant d’aperçu](src/Preview.tsx) : point d’entrée commun à la fenêtre d’aperçu et au volet. Les miniatures de listes utilisent le même classement.
- [Texte borné](src/preview-text.ts), [worker de présentation](src/preview-worker.ts) : 64 Kio / 1 000 lignes ; UTF-8 et UTF-16 avec BOM. Markdown rendu pour `.md`, autres textes affichés comme source. Détection de données binaires ; pas de couverture de tous les encodages anciens.
- [Images natives](native/image_preview.go), [coders autorisés](native/media_conversion.go) : ImageMagick optionnel, première image/page, sortie JPEG réduite, donc animation et transparence non conservées dans l’aperçu. Sources limitées à 256 Mio / 100 mégapixels, traitement borné à 8 secondes, 640 px dans le volet ou 1 600 px dans la fenêtre.
- [Flux média](native/media_stream.go) : lecture par plages d’octets via une URL locale temporaire, puis décodage par Chrome. FFmpeg ne transcode pas automatiquement les aperçus actuels ; il sert notamment à la forme d’onde. Format de conteneur et codec doivent tous deux convenir.
- PDF : le composant actuel charge un Blob dans une iframe et dépend du lecteur PDF du navigateur, avec plafond de 16 Mio dans le volet / 128 Mio dans la fenêtre. PDF.js est déjà embarqué pour l’annotation, mais **n’est pas le lecteur de ce composant**.
- [Liste des archives](native/tools.go) : ZIP via Go ; autres extensions reconnues via `7z l`. Listing dans la **fenêtre d’aperçu uniquement** ; le volet intégré refuse les archives actuellement. Sortie 7-Zip textuelle bornée, pas d’extraction pour consulter la liste.
- [Détails](src/DetailsPane.tsx) : propriétés du fichier et, si disponible, ExifTool. Ces informations restent utiles quand aucun aperçu du contenu n’existe, sans prouver sa lisibilité.

Le moteur installé sur ce poste annonce des lecteurs **HEIC, SVG, ICO, PSD, XCF, DNG, CR2, CR3, NEF et ARW** (`native/tools/magick.exe -list format`). Cette détection n’active rien dans l’application et ne qualifie pas les fichiers réels. Les moteurs restent optionnels et ne sont pas redistribués dans le paquet léger.

## Comment lire la matrice

**Nature technique :**

- **O** : standard public, format libre documenté ou convention de texte/code accessible.
- **D** : format défini par un éditeur, avec documentation publique exploitable. Ce groupe inclut des formats historiques propriétaires publiés et des formats publics d’origine industrielle ; il ne signifie pas « fermé ».
- **P** : format spécifique à un éditeur ou constructeur, non standardisé ; documentation et couverture des versions variables. Des lecteurs libres peuvent exister.
- **O\*** : structure normalisée/publique, avec codecs, macros ou extensions à examiner séparément. « Ouvert » ne signifie pas automatiquement « sans contraintes de licence ».

Ce classement sert à choisir une approche d’aperçu ; il ne constitue pas une analyse juridique de redistribution des moteurs.

**Effort restant estimé pour un premier aperçu utile :** **F** faible en réutilisant un parcours existant ; **M** modéré, parseur ou traitement isolé supplémentaire ; **E** élevé pour un rendu fiable. **—** signifie maintenir/qualifier le parcours existant. Ce sont des estimations issues de l’audit, sans prototype des nouveaux lecteurs.

### Documents et bureautique — 1 à 20

DOCX, XLSX et PPTX font partie du standard public [Office Open XML / ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/), malgré leur association à Microsoft. ODT/ODS/ODP relèvent d’[OpenDocument](https://docs.oasis-open.org/office/OpenDocument/v1.4/os/). Leurs mises en page restent complexes à rendre.

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- |
| 1 | PDF `.pdf` | O | I | — | Lecteur PDF du navigateur ; plafonds et configuration Chrome à qualifier. |
| 2 | Word `.docx` | O | N | M/E | Contenu mis en forme simplifié ; rendu exact des pages plus coûteux. |
| 3 | Word `.doc` | D | N | M/E | Importeur éprouvé ou moteur bureautique optionnel ; ne pas afficher les octets comme du texte. |
| 4 | OpenDocument texte `.odt` | O | N | M/E | Texte et tableaux depuis le paquet ; pagination fidèle plus coûteuse. |
| 5 | RTF `.rtf` | D | N | M | Texte mis en forme avec un parseur RTF, pas le balisage brut. |
| 6 | Texte `.txt` | O | I | — | Extrait borné ; encodages anciens non garantis. |
| 7 | Markdown `.md`, `.markdown` | O | I | F | `.md` rendu ; `.markdown` affiché comme texte, harmonisation à faire. |
| 8 | Excel `.xlsx` | O | N | M | Feuilles/cellules en grille ; valeurs enregistrées, sans recalcul des formules. |
| 9 | Excel `.xls` | D | N | M | Même grille via un lecteur BIFF existant. |
| 10 | Excel avec macros `.xlsm` | O* | N | M | Grille des valeurs enregistrées ; aucun déclenchement de macro ou lien externe. |
| 11 | OpenDocument tableur `.ods` | O | N | M | Feuilles/cellules via le même lecteur de tableurs. |
| 12 | CSV `.csv` | O | I | M | Texte brut actuellement ; grille bornée avec détection du séparateur à ajouter. |
| 13 | TSV `.tsv` | O | I | M | Texte brut actuellement ; grille bornée à ajouter. |
| 14 | PowerPoint `.pptx` | O | N | E | Première diapositive/miniature si présente, sinon moteur de rendu ; pas un simple XML à afficher. |
| 15 | PowerPoint `.ppt` | D | N | E | Moteur bureautique optionnel pour des images de diapositives. |
| 16 | OpenDocument présentation `.odp` | O | N | M/E | Miniature embarquée si disponible, puis moteur pour les diapositives. |
| 17 | Pages `.pages` | P | N | M/E | Aperçu embarqué s’il existe ; importeur pour les versions réellement supportées. |
| 18 | Numbers `.numbers` | P | N | M | Données des tableaux via un lecteur existant ; pas la disposition exacte de Numbers. |
| 19 | Keynote `.key` | P | N | M/E | Aperçu embarqué ou importeur ; compatibilité dépendante des versions. |
| 20 | EPUB `.epub` | O | N | M | Couverture, sommaire et premiers chapitres ; pas de DRM ni de scripts du livre. |

### Images, photographie et graphisme — 21 à 40

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- | --- |
| 21 | JPEG `.jpg`, `.jpeg` | O | I | — | Image réduite par le compagnon. |
| 22 | PNG `.png` | O | I | — | Image réduite ; transparence aplatie sur fond blanc. |
| 23 | GIF `.gif` | D | I | — | Première image, sans animation. |
| 24 | WebP `.webp` | O | I | — | Image réduite ; première image si animée. |
| 25 | AVIF `.avif` | O | I | — | Image réduite si le moteur installé sait la décoder. |
| 26 | HEIF/HEIC `.heif`, `.heic` | O* | B | F/M | Admis par le compagnon et lecteur détecté ; classé binaire par l’interface. |
| 27 | TIFF `.tif`, `.tiff` | D | I | — | Première page réduite ; pas toutes les pages/couches. |
| 28 | BMP `.bmp` | D | I | — | Image réduite par le compagnon. |
| 29 | SVG `.svg` | O | B | M | Classé image par l’interface, refusé par `rasterImage` et sans `imageCoder` ; prévoir un rendu isolé sans ressources externes. |
| 30 | ICO `.ico` | D | N | F/M | Image représentative depuis le moteur existant ; plusieurs tailles possibles. |
| 31 | Photoshop `.psd` | D | N | M | Composite aplati via ImageMagick si disponible ; pas d’édition de calques. |
| 32 | Illustrator `.ai` | P | N | M/E | Lire le contenu PDF seulement si le fichier a été enregistré avec cette compatibilité ; sinon moteur spécialisé. |
| 33 | EPS `.eps` | D | N | E | Rasterisation PostScript par moteur isolé, souvent Ghostscript ; pas de décodage générique dans Chrome. |
| 34 | DNG `.dng` | D | N | M | Aperçu embarqué ou réduction via le lecteur RAW présent ; rendu couleur à qualifier. |
| 35 | Canon RAW `.cr2` | P | N | M | Aperçu embarqué prioritaire ; couverture par modèle d’appareil à vérifier. |
| 36 | Canon RAW `.cr3` | P | N | M | Même approche, selon compression et génération d’appareil. |
| 37 | Nikon RAW `.nef` | P | N | M | Même approche ; pas de promesse pour toutes les variantes. |
| 38 | Sony RAW `.arw` | P | N | M | Même approche ; pas de promesse pour toutes les variantes. |
| 39 | GIMP `.xcf` | O | N | M | Image aplatie via le lecteur existant ; tester versions et composition des calques. |
| 40 | Krita `.kra` | O | N | F/M | Lire uniquement `mergedimage.png` dans le ZIP, avec limites de décompression. |

### Audio — 41 à 50

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- | --- |
| 41 | MP3 `.mp3` | O* | I | — | Lecture Chrome par flux local ; forme d’onde via FFmpeg optionnel. |
| 42 | WAV `.wav` | D | I | — | Flux local ; les encodages WAV ne sont pas tous équivalents. |
| 43 | FLAC `.flac` | O | I | — | Flux local décodé par Chrome. |
| 44 | AAC `.aac` | O* | B | F/M | Classé audio dans l’interface ; absent de `mediaMIME`, donc refusé par `MEDIA_OPEN`. |
| 45 | M4A `.m4a` | O* | I | — | Flux local ; codec réellement contenu à qualifier. |
| 46 | Ogg `.ogg`, `.oga` | O | I | F | `.ogg` raccordé ; `.oga` absent des deux listes. |
| 47 | Opus `.opus` | O | I | — | Flux local de l’audio encapsulé dans Ogg. |
| 48 | WMA `.wma` | D | N | M | Extrait audio compatible produit par FFmpeg si décodable ; pas de lecture Chrome universelle. |
| 49 | AIFF `.aif`, `.aiff` | D | N | M | Court extrait compatible via FFmpeg ; conserver l’original. |
| 50 | MIDI `.mid`, `.midi` | O | N | M/E | Métadonnées/notes d’abord ; écoute nécessite un synthétiseur et une banque de sons. |

### Vidéo — 51 à 60

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- | --- |
| 51 | MP4 `.mp4` | O* | I | — | Flux local ; dépend des codecs Chrome. |
| 52 | Matroska `.mkv` | O | B | M | Classé vidéo mais refusé par `mediaMIME` ; miniature/extrait via FFmpeg pour les codecs incompatibles. |
| 53 | QuickTime `.mov` | D | I | — | Parcours raccordé ; lecture conditionnelle selon codec et Chrome. |
| 54 | AVI `.avi` | D | B | M | Classé vidéo mais refusé par `mediaMIME` ; image fixe/extrait compatible via FFmpeg. |
| 55 | WebM `.webm` | O | I | — | Flux local décodé par Chrome si codecs compatibles. |
| 56 | WMV `.wmv` | D | N | M | Miniature ou extrait via FFmpeg. |
| 57 | MPEG `.mpg`, `.mpeg` | O* | N | M | Miniature ou extrait via FFmpeg. |
| 58 | M4V `.m4v` | O* | B | F/M | MIME déjà admis par le compagnon ; classé binaire par l’interface. Fichiers protégés hors cible. |
| 59 | MTS/M2TS `.mts`, `.m2ts` | O* | N | M | Miniature ou extrait borné ; pas de reconstitution complète du disque Blu-ray. |
| 60 | VOB `.vob` | O* | N | M | Miniature ou extrait d’un fichier ; navigation DVD et contenus protégés hors cible. |

### Archives et images disque — 61 à 70

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- | --- |
| 61 | ZIP `.zip` | D | I | M | Listing Go dans la fenêtre ; raccordement au volet et présentation lisible à faire. |
| 62 | RAR `.rar` | D | I | M | Listing 7-Zip dans la fenêtre ; archives chiffrées à traiter explicitement. |
| 63 | 7z `.7z` | O | I | M | Listing 7-Zip dans la fenêtre ; pas de lecture directe des fichiers internes. |
| 64 | TAR `.tar` | O | I | M | Listing via 7-Zip dans la fenêtre. |
| 65 | Gzip `.gz` | O | I | M | Listing du flux compressé ; ne pas promettre l’arborescence du TAR interne. |
| 66 | Bzip2 `.bz2` | O | N | F/M | Étendre le listing existant ; flux compressé distinct d’un paquet TAR. |
| 67 | XZ `.xz` | O | N | F/M | Même approche de listing. |
| 68 | ISO `.iso` | O | N | F/M | Liste bornée des fichiers via 7-Zip, sans montage du disque. |
| 69 | DMG `.dmg` | P | N | M | Listing via 7-Zip pour les variantes reconnues ; pas toutes les images chiffrées/systèmes de fichiers. |
| 70 | CAB `.cab` | D | N | F/M | Listing via le moteur existant, sans installation. |

### Web, code et configuration — 71 à 85

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- | --- |
| 71 | HTML `.html`, `.htm` | O | I | — | Source colorée, pas rendu actif d’une page web. |
| 72 | CSS `.css` | O | I | — | Texte/source colorée bornée. |
| 73 | JavaScript `.js`, `.mjs`, `.cjs` | O | I | F | `.js` raccordé ; `.mjs` et `.cjs` manquants. Aucun code exécuté. |
| 74 | TypeScript/TSX `.ts`, `.tsx` | O | I | — | Source colorée, sans compilation ni exécution. |
| 75 | Python `.py` | O | I | — | Source colorée bornée. |
| 76 | C `.c` | O | I | — | Source colorée bornée. |
| 77 | C++ `.cpp`, `.cc`, `.cxx` | O | I | F | `.cpp` raccordé ; `.cc` et `.cxx` manquants. |
| 78 | Java `.java` | O | I | — | Source colorée bornée. |
| 79 | PHP `.php` | O | N | F | Ajouter l’extension au parcours texte existant ; ne pas exécuter PHP. |
| 80 | JSON `.json` | O | I | — | Texte coloré ; pas encore de vue arborescente dédiée. |
| 81 | XML `.xml` | O | I | — | Texte coloré ; pas de résolution des entités/ressources pour l’affichage. |
| 82 | YAML `.yaml`, `.yml` | O | I | — | Texte coloré borné. |
| 83 | TOML `.toml` | O | I | — | Texte coloré borné. |
| 84 | INI `.ini` | O | I | — | Texte de configuration, convention avec variantes. |
| 85 | SQL `.sql` | O | I | — | Script visible comme texte ; aucune requête exécutée. |

### Courriels, contacts, calendriers et bases — 86 à 90

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- | --- |
| 86 | EML `.eml` | O | N | M | En-têtes, corps et liste des pièces jointes via parseur MIME ; images distantes bloquées. |
| 87 | Outlook MSG `.msg` | D | N | M/E | Lecteur MSG/CFB local ; courriels d’abord, autres objets Outlook distincts. |
| 88 | iCalendar `.ics` | O | N | F/M | Carte des premiers événements ; ni import automatique ni rappel créé. |
| 89 | vCard `.vcf` | O | N | F/M | Fiches de contacts, avec nombre et taille limités. |
| 90 | SQLite `.sqlite`, `.sqlite3`, parfois `.db` | O | N | M | Tables et quelques lignes en lecture seule, sans requêtes libres. `.db` ne suffit pas à identifier SQLite. |

### Plans et modèles 3D — 91 à 95

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- | --- |
| 91 | DWG `.dwg` | P | N | E | Miniature intégrée si présente ; lecteur CAD spécialisé sinon, avec versions à qualifier. |
| 92 | DXF `.dxf` | D | N | M/E | Premier aperçu de géométrie 2D ; blocs, textes et références complexes demandent davantage. |
| 93 | STL `.stl` | D | N | M | Vue 3D simple, nombre de triangles borné. |
| 94 | OBJ `.obj` | D | N | M | Géométrie seule d’abord ; matériaux/textures liés à autoriser séparément. |
| 95 | glTF/GLB `.gltf`, `.glb` | O | N | M | Vue 3D ; commencer par GLB autonome, ressources externes non chargées implicitement. |

### Applications et polices — 96 à 100

| Nº | Format / extensions | Nature | État | Effort | Aperçu actuel ou piste locale |
| ---: | --- | --- | --- | --- | --- | --- |
| 96 | EXE `.exe` | D | N | M | Informations PE : architecture, version, icône ; aucune exécution pour l’aperçu. |
| 97 | MSI `.msi` | D | N | M | Propriétés et contenu du paquet ; ni installation ni actions personnalisées. |
| 98 | DLL `.dll` | D | N | M | Informations PE et ressources ; ne pas charger la bibliothèque. |
| 99 | TrueType `.ttf` | O | N | F/M | Nom de la police et échantillon local borné, sans installation système. |
| 100 | OpenType `.otf` | O | N | F/M | Même aperçu de caractères ; pas d’éditeur de police. |

## Formats ouverts : meilleurs candidats à court terme

1. **Compléter ce qui est raccordé à moitié** : SVG, HEIC, AAC, MKV, AVI et M4V. Un ajout d’extension n’est suffisant que si le décodeur accepte réellement le contenu ; pour AVI/MKV, une miniature native est un premier aperçu plus réaliste qu’une lecture de tous les codecs.
2. **Étendre les parcours légers** : PHP et alias texte manquants, CSV/TSV en grille, ICO, KRA, polices TTF/OTF, premières fiches ICS/VCF. ICO est documenté par un éditeur mais aussi accessible techniquement que plusieurs formats ouverts.
3. **Aperçus bureautiques utiles** : DOCX/ODT comme document lisible simplifié ; XLSX/XLSM/ODS en grille ; EPUB comme couverture et extrait. Aucun besoin de réimplémenter Word, Excel ou une liseuse complète.
4. **Étendre les archives** : BZ2/XZ/ISO/CAB, et listing des formats existants dans le volet. Le moteur 7-Zip sait déjà traiter ces familles ; il reste à borner et présenter les résultats dans notre parcours.
5. **Approfondir seulement ensuite** : présentations avec rendu des pages, bases SQLite, modèles 3D et messagerie. Ce ne sont pas des ajouts aussi légers qu’une extension texte.

Ce sont des propositions d’ordre de réalisation, **pas une promesse de couverture chiffrée ni de facilité uniforme**.

## Formats propriétaires ou d’éditeur : solutions possibles

| Famille | Solution d’aperçu envisageable | Limite à annoncer |
| --- | --- | --- |
| PSD | Image composite par le moteur ImageMagick existant. | Fidélité de l’image aplatie, effets et variantes à mesurer ; aucun accès éditable aux calques. |
| CR2/CR3/NEF/ARW | Miniature embarquée ou décodeur RAW existant ; LibRaw peut extraire un aperçu embarqué. | Support par modèle d’appareil, compression et rendu couleur ; pas un développement RAW professionnel. |
| Pages/Numbers/Keynote | Aperçu contenu dans le fichier lorsqu’il existe ; parseur spécialisé pour le reste. SheetJS peut extraire les tableaux de Numbers ; libetonyek est une autre piste pour iWork. | Versions anciennes/récentes et fidélité distinctes ; ne pas promettre tout iWork. |
| DOC/XLS/PPT/RTF | Lecteurs existants ; LibreOffice local optionnel pour produire un aperçu temporaire si nécessaire. | Moteur volumineux, démarrage et fidélité ; pas une dépendance obligatoire pour tous les utilisateurs. |
| AI | Réutiliser le lecteur PDF pour les fichiers comportant une représentation PDF compatible. | Certains fichiers AI n’en contiennent pas ; ce n’est pas une lecture générale du format Illustrator. |
| EPS | Rasterisation locale isolée. | Moteur supplémentaire et traitement PostScript à borner ; ne pas l’activer comme une image ordinaire. |
| DWG | Miniature embarquée puis lecteur spécialisé à évaluer, dont LibreDWG. | Couverture des versions, objets CAD et licence de la bibliothèque à examiner avant sélection. |
| MSG | Parseur de structure Outlook/CFB. | Pièces jointes, encodages et objets autres que les messages demandent des essais dédiés. |
| WMA/WMV et anciens conteneurs | Image fixe ou court extrait compatible via FFmpeg. | Codecs réellement inclus dans le moteur, temps et taille ; pas de transcodage intégral au simple clic. |
| EXE/DLL/MSI | Lecture de propriétés et de ressources du paquet. | Aperçu informatif ; jamais lancer, installer ou charger le programme pour le consulter. |

**Conclusion :** le caractère propriétaire n’empêche pas forcément un aperçu local. Une image aplatie, une miniature embarquée, des cellules enregistrées ou des propriétés offrent souvent une valeur suffisante. En revanche, un format ouvert complexe peut demander beaucoup de travail pour un rendu fidèle.

## Règles de réalisation des prochains aperçus

- Réutiliser le volet existant ; titre, contenu, métadonnées et accès à l’application d’origine. L’aperçu ne doit pas devenir un second logiciel complet.
- Déclencher la lecture sur la sélection et arrêter/ignorer le résultat lorsque le fichier change. Plafonner octets lus/décompressés, pixels, pages/cellules, durée et cache ; ne pas appliquer un lecteur non borné à un gros TIFF ou à un paquet bureautique.
- Afficher la portée : « première page », « image aplatie », « 200 premières lignes », « miniature embarquée » ; distinguer aperçu partiel, moteur absent et format réellement refusé.
- Pas de modification de l’original, de téléchargement implicite de moteur, d’envoi cloud ou de chargement silencieux des ressources liées. HTML, EPUB, messages, SVG et documents bureautiques demandent un contenu inerte ; les ressources externes ne font pas partie de la sélection autorisée.
- Pour un aperçu dérivé, utiliser un cache temporaire plafonné ; revalider source et version, supprimer les sorties abandonnées. Une génération d’aperçu ne doit pas publier une copie permanente à côté du fichier.
- Qualifier chaque famille avec fichier réel valide, fichier corrompu, variante volumineuse, navigation rapide et arrêt. Le comportement sur fichier protégé/chiffré doit être explicite ; aucun contournement promis.

## Sources techniques vérifiées

Les possibilités des moteurs ci-dessous ne sont **pas encore des intégrations NextExplorer**. Les références justifient les pistes ; le choix d’une bibliothèque et sa version feront partie de chaque lot.

- Office Open XML est publié par [Ecma](https://ecma-international.org/publications-and-standards/standards/ecma-376/). Microsoft publie aussi les [spécifications de formats Office historiques](https://learn.microsoft.com/en-us/openspecs/office_file_formats/). La documentation publique ne supprime pas la complexité du rendu.
- [Mammoth](https://github.com/mwilliamson/mammoth.js) transforme DOCX en HTML sémantique, avec une fidélité volontairement simplifiée. Son HTML n’est pas assaini par la bibliothèque ; une intégration devrait isoler le traitement et assainir la sortie, avec limites et accès externes désactivés.
- [SheetJS CE](https://docs.sheetjs.com/docs/miscellany/formats/) lit notamment XLSX/XLSM, XLS, ODS et Numbers. Candidat pour une grille de données enregistrées ; ni recalcul complet ni reproduction de l’apparence des logiciels d’origine ne sont supposés.
- [LibreOffice](https://help.libreoffice.org/latest/en-US/text/shared/guide/ms_user.html?DbPAR=SHARED&System=WIN) importe les formats Microsoft historiques et récents. Un moteur local optionnel est une piste pour l’aperçu bureautique ; aucune installation n’a été ajoutée ici.
- [EPUB 3.3](https://www.w3.org/TR/epub-33/) est une recommandation W3C ; [epub.js](https://github.com/futurepress/epub.js) est un lecteur navigateur candidat. La lecture doit rester inerte et locale.
- Les [formats ImageMagick](https://imagemagick.org/formats/) et la commande locale `-list format` permettent d’identifier les décodeurs réellement présents. Certains nécessitent des délégués supplémentaires ; un nom dans cette liste ne garantit pas le rendu d’un fichier particulier.
- Adobe publie [PSD/PSB](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/) et la [spécification DNG](https://www.adobe.com/support/downloads/dng/dng_sdk.html). Cela permet d’étudier des aperçus sans intégrer l’application Adobe.
- [LibRaw](https://www.libraw.org/about) expose notamment les aperçus embarqués des RAW ; [libetonyek](https://listarchives.libreoffice.org/global/dev/2015/msg03352.html) est un importeur de fichiers Apple iWork. Leur couverture des versions doit être vérifiée sur les fichiers visés.
- Le [manuel Krita](https://docs.krita.org/en/general_concepts/file_formats/file_kra.html) décrit `mergedimage.png` dans KRA ; GIMP publie la [structure XCF](https://developer.gimp.org/core/standards/xcf/). Ces deux familles ouvertes ne demandent pas une reconstruction complète des outils de dessin pour fournir un premier aperçu.
- [7-Zip](https://www.7-zip.org/) liste les familles d’archives/images prises en charge ; RARLAB publie la [structure RAR 5](https://www.rarlab.com/technote.htm). Nous visons un listing, pas la création de tous ces formats.
- [FFmpeg](https://ffmpeg.org/ffmpeg-formats.html) décrit les conteneurs traitables ; la lecture navigateur dépend aussi des [codecs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers). Les prises en charge du build installé et de Chrome doivent être mesurées séparément.
- SQLite publie son [format de fichier](https://sqlite.org/fileformat.html). Une prévisualisation viserait seulement schéma et quelques valeurs, avec base ouverte en lecture seule et sans charger d’extensions.
- [Khronos](https://www.khronos.org/gltf/) publie glTF ; [Three.js](https://threejs.org/docs/) fournit des lecteurs de modèles candidats. Ce moteur serait chargé à la demande, avec géométrie et ressources bornées.
- [LibreDWG](https://www.gnu.org/software/libredwg/manual/html_node/Overview.html) traite DWG et annonce une licence GPLv3+ ; cette piste n’est pas un choix de dépendance ni une promesse de rendu CAD complet.
- Microsoft publie la [structure PE](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format) pour EXE/DLL et la [spécification OpenType](https://learn.microsoft.com/en-us/typography/opentype/spec/otff) pour les polices. Il est possible de viser des informations/échantillons sans installation du fichier.

## Portée de la vérification

Lecture croisée de l’interface, des filtres natifs, des MIME et des tests existants ; interrogation des formats du moteur image installé. Contrôle automatique des 100 numéros et des extensions via le classement TypeScript réel : `test-results/audit-apercus-100.json`. Aucune nouvelle dépendance, correction d’aperçu ou modification de moteur dans ce lot d’étude. Les futurs lecteurs restent à prototyper et les fichiers réels de chaque famille à qualifier.
