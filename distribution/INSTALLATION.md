# Installer la préversion NextExplorer

## Avant de commencer

Ce candidat pilote **1.0.7** vise Windows 11 x64 avec Chrome ou Edge. L’installateur
est non signé ; une alerte ou un blocage Windows reste possible. Ne désactivez pas
vos protections pour le pilote. Utilisez d’abord un dossier de copies et conservez
vos sauvegardes. [Parcours court et formulaire de retour](TESTER.md).

Téléchargez les fichiers uniquement depuis les
[releases officielles](https://github.com/Gremy44/NextExplorer-Downloads/releases).
Les fichiers sont gratuits. N’utilisez pas les archives « Source code » de GitHub
pour installer l’application.

## Installation

1. Téléchargez `NextExplorer-<version>-Setup.exe` et, si vous souhaitez contrôler
   l’intégrité du fichier, `SHA256SUMS.txt` de la même release.
2. Lancez l’installateur et choisissez votre navigateur, Chrome ou Edge. L’identité officielle est déjà configurée.
   Examinez les changements annoncés, puis installez pour votre compte Windows.
3. Pour ce pilote, ouvrez `chrome://extensions` ou `edge://extensions`, activez
   **Mode développeur**, puis **Charger l’extension non empaquetée**. Sélectionnez
   `%LOCALAPPDATA%\Programs\NextExplorer\package\dist`. Le dossier est fourni par
   l’installateur. Aucun code ni outil de développement à compiler.
4. Ouvrez NextExplorer et cliquez sur **Vérifier la connexion**. Si vous avez
   lancé le téléchargement depuis l’accueil de l’extension, la vérification
   reprend également à votre retour.
5. Choisissez un premier dossier de démonstration avec le sélecteur visuel.

L’extension et le compagnon doivent provenir de la même release. Ne chargez pas
une seconde copie de l’extension depuis un autre dossier.

L’archive `NextExplorer-<version>-extension.zip` est fournie pour examiner ou
charger séparément l’extension. Elle ne remplace pas l’installation du compagnon.
Le parcours pilote utilise le chargement manuel : ouvrez
`chrome://extensions` (ou `edge://extensions` pour Edge), activez **Mode développeur**, choisissez **Charger
l’extension non empaquetée**, puis sélectionnez
`%LOCALAPPDATA%\Programs\NextExplorer\package\dist`.

L’identité officielle de cette version est `afjflepinklhgicoppoobiichmjodgcp`.
Une ancienne copie de développement peut avoir une autre identité : ses réglages
ne sont pas transférés automatiquement. Exportez vos préférences et espaces
avant de la retirer. Évitez de faire fonctionner deux copies simultanément.

## Mettre à jour vers le pilote 1.0.7

L’EXE met à jour le compagnon et copie les fichiers de l’extension, mais Chrome
ne remplace pas automatiquement une extension chargée depuis un autre dossier.
Pour la copie locale, dans `chrome://extensions`, vérifiez que NextExplorer
provient de `%LOCALAPPDATA%\Programs\NextExplorer\package\dist`, rechargez cette
extension et contrôlez que sa version est **1.0.7**. Si vous utilisez déjà le
build du dépôt, rechargez plutôt la copie chargée depuis `release/NextExplorer/dist`.
Gardez une seule copie active. L’extension du Store reçoit ses propres mises
à jour ; un nouvel EXE n’en change pas la version.

Rechargez aussi les onglets où le panneau flottant 1.0.5 était ouvert pour
retirer son ancien conteneur. L’icône ouvre désormais le panneau Chrome natif,
dont la hauteur suit la fenêtre. Le style verre est conservé dans l’interface.

## Vérifier une empreinte, si nécessaire

Dans PowerShell, utilisez `Get-FileHash -Algorithm SHA256 -LiteralPath` suivi du
chemin du fichier téléchargé. Comparez le résultat à la ligne correspondante de
`SHA256SUMS.txt`. Une empreinte identique vérifie l’intégrité du téléchargement ;
elle ne remplace pas une signature d’éditeur.

## Moteurs et limites

Le compagnon suffit à la navigation, aux opérations sur les fichiers, aux tags,
aux aperçus courants et à la console. Aucun modèle d’IA n’est requis.

Dans **Réglages → Moteurs**, chaque fonction indique **Prêt**,
**À ajouter**, ou **À vérifier** si le compagnon est déconnecté.

| Fonction | Moteur facultatif |
| --- | --- |
| Images spécialisées, notamment TIFF, conversion et préparation d’images | ImageMagick (`magick`) |
| Métadonnées détaillées ; nettoyage web avec ImageMagick | ExifTool (`exiftool`) |
| Conversion, analyse et aperçus vidéo/audio | FFmpeg **et** FFprobe |
| Archives avancées | 7-Zip (`7z`) ; le ZIP courant fonctionne sans lui |
| Extraction de texte pour rechercher dans les PDF | Poppler (`pdftotext`) ; l’aperçu PDF reste disponible sans lui |

Ces moteurs ne sont pas inclus dans le paquet léger et aucun n’est téléchargé
automatiquement. Leur ajout reste **avancé** dans cette préversion :

1. Terminez les traitements et fermez les sessions de console.
2. Ouvrez PowerShell dans `%LOCALAPPDATA%\Programs\NextExplorer\package` et lancez
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-engines.ps1 -SkipMediaDownloader`.
   Le script prépare 7-Zip, ImageMagick, FFmpeg/FFprobe et ExifTool ; il peut
   contacter leurs distributeurs. Consultez ses messages et licences.
3. Relancez **Installer ou réparer** depuis le menu Démarrer pour intégrer les
   moteurs préparés au compagnon actif. Fermez puis rouvrez l’extension et
   utilisez **Vérifier la connexion** dans ses réglages.

Poppler n’est pas installé par ce script. Sa configuration reste manuelle ;
l’aperçu PDF et la navigation n’en dépendent pas.
L’assistant conserve les moteurs existants. Ne déplacez pas manuellement les
fichiers d’un compagnon actif. En cas d’échec, partagez uniquement un diagnostic
dont vous avez retiré les chemins personnels.

Le compagnon possède les droits de votre compte Windows. Les tâches autorisées
peuvent continuer après fermeture de Chrome. La console n’est pas un bac à sable.
Le glisser-déposer et l’insertion dépendent aussi du site cible.

## Mettre à jour ou réparer

Terminez vos traitements et fermez la console avant une mise à jour. Téléchargez
le nouvel installateur, lancez-le puis rechargez l’extension dans
`chrome://extensions`. Désactivez et réactivez l’extension pour renouveler sa
connexion au compagnon.

L’assistant conserve les moteurs déjà installés et l’ancienne copie du compagnon
lorsque la mise à jour le nécessite. Si la liaison ne fonctionne plus, ouvrez
**NextExplorer → Installer ou réparer** dans le menu Démarrer. Signalez tout échec
sans publier de fichier personnel ni de journal brut contenant des chemins privés.

## Désinstaller

Terminez les traitements, désactivez les règles automatiques et fermez Chrome.
Retirez NextExplorer dans les applications Windows puis supprimez son extension
depuis `chrome://extensions`. Le retrait conserve les documents et les éléments de
récupération prévus par le compagnon ; ce n’est pas un effacement complet de ses
données locales.
