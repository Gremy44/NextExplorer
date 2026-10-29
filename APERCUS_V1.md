# Aperçus et gros fichiers — qualification V1

Lot du 28 octobre 2026. Ce document décrit les aperçus actuels et leur corpus de recette. Il ne promet pas la lecture complète des 100 formats de l’audit historique, ni de tous les codecs ou variantes d’un format.

## Parcours

Sélectionner un fichier ouvre son contenu dans le volet, si celui-ci est activé ; **Espace** ouvre la fenêtre d’aperçu. Une lecture ou un décodage en cours affiche son étape et **Arrêter l’aperçu**. **Réessayer l’aperçu** relance une opération arrêtée ou en erreur. Changer de fichier ou fermer la vue invalide les réponses tardives et libère ses ressources.

Les images locales utilisent ImageMagick dans un processus distinct. Le nouveau compagnon accepte une annulation par identifiant d’aperçu, y compris si elle arrive avant le démarrage ou pendant l’attente d’un décodeur. Deux décodeurs au maximum ; l’attente et le décodage partagent le délai de huit secondes. Une annulation ne modifie aucun fichier original. Les fichiers de travail ImageMagick sont placés dans un dossier temporaire propre à l’appel, nettoyé après la fin ou l’arrêt du processus.

Les lectures texte, Office, polices et archives déjà demandées peuvent encore finir dans le compagnon après un arrêt visuel ; leurs réponses sont ignorées. Leurs limites natives restent applicables. Aucun travail de conversion ou d’extraction de fichiers lancé séparément n’est annulé par ce bouton.

## Formats et limites actuelles

| Famille | Aperçu proposé | Limites et qualification |
| --- | --- | --- |
| JPEG/JPG, PNG, WebP, GIF, BMP, TIFF/TIF, AVIF, HEIC/HEIF | Image réduite, zoom et déplacement | Onze extensions testées. ImageMagick requis ; lecteur du format nécessaire dans le moteur. Première image/page seulement, sortie JPEG ; transparence sur fond blanc. Sources ordinaires non vides de 256 Mio / 100 mégapixels maximum, sortie jusqu’à 1 600 px / 700 Kio ; 640 px dans le volet. Deux processus simultanés, huit secondes attente comprise, mémoire Windows du processus plafonnée à 512 Mio et budgets internes distincts. SVG explicitement refusé dans cet aperçu. |
| Texte/code/Markdown | Source colorée ou Markdown nettoyé | 64 Kio lus / 1 000 lignes ; UTF-8, ou UTF-16 avec BOM. Worker de présentation limité à trois secondes ; texte simple disponible si la coloration échoue. Gros log de 3,5 Mio, JSON, UTF-16 et Markdown contenant du HTML d’image testés ; aucun script ni image web exécuté depuis le Markdown. L’édition garde sa limite distincte de 128 Kio UTF-8. |
| PDF | PDF.js local, une page rendue à la fois, pages précédente/suivante, texte de la page consultable | 16 Mio dans le volet, 32 Mio dans la fenêtre. Lecture par lots avec compteur d’octets, ouverture bornée à quinze secondes, rendu de page à dix secondes. Surface cible de 1 600 × 2 000 px maximum ; images de plus de 16 mégapixels susceptibles d’être omises, limite affichée. Texte affiché borné à 32 000 caractères par page. Arrêt/fermeture détruisent le worker PDF. Les scripts, liens actifs et formulaires PDF ne sont pas proposés par ce lecteur de consultation. Mot de passe : ouverture dans l’application habituelle. |
| DOCX, XLSX, PPTX | Extrait textuel local | 32 Mio par fichier, 8 Mio de XML et 200 parties au plus, extrait de 16 Kio. Corpus OOXML synthétique pour les trois types ; aucun rendu de mise en page, formule calculée, macro ou OCR. |
| ZIP, 7z | Navigation et petit extrait d’un membre | ZIP et 7z parcourus et texte interne lu dans la recette. Archive de 128 Mio / 3 000 entrées maximum, aperçu d’un membre de 512 Kio. 7-Zip requis pour 7z. RAR garde le parcours existant selon moteur ; il n’a pas été requalifié par le corpus de ce lot. GZ/TAR restent refusés par le navigateur d’archives actuel. |
| TTF, OTF, WOFF, WOFF2 | Texte d’essai dans la police, taille réglable | Quatre formats testés avec de vraies polices. 16 Mio par police, dix secondes pour le chargement, aucune installation Windows. Les glyphes absents peuvent utiliser une police de secours du navigateur. Collections TTC/OTC et axes variables hors périmètre. |
| MP4/M4V/MOV H.264, WebM VP9, MKV H.264 | Vidéo progressive et recherche temporelle | Lecture réussie pour les fichiers du corpus, dont MP4 de 512 Mio. Le compagnon sert des plages d’octets locales, sans assemblage du média entier dans Chrome. Le conteneur et le codec doivent convenir au navigateur ; les autres variantes restent à qualifier. |
| MP3, WAV, Ogg, FLAC, M4A, AAC, Opus | Lecteur audio progressif | Sept fichiers du corpus lus jusqu’à leurs métadonnées par Chrome. AAC, MKV et AVI sont désormais raccordés au serveur local avec leur type MIME ; cela ne rend pas tous les codecs lisibles. Forme d’onde optionnelle : FFmpeg et trente premières secondes. |
| AVI du corpus | Diagnostic et conversion proposés | Le navigateur a refusé le codec MPEG-4 du fichier de test. Le refus est affiché, avec ouverture dans l’application habituelle et création d’une copie compatible si disponible. Aucun écran de chargement infini. |
| Liens `.weblink` | Titre, description et lien HTTP(S) | Fichier limité à 256 Kio. Schéma contrôlé avant affichage ; un titre malformé ne fait plus tomber l’interface. L’aperçu n’ouvre pas le site. |

Un format refusé, un moteur absent, une source corrompue ou un plafond atteint doit produire un message. **Ouvrir dans l’application** reste accessible. Une qualification sur un exemplaire ne garantit pas toutes les variantes du format.

## Preuves

- `node scripts/browser-test.mjs --preview-qualification-only` : onze extensions d’image, TIFF non compressé de **137,3 Mio** (6 000 × 4 000, 16 bits), arrêt natif puis relance, source de plus de 256 Mio refusée avant décodage, fichiers corrompus et SVG refusés.
- Même recette : PDF multipages, page tournée et grande page, PDF de **17 Mio** avec pièce jointe, limites 16/32 Mio, PDF corrompu ; texte consultable et rendu par page, sans iframe de lecteur externe.
- Même recette : quatre formats de polices, extraits Office, ZIP/7z, liens et texte, treize médias dont un refus AVI explicite ; MP4 de **512 Mio** joué avec déplacement temporel, sans `FS_READ` du média entier.
- Largeurs 320/390/1 440 px et empreintes des originaux contrôlés inchangées. La recette d’édition texte/police précédente reste verte.
- `node scripts/console-extension-test.mjs --previews` : vraie extension empaquetée dans Chromium, vrai Native Messaging, vrai worker PDF sous la CSP de l’extension, navigation de pages et disparition du worker après fermeture, TIFF natif et refus d’un PDF trop grand. Enregistrement Chromium temporaire restauré ; installation Chrome habituelle préservée.
- Tests unitaires : arrêt avant démarrage et dans la file native, réponses tardives, file des miniatures annulées libérée, budgets et plages de lecture, changement de taille pendant lecture, dimensions PDF et types MIME.

Les fichiers, rapports et captures restent sous `test-results`. Les polices de recette proviennent des [Web Platform Tests](https://github.com/web-platform-tests/wpt/tree/master/fonts) et de [Source Code Pro](https://github.com/adobe-fonts/source-code-pro) ; l’image HEIC est l’[exemple de libheif](https://github.com/strukturag/libheif/blob/master/examples/example.heic). Ces ressources de test ne sont pas embarquées dans le produit. Le produit ne télécharge aucun nouveau moteur ni ressource d’aperçu. PDF.js et ses ressources sont déjà embarqués ; son [API de chargement et d’arrêt](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html) pilote le worker local.

Restent à qualifier : documents personnels complexes, PDF protégés, TIFF scientifiques/multipages et autres codecs réels, navigateurs/configurations complémentaires. Cette recette ne remplace pas celle du prochain installateur sur Windows neuf. Aucun Setup EXE reconstruit pour ce lot.
