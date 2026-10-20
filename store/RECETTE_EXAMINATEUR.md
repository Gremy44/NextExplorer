# Instructions de test — première bêta Windows

Préversion publique 1.0.3, identité Store `afjflepinklhgicoppoobiichmjodgcp`.

## Configuration

- Windows 11 x64, Chrome stable, compte Windows standard.
- Extension provenant du même élément Chrome Web Store que l’origine Native Messaging autorisée.
- Compagnon correspondant : https://github.com/Gremy44/NextExplorer-Downloads/releases/download/v1.0.3/NextExplorer-1.0.3-Setup.exe.
- SHA256 : `ee21c7328a262c00d512f6f3bf5fb319bb5afc996f9c724edf2e9d002939ae07`. Installateur non signé, installation par utilisateur. L’ancienne 1.0.1 utilise l’identité de développement et ne convient pas à cet élément Store.
- Aucun compte NextExplorer ni abonnement requis. Les moteurs complémentaires sont facultatifs et explicités au premier usage.
- Jeu de démonstration : fichiers synthétiques uniquement ; un dossier contenant un TXT, un Markdown, un PNG et deux sous-dossiers suffit aux contrôles de base.

## Parcours

1. Installer l’extension et ouvrir son panneau. Sans compagnon, constater l’accueil **Connectez vos fichiers**, le téléchargement Windows et les diagnostics repliés.
2. Télécharger puis installer le compagnon correspondant. Revenir à l’extension : la vérification reprend après le clic de téléchargement ; **Vérifier la connexion** permet aussi de la relancer. Vérifier **Compagnon connecté**. Aucun mode développeur ni identifiant à saisir ne doit être nécessaire pour le parcours final.
3. Choisir le dossier synthétique via **Choisir un dossier → Choisir ce dossier**. Vérifier l’annulation, la navigation, le retour, le chemin et les choix d’affichage/tri. Ouvrir la vue complète ; essayer un nouvel onglet et le double panneau. Recharger : le dossier reste ouvert sans refaire l’accueil.
4. Sélectionner le Markdown ou le PNG et vérifier l’aperçu. Copier puis renommer le TXT dans un sous-dossier, vérifier l’original et tester l’annulation proposée.
5. Attribuer un tag, retrouver le fichier depuis le tag, puis retirer l’association.
6. Ouvrir la console ; exécuter `Get-Location`, changer de dossier dans l’explorateur et vérifier son suivi. Essayer **LCD rétro** dans l’apparence, puis fermer la session. Les commandes ne passent pas par l’annulation des fichiers.
7. Sur une page de démonstration contrôlée, collecter un lien ou une sélection via le clic droit. Si un champ de dépôt est testé, utiliser un fichier synthétique : la page peut le transmettre dès l’insertion.
8. Si nécessaire, tester la permission facultative PDF ou Téléchargements depuis son outil. Refuser une permission doit laisser la navigation locale utilisable. Une règle de rangement ne doit devenir automatique qu’après activation explicite.

## Limites à connaître

Les fonctions natives exigent le compagnon. Certaines conversions, miniatures ou archives exigent des moteurs optionnels. La recherche est locale et bornée ; tous les types de fichiers n’ont pas un aperçu. Aucune IA n’est livrée. La compatibilité avec tous les sites, formats et programmes de console n’est pas annoncée.

## Vérifications et état

- Native Messaging, connexion guidée, choix du dossier, moteurs facultatifs et console testés dans Chromium isolé sous le véritable ID Store, avec compagnon réel.
- [J1.7 sur Windows propre](../RECETTE_INSTALLATEUR.md) reste à exécuter. Les tests sur le poste de développement ne la remplacent pas ; ne pas déclarer cette recette effectuée.
- Utiliser les mêmes versions et empreintes pour l’extension, le compagnon et les instructions. Conserver l’ancienne release pour le retour arrière.
- Le propriétaire a demandé la soumission publique et gratuite depuis son Chrome connecté. L’approbation et la disponibilité dans le Store dépendent de Google.
