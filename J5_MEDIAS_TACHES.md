# J5 — médias, recettes et tâches locales durables

Lot du 17 octobre 2026, sans modèle d’IA. Il complète les [copies identiques C2](C2_COPIES_IDENTIQUES.md) et le [socle J4](J4_ORGANISATION_RECHERCHE.md). Les fonctions sont disponibles dans le panneau et l’explorateur complet avec le compagnon à jour. La qualification de distribution J7 et l’installation sur Windows propre J1.7 restent distinctes.

## Images similaires

Dans **Regrouper les fichiers → Images similaires**, choisissez la sélection, le dossier ou l’espace suivi, puis **Regrouper**. Dépliez un groupe pour examiner les chemins et le motif. **Arrêter** empêche les demandes suivantes et ignore les résultats tardifs. Il n’y a aucune suppression ni déplacement automatique.

Le compagnon ImageMagick extrait une petite grille de couleurs ; l’interface compare les contours, les couleurs moyennes et les proportions. Les images trop uniformes sont écartées. Les membres sont rapprochés d’une image de référence, sans enchaînement de ressemblances de proche en proche. Ce rapprochement indicatif peut manquer un recadrage ou rapprocher deux images différentes : il ne remplace pas une comparaison BLAKE3 et ne prouve pas un doublon.

| Limite | Valeur |
| --- | --- |
| Références candidates / métadonnées contrôlées | 1 000 / 200 |
| Images échantillonnées | 60 maximum |
| Taille source | 256 Mio par image ; budget cumulé 512 Mio |
| Analyse | 90 secondes pour les échantillons ; arrêt manuel disponible |
| Décodage natif | Première image seulement ; 100 mégapixels maximum ; délai de 8 secondes, attente comprise |
| Formats | JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF et HEIC/HEIF selon les décodeurs du moteur installé |

Les métadonnées précises sont contrôlées avant et après le décodage. Les fichiers non admissibles, changés, illisibles et non comparés restent signalés. Le corpus de test est synthétique ; aucune mesure de précision sur des photos personnelles n’est annoncée.

## Aperçus et gros fichiers

**Espace** ouvre l’aperçu du fichier sélectionné. Le volet d’aperçu et les miniatures utilisent aussi les images réduites natives, dont les TIFF admissibles. Aucun fichier image complet n’est assemblé dans l’interface pour ce décodage.

- Image retournée : JPEG de 1 600 pixels maximum, 700 Kio maximum. Deux décodages natifs simultanés ; sous Windows, chaque processus ImageMagick est limité à 512 Mio par un Job Object. Ses limites internes mémoire, disque temporaire, threads et durée restent appliquées.
- Cache de miniatures en mémoire : 64 entrées / 2 Mio de chaînes encodées, métadonnées précises dans la clé ; deux demandes actives et 40 en attente maximum. Aucun cache persistant de vignettes.
- Audio/vidéo compatible : lecture par plages d’octets depuis un serveur temporaire lié uniquement à `127.0.0.1`, URL secrète sans chemin local, huit médias maximum et expiration après 30 minutes. Fermer l’aperçu révoque son accès ; quitter Chrome arrête la lecture. Aucun serveur distant ni nouvelle permission Chrome.
- Forme d’onde : FFmpeg, trente premières secondes au maximum, extraction bornée et annulable par délai. Les codecs lisibles restent ceux de Chrome ; tous les formats et toutes les tailles ne sont pas qualifiés.

Un fichier hors limite reste ouvrable dans son application locale. La prévisualisation PDF et le connecteur textuel optionnel gardent leurs limites précédentes ; ce lot n’ajoute aucun OCR.

## Préréglages et recettes

### Convertisseur images et vidéos — révision du 17 octobre

**Convertir les fichiers** adapte ses réglages à la sélection. Les documents, fichiers audio seuls, dossiers, liens et SVG ne sont pas convertibles. Les images matricielles JPEG/PNG/WebP/GIF/BMP/TIFF/AVIF/HEIC/HEIF et les vidéos courantes MP4/MOV/MKV/WebM/AVI/MPEG/M4V/WMV/MTS/M2TS/TS/OGV/3GP sont admises selon les décodeurs installés. Maximum 200 sources par lot.

Si la sélection mélange images et vidéos, choisissez **Images** ou **Vidéos** en haut du formulaire. Le nombre traité et les exclusions sont visibles ; seul ce lot sera converti. Le compagnon refuse lui aussi les types non pris en charge et les lots mélangés.

- **Images** : JPEG, PNG, WebP, AVIF, TIFF, BMP ou GIF fixe ; largeur maximale et qualité uniquement lorsque le format utilise ce réglage. Aucun codec vidéo, débit audio ou remux. Proportions conservées, sans agrandissement ; première image des GIF animés/TIFF multipages, fond blanc pour la transparence convertie en JPEG. Sources limitées à 256 Mio et 100 mégapixels.
- **Vidéos** : MP4, WebM, MKV ou MOV ; qualité Équilibrée/Élevée/Compacte et largeur maximale, sans agrandissement. **Réglages avancés** propose seulement les encodeurs compatibles avec le conteneur : H.264/H.265/AV1 selon le format, VP9/AV1 pour WebM. Encodage logiciel, moteurs/codecs requis. Pistes audio conservées avec réencodage AAC ou Opus selon le format ; sous-titres et pièces jointes non copiés.
- **Changer de conteneur sans réencoder** : vidéo uniquement, dans les réglages avancés. Les options de réencodage disparaissent ; la compatibilité des pistes source avec le nouveau conteneur reste nécessaire. Le moteur peut refuser un assemblage incompatible.
- **Préréglages** : seuls ceux du type choisi sont proposés. Les anciens préréglages personnels audio/SVG restent dans le stockage et les exports, sans être proposés au convertisseur. Les options d’un ancien préréglage sont adaptées au type choisi ; vérifiez-les avant lancement.

Choisissez le dossier par **Parcourir les dossiers** ou saisissez son chemin. **Créer N copies** lance le traitement ; les noms existants sont conservés avec numérotation des collisions. Les sources sont contrôlées avant le lot puis avant/après conversion. Une erreur tardive peut laisser des copies déjà terminées ; les originaux sont conservés. Le suivi durable, les reprises sûres et l’option ZIP restent disponibles.

Les encodeurs vidéo sont interrogés dans le FFmpeg réellement installé : seules les implémentations prises en charge, présentes et compatibles avec le conteneur sont proposées. Les préréglages nécessitant un encodeur absent sont masqués sans être effacés. Le compagnon revérifie sa présence avant toute copie. Avec le moteur fourni ici, H.264, H.265 et VP9 sont qualifiés ; l’encodeur AV1 `libsvtav1` est absent et reste masqué. Installer un autre moteur ne qualifie pas automatiquement ses codecs.

Le parcours suit une séparation source/réglages/sortie, inspirée de la [conversion par lots XnConvert](https://www.xnview.com/en/how-to-batch-convert-and-batch-process/) et des [préréglages HandBrake](https://handbrake.fr/docs/en/latest/technical/official-presets.html), avec les composants et couleurs Material 3 du projet.

Ouvrez **Convertir les fichiers** ou **Préparer des images**, puis **Préréglages et recettes**. Choisissez un préréglage fourni, ajustez les options et vérifiez la destination. Pour conserver vos options, saisissez un nom puis **Enregistrer les options**. Trente préréglages maximum par profil ; **Retirer le préréglage** ne supprime aucun fichier.

Seules les options sont enregistrées : aucun chemin, fichier ou mot de passe. Les préréglages personnels font partie de l’export/import explicite des réglages. L’import d’un ancien export sans préréglages produit une liste personnelle vide.

Dans la conversion, **Puis créer une archive ZIP des copies** enchaîne les opérations après **Créer N copies**. Le préréglage **Images pour courriel + ZIP** prépare cet enchaînement. Choisissez le nom de l’archive et un dossier de sortie. Les originaux sont conservés ; une erreur peut laisser les copies déjà terminées. Aucun envoi vers un site n’a lieu pendant cette recette.

## Archives

| Opération | Disponible | Limites |
| --- | --- | --- |
| Création ZIP | Moteur Go ; compression ou stockage sans compression | Destination nouvelle uniquement ; aucun écrasement |
| Création ZIP chiffré / 7z | Moteur 7-Zip ; mot de passe facultatif pour 7z, AES-256 pour ZIP chiffré | Sources copiées dans un instantané temporaire contrôlé avant traitement |
| Extraction ZIP, 7z, RAR | Extraction contrôlée existante ; moteur 7-Zip selon le format et le chiffrement | Mot de passe saisi explicitement ; chemins confinés et liens refusés |
| Modification dans l’archive, création RAR, multivolumes | Non pris en charge | Utiliser une application dédiée |

Plafonds : 3 000 entrées, 256 Mio par fichier décompressé, 1 Gio cumulé ; archive à extraire de 1 Gio maximum. Les moteurs avancés ont une échéance de cinq minutes. Les sources sont revérifiées pendant la création. L’extraction et les lots de conversion ne constituent pas une transaction atomique de tout le dossier.

## Activité, fermeture et récupération

Les tâches validées sont confiées à un worker local indépendant, exécuté avec les droits de l’utilisateur. Il continue après fermeture du panneau, de l’extension ou de Chrome. Il n’est pas installé comme service au démarrage de Windows. Une file séquentielle évite que deux tâches de mutation se superposent. Les lectures et aperçus restent disponibles pendant une pause.

**Démarrer en pause dans l’activité** réserve une tâche sans la démarrer. Dans **Activité**, **Pause** peut attendre la fin du fichier ou du traitement courant et bloque les mutations suivantes de la file. Les actions directes de modification, dont renommage, corbeille et annulation de transfert, sont refusées immédiatement tant qu’une tâche détient le verrou ; elles ne restent pas en attente pour s’exécuter après une erreur de délai dans le navigateur. **Annuler** arrête la suite et ne défait pas les fichiers déjà écrits. Les transferts terminés gardent leurs contrôles d’annulation habituels.

| Situation | Comportement |
| --- | --- |
| Fermeture/réouverture de Chrome | Même tâche, même file et résultats retrouvables ; aucun nouveau lancement |
| Arrêt du worker ou du PC | Tâches en cours chargées comme interrompues ; aucun rejeu automatique |
| Copie/déplacement ou conversion à un point de reprise sûr | Reprise explicite proposée ; étapes terminées conservées, sources et destination contrôlées |
| Publication interrompue ou état ambigu | Reprise refusée ; examen manuel du dossier et du journal |
| Archive, extraction, métadonnées ou téléchargement commencé au moment de l’arrêt | Pas de reprise automatique du traitement partiel |
| Mot de passe nécessaire à une reprise sûre | Nouvelle saisie ; jamais écrit dans l’état durable |
| Ancien worker encore actif après mise à jour | Navigation disponible, mutations refusées ; terminer ses tâches et fermer l’extension une minute avant reconnexion |

La reprise se fait entre fichiers de premier niveau, jamais à un octet précis. Des fichiers temporaires peuvent rester après un arrêt brutal ; aucune suppression automatique de dossiers utilisateur n’est tentée. Les vérifications de taille, date et identité ne constituent pas une sauvegarde.

Les états sont stockés dans `%APPDATA%\NextExplorer\worker\tasks` : cent tâches, 4 Mio par état, jusqu’à mille sources. Les plus anciens résultats terminés peuvent être écartés à capacité pleine ; les tâches en attente ne sont pas supprimées. Les journaux de transfert restent séparés.

Les tags suivent aussi les déplacements natifs terminés pendant que Chrome est fermé, grâce à un historique local borné à 200 événements / 8 Mio. Une perte d’historique déclenche un avertissement et exige un contrôle manuel ; les renommages externes ne sont pas déduits. Ces fichiers locaux contiennent des chemins, pas les contenus des documents.

## Vérifications reproductibles

```powershell
npm.cmd run check
npm.cmd run native:test
npm.cmd run test:j5:worker
npm.cmd run test:j5:extension
npm.cmd run test:browser
$env:NEXTEXPLORER_REQUIRE_NATIVE='1'
npm.cmd run test:extension
```

Compilation, 198 tests TypeScript et suite Go réussis. Les recettes du worker, de J5 dans l’extension réelle et du navigateur réussissent aussi : TIFF 28 Mio, vidéo 512 Mio avec recherche temporelle, recette ZIP, fermeture complète de Chrome, reprise explicite après arrêt et tags hors navigateur. Le cas d’un ancien worker incompatible vérifie la navigation et le refus des nouveaux transferts. La recette complète de l’extension avec le compagnon final réussit également, y compris J3/J4 et H07 automatique toutes vues fermées. Paquet, installateur et kit Windows reconstruits ; J1.7 reste non exécuté.

Les recettes utilisent des dossiers, profils Chrome et états natifs isolés. Elles arrêtent seulement les processus qu’elles ont lancés, après contrôle du répertoire privé pour le worker connecté. Voir les preuves du lot dans [la recette hybride](RECETTE_HYBRIDE.md#j5--médias-recettes-et-worker-durable).
