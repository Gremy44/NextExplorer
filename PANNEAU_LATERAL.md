# Panneau latéral — espace d'action pendant la navigation

## Ouverture et hauteur — correctif local 1.0.6

Le clic sur l’icône et `Alt+E` ouvrent le panneau natif Chrome, à côté du site.
Chrome lui donne la hauteur disponible ; l’interface n’impose plus une hauteur
minimale de 440 px dans ce mode. Le style verre est conservé sur ses surfaces.

La superposition par iframe essayée en 1.0.5 est retirée à la suite d’un blocage
signalé dans Chrome. L’ouverture ne dépend plus d’une injection dans le site,
et les ressources de l’interface ne sont plus exposées aux pages HTTP(S).
Après mise à jour, rechargez l’extension et les pages où l’ancien panneau était
ouvert pour retirer ce conteneur. L’EXE et l’extension ont des mises à jour
distinctes : voir [les instructions](distribution/INSTALLATION.md).


## J5 — médias et activité, 17 octobre 2026

**Options → Regrouper les fichiers → Images similaires** complète les copies identiques, avec analyse native bornée et résultats indicatifs. Les TIFF admissibles ont un aperçu réduit ; les médias compatibles utilisent une lecture locale progressive. **Préréglages et recettes** reste replié dans les formulaires de conversion/préparation, et l’**Activité** conserve les tâches autorisées après fermeture de Chrome. Reprise après arrêt uniquement sur demande et aux étapes sûres. Mêmes fonctions en vue complète ; [guide J5 et limites](J5_MEDIAS_TACHES.md).

## J5/C2 — copies identiques, 17 octobre 2026

**Options → Regrouper les fichiers → Copies identiques** compare la sélection, le dossier ou les références de l’espace suivi par empreinte BLAKE3 complète. Progression et arrêt, cache en mémoire contrôlé avant réutilisation et motifs pour les fichiers non comparés ; aucun décodage d’image dans ce mode ni suppression automatique. Même mode dans l’explorateur complet, compagnon à jour requis. Voir [le guide C2 et ses limites](C2_COPIES_IDENTIQUES.md).

## J4 — organisation et recherche locales, 17 octobre 2026

**Prototype J4 validé localement : compilation, 176 tests TypeScript et recette J4 avec le compagnon réussis.** Recherche lexicale dans un dossier choisi et ses sous-dossiers, rapprochement de vocabulaire TF-IDF, règles de mots-clés, recherche commune fichiers/liens/espaces, tags multiples, tailles de dossiers et préférences exportables. Aucun modèle d’IA ajouté.

- **Recherche locale** ou **Ctrl+Maj+F** : index de 1 000 entrées / 100 dossiers / profondeur 8, extraits TXT/Markdown bornés, origine déclarée contrôlée pour 20 fichiers. Réindexation après changement, résultats périmés masqués, arrêt et effacement. PDF textuel : connecteur **pdftotext** optionnel, moteur absent du paquet et extraction réelle non validée ici ; aucun OCR.
- **Tags** : 32 tags colorés, 2 000 chemins, attribution/retrait par lots, filtre et tri ; les associations suivent les renommages et déplacements natifs réussis. Changements externes non réconciliés automatiquement.
- **Réglages et moteurs** : thème système/clair/sombre, couleurs, navigation/sélection, miniatures/extensions, colonnes et unités, affichages/tri par dossier, démarrage et accueil configurables, raccourcis contrôlés, menus et export/import explicite des préférences/tags/règles/vues. L’index et les fichiers sont exclus de cet export.
- **Tailles et grands dossiers** : totaux natifs disponibles dans les listes et leur tri ; calcul annulable via l’activité. Listes natives bornées avec avertissement et filtre par nom ; affichage Colonnes de dossiers en complément des huit modes précédents.

Voir [le guide J4 et ses limites](J4_ORGANISATION_RECHERCHE.md). **Suite : J5/C2**, puis J7 et seulement ensuite A0/A1. La recette Windows propre J1.7 reste ouverte.

## Historique avant J4 — palier C1, 17 octobre 2026

**Palier C1 du prototype validé localement.** Compilation, 161 tests et recettes navigateur/compagnon réussis. La recherche textuelle C3 et le reste de J4 viennent ensuite ; J1.7 sur Windows propre reste ouvert.

Dans **Regrouper les fichiers**, les sept choix sont **Format**, **Nom apparenté**, **Date de modification**, **Taille**, **Relations enregistrées**, **Destination proposée** et **Origine web**. Sélection, dossier courant ou références de l’espace suivi ; analyse explicite, non récursive et limites visibles.

- **Taille :** fichiers vides, moins de 1 Mio, 1 à moins de 10 Mio, 10 à moins de 100 Mio et 100 Mio ou plus. Taille de l’instantané ; valeurs invalides séparées, aucune preuve de doublon.
- **Familles manuelles :** sélectionnez de 2 à 20 fichiers puis **Familles enregistrées → Relier la sélection**, ou dépliez un groupe et choisissez **Enregistrer une famille**. Donnez un nom puis confirmez ; les métadonnées doivent toujours concorder avant stockage. 50 familles locales, noms distincts, données illisibles et modifications concurrentes refusées sans écraser les autres familles. **Retirer** enlève seulement le lien.
- **Relations enregistrées :** liens manuels et sources/copies des nouvelles préparations, y compris hors du dossier choisi. Les nouvelles préparations conservent les sources au lancement et les premières copies vérifiées ; les anciennes sans sources ne sont pas rattachées par déduction. Il s’agit du lien de la préparation entière, sans correspondance source/copie individuelle inventée. Jusqu’à 200 fichiers contrôlés et 1 000 références candidates ; références modifiées/absentes et non vérifiées séparées. Relance explicite, arrêt et réponses tardives ignorées ; les changements du suivi entre vues effacent les résultats périmés.
- **Créer une règle :** dans un groupe avec extension commune ou origine web commune contrôlée, ouvrez le brouillon H07 prérempli. Vérifiez nom, critères et dossier puis enregistrez. Aucun fichier déplacé, aucune règle enregistrée à l’ouverture ou après annulation. Règle manuelle par défaut ; l’automatisme garde son activation explicite et sa permission. Le brouillon manuel est utilisable sans permission Chrome downloads.

Les familles et liens de préparations restent dans ce profil, synchronisés entre ses vues ; ils ne font pas partie de l’export d’un espace. Les références enregistrent chemins, noms, taille et date ; elles ne suivent pas automatiquement les déplacements/renommages et ne prouvent pas le contenu. Aucun document/image ouvert par Taille ou Relations, aucun nouveau moteur, permission ou dépendance. Le TIFF de recette de 24 Mio reste sans décodage Chrome. Les limites des transferts confirmés et des JSON de provenance voisins non transférés restent celles des lots précédents.

**Rapprochements approximatifs :** Jaccard et Levenshtein mesurés sur 20 paires synthétiques ; tous les seuils essayés produisent des faux positifs. Ils ne sont pas proposés dans l’application. Voir [les résultats et la décision](EVALUATION_CLASSEMENT.md). Les noms normalisés exacts et les liens choisis restent disponibles ; aucune justesse sur un corpus personnel n’est annoncée.

## Groupes virtuels — 11 octobre 2026

**Options → Regrouper les fichiers…** ouvre le même dialogue que l’explorateur, depuis la sélection, le dossier courant ou les références collectées de l’espace suivi. Les groupes sont repliés, avec leur nom et nombre de fichiers ; en les ouvrant, on retrouve les motifs par extension, tailles et chemins. **Personnaliser** conserve les catégories dans ce profil et synchronise les vues, avec refus d’un brouillon dépassé par une autre sauvegarde.

Le choix **Regrouper par → Nom apparenté** ajoute le premier lot C1 : même nom après harmonisation des accents/casse/séparateurs et retrait de l’extension et des suffixes explicites de version/copie. Le motif s’affiche sous chaque famille ; **Sans rapprochement fiable** garde les noms trop génériques ou isolés. Les dates, numéros ordinaires et l’ordre des mots sont conservés. Deux mots minimum dont un terme autre que les mots génériques connus ; il ne s’agit ni d’une preuve de doublon ni d’un export confirmé. Passer entre Format, Nom, Date et Destination réutilise l’instantané ; un changement de source exige un nouveau clic sur Regrouper. Les catégories personnalisables restent propres au mode Format.

**Regrouper par → Date de modification** ajoute des groupes par mois/année, les plus récents en premier. Date locale de l’instantané affichée sous chaque fichier, dates invalides séparées. Aucun contenu lu ni date de création/prise de vue déduite ; un mois commun ne prouve pas une relation. La sélection, le dossier et les références d’espace utilisent le même dialogue.

**Destinations selon l’origine web (cinquième lot C1, 11 octobre 2026) :** dans **Destination proposée**, cochez **Tenir compte des origines web (.source.json)** puis **Regrouper**. Option décochée à l’ouverture, compagnon requis. Jusqu’à 20 fichiers contrôlés ; seuls les JSON voisins réguliers de 64 Kio maximum sont lus. Les règles actives H07 utilisent le domaine exact de l’origine déclarée et l’extension, avec leur priorité et leurs conflits habituels ; protocole et port ne distinguent pas ces règles. La règle retenue et l’adresse épurée sont visibles. Provenances absentes, invalides, trop lourdes ou fichiers non analysés restent sans destination dans ce mode ; désactivez l’option pour les règles d’extension seules. Aucun site visité, document/image lu ou fichier déplacé au regroupement.

Le transfert reste examiné puis confirmé, copie par défaut. Les métadonnées de provenance affichées sont relues et comparées avant le lancement ; une origine indisponible ou différente bloque tout le lot avant `FS_TRANSFER`, même si la destination est modifiée dans l’aperçu. Les contrôles habituels du fichier et du dossier restent actifs. Aucun automatisme ou règle créée/activée. Les JSON voisins ne suivent pas le transfert ; ces métadonnées déclaratives n’authentifient ni le site ni le contenu et ne verrouillent pas les fichiers. Changer l’option ou entrer/quitter un mode lisant la provenance exige une nouvelle analyse explicite.

**Destination proposée (quatrième lot C1, 11 octobre 2026) :** dans **Regrouper les fichiers**, choisissez ce mode puis **Regrouper**. Sans l’option d’origine web, il réutilise vos règles H07 actives par extension, sans critère de site, et affiche la règle sous chaque fichier. Les groupes **Règles en conflit**, **Déjà à destination** et **Sans destination proposée** restent sans action de transfert. Dossiers/liens et fichiers `.source.json` exclus, sans lecture de contenu ni déplacement au regroupement. **Gérer les règles** ouvre le rangement des téléchargements existant. Les changements de règles se synchronisent entre les vues ; aucune règle n’est créée ou activée par une suggestion.

Dans un groupe de **20 fichiers maximum**, **Examiner le transfert** ouvre la confirmation existante avec les chemins et la destination proposés, **copie par défaut** et conservation des deux noms en cas de collision. Destination, opération et conflits restent modifiables ; annuler ne modifie aucun fichier. À la confirmation, présence/type, nom, taille et date sont revérifiés pour tout le lot, ainsi que le dossier de destination ; un changement détecté empêche le lancement. Le transfert utilise le journal et les contrôles natifs J2 existants. Les métadonnées voisines `.source.json` ne sont pas incluses : leur association n’est pas maintenue après copie/déplacement. Les vérifications de métadonnées ne prouvent pas l’identité du contenu et ne verrouillent pas les fichiers pendant le transfert.

**Regrouper par → Origine web (.source.json)** utilise les provenances enregistrées, avec un nouveau clic sur **Regrouper** et le compagnon connecté. Chaque groupe expose le site déclaré, les sources épurées et les dates. Limite : 20 fichiers par analyse ; seuls les JSON voisins réguliers de 64 Kio maximum sont lus, après contrôle des métadonnées. Nom, taille déclarée et stabilité contrôlés, provenances invalides/absentes/incompatibles et fichiers non analysés séparés. Aucun site visité ou contenu de document/image ouvert. Les `.source.json` sont exclus des groupes ; entrer/quitter ce mode efface le résultat. Une provenance déclarée n’authentifie pas la source.

Premiers lots C0 et C1, sans déplacement au regroupement ou activer une règle H07. Dossiers/liens exclus et sous-dossiers non parcourus ; 1 000 entrées au maximum et vue partielle annoncée. Le dossier ignore la recherche et respecte le choix des fichiers cachés. Format/Nom/Date/Taille/Destination sans l’option origine ne lisent aucun contenu et ne revérifient pas les références de l’espace ; Origine et Destination avec cette option contrôlent leurs métadonnées sans modifier les références. Les contrôles et listes utilisent les surfaces Material 3 existantes, dans les deux thèmes ; le regroupement par contenu et la recherche commune C3 relèvent des lots suivants.

## Deux parcours complets — 10 octobre 2026

La [recette hybride](RECETTE_HYBRIDE.md) réunit les fonctionnalités du panneau : choisir des dossiers et collecter les pièces, enregistrer l’espace avec la page web, retrouver l’espace et la collecte au rechargement, choisir le champ, préparer une copie si nécessaire, puis insérer. Les parcours dossier administratif et projet d’images sont réussis dans la recette complète avec les autres fonctions, y compris le rangement automatique toutes vues fermées. J3 est validé dans ce périmètre du prototype ; J1.7 reste distinct.

Le serveur de test reçoit les contenus exacts uniquement après clic sur son bouton de validation. Cette preuve appartient à la recette, pas au suivi du produit : NextExplorer continue de distinguer champ rempli et réception par le site. La préparation conserve les originaux et la collecte ; un champ WebP reçoit la copie convertie sans devoir retirer le PNG original du projet. Contrôle des largeurs 320/390/1024 px et captures conservés dans `test-results/`.

## Retrouver les insertions — 10 octobre 2026

Dans **Collecte**, **Insertions récentes** reste replié. Date, site, champ et noms/tailles permettent de retrouver les 20 dernières tentatives ayant atteint l’insertion, même après fermeture ou rechargement. La vue complète propose le même suivi dans **Examiner la collecte**. Les états distinguent **Insérée dans le champ**, **Non insérée** et **Résultat à vérifier sur le site** ; aucune tentative n’est rejouée. Les insertions directes et celles des copies préparées passent par ce suivi commun.

Le remplissage du champ ne prouve pas la réception. Le site peut commencer un envoi dès les événements d’insertion. Seule l’origine du site est conservée, avec le libellé du champ et les noms/tailles ; aucun contenu de fichier, chemin local ou URL complète. Les plus anciennes entrées sortent du suivi au-delà de 20 tentatives. Retirer une entrée ou effacer le suivi conserve fichiers, collecte et formulaire, sans annuler un envoi. Le glisser-déposer Windows et les dépôts faits sur le site ne sont pas suivis. Un stockage illisible ou indisponible bloque avant mutation ; effacement du suivi sur clic seulement.

## Espace suivi à portée de clic — 9 octobre 2026

Une barre discrète **Espace suivi** affiche le projet et les tâches cochées. Cliquer ou appuyer sur Entrée ouvre ses tâches et place le focus sur leur résumé. Enregistrer ou reprendre un espace le choisit ; **Options → Espaces hybrides… → Suivre cet espace** permet de choisir le suivi sans ouvrir de dossiers ni de pages. L’import seul ne change pas ce choix. **Arrêter le suivi dans cette vue** conserve l’espace et ses tâches.

Le panneau et la vue complète mémorisent chacun leur choix, conservé au rechargement. Noms et avancement suivent les modifications partagées ; supprimer l’espace retire le suivi correspondant. Ce repère est un choix personnel : navigation et changements de collecte/pages n’actualisent pas l’espace enregistré. Utilisez **Actualiser…** pour les conserver. Les noms longs sont abrégés visuellement et restent complets dans le nom accessible du bouton.

## Suivi personnel par espace — 9 octobre 2026

Dans **Options → Espaces hybrides…**, **Tâches** reste replié sous chaque espace enregistré. Ajout d’un libellé, cases d’avancement et retrait explicites ; compteur de tâches cochées. 20 tâches distinctes de 160 caractères maximum par espace. Les modifications locales sont synchronisées avec la vue complète, conservées après fermeture/rechargement et incluses dans l’export/import. L’actualisation des dossiers/pages garde l’avancement ; une modification concurrente après son aperçu empêche de l’écraser. Une écriture de tâche refuse de réécrire une liste contenant un espace illisible ou des identités en double, plutôt que de les supprimer silencieusement.

Cocher indique seulement l’avancement déclaré par la personne, sans transmission ni confirmation de réception par le site. Aucun fichier, collecte, onglet ou page modifié au suivi. Les tâches sont associées à l’espace enregistré, avec choix explicite de l’espace suivi, sans détection automatique du site. Les brouillons non ajoutés ne sont pas conservés.

## Préparer pour le champ choisi — 9 octobre 2026

Dans **Collecte → Insérer dans un formulaire**, après repérage et choix du champ, **Préparer les images pour ce champ…** reprend les images cochées. Le dialogue existant montre le site, le champ et les formats déclarés, puis propose uniquement ses sorties JPEG (`.jpg`), PNG ou WebP compatibles. Pour un champ simple, une seule image est choisie avec des boutons radio ; les autres fichiers restent cochés dans la collecte.

Dimensions et poids restent saisis par l’utilisateur. La création et la reprise des copies restent locales. Une action séparée **Insérer les copies dans ce champ** revérifie toutes les copies et la destination ; elle remplace les pièces du champ, sans valider explicitement le formulaire. Le site peut démarrer un envoi lors de ses événements d’insertion. Refus sans remplacement si copie incompatible, absente ou modifiée, page/champ changé, nombre ou poids total excessif. Fermer le dialogue arrête les demandes de vérification/insertion encore en attente ; une insertion déjà déclenchée dans la page ne peut pas être retirée. Aucun ajout automatique à la collecte. Le champ et son URL ne sont pas conservés dans le suivi des préparations. Après fermeture, réanalyse du champ puis récupération explicite des copies. Les consignes propres au site et l’état de réception restent à vérifier manuellement.

## Vérifier la collecte — 9 octobre 2026

Dans **Collecte → Gérer**, **Vérifier les fichiers** contrôle sur demande la présence et les métadonnées des 200 premières références locales. Progression et arrêt accessibles, heure du contrôle, problèmes détaillés ; les autres références restent signalées comme non vérifiées. Aucun retrait automatique, aucune lecture des contenus ou visite des liens web. Les résultats s’effacent après changement de collecte, déconnexion ou fermeture du dialogue. Le même contrôle existe dans **Examiner** en pleine page ; il ne garantit pas les contenus, l’accès ultérieur, l’intérieur des dossiers ou les cibles symboliques. Voir [le parcours et les limites](README.md).

Validation : 74 tests TypeScript et parcours navigateur complet, arrêt avec réponse tardive ignorée et absence de lecture du contenu. Extension réelle avec référence absente, fichier modifié, TIFF 24 Mio, dossier présent, deux vues et références conservées. Résultats périmés effacés, largeurs 320/390/1024 px et retour en français revérifiés sur le build final ; capture `test-results/collection-check.png` inspectée.

## Espaces transportables — 9 octobre 2026

**Actualiser…** permet également de préparer un nouvel instantané depuis le panneau puis de le confirmer, avec aperçu des dossiers et des nombres de références avant/après. Le nom peut changer, l’identité reste la même. Les pages/groupes enregistrés restent conservés par défaut ; leur remplacement par ceux de la fenêtre est un choix explicite. Annulation sans stockage, aucun document modifié ni page ouverte/fermée. Un espace modifié ou supprimé dans une autre vue bloque la confirmation. La mise à jour reste manuelle, sans historique : exporter l’ancienne version permet de la garder.

Validation de l’actualisation : 70 tests TypeScript et recette complète de l’extension réelle. Aperçu/annulation sans stockage, pages conservées ou remplacées explicitement, conflits de noms et modification/suppression dans la seconde vue couverts. Formulaire contenu à 320/390/1024 px ; capture `test-results/space-update.png` inspectée.

Dans **Options du panneau → Espaces hybrides…**, **Exporter** et **Importer un espace…** restent dans le dialogue existant. L’import montre les dossiers et le nombre de références avant enregistrement ; son nom peut être modifié pour éviter les doublons. Il ajoute un instantané, sans remplacer un espace ni ouvrir de fichiers ou de pages. La reprise conserve son action distincte et son choix explicite pour les pages web. Fichier JSON limité à 2 Mio ; chemins et adresses web inclus, aucun document copié. Voir [le parcours détaillé](README.md).

Validation : 66 tests TypeScript et parcours navigateur ; export/import dans l’extension réelle, annulation, erreurs et synchronisation entre vues. Aperçu sans débordement à 320/390/1024 px. Capture `test-results/space-import.png` inspectée.

## Compléments J3 — 7 octobre 2026

Les fonctions restent accessibles à la demande : **Page → Plus d’actions** contient le rangement des téléchargements et **Préparer des images pour le web…**. Les règles de rangement sont repliées dans leur dialogue ; elles proposent une destination et offrent une option automatique à activer explicitement par règle. Cette option range les nouveaux téléchargements terminés, même panneau fermé, et conserve les deux fichiers en cas de conflit. Une modification demande de confirmer à nouveau l’option ; la désactivation met l’automatisme en pause. Le suivi signale les blocages sans déplacer le fichier ni rejouer un transfert déjà lancé. Le transfert confirmé mémorise facultativement la destination et expose les résultats dans le suivi et l’activité. La provenance du nom final est consultable dans l’aperçu.

**Options du panneau → Espaces hybrides…** enregistre dossiers, collecte et liens, avec inclusion facultative des pages/groupes. La reprise signale les références manquantes, fusionne la collecte et ouvre les pages seulement si leur option est cochée. La préparation d’images conserve les originaux, vérifie les copies contre les contraintes manuelles et laisse choisir celles à collecter. Aucun envoi ni IA automatiques. Voir [l’aide et les limites](README.md).

Validation : 55 tests TypeScript et parcours navigateur complet ; extension réelle avec rangement/provenance après collision, préparation JPEG 64 px sans modification de l’original, espaces persistants, références manquantes, reprise web/groupes explicitement cochée et dialogues à 320/390/1024 px. Captures `test-results/download-rules.png`, `prepare-images.png`, `hybrid-spaces.png`.

Décision de conception du 14 septembre 2026 : conserver le panneau comme axe prioritaire à valider. Il doit apporter une utilité propre pendant la navigation. La vue complète sert aux opérations demandant de la place ; le panneau relie la page courante aux fichiers et à l'espace de travail choisi.

## Parcours simplifié — 6 octobre 2026

### Choisir l’affichage des fichiers

Le menu **Affichage des fichiers**, près de la recherche, est commun au panneau et à l’explorateur complet. Cliquez sur son icône ou son libellé pour l’ouvrir ; chaque mode possède un pictogramme distinct et une coche indique le choix actif. Le mode courant et son icône restent visibles sur le bouton. Le menu flotte au-dessus du contenu et se repositionne pour rester dans la fenêtre.

| Mode | Présentation |
| --- | --- |
| Très grandes / grandes / moyennes icônes | Grille avec miniature ou icône, nom sur deux lignes et format/taille ; trois tailles distinctes |
| Petites icônes | Grille compacte de noms avec icônes de 18 px |
| Liste | Une ligne compacte par élément, avec nom et icône |
| Détails | Colonnes nom, date de modification et taille ; la date se masque dans le panneau étroit pour garder les noms et tailles lisibles |
| Mosaïques | Icône à gauche, nom et format/taille ; les raccourcis de sous-dossiers restent compacts dans le panneau |
| Contenu | Miniature à gauche, nom, format/taille et date de modification |

Le choix est conservé par onglet et par volet de l’explorateur ; le panneau Chrome possède ses propres préférences. Changer de mode conserve le dossier, les filtres, le tri et la sélection. Les anciennes préférences de grille migrent vers Icônes moyennes. Détails est le mode initial de l’explorateur, Mosaïques celui du panneau. Les grilles se réorganisent selon la place disponible ; dans l’explorateur, le clavier suit les lignes et colonnes et la sélection reste visible lors d’un redimensionnement.

Les miniatures utilisent les aperçus existants et ne se chargent que pour les éléments visibles ou proches de la zone affichée. Leurs lectures sont annulées et leurs images libérées lorsqu’ils sortent de cette zone. Les TIFF gardent une icône, sans lecture ou décodage automatiques ; les limites des médias et des extraits texte restent appliquées. La vue complète conserve la virtualisation des lignes, et le panneau ses limites de 200 dossiers et 200 fichiers. Les actions d’aperçu, de collecte et le glisser-déposer restent disponibles dans chaque mode. Dans le panneau, les miniatures servent à identifier le fichier ; les contrôles de lecture audio restent dans l’explorateur et l’aperçu.

Validation des affichages : 42 tests TypeScript réussis ; les huit modes vérifiés dans l’explorateur et le panneau à 390 et 1024 px, sans débordement horizontal. Sélection et navigation au clavier, migration et mémorisation après rechargement, indépendance panneau/page et miniature visible vérifiées. Extension réelle via Native Messaging et vrai glisser-déposer Windows réussis en Mosaïques, Grandes icônes et Petites icônes, dont un TIFF de 24 Mio. Captures `test-results/explorer-view-*.png` et `panel-view-*.png`.

### Trier les fichiers

Un second menu près de la recherche propose **Nom A–Z**, **Nom Z–A**, **Plus récents**, **Plus anciens**, **Plus volumineux** et **Plus petits**, avec pictogrammes et coche du choix actif. Il est disponible dans chaque affichage du panneau et de l’explorateur. Le tri utilise le compagnon existant, garde les dossiers avant les fichiers et conserve la sélection et les filtres. Le critère et le sens sont mémorisés par onglet et volet, indépendamment entre panneau et page. Dans Détails, cliquer une colonne change le critère ou inverse son sens ; la flèche visible correspond au tri actuel.

Les deux menus s’ouvrent au clic, Entrée, Espace ou flèche haut/bas. Le focus arrive sur le choix actif ; flèches et Début/Fin parcourent les choix, Entrée ou Espace confirme. Échap, Tab et clic extérieur ferment le menu sans modifier le choix. Échap et la confirmation rendent le focus au bouton ; un redimensionnement ou un défilement du contenu ferme le menu. Les actions de la liste restent accessibles.

Validation des menus : 42 tests TypeScript ; six tris réels en Grandes icônes dans Chrome, rechargement avec préférence conservée, clavier et sortie sans modification. Extension réelle à 320/390/1024 px : ouverture sur l’icône, pictogrammes, choix actif unique, menu contenu dans la fenêtre, Échap/focus et préférence du panneau indépendante. Vrai glisser-déposer Windows conservé. Captures `test-results/explorer-*-menu.png` et `companion-*-menu-*.png`.

### Navigation, largeur du panneau et filtres

Le dossier de travail et le sélecteur disposent d’une flèche **Dossier précédent**, d’une flèche **Dossier parent** et d’un chemin cliquable. Le retour reprend les emplacements visités, même après avoir remonté ou utilisé le chemin ; chaque historique conserve au plus 50 emplacements. **Alt + ←** permet aussi de revenir, **Alt + ↑** de remonter. Le dossier courant est un libellé sans action : le cliquer ne vide pas la liste ni la recherche. Les racines de lecteurs, les partages réseau et les chemins Unix sont préservés.

Le chemin se répartit sur les lignes disponibles. Un chemin profond défile dans une zone bornée à deux lignes ; le dossier courant reste visible lors d’une navigation ou d’un redimensionnement. Les noms longs sont tronqués uniquement quand la place manque, avec le chemin complet au survol. Les filtres, tuiles de dossiers et lignes de fichiers utilisent plusieurs colonnes quand le panneau s’élargit, puis reviennent à la disposition compacte quand il rétrécit. Le sélecteur suit aussi la largeur disponible, jusqu’à 960 px : accès rapides et sous-dossiers se répartissent en colonnes, avec une seule zone de défilement pour le contenu.

Validation des grandes largeurs : recette Chrome réussie à 320/390/520/760/1024/1440 px, puis retour à 390 px. La recette vérifie la largeur réelle du dialogue, les colonnes des fichiers et sous-dossiers, l’absence de débordement et le dossier courant visible lors du redimensionnement. Captures `test-results/companion-files-*.png`, `companion-filters-*.png` et `companion-folder-picker-*.png`, avec inspection des petites et grandes largeurs.

Dans **Fichiers**, **Filtres** est replié par défaut et indique le nombre de filtres actifs. Il contient **Type de fichier** (documents, images, vidéos, audio, archives, autres), **Afficher les fichiers cachés** et **Réinitialiser les filtres** ; le tri possède son menu directement près de la recherche. Documents inclut les textes, PDF, liens enregistrés et formats bureautiques usuels. Le filtre de nom reste directement visible et se combine au type ; filtrer par type laisse les dossiers disponibles pour naviguer. La réinitialisation efface les filtres et restaure le tri A–Z. L’option des fichiers cachés s’applique aussi au sélecteur de dossier.

Validation : 40 tests TypeScript réussis, notamment les racines de lecteurs, partages réseau et chemins Unix. Recette Chrome : historique, Alt + gauche, navigation par chemin, clic sur le dossier courant sans effacement, filtres combinés, document Office, tri par taille dans les deux sens, fichiers cachés dans le panneau et le sélecteur, puis réinitialisation. Contrôles et captures aux largeurs 320/390/520 px : pas de débordement horizontal et dossier courant visible après redimensionnement. Extension réelle via Native Messaging et vrai glisser-déposer Windows texte/TIFF de 24 Mio réussis. Captures `test-results/companion-filters-*.png`, `companion-files-*.png` et `companion-folder-picker-*.png`.

### Choisir son dossier et lire son contenu

**Changer** ouvre un sélecteur visuel dans le panneau. Documents, Bureau, Téléchargements et Mes fichiers ont des boutons directs ; favoris et disques restent accessibles sous leur propre bloc. Ouvrir un dossier affiche ses sous-dossiers ; la flèche permet de remonter. Le nom et le chemin du dossier parcouru restent visibles. **Choisir ce dossier** confirme la destination ; **Annuler** ou Échap ferme sans changer le dossier de travail et rend le focus au bouton d’ouverture. La recherche porte sur les noms des sous-dossiers. La saisie d’un chemin reste disponible sous **Saisir un chemin** et un emplacement inaccessible désactive la confirmation.

La liste principale sépare **Dossiers**, en tuiles, et **Fichiers**, en lignes avec format et taille. Quatre dossiers sont visibles au départ ; une action déplie les suivants pour laisser de la place aux fichiers. Une recherche affiche les dossiers correspondants. Le clic sur un dossier navigue ; sur un fichier, il ouvre l’aperçu. Les fichiers conservent leur **+** et le vrai glisser-déposer Windows.

Le sélecteur utilise le même compagnon et les mêmes lectures de dossier que l’explorateur, sans nouveau composant natif ni nouvelle permission. Limites d’affichage : 200 dossiers et 200 fichiers par groupe ; le sélecteur montre au plus 200 sous-dossiers depuis une lecture bornée à 500 entrées, triée avec les dossiers d’abord. La recherche affine la liste avant cette limite. Les dossiers cachés sont visibles lorsque l’option correspondante est activée dans Filtres.

Validation : 39 tests TypeScript réussis ; recette navigateur avec navigation, confirmation, annulation, retour du focus, chemin invalide, dossier vide et recherche de sous-dossiers. Captures à 320, 390 et 520 px sans débordement. Extension Chrome réelle : navigation et confirmation via Native Messaging. Vrai panneau Windows : texte et TIFF de 24 Mio, dépôts successifs et Échap toujours vérifiés.

### Les trois vues

La nouvelle organisation remplace les vues Capturer / Retrouver / Envoyer. Le panneau accompagne une action courte à côté du site : trouver un fichier, garder une référence ou réutiliser sa collecte.

| Vue | Action immédiate | Fonctions à la demande |
| --- | --- | --- |
| **Fichiers**, ouverte par défaut | Rechercher, ouvrir un dossier, choisir l’affichage ou le tri, consulter un aperçu ou glisser directement un fichier sur le site | **Changer** ouvre le sélecteur visuel ; flèches et chemin permettent de naviguer ; **Filtres** regroupe type et fichiers cachés ; le **+** garde un fichier dans la collecte |
| **Page** | **Garder cette page**, **Capturer la sélection**, déposer une image/un lien/du texte depuis le site | **Plus d’actions** contient le PDF, le lien enregistré dans le dossier, les téléchargements et les notes |
| **Collecte** | Retrouver les fichiers et références gardés entre les sites, glisser un fichier, consulter ou retirer un élément | **Gérer** ouvre les listes enregistrées et les outils existants ; **Insérer dans un formulaire** révèle le choix des fichiers, de la page cible et du champ |

Parcours le plus court : ouvrir le panneau → rechercher un fichier si nécessaire → glisser son nom sur le site. Pas de collecte obligatoire ni de case à cocher pour ce geste. Les cases restent réservées à l’insertion par champ, où les choix et les limites doivent être explicites.

Principes de lisibilité : une seule zone de défilement, navigation toujours visible, dossier sur une ligne compacte, nom de fichier à 14 px et informations secondaires à 12 px. Le titre du site apparaît dans Page et la cible du formulaire dans son bloc d’insertion. La collecte ne duplique plus sa liste sous chaque vue. Les messages se placent en bas du panneau et peuvent être fermés ; une capture à confirmer reste accessible depuis toutes les vues.

**Agrandir** conserve le comportement d’ouverture en pleine page sur le dossier courant puis de fermeture du panneau. Le menu **Options du panneau** rassemble recherche de commandes, thème et réglages. La connexion garde une action principale et replie son aide technique. Les onglets sont utilisables au clavier avec les flèches et Début/Fin, avec un focus visible. Les surfaces, couleurs et formes réutilisent les tokens Material 3 existants, en clair et en sombre.

Adaptation web des recommandations [Googlebook](https://developer.android.com/googlebook) pour les interactions de bureau et des [onglets Material 3](https://m3.material.io/components/tabs/overview). Ce panneau reste une extension Chrome, sans composants Android ajoutés.

Validation de cette refonte : 39 tests TypeScript réussis, parcours navigateur réussis à 320, 390 et 520 px sans débordement horizontal ; navigation clavier, menu Options et Échap, retour en haut des vues, thème clair/sombre, collecte partagée, capture, choix du champ et invalidation de destination vérifiés. Extension Chrome réelle : image, PDF, provenance et rangement des téléchargements vérifiés via Native Messaging. Vrai panneau Chrome : texte complet et TIFF de 24 Mio reçus par glissement Windows, trois dépôts successifs, Échap et sources conservées. Captures dans `test-results/companion-files-*.png`, `explorer-tabs-sidepanel.png`, `explorer-light.png` et `companion-real.png`. L’évaluation avec des utilisateurs non spécialistes reste à mener ; aucune certification d’accessibilité ou de facilité d’utilisation n’est déduite des tests techniques.

## Première interface dédiée — 4 octobre 2026

L’organisation initiale affichait la page HTTP(S) active de sa fenêtre et conserve le dossier choisi pendant les changements d'onglet. Trois actions remplaçaient les onglets et le double panneau de l’explorateur (libellés désormais remplacés ci-dessus) :

- **Capturer** : ajouter la page à la collecte, capturer le texte sélectionné avec confirmation, enregistrer la page ouverte en PDF après choix du dossier, enregistrer un lien enrichi, déposer une image/un lien/du texte avec les dialogues existants ou écrire une note. Les images HTTP(S) peuvent aussi être capturées par clic droit, avec brouillon persistant et confirmation.
- **Retrouver** : changer de dossier par chemin, favoris ou racines ; filtrer ses fichiers, afficher les plus récents, consulter un aperçu et ajouter les pièces à la collecte. La liste compacte affiche au plus 200 résultats ; le filtre permet d'affiner un grand dossier.
- **Téléchargements depuis Capturer** : consulter les 20 derniers téléchargements après autorisation optionnelle et ranger un fichier terminé dans un dossier choisi. Le dialogue de transfert montre la source, la destination et le choix de collision. Les éléments en cours ou interrompus restent visibles sans action de rangement ; le rangement automatique des nouveaux fichiers terminés nécessite l’activation explicite d’une règle.
- **Envoyer** : cocher les fichiers de la collecte, repérer les champs de téléversement du document principal, choisir explicitement un champ et insérer les fichiers. Les règles `accept` et le nombre autorisé sont affichés et contrôlés ; une incompatibilité explique pourquoi le bouton est désactivé. Limites : 20 fichiers ordinaires et 20 Mo au total ; dossiers, liens web et liens symboliques restent dans la collecte. Le poids réel est revérifié avec le compagnon avant lecture, même si la taille collectée est périmée. L'acceptation par le site n'est pas garantie.

La collecte et les listes enregistrées restent communes à la page complète et au panneau. Un changement de page ou un rechargement invalide le choix du formulaire ; une nouvelle analyse est nécessaire. L'insertion vérifie l'onglet, son URL, le document et les propriétés du champ avant lecture puis avant insertion. Une modification détectée de la taille/date d'un fichier pendant la préparation annule l'insertion. Les formulaires à l'intérieur de cadres ne sont pas parcourus dans cette version. Le format et le type MIME sont déduits du nom, sans vérification du contenu ; un MIME inconnu ne permet pas de confirmer une contrainte MIME du site. L'action réussie déclenche les événements `input` et `change` du site : celui-ci peut réagir à la sélection des fichiers selon son propre fonctionnement. Un refus préalable conserve le contenu du champ et ne déclenche pas ces événements.

**Ouvrir en pleine page** ouvre le dossier en cours, en conservant les onglets déjà enregistrés de la vue complète, puis ferme le panneau. La fermeture utilise [`sidePanel.close`](https://developer.chrome.com/docs/extensions/reference/api/sidePanel#method-close) lorsqu'elle est disponible, avec repli sur la fermeture de la fenêtre du panneau pour les anciennes versions. Sans compagnon connecté, la collecte de liens reste disponible et les opérations locales sont désactivées avec une action de reconnexion.

Validation : tests navigateur à 390 px avec un vrai compagnon local ; capture de sélection, choix entre deux champs, insertion et contenu des fichiers, invalidation du formulaire, transmission du dossier et fermeture. Une copie isolée de l'extension donne préalablement accès au site de recette local pour vérifier l'injection réelle dans Chrome sans automatiser le dialogue de permission. Les usages avancés et les propositions IA ci-dessous restent à construire.

## Complément IA locale — conception du 18 septembre 2026

La [stratégie IA locale](STRATEGIE_IA_LOCALE.md) prolonge S01 avec une liste de pièces extraite des consignes et des suggestions sourcées, S02 avec le classement expliqué, S03 avec une synthèse de l'espace. Ces propositions ne sont pas implémentées. Les parcours manuels restent utilisables sans modèle ; le panneau affiche les sources, les omissions et l'aperçu des actions avant application.

## Trois usages prioritaires pour J3

### S01 — Préparer les fichiers demandés par une page

Exemple : une démarche en ligne demande un justificatif et une photo. Le panneau garde ces pièces à portée de main, affiche leur taille et permet de préparer les formats disponibles avant insertion.

Parcours : choisir les fichiers → préparer une copie si nécessaire → vérifier la destination → insérer dans le champ choisi. Une liste de pièces attendues peut être renseignée manuellement ; les contraintes HTML explicites peuvent aider lorsqu'elles sont accessibles. Ne pas supposer qu'un site expose toutes ses règles ni qu'un fichier sera accepté parce que son extension correspond.

Briques existantes : collecte, conversions et insertion explicite, limitée à 20 fichiers et 20 Mo au total. La première interface dédiée permet le choix des fichiers et du champ, contrôle les formats HTML déclarés, signale l'insertion et les erreurs de destination. À construire : états persistants « sélectionné », « préparé », « inséré », préréglages et prise en charge des refus spécifiques aux sites. « Inséré » ne signifie ni envoyé ni accepté par le serveur. L'utilisateur garde la validation finale du formulaire. La compression PDF n'est pas une capacité à déduire de la compression d'images existante.

### S02 — Collecter au fil des sites sans perdre le contexte

Exemple : préparer un voyage en passant entre plusieurs sites. Le panneau conserve un espace « Voyage » avec documents, images, liens, extraits et notes. Chaque capture garde sa provenance exploitable et peut être classée dans le dossier choisi.

Parcours : sélectionner une ressource sur la page → l'ajouter au panier ou l'enregistrer → continuer la navigation avec la collection visible. Un clic droit « Ajouter à NextExplorer » et une action sur la sélection sont à prévoir. Ne pas enregistrer toute une page ou ses données privées pour une simple citation sélectionnée.

Briques existantes : captures, notes, liens enrichis, collecte et liens épinglés. À construire : collection homogène, origine des fichiers, annotation reliée à la source et rangement des téléchargements terminés. Une ressource inaccessible doit rester un lien accompagné d'un état clair, pas une capture prétendument complète.

### S03 — Garder un espace de travail à côté de la page

Exemple : candidater à plusieurs offres en gardant CV, variantes de lettre, annonces sauvegardées et notes visibles. L'espace conserve les références utiles pendant les changements d'onglet et peut être rouvert plus tard.

Parcours : choisir ou épingler un espace → consulter ses ressources et sa petite liste de tâches → préparer les fichiers adaptés à la page → enregistrer l'avancement. Les tâches cochées sont des indications de l'utilisateur, pas une preuve de dépôt sur un site.

Briques livrées : espaces nommés réunissant dossiers/affichages/collecte/liens, pages/groupes web facultatifs, reprise choisie, export/import et actualisation manuelle. Liste de tâches personnelle par espace, cases synchronisées, avancement conservé et transporté par l’export/import. Barre d’espace suivi, choisi et mémorisé indépendamment dans le panneau et la vue complète, avec accès direct aux tâches. Aperçu des fichiers existant. Aucun suivi implicite des pages ou des fichiers. Pas besoin d’IA ou d’identification automatique du métier pour cette version.

## Fonctions complémentaires, après validation des trois usages

| ID | Fonction proposée | Valeur du panneau / jalon |
| --- | --- | --- |
| S04 | Téléchargement terminé : « Ranger dans cet espace », renommer, consulter la source | Décision immédiate à côté de la page d'origine ; J3 avec H07/H08. Pas de fenêtre surgissante à chaque fichier. |
| S05 | Recherche dans l'espace : fichiers, captures et liens, avec aperçu compact | Consulter une référence tout en gardant le site visible ; J4 avec H10. |
| S06 | Notes et comparaison manuelle de ressources collectées | Conserver ses critères et sources en passant d'une annonce ou d'un produit à l'autre ; après J3. Toute extraction automatique de prix/détails demanderait une recette séparée. |
| S07 | Suivi des préparations en cours et récupération du résultat | J3 : Préparations récentes dans le dialogue existant, destination/contraintes/chemins connus conservés, récupération et revalidation explicites sans nouvelle conversion ni collecte automatique. 20 préparations ; retrait sans supprimer les copies ou arrêter la tâche. J5 conserve la reprise durable des traitements. |
| S08 | Recettes enregistrées par l'utilisateur | Répéter « convertir ces images puis les ajouter au panier » ; J5. Une recette n'autorise pas à téléverser ou soumettre à n'importe quel site. |

## Organisation de l’interface

La disposition actuelle est décrite dans **Parcours simplifié** ci-dessus. Les vues **Fichiers / Page / Collecte** séparent les trois usages ; la collecte conserve le même modèle de données que la vue complète. Les outils avancés de gestion de fichiers et les listes enregistrées restent disponibles depuis la vue complète, la palette de commandes ou **Gérer**.

Les propositions S01–S08 décrivent les prolongements du produit ; leur présence dans ce document ne signifie pas qu’elles sont toutes implémentées.

## Contexte prévisible

- L'espace peut être **épinglé** pendant que l'utilisateur change de site. Un changement d'onglet ne remplace ni les fichiers sélectionnés ni les notes.
- La page cible suit l'onglet actif de la fenêtre concernée ; un envoi est lié à une destination précise. Si la page, le champ ou l'origine change pendant la préparation, suspendre l'insertion et faire choisir à nouveau la destination.
- Une association mémorisée site/espace peut proposer un espace, jamais déplacer des fichiers ou envoyer des pièces sans action prévue par l'utilisateur.
- Les fenêtres et profils ont des contextes distincts. Une même collection peut être accessible volontairement sans partager silencieusement leur destination d'envoi.
- Le panneau s'ouvre sur demande et se ferme sans effacer l'espace. Il doit aussi afficher un état utile quand le compagnon manque ou qu'une page ne permet aucune interaction.

Chrome permet un panneau persistant entre onglets ou lié à certains onglets/sites. Son ouverture programmée est encadrée par une interaction utilisateur. Prévoir une mise en œuvre compatible avec la version minimale annoncée et tester Edge séparément. [API Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

L'accès à la page reste soumis aux permissions. `activeTab` apporte un accès temporaire après invocation ; une navigation vers une autre origine ne conserve pas automatiquement ce droit. Évaluer les autorisations à chaque action, notamment dans les cadres intégrés. [Permission activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

Le site ne doit jamais pouvoir transformer son contenu ou ses messages en commandes sur le disque. Les contenus capturés sont des données, les commandes proviennent de l'interface NextExplorer. Les détails d'API et d'outils restent hors du parcours utilisateur courant.

## Validation : mériter sa place

En J0, prototyper S01 et S02 avant les fonctions secondaires. En J3, comparer trois méthodes sur les mêmes tâches avec ordre alterné : habitudes de la personne, NextExplorer en vue complète, NextExplorer en panneau. Observer changements de fenêtre, temps, erreurs de destination et besoin d'assistance, sur petits et grands écrans.

Critères de décision proposés pour 10 testeurs non spécialistes : au moins 8 terminent seuls deux scénarios, au moins 6 préfèrent le panneau pour un usage répété et au moins 5 le réutilisent volontairement la semaine suivante. Aucun incident non résolu d'envoi vers une mauvaise cible. Ces seuils sont des règles de travail, pas une preuve statistique.

Si le panneau n'apporte pas de bénéfice observable après deux itérations ciblées, réduire ses fonctions ou le retirer du parcours principal. Conserver les données et usages hybrides en vue complète. La décision de retrait porte sur la surface, pas sur l'abandon de l'atout web/local du projet.
