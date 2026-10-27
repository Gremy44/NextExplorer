# Installation simple des compagnons NextExplorer

**Sources du 24 octobre, sans nouvel EXE :** enregistrement corrigé pour préserver
les clés existantes et leurs permissions ; test dédié intégré à la recette.
Refus d’écriture et récupération après retrait partiel vérifiés avec le vrai
registre ; choix explicite de réparation vérifié. Mise à jour avec copie active
de 200 fichiers et récupération explicite d’une tâche interrompue réussies.
Le Setup 1.0.6 déjà généré reste inchangé et ne contient pas ce correctif.
[Rapport des sources et portée](VALIDATION_WINDOWS_NEUF.md).
Le véritable profil Windows accentué reste non qualifié : échec d’installation
de Windows dans la VM dédiée, avant tout lancement du produit. Les cas d’écriture,
de réparation ambiguë et de mise à jour active ciblés ont été exécutés avec les
sources et binaires existants ; le futur EXE corrigé reste à qualifier après build.

Décision de conception du 14 septembre 2026, suivi actualisé le 18 septembre. Ce document décrit l’installateur cible et distingue les briques déjà développées ci-dessous.

**État courant, 22 octobre 2026 :** préversion 1.0.3 publiée avec connexion guidée,
identité Store officielle et présentation des moteurs ; soumise au Chrome Web
Store, en attente d’examen avec publication automatique après approbation.
Le candidat local 1.0.6 a passé le parcours principal dans une VM Windows 11
isolée avec Chrome/Edge, compte standard, registre et Native Messaging réels :
[résultats et limites](VALIDATION_WINDOWS_NEUF.md). Le [kit de recette](RECETTE_INSTALLATEUR.md)
contient cet EXE exact. Cas complémentaires J1.7 et pilote utilisateur restent ouverts.
Le 24 octobre, la mise à jour au repos 1.0.3 → 1.0.6 a aussi réussi dans le même
profil Edge : sources/fichiers accentués, ancien runtime et préférences préservés.
Complément : conflit Edge étranger bloqué, désinstallations refusées sans altération
si le script manque ou échoue (`exit 42`), puis paquet réparé et connexion/lecture
réelles vérifiées dans Edge 156.0.4314.42.
Les points ci-dessous conservent l’historique de validation des briques.

**Périmètre actualisé le 9 octobre 2026 :** l'installateur sert les traitements de fichiers locaux et les parcours navigateur. J6 est retiré : aucun pack de clients cloud, FTP ou de nouvelles intégrations tierces à préparer. Les moteurs locaux nécessaires restent les seuls composants fonctionnels à distribuer selon les usages retenus.

## Avancement du jalon J1

- **J1.1 — Validé localement :** contrôle du protocole 1 à la connexion, avec instruction de mise à jour pour un compagnon ancien ou incompatible. HELLO conserve l’annonce des moteurs optionnels. Tests TypeScript et Go réussis ; recette du paquet final à faire.
- **J1.2 — Validé localement :** reconnexion à l’accueil, limitée à 4 tentatives HELLO de 5 secondes maximum, espacées de 2 secondes après échec. Arrêt sur incompatibilité, compteur visible et relance manuelle après épuisement. La fermeture de la vue annule les tentatives restantes ; les opérations de fichiers ne sont pas rejouées. Six tests dédiés réussis, compilation et test Chrome avec deux échecs simulés puis accès au vrai compagnon réussis. Le transport d’extension est adapté dans ce test ; installation réelle et paquet final restent à tester.
- **J1.3 — Validé localement :** le script installe sous `%LOCALAPPDATA%\Programs\NextExplorer`, avec un manifeste stable et une copie distincte par installation. Compagnon, politique de sécurité et moteurs présents sont copiés ; un paquet léger conserve les moteurs antérieurs. Tests de chemins accentués, déplacement du paquet source, HELLO réel, réinstallation, retour arrière sur échec d’enregistrement et retrait sélectif des enregistrements réussis. Le registre est simulé dans ces tests ; validation avec Chrome installé et machine propre restante. Les anciennes copies restent sur disque.
- **J1.4 — Validé localement :** `scripts/diagnose-host.ps1` contrôle la structure de l’installation et les enregistrements du navigateur choisi. Les erreurs proposent une action ; les moteurs optionnels absents restent informatifs. Rapport JSON sans chemins personnels, aucune modification et aucun lancement de programme. Tests de fichiers réels et registre simulé réussis, comprenant l’absence de modifications et de divulgation de chemins. La connexion et le protocole restent vérifiés dans l’extension.
- **J1.5 — Validé localement :** `repair-host.ps1` affiche l’aperçu puis applique les corrections avec `-Apply`. Sauvegarde locale, restauration d’un manifeste endommagé, récupération des moteurs sans choix implicite en cas d’ambiguïté, conservation des enregistrements étrangers et retour arrière sur échec. Tests de réparation et diagnostic réussis, avec fichiers réels, HELLO natif et registre simulé ; la recette Windows complète reste nécessaire.
- **J1.6 — Parcours principal validé sur Windows isolé :** `release/NextExplorer-1.0.6-Setup.exe`, assistant français par utilisateur, aperçu, licence et maintenance. Installation, réinstallation saine, réparation et désinstallation exécutées sous compte standard avec le vrai registre. EXE non signé ; extension chargée manuellement dans Chrome et Edge.
- **J1.7 — Recette principale réalisée, compléments ouverts :** [procédure](RECETTE_INSTALLATEUR.md), [rapport et preuves](VALIDATION_WINDOWS_NEUF.md). VM Windows 11, Chrome/Edge officiels, lecture réelle du témoin et reconnexion après fermeture ; annulations, entrée Windows et raccourcis contrôlés. Panneau natif Edge et conservation d’un enregistrement Chrome étranger vérifiés. `npm run setup:acceptance` prépare le kit versionné ; contrôleur avec `-Browser Edge`. Compte avec accents, mises à jour avec tâches actives/interrompues, défauts d’écriture et réparations ambiguës restent à qualifier ; signature et réputation de téléchargement sont distinctes.

## Solution retenue pour la première distribution

Une extension distribuée par sa boutique et **un seul installateur Windows**, regroupant le compagnon et la gestion des moteurs. Choix du propriétaire : aucune dépense de signature ; l’EXE reste non signé et cela est indiqué dans les téléchargements. Go et Node ne sont pas nécessaires à l’utilisation. Le paquet léger n’embarque pas les moteurs ; leur préparation reste avancée dans la préversion, expliquée dans les réglages et le guide public. La gestion intégrée des téléchargements de moteurs reste une amélioration future, pas un prérequis déclaré livré.

Le candidat 1.0.6 prépare la signature horodatée avec un certificat reconnu déjà
disponible, sans achat ni certificat autosigné. Aucun n’est présent sur le poste
de build : l’EXE reste non signé. [État, contrôles et piste MSIX gratuite](SIGNATURE_WINDOWS.md).

Choix technique proposé : **Inno Setup**, installation par utilisateur avec `PrivilegesRequired=lowest`, dans `%LOCALAPPDATA%\Programs\NextExplorer`. Il sait produire un EXE, gérer fichiers/registre et désinstallation ; vérifier les conditions commerciales de la version retenue et les intégrer au budget. Une installation sans élévation reste soumise aux politiques du PC. [Inno Setup](https://jrsoftware.org/isinfo.php), [droits d'installation](https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm).

Conserver Native Messaging : l'extension échange avec le compagnon sans port HTTP local. L'installateur écrit les manifestes et les clés de l'utilisateur courant ; le navigateur lance automatiquement le point d'entrée natif quand l'extension le contacte. [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

## Parcours utilisateur recommandé

1. **Ajouter NextExplorer au navigateur** depuis sa boutique ; l'utilisateur confirme l'ajout.
2. Le premier écran vérifie le compagnon. S'il manque : **« Activer l'accès à mes fichiers »**, avec une explication courte et le téléchargement de `NextExplorer-Setup.exe`.
3. L'utilisateur lance cet installateur une fois. Il installe les composants de base, enregistre la liaison et explique les éventuels téléchargements supplémentaires.
4. L'extension retrouve automatiquement le compagnon par une reconnexion bornée pendant l'accueil. Elle affiche **« Prêt »**, puis propose une première action utile. Aucun copier-coller d'identifiant ni redémarrage systématique du navigateur.

Variante depuis le site : lancer l'installateur, puis ouvrir la fiche de la boutique dans le navigateur choisi. L'ajout et sa confirmation restent effectués par l'utilisateur. Le produit doit fonctionner dans les deux ordres d'installation.

**Limite explicite :** Chrome exige une confirmation pour activer une extension, y compris avec les méthodes d'installation externes documentées. Ne pas promettre que l'EXE installera silencieusement une extension privée sur un PC grand public. La boutique et son acceptation sont des prérequis de distribution, distincts du travail local. [Méthodes Chrome](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions).

L'ouverture automatique du panneau latéral n'est pas une garantie : Chrome encadre cette ouverture par une action de l'utilisateur. Au besoin, le bouton de l'extension ou « Continuer » finalise l'accueil. [Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

## Paquets fonctionnels

| Composants | Distribution proposée | Ce que voit l'utilisateur |
| --- | --- | --- |
| Compagnon, configuration, réparation et désinstallation | Toujours installés | « Accès aux fichiers » |
| Images, métadonnées et archives | Pack de base recommandé, embarqué après vérification des licences et de la taille | « Images et archives prêtes » |
| FFmpeg et ffprobe | Téléchargement au premier besoin vidéo/audio ; option d'installation complète dès le départ | « Activer la conversion vidéo — taille du téléchargement » |
| Téléchargement de médias web | Module facultatif, activé pour un usage choisi ; périmètre et distribution à vérifier | Nom d'usage et limites, sans installation d'un outil séparé |
| Applications locales utilisées par les commandes existantes : application par défaut, terminal, Git status et VS Code | Utiliser les installations système existantes ; aucun nouveau pack d'intégrations tierces | « Ouvrir mon outil » ; aucune installation silencieuse d'application tierce |

Un paquet complet hors ligne du compagnon et des moteurs sera une option ultérieure. Il ne supprime pas le besoin d'installer l'extension via la méthode admise par le navigateur.

La promesse « un seul compagnon » concerne l'installation visible. Les moteurs peuvent rester des exécutables distincts privés du produit, lancés à la demande. Leurs versions ne doivent pas dépendre du PATH de l'utilisateur ; un moteur externe peut rester une option avancée explicite.

## Écarts concrets du projet actuel

- `scripts/install-host.ps1` copie le compagnon vers un emplacement stable et enregistre les chemins définitifs dans HKCU. L’assistant graphique réutilise la réparation via PowerShell en arrière-plan, sans console visible. La recette système complète reste à faire.
- L'identifiant de développement courant est `hefjoeegkokdcfpgffaelaanegakhlde`. Utiliser les IDs effectivement publiés et vérifier leur correspondance. Chrome et Edge peuvent avoir des IDs distincts ; `allowed_origins` doit contenir uniquement les éditions autorisées. [Documentation Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging).
- `setup-engines.ps1` recherche plusieurs versions `latest` et découvre un lien 7-Zip depuis une page HTML. Cela convient à un outil de préparation, pas à une chaîne de distribution reproductible.
- Pour plusieurs téléchargements, le script enregistre un SHA-256 sans disposer d'une valeur attendue indépendante. Calculer une empreinte après téléchargement ne suffit pas à authentifier la provenance.
- Les erreurs actuelles sont des messages de scripts ; remplacer ce parcours par un état lisible, une progression, une reprise et un bouton de réparation.

## Versionnement et téléchargement des moteurs

Préparer un catalogue de distribution validé : identifiant du composant, version précise, architecture, URL, taille, SHA-256 attendu, licence, dépendances et versions de protocole compatibles. Signer ce catalogue ou le distribuer dans un paquet signé avec une chaîne de confiance vérifiable. Une empreinte obtenue du même téléchargement non authentifié ne crée pas cette confiance.

Télécharger en zone temporaire, vérifier avant exécution/extraction, contrôler les chemins extraits, puis activer la version complète. Si la vérification échoue, garder l'ancienne version et proposer de réessayer. Les composants optionnels absents désactivent seulement leurs fonctions.

Conserver notices et obligations de redistribution des versions réellement utilisées, y compris les dépendances incluses dans les builds. La signature de notre installateur ne remplace pas ce travail. Point de départ : [THIRD_PARTY.md](THIRD_PARTY.md).

## Mises à jour et réparation

L'extension se met à jour via sa boutique. Le compagnon et ses moteurs ont leur propre mécanisme de mise à jour signé. Le navigateur ne gère pas ces applications natives. [Native Messaging Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging).

Prévoir un petit lanceur natif stable et des répertoires de versions. Au handshake : version du protocole, capacités et composants disponibles. Une extension récente doit tolérer la version précédente du compagnon pendant la transition, ou expliquer précisément la mise à jour requise.

Téléchargement en arrière-plan autorisé dans les préférences, installation au repos, puis test de santé. Ne pas remplacer un moteur utilisé par un transfert. Prévoir retour à la version précédente et migrations de données compatibles avec ce retour.

« Réparer NextExplorer » vérifie chemins, registre, origine autorisée, protocole et moteurs, puis restaure les éléments appartenant au produit. Un programme supprimé ou bloqué par Windows ne peut pas toujours s'autoréparer : proposer de relancer l'installateur signé. Ne pas demander de désactiver globalement l'antivirus. La signature réduit les ambiguïtés d'éditeur mais ne garantit pas l'absence d'alertes de réputation.

Les diagnostics envoyés au support doivent être prévisualisables et exclure les chemins sensibles, contenus, cookies et jetons. La désinstallation supprime uniquement composants et enregistrements appartenant à cette installation ; fichiers personnels, captures, corbeilles et réglages sont conservés par défaut.

## Tâches qui survivent au navigateur

Le processus natif actuel est lié à la connexion du navigateur. Deux capacités doivent être développées séparément :

- **Reprise après fermeture/redémarrage :** journal durable de jobs, identifiants stables, checkpoints et validation des sources/destinations avant reprise.
- **Continuation pendant la fermeture du navigateur :** worker natif utilisateur indépendant du point d'entrée Native Messaging, visible dans les réglages et la zone de notification pendant les tâches.

Architecture proposée pour J5 : extension → point d'entrée Native Messaging → canal nommé local protégé pour l'utilisateur → worker de tâches. Aucun service administrateur ni écoute TCP nécessaire par défaut. Prévoir instance unique, authentification de la liaison, droits d'accès, déconnexion et rattachement. Le journal ne doit pas être stocké uniquement dans le service worker du navigateur.

Les tâches web nécessitant une page active sont suspendues si cette page disparaît. Seules les opérations locales déjà autorisées peuvent continuer. Une mise à jour ou une seconde connexion ne doit jamais rejouer un déplacement déjà validé. Les tâches sensibles aux fichiers modifiés depuis l'arrêt passent par un écran de résolution.

## Contraintes web à intégrer dès la conception

L'API de téléchargement Chrome accepte pour son nom cible un chemin relatif au dossier Téléchargements, pas un chemin absolu arbitraire. Pour classer ailleurs : laisser le navigateur terminer, puis faire déplacer le résultat vérifié par le compagnon, sur instruction ou règle choisie. Un téléchargement natif direct est un autre parcours, qui ne doit pas récupérer indistinctement les cookies du navigateur. [API Downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads).

Native Messaging impose notamment une limite de 1 Mo par message du compagnon vers Chrome : transferts découpés, contrôle du débit et mémoire bornée. Cela ne garantit pas qu'un formulaire accepte un gros objet File. Tester séparément insertion, dépôt natif et fallback sélecteur ; aucune promesse de compatibilité avec tous les sites. [Protocole Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

## Recette d'installation avant bêta publique

- Machine Windows x64 propre, sans outils de développement ni moteurs ; compte utilisateur standard ; profils Chrome puis Edge distincts.
- Installation dans les deux ordres, second navigateur, réinstallation, changement d'ID de boutique contrôlé, chemins avec accents.
- Téléchargement interrompu, composant absent, archive corrompue, disque plein et version incompatible.
- Mise à jour avec tâche active, retour arrière et fermeture du navigateur.
- Désinstallation/réinstallation sans perte des fichiers ni retrait d'enregistrements appartenant à une autre installation.
- Objectif d'usage proposé : au moins 8 personnes non techniques sur 10 terminent seules ; aucune commande à copier, aucune console à utiliser, aucun chemin de moteur à saisir.

Windows ARM64, macOS et Linux demandent des paquets et recettes dédiés. Ne pas les déclarer pris en charge parce que l'outil d'installation ou le langage sait les cibler.
