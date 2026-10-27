# Revue des outils et des parcours utilisateur

État au 18 octobre 2026. Premier lot choisi : **espace disque amélioré + liste complète des outils à vérifier ensemble**.

Les 47 points ci-dessous couvrent les fonctions actuelles de NextExplorer, regroupées en parcours testables. Ce sont des repères de revue, pas de nouvelles étapes J. Les accès ont été relevés dans le code et les guides ; les autres outils attendent encore votre retour d’utilisation. Cette liste ne signifie pas que toute l’interface a déjà été optimisée.

## Premier outil amélioré : UX-22 — Espace disque

- Le volet **Aperçu et détails** peut dépasser son ancienne limite de 640 px, dans la largeur disponible. Glissez sa séparation ; les flèches, Début/Fin et le double-clic restent utilisables. Le réglage est mémorisé et s’adapte à la fenêtre.
- Le bouton d’agrandissement du volet donne toute la zone centrale à l’analyse. Le bouton de réduction retrouve les fichiers. Cliquer un résultat ramène aussi aux fichiers, sans perdre l’analyse.
- Le survol d’un bloc, même minuscule, affiche son nom complet, son chemin, sa taille et sa part de l’espace analysé. Le clavier donne les mêmes informations avec Tab ; Échap masque l’infobulle. Ces informations sont également disponibles dans la liste.
- Six couleurs contrastées et des séparations blanches rendent les surfaces plus lisibles dans les deux thèmes. Les couleurs distinguent les éléments ; elles ne codent pas leur type. La surface représente toujours la taille.
- Les petites parts non nulles affichent **< 0,1 %** au lieu de 0 %. Actualisation, résultat persistant, pagination et avertissements d’analyse partielle sont conservés.

Vérifications techniques : **224 tests / 36 fichiers**, puis `npm.cmd run test:space` avec Chrome et le compagnon isolé. Survol, focus, largeur supérieure à 640 px, agrandissement, navigation, mémorisation, pagination et thèmes à 320/390/900/1440 px sont contrôlés. Les fichiers du test gardent leurs empreintes ; aucune lecture du contenu des fichiers n’est demandée par Chrome pendant ce parcours. Preuves locales : `test-results/check-space-ux.log`, `browser-space-ux.log`, `space-expanded-dark.png`, `space-tooltip-small.png` et `space-{light|dark}-{largeur}.png`.

Les plafonds du scan restent inchangés : voir [le guide de l’espace disque](AMELIORATIONS_FINDER.md#espace-disque-dans-laperçu). L’analyse reste un instantané des fichiers parcourus, pas une mesure exhaustive des blocs occupés du volume. Vos dossiers réels et votre confort d’utilisation restent à vérifier.

## Comment faire la revue

Lot du 26 octobre 2026 : les **Actions rapides** utilisent désormais un atelier
commun, ouvert directement sur un outil adapté. Rotation avec aperçu, annotation
sans perte du travail lors du changement d’outil, ordre PDF au glisser-déposer et
bornes d’extrait depuis la lecture. Le dossier courant est proposé et les options
de sortie sont repliables. [Essais à cocher](AMELIORATIONS_ERGONOMIE.md#actions-rapides--atelier-du-26-octobre-2026).

Dans l’explorateur complet, **Ctrl+K** ouvre la palette : tapez le nom de l’outil indiqué. Le clic droit d’un fichier présente aussi les actions adaptées à la sélection. Les commandes indisponibles dépendent du type de fichier, de la connexion au compagnon et des moteurs installés. Les accès du panneau sont parfois regroupés sous **Organiser ce dossier**, **Examiner** ou le menu **…**.

Pour les opérations qui changent des fichiers, utilisez un dossier de copies de test. Commencez par UX-22, puis choisissez un numéro ; nous corrigerons le parcours correspondant avant de passer au suivant.

Format de retour possible :

```text
UX-22 — Espace disque — page complète ou panneau
Je voulais : …
Ce qui gêne : …
Je m’attendais à : …
```

## Navigation et présentation

| Repère | Outil et accès actuel | Petit essai à faire |
| --- | --- | --- |
| UX-01 | **Navigation et choix d’un dossier** : retour, parent, chemin cliquable/saisissable ; sélecteur de dossier dans le panneau et les outils concernés. | Rejoindre un dossier profond, revenir, modifier le chemin et choisir un autre disque. Vérifier les noms longs à petite et grande largeur. |
| UX-02 | **Onglets et double panneau** : onglet **+**, fermeture d’onglet, commande **Double panneau**, séparation centrale. | Ouvrir deux dossiers, changer d’onglet, ajuster le partage, fermer puis reprendre. |
| UX-03 | **Affichages, tri et colonnes** : icônes d’affichage et de tri ; entêtes du mode Détails ; réglages des colonnes. | Passer de grandes icônes à liste/détails/colonnes, trier dans les deux sens et recharger. |
| UX-04 | **Filtres du dossier** : bouton à curseurs avant le champ de filtre. | Combiner nom/type/taille/date, replier sans perdre les critères, puis réinitialiser. |
| UX-05 | **Accueil, favoris et récents** : navigation **Accueil**, emplacements et ajout de favoris. | Épingler un dossier, le retrouver sans saisir son chemin, vérifier ce qui apparaît au redémarrage. |
| UX-06 | **Ce PC et capacité des lecteurs** : navigation ou palette **Ce PC** ; remontée depuis une racine. | Repérer l’espace disponible, ouvrir un lecteur, revenir à la liste et actualiser. |
| UX-07 | **Aperçu et détails** : bouton **Aperçu**, Espace et sélection d’un fichier. [Audit des 100 formats](APERCUS_100_FORMATS.md). | Alterner image/PDF/texte/média/dossier, agrandir le volet et vérifier les métadonnées sans perdre la sélection. |
| UX-08 | **Tags** : pastilles du clic droit, **Tags…**, navigation Tags et **Gérer les tags**. | Ajouter deux tags, les retirer, créer/renommer un nom et retrouver ses fichiers dans plusieurs dossiers. |
| UX-09 | **Personnalisation des dossiers** : clic droit ou palette **Personnaliser les dossiers**. | Choisir couleur/symbole, vérifier listes et favoris, puis réinitialiser. |

## Fichiers, recherche et organisation

| Repère | Outil et accès actuel | Petit essai à faire |
| --- | --- | --- |
| UX-10 | **Créer un dossier ou une note Markdown** : palette et menu du dossier. | Comprendre où le nouvel élément sera créé et le retrouver immédiatement. |
| UX-11 | **Copier et déplacer** : clic droit ou Ctrl+C/Ctrl+X puis Ctrl+V, double panneau et collecte. | Vérifier sources, destination et résultat d’un petit lot. |
| UX-12 | **Conflits et fusion de dossiers** : étape affichée lorsqu’une destination contient déjà un nom. | Comparer les versions, choisir ignorer/renommer/remplacer/fusionner selon le cas ; vérifier que la portée du choix est claire. |
| UX-13 | **Annuler un transfert** : **Activité → Vérifier l’annulation** sur un transfert éligible. | Comprendre le rapport avant confirmation et les cas où l’annulation est bloquée. |
| UX-14 | **Corbeille locale et restauration** : Suppr/clic droit, palette **Restaurer depuis la corbeille**. | Supprimer une copie puis la restaurer ; distinguer cette corbeille de celle de Windows. |
| UX-15 | **Renommage simple et par lot** : F2/clic droit ; palette **Renommer par lot**. | Essayer préfixe/remplacement/numérotation, utiliser la vérification avant application et lire les conflits. |
| UX-16 | **Recherche locale et index** : navigation Recherche locale, Ctrl+Maj+F ou palette. | Choisir le dossier, indexer, chercher un mot, comprendre les résultats et relancer après modification d’un fichier. |
| UX-17 | **Regroupements classiques** : **Regrouper les fichiers**, modes format, nom apparenté, mois, taille et origine web. | Choisir un périmètre, examiner les groupes, préparer un transfert et vérifier sa destination. |
| UX-18 | **Familles manuelles et relations enregistrées** : **Regrouper les fichiers → Relations enregistrées**, gestion des familles dans ce parcours. | Créer une famille, ajouter/retirer une référence, distinguer lien manuel et copie préparée. |
| UX-19 | **Destinations proposées** : **Regrouper les fichiers → Destination**. | Comprendre la proposition et ses éléments explicatifs, corriger le dossier puis examiner le transfert. |
| UX-20 | **Doublons et copies identiques** : palette **Rechercher les doublons** ; autre accès **Regrouper les fichiers → Copies identiques**. | Comparer les deux entrées, leur périmètre et leurs limites. Ce sont actuellement deux parcours distincts : ne pas supposer des résultats ou plafonds identiques. |
| UX-21 | **Images similaires** : **Regrouper les fichiers → Images similaires**. | Comparer les aperçus et comprendre que la ressemblance ne garantit pas des fichiers identiques. |
| UX-22 | **Espace disque — amélioré dans ce lot** : palette **Analyser l’espace disque**, résultat dans l’aperçu. | Agrandir, survoler les petits blocs, naviguer puis revenir au résultat ; vérifier les noms longs et le contraste. |

## Images, vidéo, PDF et archives

| Repère | Outil et accès actuel | Petit essai à faire |
| --- | --- | --- |
| UX-23 | **Conversion d’images** : sélection d’images puis **Convertir les fichiers**. | Choisir format/taille/qualité quand applicable, voir la sortie et retrouver les copies produites. |
| UX-24 | **Conversion de vidéos** : sélection de vidéos puis même convertisseur. | Partir d’un préréglage, vérifier conteneur/son/taille, ouvrir les réglages avancés seulement si besoin. |
| UX-25 | **Préréglages et recette conversion → ZIP** : convertisseur, préréglages personnels et option de recette. | Enregistrer un réglage, le réutiliser et comprendre les étapes ainsi que l’emplacement des résultats. |
| UX-26 | **Rotation d’images ou de vidéos** : aperçu ou **Actions rapides**. | Choisir le sens, lire le format de sortie et retrouver la copie sans modifier l’original. |
| UX-27 | **Annotation d’image** : une image compatible puis **Actions rapides → Annoter**. | Dessiner, ajouter du texte, annuler et enregistrer une copie ; essayer aussi au clavier. |
| UX-28 | **Annotation PDF** : un PDF puis **Annoter**. | Changer de page, annoter, enregistrer et rouvrir. Une annotation graphique ne supprime pas le texte situé dessous. |
| UX-29 | **Assemblage PDF** : sélection d’images/PDF puis **Créer un PDF** dans les actions rapides. | Réordonner, vérifier pages/destination/nom et ouvrir le document produit. |
| UX-30 | **Découpe audio ou vidéo** : un média puis **Actions rapides → Raccourcir**. | Régler début/fin avec les poignées, écouter/voir l’extrait et vérifier la copie finale. |
| UX-31 | **Création ZIP/7z** : palette **Créer une archive** ou menu de la sélection. | Choisir nom/destination/format, consulter les options avancées et retrouver l’archive. |
| UX-32 | **Extraction ZIP/7z/RAR** : archive sélectionnée, palette **Extraire une archive…**. | Examiner la destination et les conflits, extraire puis repérer le résultat. |
| UX-33 | **Écriture ou retrait de métadonnées** : palette **Modifier les métadonnées**. | Comprendre les champs concernés, la portée du lot et les effets avant confirmation. |
| UX-34 | **Empreinte d’un fichier** : clic droit **Calculer une empreinte**. | Choisir l’algorithme disponible, copier le résultat et vérifier une empreinte attendue. |
| UX-35 | **Activité, file et reprise** : navigation **Activité**, volet ajustable ; icône par type d’opération, y compris dans l’historique. | Suivre un traitement, l’arrêter, consulter une erreur et comprendre les possibilités de reprise. |

## Fichiers et navigateur

| Repère | Outil et accès actuel | Petit essai à faire |
| --- | --- | --- |
| UX-36 | **Collecte** : **Ajouter à la collecte** au clic droit et zone Collecte. | Réunir des fichiers de plusieurs dossiers, examiner la liste et retirer un élément. |
| UX-37 | **Utilisation sur un site** : glisser natif Windows depuis le panneau ; insertion dans un champ de fichiers choisi et historique. | Déposer un fichier sur un site compatible, puis essayer l’autre parcours sur un champ de fichiers. Distinguer dépôt, sélection du champ et envoi final du site. |
| UX-38 | **Préparation d’images pour le web** : palette ou panneau **Préparer des images pour le web**. | Régler format/dimensions/poids, comparer les copies et les utiliser sur une page. |
| UX-39 | **Capture web : texte, image, lien et Markdown** : panneau ou palette **Capturer une page web**. | Choisir le contenu, la destination et le format ; vérifier la source enregistrée. |
| UX-40 | **Capture d’une page en PDF** : palette **Capturer la page en PDF** et panneau. | Comprendre quelle page est capturée, choisir la sortie et retrouver le PDF. |
| UX-41 | **Téléchargements et rangement** : panneau ou palette **Ranger les téléchargements**, règles et historique. | Ranger manuellement, créer une règle puis distinguer règle enregistrée et activation automatique explicite. |
| UX-42 | **Espaces hybrides et tâches de projet** : palette **Enregistrer ou reprendre un espace**, sélecteur d’espace. | Associer dossiers/pages, reprendre un projet, gérer ses tâches, mettre à jour et exporter/importer. |
| UX-43 | **Session d’onglets et groupes Chrome** : palette **Sauvegarder les onglets et groupes**, ouverture du fichier `.session.json` pour restaurer. | Sauvegarder, comprendre les onglets qui seront rouverts et vérifier les groupes. |
| UX-44 | **Liens web liés aux dossiers** : panneau de liens du dossier ; capture d’un lien enrichi `.weblink`. | Ajouter un lien, le retrouver dans le bon dossier, l’ouvrir et retirer sa référence. |
| UX-45 | **Application, terminal, VS Code et Git** : clic droit **Ouvrir dans l’application**, palette terminal/VS Code/git status. | Vérifier le fichier/dossier transmis et comprendre une application ou un outil absent. |
| UX-46 | **Réglages et raccourcis** : bouton de réglages ou palette **Réglages et moteurs**. | Modifier thème/affichage/démarrage, changer un raccourci puis exporter/importer les préférences. |
| UX-47 | **Compagnon, moteurs et assistant Windows** : état de connexion, réglages des moteurs, assistant/diagnostic/réparation du paquet. | Sur une installation prévue pour le test, identifier ce qui manque et retrouver une action de correction compréhensible. La recette complète sur Windows vierge reste ouverte. |

## Comparaisons avec les logiciels existants

Ces références servent à comparer des parcours, pas à annoncer une parité de fonctionnalités. Leurs composants sont adaptés aux couleurs, états de focus et surfaces Material 3 de NextExplorer.

| Référence officielle | Principe utile pour notre revue |
| --- | --- |
| [Explorateur Windows : navigation et régions de l’interface](https://support.microsoft.com/en-us/accessibility/windows/use-a-screen-reader-to-explore-and-navigate-file-explorer-in-windows) | Séparer clairement navigation, fichiers et informations ; vérifier le passage au clavier entre ces zones. |
| [Dolphin : panneaux](https://docs.kde.org/stable_kf6/en/dolphin/dolphin/panels.html) | Garder l’aperçu et les informations à côté des fichiers. L’utilisateur doit pouvoir parcourir ses dossiers pendant qu’il examine un résultat. |
| [Finder : tags](https://support.apple.com/fr-fr/guide/mac-help/mchlp15236/mac) | Attribuer rapidement une couleur, permettre plusieurs tags et retrouver ensuite les éléments par tag. Le gestionnaire ne doit pas être un passage obligé. |
| [Finder : actions rapides](https://support.apple.com/fr-fr/guide/mac-help/mchl97ff9142/mac) | Montrer les actions adaptées à la sélection près de l’aperçu et dans son menu contextuel. |
| [WinDirStat](https://windirstat.net/index.html) | Associer carte de surfaces et liste pour lire l’espace utilisé. Chez WinDirStat les couleurs représentent les types ; chez nous elles distinguent les éléments, ce que la légende précise. |
| [PowerRename](https://learn.microsoft.com/en-us/windows/powertoys/powerrename) | Rendre l’avant/après et le périmètre d’un renommage compréhensibles avant application. Notre bouton de vérification actuel reste un point à tester. |
| [XnConvert](https://www.xnview.com/en/xnconvert/) | Distinguer fichiers d’entrée, transformations et sortie ; réutiliser des préréglages pour les traitements répétitifs. |
| [HandBrake : choix d’un préréglage](https://handbrake.fr/docs/en/latest/workflow/select-preset.html) | Commencer par un usage ou un préréglage adapté, puis donner accès aux réglages avancés. |
| [dupeGuru : démarrage](https://dupeguru.voltaicideas.net/help/en/quick_start.html) | Comparer référence et doublons, examiner les résultats puis marquer les éléments avant une action. Une ressemblance visuelle ne suffit pas à supprimer un fichier. |
| [7-Zip : questions fréquentes](https://www.7-zip.org/faq.html) | Employer des noms de formats et d’options explicites. Pour NextExplorer, mettre destination et nom avant les réglages de compression est une proposition de conception à vérifier avec vous. |

## Points repérés pour les prochains lots

Ces observations viennent de la lecture des interfaces ; **elles ne sont pas des refontes déjà livrées**.

1. **Recherche locale** : le choix du chemin reste très textuel, avec une étape d’indexation et des termes techniques visibles. Tester un choix de dossier visuel et une présentation progressive des options après l’intention de recherche.
2. **Regroupement** : neuf modes et plusieurs périmètres demandent beaucoup de lecture. Clarifier les intentions « former des groupes », « comparer des copies » et « choisir une destination », en conservant les contrôles avant transfert.
3. **Doublons** : l’analyse directe et le mode **Copies identiques** ont des limites différentes. Rendre cette différence visible ou revoir leur entrée commune après retour utilisateur.
4. **Espaces** : création, reprise, mise à jour, import et espace suivi cohabitent dans un parcours dense. Vérifier que l’état du projet et l’action principale se reconnaissent immédiatement.
5. **Téléchargements** : liste, règles et historique s’enchaînent verticalement. Mieux distinguer rangement manuel, automatisation active et erreurs à corriger si les essais le confirment.
6. **Résultats produits** : vérifier, outil par outil, la cohérence de la destination, du nom de sortie, de la progression et de l’accès au résultat. Plusieurs outils ont déjà un sélecteur visuel ; il faut tester le parcours complet avant d’en ajouter un autre.

Ordre proposé après UX-22 : **UX-01/03/07** (usage quotidien), **UX-15** (renommage), **UX-23/24** (conversion), **UX-17/20** (organisation), puis **UX-41/42** (navigation web et projets). Le retour utilisateur peut changer cet ordre.
