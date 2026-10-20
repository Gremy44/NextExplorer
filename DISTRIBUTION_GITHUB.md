# Distribution gratuite GitHub

Décision validée le 19 octobre 2026 : aucune signature payante, aucun hébergement
ou abonnement acheté. Code applicatif privé ; dépôt public de documentation,
téléchargements et retours. La licence permet l’utilisation gratuite des binaires
sans placer les éléments propres à NextExplorer sous licence open source.

## Liens publiés

- Dépôt public : https://github.com/Gremy44/NextExplorer-Downloads
- Préversion 1.0.1 : https://github.com/Gremy44/NextExplorer-Downloads/releases/tag/v1.0.1
- Confidentialité : https://github.com/Gremy44/NextExplorer-Downloads/blob/main/CONFIDENTIALITE.md
- Assistance : https://github.com/Gremy44/NextExplorer-Downloads/issues/new/choose

Le code applicatif reste dans le dépôt privé existant. Le dépôt public contient
uniquement des documents et des visuels ; aucun historique ni source du dépôt privé
n’y a été poussé. Les archives « Source code » de GitHub sont les archives de ce
dépôt documentaire.

## Paquet public

La release contient quatre fichiers : installateur Windows versionné, extension
en ZIP, notices complètes et `SHA256SUMS.txt`. EXE non signé, essais sur fichiers
fictifs uniquement ; J1.7 reste ouvert. Le numéro de version est issu de
`package.json`, les versions déjà publiées ne doivent pas être remplacées.

Les ressources sont dérivées du ZIP Store audité, puis la clé publique de
développement est rétablie dans la copie de distribution manuelle pour conserver
l’ID attendu par le compagnon. Cette clé n’est pas un secret. Les cartes de
sources, fichiers internes, outils téléchargés et documents de recette ne sont
pas placés dans le paquet public. Le JavaScript nécessaire au navigateur et les
scripts d’installation restent naturellement présents dans le logiciel livré.

## Préparer une prochaine version

1. Augmenter `package.json`/`package-lock.json` sans réutiliser une release publiée.
2. Exécuter `npm run check`, les recettes adaptées, puis `npm run package:store`.
3. Exécuter `node scripts/prepare-distribution.mjs`. Le script produit un payload
   dans `release/distribution/<version>/payload-…/windows`, un dossier public
   documentaire et le ZIP de l’extension manuelle. Une version déjà préparée est
   protégée contre l’écrasement.
4. Lire le chemin `payload` dans `prepared.json`, puis construire l’EXE avec
   `scripts/build-setup.ps1 -PackageRoot <payload> -OutputRoot <dossier-version>`.
5. Exécuter `node scripts/verify-distribution.mjs` : inventaire exact, empreintes,
   licences, cohérence d’ID, notices et fichiers à téléverser dans `assets.json`.
6. Mettre à jour seulement les fichiers documentaires prévus du dépôt public.
   Créer une release en brouillon, joindre les quatre fichiers vérifiés, puis
   publier comme préversion tant que J1.7 et la bêta ne sont pas validés.
7. Relire les téléchargements sans authentification et comparer les SHA256 avant
   de partager le lien. Ne jamais publier le ZIP du kit de développement.

L’authentification GitHub utilise le gestionnaire de credentials existant ; aucun
jeton n’est enregistré dans les scripts, fichiers distribués ou dépôt public.
La publication du 19 octobre est tracée dans `github-state.json` et les preuves
locales ignorées par Git. Aucun compte payant ni GitHub Actions ajouté.

## Validation du 19 octobre

233 tests TypeScript, typage, build, tests du paquet Store et recette de
l’extension/compagnon installé réussis. Payload de 269 fichiers contrôlé ; carte
de sources injectée et document altéré rejetés. Aperçu du backend d’installation
effectué sur le payload public sans appliquer d’installation. Les quatre assets
publiés ont été téléchargés sans compte et comparés en taille/SHA256 ; documents
et captures accessibles. Dépôt source confirmé privé avant/après publication.

Preuves locales : `test-results/public-distribution-anonymous.json`,
`verify-public-distribution.log`, `publish-public-distribution.log`,
`extension-public-distribution.log`, `public-setup-preview.txt`.

La vraie installation sur Windows propre et l’identité Chrome Web Store restent
à valider ; cette publication n’annonce ni version stable, ni IA, ni Pro livré.

## Présentation publique enrichie — 19 octobre 2026

Le README public présente les usages navigateur : dépôt natif depuis le vrai
panneau latéral, collecte et formulaires, explorateur à onglets/double panneau,
console dans le dossier actif et espaces hybrides. Le nouveau
`distribution/FONCTIONNALITES.md` détaille aussi tags, recherche, regroupements,
aperçus, actions rapides, médias, archives, activité et réglages, avec leurs limites.

Six captures réelles sont conservées dans `distribution/images/` : cinq en
1920 × 1080 et une fenêtre Chrome avec panneau en 1920 × 1111. Projet fictif
dans les Documents publics ; aucune donnée personnelle ni réponse d’agent
inventée. Codex CLI 0.163.0 a réellement été ouvert dans le dossier de code,
sans envoyer de demande au modèle. Outil externe, configuration/coût séparés.

Régénération locale :

- `node scripts/console-extension-test.mjs --installed --presentation` : UI issue
  du ZIP Store existant, aperçus/console et parcours complet du terminal.
- `node scripts/test-native-file-drag.mjs --presentation` : vrai panneau Chrome,
  geste Windows, site témoin local sans téléversement et capture de sa fenêtre.
- `node scripts/test-native-file-drag.mjs` : régression complète, TIFF de 24 Mio,
  dépôts successifs, Échap, sources conservées et permission debugger absente.

Ces parcours ont réussi. `prepare-distribution.mjs` reprend désormais le guide et
les six visuels canoniques pour une prochaine version ; les images Store restent
distinctes. Le contenu de la release 1.0.1 et ses inventaires sont conservés.

Publication documentaire : commit public
`e130d65cb0d9646751a4604a337d5130b5b78b5c`. Les huit fichiers modifiés/ajoutés
ont été relus sans authentification et comparés en SHA256. Les autres fichiers
publics et les assets de release sont inchangés ; le dépôt source est toujours privé.
Preuves : `test-results/public-presentation.json`, `presentation.log`,
`presentation-drag.json`, `presentation-drag-regression.log`.

### Suite du projet rendue publique

Le README et le guide distinguent désormais les évolutions envisagées : IA
locale facultative (classement documents/images et recherche par sens), refonte
progressive du design/ergonomie dans la continuité de Material 3, et extension
des aperçus à partir de l’audit des 100 formats. Aucun calendrier, modèle,
tarif ou support universel promis ; qualification gratuite et installation
Windows propre prioritaires. Ces ajouts documentaires ne développent pas ces fonctions.

Commit public `76e4b0bdb1875e658512fcd087f150f51c6a04f8` : seuls les deux
documents ont changé, relus anonymement avec SHA256 comparés ; captures et
assets publiés conservés, source toujours privée.
Preuves : `test-results/public-roadmap.json`, `publish-roadmap.log`.

### Vitrine du dépôt — 19 octobre 2026

README recomposé autour des usages : bannière de marque bleu ardoise,
téléchargement visible, trois parcours illustrés (dépôt web, console/Codex,
explorateur et espaces), catalogue compact et feuille de route conservée.
Galerie secondaire et FAQ repliables. Les captures restent celles du produit
réel ; la bannière est explicitement une illustration.

La bannière `distribution/images/banniere.png` se régénère avec
`node scripts/readme-banner.mjs` : dessin vectoriel, rendu 1920 × 640,
contrôle du cadre et des débordements de texte. Le préparateur des prochaines
versions l’inclut avec les six captures. Description et topics du dépôt public
actualisés pour présenter l’usage dans Chrome, Windows et PowerShell.

Commit public `9a962b57dba364bfc076cfd740f31594380aad25` ; README et bannière
relus anonymement avec SHA256 comparés. Vrai rendu GitHub contrôlé à 1440 et
390 px, sans débordement horizontal : images chargées, liens présents,
sections repliables fonctionnelles. Assets de release inchangés, source privée.
Preuves : `test-results/public-vitrine.json`, `public-vitrine-render.json`,
`public-vitrine-1440.png`, `public-vitrine-390.png`, `readme-banner.log`.

### Soutien volontaire — 19 octobre 2026

Lien fourni par le propriétaire : https://buymeacoffee.com/gremy_44
(Buy Me a Coffee). Le README public propose un lien dans la navigation et
un encart « Un café pour faire avancer NextExplorer », avec un bouton illustré
320 × 64. Le texte présente l’usage des contributions et rappelle leur caractère
facultatif ainsi que l’accès à la version gratuite avec ou sans soutien.

Le bouton local `distribution/images/soutenir.png` se régénère avec le script
de bannière et rejoint les ressources des prochains paquets. Aucune image de
bouton ni aucun widget chargé depuis le prestataire ; le clic ouvre sa page.

Commit public `4ba07cc40ac37c215e0dd73e80d85735e7efdfb5`. README et image
relus anonymement avec SHA256 comparés ; autres fichiers publics et assets de
release conservés, source privée. Rendu GitHub à 1440/390 px, deux liens exacts,
image chargée, largeur contenue et accès clavier vérifiés. La page de destination
répond 200 avec le titre Gremy44 dans Chromium ; aucun paiement envoyé.
Preuves : `test-results/public-support.json`, `public-support-render.json`,
`support-destination.json`, `public-support-section-390.png`.
