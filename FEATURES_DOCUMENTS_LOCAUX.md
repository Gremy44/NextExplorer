# Documents, archives et médias — version locale 1.0.4

Ces outils traitent les fichiers sur l’ordinateur avec le compagnon Windows. Aucun compte, partage public ou service bureautique collaboratif n’est requis.

Le [complément V1 du 28 octobre](APERCUS_V1.md) qualifie les aperçus courants et les gros fichiers, ajoute l’arrêt natif des images et remplace le lecteur PDF par un aperçu borné par page. Il précise les refus et les limites de chaque famille, y compris les polices et les documents Office.

## Galerie

Dans l’aperçu d’une image ou vidéo du dossier courant, les flèches passent au média précédent/suivant. Pour les images : molette, boutons de zoom, double-clic et déplacement de l’image agrandie. Le plein écran agrandit le lecteur média courant. Seuls les éléments déjà chargés dans le dossier sont parcourus ; l’image reste soumise aux limites d’aperçu image existantes et le navigateur décide quels codecs vidéo il sait lire.

## Archives

Ouvrir une archive ZIP, 7z ou RAR (7z/RAR nécessitent le moteur 7-Zip déjà pris en charge) pour parcourir ses dossiers, sélectionner des fichiers, lire un texte ou une petite image et extraire la sélection à côté de l’archive. Rien n’est extrait automatiquement. Chaque chemin et membre est revérifié par le compagnon.

Limites : 128 Mio pour l’archive parcourue, 3 000 membres, jusqu’à 256 Mio par membre et 1 Gio décompressé selon les protections d’extraction existantes. L’aperçu d’un membre est limité à 512 Kio. Les archives chiffrées, ambiguës, multivolumes ou contenant des liens ne sont pas parcourues. L’extraction sélectionnée n’écrit que les membres demandés ; les entrées non sélectionnées restent validées selon les protections de l’extraction.

## Éditeur texte et versions locales

Dans le volet de sélection comme dans la fenêtre d’aperçu, **Modifier** transforme l’aperçu en éditeur sans ouvrir de modale. **Enregistrer** ou **Ctrl+S** écrit le fichier ; **Quitter l’édition** revient à la lecture. Le bouton **Versions** du même outil permet de consulter la copie antérieure. L’éditeur séparé reste disponible depuis les actions existantes.

Le brouillon survit aux changements de sélection, d’onglet, d’outil et à la fermeture/recharge de la page : il est conservé immédiatement dans le stockage local du profil de l’extension. Revenez au fichier puis **Reprendre le brouillon**, ou utilisez **Brouillons à récupérer** dans la barre supérieure. Téléchargement du texte possible même si le fichier source a disparu ; variantes séparées entre fenêtres, contrôle d’empreinte avant toute écriture. Maximum 20 brouillons / 3 Mio de chaînes stockées, sans éviction automatique. Une alerte signale toute sauvegarde locale refusée et invite à garder la page ouverte ou télécharger le texte. Un avertissement de sortie est demandé tant qu’un brouillon existe. Abandon explicite et relecture depuis le disque restent confirmés s’ils écartent une modification. [Protection et confidentialité](PROTECTION_TRAVAIL_V1.md).

L’éditeur propose numéros de ligne, coloration quand le langage est reconnu, recherche, raccourci Ctrl+S, annulation et avertissement si le fichier a changé depuis son ouverture. L’enregistrement conserve une version précédente avant d’écrire le fichier. Encodage UTF-8 uniquement, fichiers jusqu’à 128 Kio ; BOM UTF-8 et fins de ligne CRLF conservés.

L’historique garde au plus 20 versions par chemin, 16 Mio par version et 256 Mio au total. Une restauration crée une copie voisine et laisse l’original intact. Aucun nettoyage automatique : quand un quota est atteint, l’utilisateur supprime lui-même une ancienne version. L’historique est stocké dans la configuration locale du compagnon. Une panne pendant l’écriture peut nécessiter la récupération manuelle depuis la version précédente.

## Polices de caractères

Sélectionnez ou ouvrez un fichier **TTF, OTF, WOFF ou WOFF2** pour voir un échantillon dans sa propre police. Changez le **Texte d’essai** et la **Taille** de 12 à 96 px. La police est chargée uniquement dans le navigateur pour cet aperçu, puis retirée quand il est fermé ou remplacé : aucune installation Windows ni modification du fichier.

Limites : 16 Mio par police, dix secondes pour le chargement, formats acceptés par le décodeur de Chrome/Edge. Collections TTC/OTC, polices anciennes et réglages des axes variables non inclus. Les glyphes absents peuvent être rendus par une police de secours du navigateur. Le nom affiché est celui du fichier, pas une extraction des métadonnées internes. Aucun moteur ni téléchargement supplémentaire.

Validation du 28 octobre : parcours navigateur avec compagnon réel, édition/CRLF/version précédente/conflit externe/brouillon/texte vide/UTF-16 refusé, police TTF réelle et polices invalides ou trop grandes, contrôle du retrait de la police, largeurs 320/390/1440 px. Les corpus complets de polices et tous les jeux de glyphes ne sont pas qualifiés.

## Recherche dans Office

L’index local peut extraire du texte DOCX, XLSX et PPTX, puis le rechercher comme les autres contenus. Taille limitée à 32 Mio, 8 Mio de XML traité, 200 parties et 16 Kio de texte par document. Les nombres de cellules XLSX sont extraits ; images, OCR, macros, mise en page et formules calculées ne le sont pas. Les présentations sont lues par numéro de diapositive ; les tableurs ne reconstruisent pas la mise en page des cellules.

## Sous-titres et diagnostic codec

Dans l’aperçu audio/vidéo, NextExplorer propose les fichiers voisins SRT/VTT portant le nom du média et les pistes intégrées textuelles lisibles par FFmpeg. Les SRT sont adaptés en WebVTT pour le lecteur Chrome. FFprobe affiche les pistes et signale certains codecs dont la lecture varie selon Chrome, avec accès au convertisseur vidéo.

Les pistes voisines sont limitées à 128 Kio ; le dossier est parcouru sur 2 000 entrées au maximum. Les pistes intégrées sont limitées à 128 Kio et 15 secondes d’extraction. Les sous-titres graphiques (PGS/VobSub) demandent de l’OCR et ne sont pas convertis. La prise en charge réelle des codecs dépend de Chrome et du système.

## Mise à jour requise

Ces fonctions nécessitent l’extension et le compagnon construits ensemble en version 1.0.4. Le compagnon 1.0.3 ne connaît pas les nouvelles commandes. Après remplacement du compagnon, désactiver puis réactiver l’extension et vérifier la connexion.
