# Distribution — lancer le gratuit, puis activer Pro

## Décision et publication gratuite du 19 octobre 2026

L’utilisateur choisit de ne payer ni signature ni service de distribution. Code applicatif privé ; [dépôt public](https://github.com/Gremy44/NextExplorer-Downloads) avec présentation, licence gratuite, confidentialité, guide, visuels et retours. [Préversion technique 1.0.1](https://github.com/Gremy44/NextExplorer-Downloads/releases/tag/v1.0.1) téléchargeable sans compte : installateur non signé, extension manuelle, notices et SHA256. Les archives automatiques « Source code » contiennent le dépôt documentaire.

Utilisation gratuite personnelle/professionnelle de la version reçue ; aucune licence open source sur les éléments propres à NextExplorer. Les tiers gardent leurs droits. Le Pro futur reste distinct. Aucun changement de visibilité du dépôt source, achat ou abonnement effectué.

Cette publication vise des essais sur fichiers fictifs. La recette Windows propre reste ouverte ; elle ne vaut ni J1.7 validé, ni bêta sur des données personnelles. Le Chrome Web Store reste le canal cible ; son identité et l’installation simplifiée viennent ensuite. La signature payante proposée dans le plan antérieur n’est pas retenue.

## Avancement du 19 octobre 2026

Le propriétaire confirme posséder un compte développeur Chrome Web Store. La [préparation J7.1](store/README.md) livre le ZIP séparé, les contrôles d’intégrité/versions, les textes et visuels. Aucun brouillon téléversé et aucune publication effectuée. La clé/ID du futur élément, l’identité publique/contact et les URLs de téléchargement/confidentialité restent à renseigner ; le raccordement natif et l’installation simplifiée viennent ensuite. Les frais d’un nouveau compte ne sont donc pas une action à lancer ici.

Stratégie retenue par l’utilisateur le 18 octobre 2026 et à conserver pour les prochaines sessions, fondée sur le code et les documentations officielles consultées à cette date. Objectif : **terminer rapidement la mise en place de la distribution gratuite**, en conservant une base maintenable pour le payant. Aucun compte éditeur, achat, hébergement ou envoi au Store n’a été effectué.

## Orientation retenue

**Un produit, une fiche Chrome Web Store, deux composants techniques :**

- **Extension gratuite** distribuée et mise à jour par le Chrome Web Store.
- **Compagnon Windows** installé séparément depuis une page officielle HTTPS, avec notre assistant existant simplifié.
- **Pro plus tard dans cette même extension**, via achat externe et licence ; pas de seconde extension ou de réinstallation pour devenir client.

Première cible proposée : Windows 11 x64, Chrome stable et interface française. Élargir ensuite les systèmes et navigateurs après qualification ; le fait que le code possède des adaptations ne suffit pas à annoncer leur prise en charge.

« Boucler le gratuit » signifie stabiliser installation, mises à jour et assistance. **L’offre gratuite reste disponible après l’arrivée de Pro** ; son entretien continue.

## Le Chrome Web Store est-il compatible avec notre EXE ?

Oui, l’architecture extension + programme local correspond au mécanisme documenté de [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging). Sous Windows, le compagnon doit être installé et enregistré dans le système ; le paquet de l’extension ne réalise pas cette installation à sa place.

Le ZIP destiné au Store contiendra l’extension construite depuis `dist/`, avec ses ressources et notices. Notre EXE, ses moteurs et les documents de développement ne sont pas le paquet de l’extension. Le compagnon sera téléchargé depuis notre propre page.

Attention à une confusion dans les règles : la restriction sur un exécutable obligatoire figure dans la section des anciennes [Chrome Apps](https://developer.chrome.com/docs/webstore/program-policies/chrome-apps), pas dans une interdiction générale de Native Messaging pour les extensions. Cela ne garantit pas l’acceptation de NextExplorer : sa description, ses permissions, son fonctionnement et sa distribution seront examinés.

Le produit doit proposer une utilité réelle dans le navigateur et une finalité compréhensible : **organiser et préparer ses fichiers locaux pour travailler avec ses pages web**. Notre interface complète, ses opérations et son panneau en constituent le produit ; la fiche ne doit pas se limiter à lancer un installateur. Les fonctions et permissions doivent rester cohérentes avec cette finalité. [Règles de qualité du Store](https://developer.chrome.com/docs/webstore/program-policies/policies).

## Peut-on se passer de l’EXE ?

| Option | Possibilité | Conséquence pour NextExplorer | Choix proposé |
| --- | --- | --- | --- |
| Store + compagnon actuel | Architecture officiellement prévue. | Réutilise les opérations natives, traitements isolés et protections existantes. Deux installations à expliquer. | **Premier lancement.** |
| Navigateur seul | Accès à des fichiers/dossiers choisis par l’utilisateur via File System Access ; traitements compatibles dans le navigateur. | Nouveau moteur d’accès aux fichiers ; fonctions Windows et outils natifs à remplacer, limiter ou retirer. | Éventuelle version légère ultérieure. |
| ZIP portable ou script | Peut distribuer un programme sans assistant classique. | Il reste un programme natif à enregistrer et à maintenir ; ne supprime pas les contraintes du navigateur. | N’améliore pas le parcours grand public initial. |
| MSI/MSIX ou Microsoft Store pour le compagnon | Autre méthode de distribution native à étudier. | Ne supprime pas le programme local ; emballage, mises à jour et liaison Native Messaging à qualifier. | À réexaminer après les premiers retours. |

[File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) autorise des lectures/écritures après choix et permission utilisateur, avec des dossiers restreints. Le déplacement natif de répertoires n’y offre pas les mêmes possibilités que notre compagnon. Notre analyse : elle conviendrait à un explorateur limité aux dossiers accordés, mais ne remplace pas directement notre accès Windows, nos processus de traitement et notre glissement Shell.

**Recommandation : conserver le compagnon et réduire la friction de son installation.** Remplacer sa technologie maintenant retarderait la distribution tout en créant un second comportement à maintenir.

## Parcours d’installation cible

1. La page et la fiche annoncent avant installation : **extension Chrome + compagnon Windows nécessaires pour les fonctions locales**. Afficher également les moteurs facultatifs et leurs usages.
2. L’utilisateur choisit **Ajouter à Chrome** dans le Store.
3. Au premier lancement, NextExplorer détecte la connexion. Si le compagnon manque, un écran court explique son rôle et propose **Télécharger le compagnon Windows**.
4. L’assistant installe pour le compte utilisateur, avec l’identifiant du Store déjà configuré. Aucun chemin technique, identifiant d’extension ou terminal à renseigner dans le parcours normal.
5. Après installation, retour au panneau : contrôle de connexion, puis choix d’un premier dossier et tâche simple. Le bouton de nouvelle vérification reste accessible si la détection automatique n’a pas abouti.

L’extension ne tente pas d’installer silencieusement le programme. Sur Windows, les installations grand public de l’extension passent normalement par le Store avec confirmation de l’utilisateur. [Méthodes de distribution Chrome](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions).

### Écart avec notre paquet actuel

- L’assistant est déjà construit avec privilèges utilisateur et enregistrement HKCU. Il demande encore un identifiant et propose des options de réparation techniques ; le parcours Store devra préconfigurer ces éléments.
- Le flux de développement demande encore de charger `dist` manuellement. Il restera réservé au développement, sans mode développeur dans le parcours distribué.
- Le paquet léger ne contient pas ImageMagick, FFmpeg, ExifTool ou 7-Zip. **Les fonctions qui en dépendent ne doivent pas sembler incluses dans une installation où ils manquent.**
- Pour le premier lot, proposer une installation explicite des outils nécessaires aux aperçus images mis en avant ; les autres moteurs seront proposés au premier usage correspondant. Réutiliser les téléchargements vérifiés existants derrière une interface simple. Choisir entre téléchargement guidé et moteur embarqué après vérification de la distribution retenue ; éviter d’ajouter tous les moteurs au téléchargement initial.
- L’EXE reste non signé à la demande de l’utilisateur, qui refuse une solution payante. Cette limite est annoncée sur les téléchargements ; Windows peut avertir ou bloquer le lancement. J1.7 sur Windows propre reste ouvert avant bêta utilisateur. Aucun contournement des protections n’est prévu. [Documentation Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Un premier lot de distribution, avec une fin précise

Ces cinq lots détaillent **J7 et la clôture de J1.7** ; ils ne créent pas une nouvelle série de fonctionnalités produit. Les objectifs de testeurs ci-dessous sont proposés, pas déjà atteints.

| Lot | Livrable concret | Critère de sortie |
| --- | --- | --- |
| 1 — Identité et paquet Store | ZIP de l’extension séparé du kit Windows ; version de publication explicite ; profil éditeur ; brouillon de fiche. | Identifiant du Store récupéré et recoupé avec le manifeste natif et l’installateur. Compte développeur et frais d’inscription vérifiés par le propriétaire. |
| 2 — Installation compréhensible | Écran de première ouverture, assistant préconfiguré, moteurs présentés par besoin, page téléchargement/aide/confidentialité. | Une personne suit le parcours sans code, identifiant ni mode développeur. Une tâche annoncée comme disponible fonctionne avec les moteurs installés. |
| 3 — Installation propre et maintenance | J1.7 exécuté : connexion, réinstallation, réparation, désinstallation ; premier parcours mise à jour/retour à une version compatible. | Preuves sur Windows propre, conservation des fichiers et préférences, erreurs expliquées ; téléchargement/signature examinés dans les conditions réelles. |
| 4 — Bêta gratuite contrôlée | Même fiche publiée en privé pour 5 à 10 testeurs ; page et binaire identifiables. | Objectif : cinq nouvelles installations consécutives sans assistance, première tâche réussie et une mise à jour réellement testée ; aucun blocage critique de données non résolu. |
| 5 — Ouverture publique | Corriger les obstacles du pilote, publier les limites et ouvrir la même fiche au public. | Installation et support reproductibles, versions/archive disponibles, réaction prévue à un incident. L’infrastructure de distribution gratuite est alors considérée en place. |

Le Store distingue **privé** (testeurs autorisés), **non répertorié** (toute personne possédant l’URL) et **public**. Je recommande privé puis public ; non répertorié reste une option si un lien librement partageable est souhaité. Toutes ces visibilités suivent les mêmes règles et le même système d’examen. [Modes de distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).

Créer d’abord le brouillon permet d’obtenir la clé publique et de vérifier l’identité stable de l’extension. Ne pas supposer que l’identifiant de notre copie de développement sera celui attribué au nouvel élément du Store. [Procédure officielle](https://developer.chrome.com/docs/extensions/reference/manifest/key).

Pour conserver un premier lot court : nouveaux formats d’aperçu, nouvelles fonctions IA et refonte exhaustive des 47 parcours restent hors de sa réalisation. Les corrections bloquantes des fonctionnalités déjà annoncées y restent incluses.

## Gérer correctement les versions dès le départ

- **Une seule publication de référence** : un numéro, un ZIP Store, un installateur immuable, une empreinte et une note de version. Garder la correspondance extension/compagnon/protocole dans les preuves de chaque release. Le `1.0.0` actuellement fixe dans plusieurs fichiers doit devenir un vrai numéro de release, pas être réutilisé à chaque publication.
- **Extension** : mises à jour via le Store ; compatibilité avec les compagnons encore installés, fonctionnalités détectées et message de mise à jour utile si nécessaire. Ne pas exiger une mise à jour native pour une simple correction de présentation.
- **Compagnon** : téléchargement et réinstallation explicites pour le premier lancement. Version visible et archive de la précédente release. Pas d’auto-updater maison à construire pour sortir le gratuit ; documenter l’arrêt des traitements avant remplacement du worker.
- **Retour arrière** : le Store propose un retour à la version précédente sous un nouveau numéro. Cela ne restaure ni le compagnon ni les données : tester leur compatibilité et conserver les schémas nécessaires. [Rollback du Store](https://developer.chrome.com/docs/webstore/rollback).
- **Hébergement** : page HTTPS stable et fichiers de téléchargement accessibles aux testeurs sans accès à notre dépôt privé. Le code source GitHub peut rester privé ; une pièce jointe à une release privée ne convient pas à un téléchargement public sans authentification.
- **Assistance initiale** : une adresse de contact, un guide court et un rapport de diagnostic partageable après examen. Mesurer manuellement les installations réussies et le temps d’assistance ; ne pas ajouter de collecte de noms, chemins ou contenus de fichiers.

Cette gestion représente notre proposition d’exploitation, pas des mécanismes de mise à jour déjà développés. L’examen du Store peut prendre de quelques jours à plusieurs semaines ; sa durée n’est pas une échéance que nous maîtrisons. [Processus d’examen](https://developer.chrome.com/docs/webstore/review-process).

## Gratuit maintenant, Pro ensuite

| Élément | Lancement gratuit | Après validation d’A0/A1 |
| --- | --- | --- |
| Extension et compagnon | Installation gratuite, sans compte NextExplorer. | Même installation et même fiche. |
| Fonctions classiques livrées | Conservées gratuitement, avec limites annoncées. | Restent disponibles ; pas de retrait pour forcer l’achat. |
| IA locale | Non annoncée comme disponible. | Essai explicite puis licence du pack réellement validé. |
| Paiement | Aucun système de paiement à construire pour la bêta gratuite. | Paiement hébergé chez un prestataire externe ; activation Pro dans le produit. |
| Données | Traitement local ; communications vers les sites choisis et téléchargements expliqués. | Aucun fichier, nom de fichier ou historique envoyé au prestataire de paiement. Usage local après activation selon le mécanisme de licence retenu. |

Conserver l’hypothèse commerciale existante : un seul pack Pro, achat unique de la version acquise, 12 mois d’évolutions, essai de 14 jours à compter de la première analyse IA réussie. Prix de travail **49 €**, non validé commercialement ; ne pas annoncer de vente ou encaisser avant valeur mesurée et parcours commercial prêt. Ces hypothèses sont précisées dans [le plan économique](PLAN_RENTABILISATION.md).

Pour la vente, le Chrome Web Store reste le canal d’installation de l’extension. Le paiement et la licence seront externes, avec offre, vendeur et remboursement clairement présentés. [Règles Chrome sur les paiements](https://developer.chrome.com/docs/webstore/program-policies/accepting-payment). L’ancien système de paiement du Store a été abandonné ; [annonce officielle archivée de Google](https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md).

Choisir un prestataire qui évite de créer une boutique et un serveur de licences complets. [Lemon Squeezy](https://docs.lemonsqueezy.com/help/licensing) fournit par exemple des clés et une API : candidat à examiner avant B2, sans engagement ici. Son adéquation au vendeur, ses conditions, ses coûts et le comportement hors ligne restent à vérifier. Ne pas confondre une clé obtenue par API et une preuve signée vérifiable hors ligne ; ne jamais inclure un secret marchand dans l’extension. Une vérification initiale sur Internet n’implique pas le transfert du contenu des fichiers.

## Dossier nécessaire à la soumission

Préparer une description honnête, des captures du produit livré, des instructions de test reproductibles et un téléchargement du compagnon accessible à l’examinateur. Expliquer les fonctions nécessitant un moteur et fournir un petit jeu de fichiers synthétiques. Vérifier les permissions obligatoires et facultatives du manifeste, dont `nativeMessaging`, `tabs`, `debugger`, `downloads` et les accès aux sites, avec un usage précis pour chacune.

Publier une politique de confidentialité qui décrit aussi le traitement local, les captures/insertions et les téléchargements ; « les données restent locales » ne dispense pas de cette déclaration. [FAQ officielle sur les données](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq). Préparer l’identité et les coordonnées d’éditeur demandées par le tableau de bord. Le [compte développeur](https://developer.chrome.com/docs/webstore/register) nécessite une inscription et des frais uniques ; leur montant et les informations demandées seront vérifiés lors de la création effective.

Conserver les notices des composants redistribués et examiner les conditions du compilateur Inno Setup et des moteurs retenus. L’éditeur d’[Inno Setup](https://jrsoftware.org/isinfo.php) publie ses conditions et demande aux utilisateurs commerciaux une licence commerciale ; ce document ne transforme pas cette demande en achat automatique ni en conclusion juridique sur notre usage précis.

## Prochaine étape à la reprise

Commencer par **le lot 1 : préparer le paquet Store et le dossier de soumission**, avec page/parcours d’installation conçus au lot 2. L’obtention de l’identifiant définitif via le compte du propriétaire précédera le raccordement de l’installateur de distribution. Clôturer J1.7 avant l’essai sur les fichiers personnels des testeurs.

À ce stade : aucune garantie d’acceptation du Store, aucune publication et aucun prestataire acheté. Le lancement gratuit reste soumis à l’installation propre et à la résolution des blocages constatés pendant le pilote.
