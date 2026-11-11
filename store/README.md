# J7.1 — dossier Chrome Web Store

**11 novembre 2026 :** le code applicatif est maintenant ouvert sous MIT dans
[Gremy44/NextExplorer](https://github.com/Gremy44/NextExplorer). La version source
1.0.8 ajoute le MCP ; les anciens ZIP et EXE ci-dessous restent inchangés.

## Candidat officiel — 1.0.3, 20 octobre 2026

Identité officielle **`afjflepinklhgicoppoobiichmjodgcp`**, clé publique récupérée
dans le tableau de bord et vérifiée par SHA256. Sources, paquet Windows et
origine Native Messaging concordants. Le premier ZIP 1.0.2 est conservé ;
le ZIP final 1.0.3 est importé dans **le même brouillon**, sans nouvel élément.

La [préversion GitHub 1.0.3](https://github.com/Gremy44/NextExplorer-Downloads/releases/tag/v1.0.3)
est publiée : EXE correspondant, extension pour chargement manuel, notices,
SHA256 et guides. Quatre téléchargements et 17 documents/visuels vérifiés
anonymement. Le code était alors privé ; la 1.0.1 reste inchangée.

Description, catégorie Outils, langue française, liens, icône, deux captures et
vignette enregistrés depuis le Chrome connecté du propriétaire. Confidentialité
et permissions renseignées, absence de code distant déclarée, diffusion demandée
**publique et sans frais**, conformément à son autorisation. Aucun changement
des paramètres globaux de l’éditeur ni de l’extension Chrome de développement.

**Statut : envoyé pour examen le 20 octobre 2026.** Le tableau de bord affiche
**En attente d’examen**, avec publication automatique après approbation activée.
L’approbation et la disponibilité publique dépendent de Google.

## Livrables et contrôles

- `npm run package:store` construit un ZIP contenant le manifeste à la racine,
  les ressources locales PDF/terminal/polices et leurs licences. Ni EXE, ni scripts
  Windows, ni cartes de sources, ni clé de développement dans ce ZIP.
- Version de `package.json` partagée par extension et installateur. Une archive
  différente sous un numéro existant est refusée ; les versions restent immuables.
- `npm run check:identity` valide la clé publique SPKI et sa correspondance avec
  `extension-id.txt`. Clé privée/malformée, contenu ajouté et incohérence refusés.
  Le paquet Windows et le paquet Store rejettent un build à l’identité périmée.
- `npm run test:store` vérifie les ressources, les fichiers sensibles inattendus,
  les builds périmés et l’immuabilité. Cela ne garantit pas l’acceptation par Google.
- `npm run test:store:extension` charge le ZIP dans un profil Chromium isolé,
  en ajoutant **à cette copie de test uniquement** la clé publique déclarée.
  L’enregistrement Native Messaging Chromium temporaire est restauré à la fin.
  Le ZIP et l’installation Chrome existante restent inchangés.
- Compagnon réel, véritable ID Store, première connexion, console, isolation et
  fermeture des sessions vérifiés. Moteurs testés à 320/390/1440 px, FFmpeg et
  FFprobe nécessaires ensemble. Typage et **240 tests** réussis.
- Preuves : `base-final-*.log`, `base-final-public-anonymous.json` et captures
  `engines-*.png` dans `test-results`. Visuels Store : `release/store/visuels/`.

## Dossier et liens

- [Fiche française](FICHE.fr.md), [confidentialité](CONFIDENTIALITE.md),
  [permissions](PERMISSIONS.md), [instructions examinateur](RECETTE_EXAMINATEUR.md).
- [Accueil](https://github.com/Gremy44/NextExplorer-Downloads),
  [guide](https://github.com/Gremy44/NextExplorer-Downloads/blob/main/INSTALLATION.md),
  [support](https://github.com/Gremy44/NextExplorer-Downloads/issues),
  [politique publique](https://github.com/Gremy44/NextExplorer-Downloads/blob/main/CONFIDENTIALITE.md).
- Compagnon : `NextExplorer-1.0.3-Setup.exe`, SHA256
  `ee21c7328a262c00d512f6f3bf5fb319bb5afc996f9c724edf2e9d002939ae07`.
- ZIP Store : SHA256
  `94a881ff89a1c2a27d9e0da3c94e70a2151639ec7ff274c7b23192639f5218e9`.

## Limites et suite

Le nouvel ID possède un stockage Chrome distinct. Exporter réglages et espaces
avant de retirer l’ancienne copie ; aucune migration automatique n’est annoncée.
L’EXE est non signé selon le choix du propriétaire. La préparation des moteurs
facultatifs reste avancée ; aucun moteur ni modèle d’IA installé automatiquement.

**J1.7 reste ouvert :** le kit Windows propre est préparé pour l’EXE exact 1.0.3,
mais le poste Windows 11 Famille ne dispose pas d’un outil de VM détecté. Les
tests du backend/contrôleur à registre simulé et l’UI sans clic Installer ne
remplacent pas installation, mise à jour, réparation et retrait sur Windows neuf.
Le pilote utilisateur vient ensuite ; aucune IA ni fonction Pro n’est ajoutée.

## Références

- [Paquet Store](https://developer.chrome.com/docs/webstore/prepare).
- [Clé publique et ID](https://developer.chrome.com/docs/extensions/reference/manifest/key).
- [Visuels](https://developer.chrome.com/docs/webstore/images).
- [Confidentialité et données locales](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
