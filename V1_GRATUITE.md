# Finalisation de la V1 gratuite

Périmètre retenu le 28 octobre 2026 : consolider les outils existants avant les nouvelles pistes et l’IA locale. Aucun paiement ajouté à cette phase.

- [x] **1 — Recherche locale.** Index de travail élargi, noms seuls ou extraits, pagination des résultats, worker de recherche, progression et périmètre explicites, contrôle de fraîcheur par lots et conservation du cache. [Guide](J4_ORGANISATION_RECHERCHE.md).
- [x] **2 — Aperçus et gros fichiers.** Corpus courant qualifié, gros TIFF natif avec arrêt réel, PDF bornés par page en worker, progression, refus explicites et relance. [Formats et limites vérifiés](APERCUS_V1.md).
- [x] **3 — Protection du travail.** Brouillons texte conservés localement après fermeture, reprise et téléchargement visibles, variantes entre fenêtres, conflits et quotas signalés ; versions et corbeille restaurées sans écrasement. [Guide et qualification](PROTECTION_TRAVAIL_V1.md).
- [x] **4 — Parcours principaux.** Déplacer/dupliquer, corbeille/restauration, atelier et conversion qualifiés dans l’extension compilée ; rangement de téléchargements réel et dépôt Windows depuis le panneau latéral vérifiés. [Recettes et limites](PARCOURS_V1.md).
- [x] **5 — Cohérence de l’interface.** Actions contextuelles, renommage simple/par lot, recherche des réglages, textes adaptables, aides clavier et palette hors ligne corrigés ; thèmes, densités et petits écrans qualifiés. [Corrections et recette](COHERENCE_UI_V1.md).

Ensuite : paquet final cohérent, reconstruction de l’installateur au moment choisi, recette du nouveau paquet sur Windows neuf et pilote de 5 à 10 utilisateurs. La recette de l’ancien EXE ne qualifie pas les changements récents. Les connexions distantes restent facultatives ; [les essais sur serveur utilisateur et FTP/FTPS externes](DOSSIERS_DISTANTS.md) sont encore ouverts.

## Distribution pilote — 1.0.7 publiée le 29 octobre 2026

- [x] Extension et compagnon 1.0.7 reconstruits ensemble ; paquet public limité aux fichiers autorisés, notices et guides.
- [x] Nouvel installateur non signé construit depuis ce paquet. L’écran final explique le chargement manuel et le dossier à sélectionner.
- [x] Recette du candidat exact sous Windows 11 isolé, compte standard : Chrome et Edge, annulation, installation, connexion/lecture, réinstallation, réparation et retrait. Reconnexion Chrome, fichier témoin et enregistrement Chrome étranger préservés.
- [x] [Préversion publique](https://github.com/Gremy44/NextExplorer-Downloads/releases/tag/v1.0.7-pilot.1), quatre fichiers et empreintes téléchargés anonymement et comparés ; guides accessibles sur le tag.
- [x] [Parcours de test et modèle de retour](distribution/TESTER.md) fournis, tickets publics demandant de retirer les données personnelles.
- [ ] Pilote externe : 5 à 10 utilisateurs, retours et corrections avant promotion en version stable.

La VM réutilise un Windows de recette : NextExplorer est absent au début de chaque parcours et les anciens artefacts sont archivés. Cela ne constitue pas une réinstallation complète de Windows. [Preuves, empreinte du nouvel EXE et limites](VALIDATION_WINDOWS_NEUF.md). La réputation SmartScreen d’un téléchargement public, les profils Windows accentués et toutes les configurations de sécurité ne sont pas qualifiés. Aucun contournement de protection n’est requis pour le pilote.

## Point 1 — périmètre et preuves

- Index : 50 000 entrées, 5 000 dossiers, profondeur 64, métadonnées de références de 32 Mio et texte cumulé de 16 777 216 caractères maximum. Les extraits restent limités à 8 192 caractères par fichier.
- Listes de recherche du nouveau compagnon : 50 000 entrées / 32 Mio, pagination native ; lecture native de 200 000 noms maximum par dossier. Les limites de navigation restent distinctes.
- Pas de lecture de contenu ou de provenance en mode noms seuls. Pas d’OCR ni de recherche par sens. Les résultats partiels et les fichiers non extraits sont identifiés.
- Essai navigateur avec le compagnon réel : 11 121 fichiers, plus de 100 dossiers, profondeur 14, nom après 10 000 fichiers, pages de résultats, noms composés/fragments/accents, cachés, extraits, TF-IDF en worker, modification hors dossier surveillé et largeurs 320/390/1440 px.
- Tests unitaires : 50 000 références synthétiques avec limite visible, budgets, pagination native tronquée ou bloquée, profondeur 64, contrôle de fraîcheur par lots et cache hors périmètre refusé. Ce n’est pas une mesure sur un disque réel de plusieurs millions de fichiers.

Les preuves détaillées et captures restent dans `test-results`. Le Setup n’est pas reconstruit pour ce lot.

Validation finale : **274 tests TypeScript**, suite Go complète, compilation et vérification du paquet réussies. Le parcours d’organisation existant passe également, avec 1 003 fichiers désormais tous indexés et 478 événements UI pendant ses 7,8 secondes d’essai synthétique ; ce chiffre n’est pas une promesse de performance sur d’autres dossiers. Arrêt sans remplacement du cache précédent, réouverture avec revalidation sans lecture de contenu, choix visuel du dossier et effacement vérifiés dans le parcours dédié.

Le compagnon du paquet a été installé sur ce PC et son empreinte vérifiée. Les processus déjà connectés n’ont pas été arrêtés : terminer les tâches, désactiver l’extension une minute puis la réactiver pour renouveler la connexion, et recharger l’extension construite depuis `release/NextExplorer/dist`.

## Point 2 — validation finale

**281 tests TypeScript**, suite Go complète, compilation et paquet vérifiés. Corpus réel de consultation : onze extensions d’image, quatre formats de polices, texte/Markdown/liens, PDF multipages et de 17 Mio, extraits Office, ZIP/7z, médias et MP4 de 512 Mio. TIFF de 137,3 Mio réduit puis arrêté/relancé dans le compagnon. Les fichiers contrôlés sont inchangés ; les erreurs, refus et plafonds ont un message.

Le parcours de la vraie extension confirme le worker PDF sous sa CSP et sa libération à la fermeture. Les régressions de l’éditeur/polices passent. Le compagnon du lot est installé avec empreinte vérifiée ; le Setup est inchangé. [Qualification détaillée et limites restantes](APERCUS_V1.md).

## Point 3 — validation finale, 29 octobre 2026

**288 tests unitaires dans 48 fichiers**, suite Go complète et compilation réussis. Fermeture réelle/réouverture de pages vérifiées dans Chrome avec compagnon réel et dans l’extension compilée sous Native Messaging. Téléchargement exact Unicode, conflits même taille/date et fichier supprimé, BOM/CRLF, deux fenêtres sans perte de variante, simulation de quota, limites du stockage, anciennes versions restaurées sans remplacer les copies existantes et récupération à 320/390/1440 px. Régressions de l’édition/aperçu et de la corbeille réussies, dont refus de restauration sur une destination occupée et restauration après rechargement.

Le paquet local est actualisé. Le compagnon déjà installé du point 2 suffit : seules son interface et les vérifications ont changé dans ce lot. Aucun Setup reconstruit, aucune publication. [Périmètre, stockage local et limites de récupération](PROTECTION_TRAVAIL_V1.md).

## Point 4 — validation finale, 29 octobre 2026

**288 tests unitaires / 48 fichiers**, suite Go complète et parcours de la vraie extension réussis. Transferts par glisser-déposer, collisions, annulation, sélection multiple, corbeille/restauration après rechargement et destination occupée, exports de l’atelier, lots image/vidéo et WebM réel sans agrandissement : les résultats ont été contrôlés sur disque. Organisation J4 : 1 003 fichiers tous indexés, 257 événements UI sur 4 248 ms pour ce corpus synthétique.

Rangement de vrais téléchargements Chrome : annulation manuelle sans effet, déplacement avec collision conservée, activation explicite de règle automatique, traitement avec toutes les vues fermées, provenance, ancien téléchargement intact, pause et destination absente. La permission facultative est préaccordée uniquement dans le manifeste de test isolé.

Geste Windows vérifié depuis le vrai panneau latéral : réception de texte exacte et d’un fichier de 24 Mio, trois dépôts successifs, Échap, collecte vide, source intacte et permission `debugger` absente. Le site témoin est local ; les restrictions des sites tiers restent applicables.

Recettes ciblées ajoutées et recette du convertisseur corrigée pour suivre sa propre nouvelle tâche. Aucun changement fonctionnel requis dans ce lot, aucun compagnon à réinstaller, aucun Setup reconstruit ni publication. [Relancer les essais et connaître leurs limites](PARCOURS_V1.md). Ce lot est complété par le point 5 ci-dessous.

## Point 5 — validation finale, 29 octobre 2026

**292 tests unitaires / 49 fichiers**, compilation, recette dédiée dans l’extension compilée et régressions d’ergonomie/disposition/menu/console réussis. Les réglages se recherchent sans accents et par plusieurs mots ; les actions suivent la sélection, le renommage simple est distingué du lot, les textes d’interface de la console suivent le réglage général et la palette respecte la déconnexion au clavier. Une aide ne disparaît plus à cause du défilement du focus et les noms des boutons restent corrects lorsque les infobulles sont désactivées.

Thèmes clair/sombre, densités et textes 85/150 %, menus et réglages à 320/390/900/1440 px, réglages du panneau latéral sur petites hauteurs, console réelle et interface distante avec réseau simulé contrôlés. [Matrice, corrections et limites](COHERENCE_UI_V1.md). Aucune source Go modifiée ni réinstallation du compagnon requise. Le paquet local est actualisé ; le Setup et les publications restent inchangés.

**Les cinq points de consolidation sont terminés.** La clôture de distribution reste à faire : paquet/Setup final, recette de ce candidat sur Windows neuf et pilote de 5 à 10 utilisateurs. Les cases d’essai utilisateur des anciennes checklists restent ouvertes jusqu’à leurs retours.
