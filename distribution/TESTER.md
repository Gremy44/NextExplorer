# Tester NextExplorer 1.0.7

Merci de participer au pilote gratuit. Prévoyez environ 20 minutes et utilisez un **dossier de copies**, par exemple `Documents\Test NextExplorer`. Windows 11 x64, Chrome ou Edge sont requis. Le compagnon Windows est nécessaire ; aucun compte NextExplorer et aucun abonnement ne sont demandés.

## Installer

1. Depuis la préversion **1.0.7** des [releases officielles](https://github.com/Gremy44/NextExplorer-Downloads/releases), téléchargez `NextExplorer-1.0.7-Setup.exe`.
2. Lancez-le, choisissez Chrome ou Edge, consultez les changements annoncés et installez pour votre compte Windows.
3. Ouvrez `chrome://extensions` ou `edge://extensions`, activez **Mode développeur**, puis **Charger l’extension non empaquetée**. Sélectionnez `%LOCALAPPDATA%\Programs\NextExplorer\package\dist`. L’installateur fournit ce dossier ; il n’y a pas de compilation à faire.
4. Épinglez NextExplorer et ouvrez-le. Vérifiez la connexion, puis choisissez votre dossier de copies. La vue complète et le compagnon doivent annoncer **1.0.7**.

Le programme n’est pas signé. Windows ou un antivirus peut le bloquer : ne désactivez pas vos protections pour le pilote. Signalez le nom du logiciel de sécurité et son message. Le chargement manuel de l’extension évite de dépendre de l’approbation du Store.

Vous avez déjà NextExplorer ? Terminez les traitements, fermez les consoles et l’extension, puis installez la nouvelle version. Rechargez la copie située dans le dossier ci-dessus et gardez une seule copie active. [Installation, réparation et retrait](INSTALLATION.md).

## Parcours de test

- [ ] Explorer le dossier ; changer d’affichage et de tri, ouvrir deux onglets et le double panneau. Ajuster la navigation et le volet d’aperçu.
- [ ] Glisser une **copie** de fichier entre les panneaux : dupliquer, puis déplacer. Essayer un nom déjà présent et vérifier que les deux contenus sont conservés.
- [ ] Mettre une copie à la corbeille, puis la restaurer depuis **Corbeille**.
- [ ] Aperçu d’un texte, d’un PDF et d’une police si vous en avez. Modifier un petit texte UTF-8, changer de sélection puis reprendre le brouillon. Fermer et rouvrir l’extension : le bouton de récupération doit le retrouver. Enregistrer explicitement, puis consulter **Versions**.
- [ ] **Recherche locale** : choisir un dossier, indexer les noms, chercher un fragment. Essayer ensuite le contenu des documents compatibles, si utile.
- [ ] **Réglages** : rechercher `demarrage`, tester la densité et la taille des textes, puis le thème clair ou sombre.
- [ ] Sur un site de confiance qui accepte des fichiers, ouvrir le panneau de l’extension et glisser le nom d’une copie vers la zone de dépôt. Le site peut commencer son envoi dès le dépôt. Ce parcours fonctionne avec la souris sous Windows ; ses restrictions dépendent du site.
- [ ] Facultatif : ouvrir la console dans un dossier de test. Elle utilise **PowerShell**, même avec l’apparence Ubuntu. Exécuter seulement une commande que vous comprenez, par exemple `Get-Location`.

Les aperçus d’images, conversions, métadonnées avancées et archives spécialisées peuvent demander des **moteurs facultatifs**. Consultez **Réglages → Moteurs** : une fonction « À ajouter » n’est pas un échec d’installation du compagnon. Le [guide](INSTALLATION.md) explique leur ajout ; ils ne sont pas téléchargés automatiquement.

Les connexions SFTP/SSH restent expérimentales dans ce pilote, désactivées par défaut. Elles ne font pas partie du parcours minimal à valider. L’IA locale n’est pas incluse.

## Envoyer un retour

Ouvrez un [signalement](https://github.com/Gremy44/NextExplorer-Downloads/issues/new/choose), ou transmettez votre retour à la personne qui vous a proposé le test :

```text
Version NextExplorer : 1.0.7
Windows et navigateur (version) :
Installation neuve ou mise à jour :
Ce que j’ai fait (2–5 étapes) :
Ce que j’attendais :
Ce qui s’est passé :
Est-ce reproductible ?
Type/taille du fichier si pertinent :
Gêne : bloquant / important / détail
```

Les tickets GitHub sont publics. Masquez les chemins personnels, noms de clients, serveurs, clés et mots de passe ; ne joignez pas de document confidentiel. Une capture recadrée et un petit fichier synthétique suffisent souvent. En cas de risque de perte de données, arrêtez le parcours concerné et conservez les copies et journaux avant de réessayer.
