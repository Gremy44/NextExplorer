# Organisation, actions rapides et espace disque

Lot du 18 octobre 2026. Fonctions locales dans le panneau et l’explorateur complet, avec le compagnon du même paquet. L’installation réelle sur un Windows propre reste à qualifier dans J1.7.

## Ajuster l’interface

- **Activité** : glissez la poignée à gauche du volet pour choisir sa largeur. Elle reste mémorisée après fermeture et rechargement, séparément pour la page et le panneau. La largeur s’adapte à la fenêtre sans perdre le réglage choisi. Au clavier : flèches gauche/droite, Début/Fin ; double-clic pour revenir à la largeur initiale.
- **Historique des activités** : une icône devant chaque libellé distingue transfert, conversion, recette, création/extraction d’archive, analyse du disque, action rapide, recherche de doublons, métadonnées et téléchargement. Elle apparaît aussi sur les activités déjà enregistrées. Les états restent indiqués en texte ; un ancien type inconnu garde une icône d’historique générique.
- **Filtres et organisation** : le bouton à curseurs avant le champ **Filtrer ce dossier** ouvre ou replie les options. Fermées, elles n’occupent aucune ligne. Le nombre de filtres actifs reste indiqué ; repliez sans perdre les critères ou utilisez **Effacer les filtres** pour les retirer. Échap replie les options et remet le focus sur le bouton. Chaque panneau conserve ses propres critères.

## Tags à la manière du Finder

- **Clic droit → pastille de couleur** : ajoute ou retire immédiatement le tag, sans ouvrir de gestionnaire. Les sept couleurs sont disponibles dès la première utilisation ; le tag choisi est créé à ce moment-là. Une coche indique une attribution à toute la sélection, un trait une attribution partielle. Dans ce dernier cas, le clic l’ajoute à tous les éléments sélectionnés. Les tags renommés restent accessibles sous leur nom actuel.
- **Tags…**, depuis le clic droit, la barre de sélection ou l’aperçu, ouvre un sélecteur compact. Cliquez sur un nom pour l’ajouter/retirer, ou saisissez un nouveau nom puis **Créer et appliquer**. **Retirer tous les tags** n’agit que sur les éléments sélectionnés, sans supprimer les noms ni les associations des autres fichiers. Dans le panneau, **Organiser ce dossier** permet aussi de taguer le dossier de travail.
- **Gérer les tags…** ouvre les réglages de nom et couleur ; l’entrée **Tags** de la navigation et la commande **Gérer les tags** gardent cet accès. Sur un profil sans tags, **Créer les 7 tags de couleur** reste disponible dans ce gestionnaire. Plusieurs tags peuvent être attribués à un fichier ou un dossier.
- **Modifier le nom du tag** et sa couleur conserve ses associations. Les anciens tags et leurs couleurs restent lisibles. Les noms doivent être distincts.
- Un clic sur un tag de la barre latérale ou de l’accueil retrouve ses références dans tous les dossiers, sans créer un index de contenu. Vérification de 200 références à la fois, puis chargement supplémentaire ; une référence absente reste signalée.
- Les tags restent dans le profil Chrome et suivent les déplacements/renommages du compagnon, y compris son historique de déplacements pendant la fermeture de Chrome. Ils ne sont pas écrits dans les métadonnées Windows ou macOS. Changements externes et historique dépassé : associations à vérifier.

Plafonds conservés : 32 tags, 2 000 chemins et attribution à 1 000 références par opération. Export/import explicite dans les préférences.

## Personnaliser les dossiers

Sélectionnez un ou plusieurs dossiers puis **Personnaliser les dossiers…**, ou ouvrez **Organiser ce dossier** dans le panneau. Choisissez une couleur et un symbole/emoji, puis **Appliquer aux dossiers**. **Réinitialiser l’apparence** retire la personnalisation.

L’apparence est visible dans les listes, les colonnes, l’aperçu, les favoris et le choix d’un dossier. Elle reste propre à NextExplorer et à ce profil ; aucune icône système ni fichier `desktop.ini` n’est modifié. Les déplacements du compagnon sont suivis ; une copie ne crée pas automatiquement une nouvelle association. Export/import inclus avec les préférences. Maximum 1 000 dossiers personnalisés, 200 dossiers par application et un symbole/emoji par dossier.

## Actions rapides

Elles apparaissent sous l’aperçu du fichier et sont accessibles depuis le clic droit **Actions rapides…** ou la palette. La sélection détermine les outils disponibles. Le convertisseur reste réservé aux images et aux vidéos.

| Action | Entrées et résultat |
| --- | --- |
| Faire pivoter | Lot homogène d’images ou de vidéos, à gauche/droite de 90°. Images : copies PNG via ImageMagick ; vidéos : MP4 H.264/AAC via FFmpeg. Maximum 200 fichiers. |
| Annoter | Une image PNG/JPEG/WebP/GIF/BMP ou un PDF. Dessin, surlignage, rectangle et texte ; annulation du dernier trait, effacement de la page et navigation des pages PDF. Image produite en PNG ; PDF conservé avec annotations graphiques ajoutées. |
| Créer un PDF | Images PNG/JPEG/WebP/GIF/BMP et PDF sélectionnés, réordonnables avant création. Images centrées sur des pages A4 ; pages PDF conservées dans leur ordre et dimensions. |
| Raccourcir | Un média audio ou vidéo ; début/fin en secondes ou avec les poignées, lecture de l’extrait. Sortie MP4 H.264/AAC ou M4A/AAC. Extrait d’une heure maximum. |
| Convertir | Ouvre le convertisseur contextualisé existant. |

### Conservation des fichiers et limites

- Toutes ces actions créent des **copies**. Les originaux ne sont pas écrasés. Rotation/découpe numérotent les collisions ; annotation/création PDF refusent un nom déjà présent et demandent un autre nom.
- Les sources sont vérifiées avant et après leur lecture ou traitement. Une erreur avant publication ne remplace pas un fichier existant.
- Annotation/PDF : 32 Mio par source et par sortie, 64 Mio au total, 20 sources et 100 pages. Images limitées à 16 mégapixels pour ces outils ; créez une copie réduite dans le convertisseur si nécessaire. GIF : première image uniquement. TIFF/HEIC/AVIF ne sont pas proposés pour l’annotation ou l’assemblage PDF de ce lot ; leurs conversions natives restent disponibles.
- PDF chiffrés ou avec champ de signature : modification refusée. L’annotation ajoute du graphisme, sans réécrire le texte original. Dessiner une signature manuscrite ne crée pas une signature électronique certifiée. Ce lot n’est pas un outil de suppression confidentielle de texte : le surlignage/rectangle ne retire pas le contenu situé dessous.
- Rotation/découpe utilisent la file native et l’activité, avec arrêt et points de reprise sûrs. Annotation et assemblage PDF se préparent dans l’extension, avec worker et arrêt pendant la préparation ; gardez leur fenêtre ouverte pendant l’enregistrement. Aucun rejeu automatique d’une publication interrompue.
- ImageMagick est requis pour contrôler les images ; FFmpeg/FFprobe pour les médias. Les encodeurs requis doivent être présents. Les pistes secondaires, sous-titres et métadonnées média ne sont pas conservés par la découpe/rotation vidéo. La lecture d’aperçu dépend des codecs de Chrome.
- Le détourage automatique, les extensions Automator/Raccourcis et l’édition du texte existant d’un PDF ne font pas partie de ces actions. Aucun modèle d’IA ajouté.

Les ressources PDF.js, ses polices/CMaps et PDF-LIB sont embarquées et chargées à la demande. Aucun CDN, compte ou traitement distant. Les sorties gardent leurs limites même si une source annonce une grande taille. Le rendu PDF est limité à une page à la fois et une surface d’environ 3,2 mégapixels ; les documents complexes restent à tester sur les machines visées.

**Clavier :** choisissez l’outil avec Tab, placez le focus sur la zone d’annotation, déplacez le curseur avec les flèches (Maj pour un pas plus grand), puis Entrée pour commencer/terminer le trait ou placer le texte. Échap annule le trait en cours. Les actions et les poignées de découpe restent accessibles au clavier.

## Espace disque dans l’aperçu

**Analyser l’espace disque** ouvre son résultat dans le volet **Aperçu et détails → Espace disque**, sans fenêtre modale. Le résultat reste présent quand vous ouvrez un dossier. **Sélection** retrouve l’aperçu du fichier ; **Espace disque** retrouve la dernière analyse. Le panneau affiche le même résultat dans son contenu.

Glissez la séparation du volet pour l’élargir selon la place disponible, sans l’ancienne limite de 640 px. Les flèches, Début/Fin et le double-clic restent disponibles ; la largeur choisie est mémorisée. Le bouton **Agrandir le volet d’aperçu** utilise toute la zone centrale ; **Réduire le volet d’aperçu** revient aux fichiers. Cliquer un résultat dans ce mode remet aussi les fichiers à l’écran et conserve l’analyse. Sur petit écran, le volet s’adapte à la largeur disponible.

Survolez un bloc, même très petit, ou donnez-lui le focus avec Tab pour lire son nom complet, son chemin, sa taille et son pourcentage. Échap masque l’infobulle ; la liste propose les mêmes informations. Six couleurs contrastées et des séparations blanches distinguent les éléments dans les deux thèmes, sans coder leur type. Les petites parts non nulles affichent **< 0,1 %** plutôt que 0 %.

La carte représente les 40 plus gros éléments et le reste avec des surfaces proportionnelles. La liste affiche 80 éléments à la fois et permet de charger la suite. Cliquer un élément ouvre son dossier sans fermer l’analyse. **Actualiser** lance une nouvelle mesure ; le résultat précédent est un instantané.

Le parcours lit les répertoires par lots de 256 entrées, sans plafond de nombre de fichiers. Dossiers vides, fichiers cachés et corbeille locale sont inclus ; les liens ne sont pas suivis et les accès refusés sont signalés. Les résultats triés sont conservés localement hors du petit enregistrement de tâche, puis transmis par pages de 500 lignes au maximum, bornées à 512 Kio. L’interface n’affiche que 80 lignes par page. Le cache est borné à 64 Mio, avec 60 Mio de métadonnées de lignes ; une omission exceptionnelle reste indiquée et ses tailles restent comptées. La profondeur est bornée à 512 niveaux. La taille mesurée est la somme logique des fichiers parcourus, pas la totalité des blocs occupés d’un volume ; ce parcours n’est pas un instantané atomique des fichiers modifiés en parallèle. La lecture ne bloque plus les mises à la corbeille locales. **Arrêter** permet d’interrompre une longue analyse. Les limites de recherche de doublons restent 20 000 entrées et 512 Kio de chemins. Cette évolution nécessite le compagnon à jour (`spaceAnalysisVersion: 2`). Voir [les retours d’usage](RETOURS_USAGE_01.md).

## Ce PC et capacités des lecteurs

Ouvrez **Ce PC** dans les emplacements, depuis la palette, ou remontez depuis la racine d’un lecteur. Une carte par lecteur affiche la jauge d’utilisation et l’espace disponible ; les emplacements de la barre latérale et l’accueil reprennent ces capacités. Actualisation manuelle et toutes les minutes.

Sous Windows, les mesures viennent de `GetDiskFreeSpaceExW`, sans parcourir le contenu des disques. L’espace disponible tient compte du compte utilisateur ; les volumes presque pleins sont signalés par la jauge. Lecteurs débranchés, optiques et réseau sans mesure restent identifiés sans afficher un faux zéro. Les capacités des lecteurs réseau ne sont pas interrogées. Hors Windows, la liste des racines reste disponible avec capacité indisponible.

## Références de conception

Comportements adaptés de la documentation Apple : [tags](https://support.apple.com/fr-fr/guide/mac-help/mchlp15236/mac), [actions rapides](https://support.apple.com/fr-fr/guide/mac-help/mchl97ff9142/mac), [personnalisation des dossiers](https://support.apple.com/fr-fr/guide/mac-help/mchlp2313/mac). L’interface conserve les rôles, composants et thèmes Material 3 de NextExplorer. [API Windows des capacités](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdiskfreespaceexw).
