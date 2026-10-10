# Spécifications Techniques & Architecture : Extension Chrome Hybride "Super Explorateur Local" (Manifest V3 + Native Messaging)

> **Évolution du périmètre — décision utilisateur du 9 octobre 2026 :** la ligne directrice est la gestion des fichiers locaux et leur usage dans le navigateur. J6, les nouveaux clients cloud/FTP et les nouvelles intégrations tierces sont retirés ; l'ancien objectif du 14 septembre de couverture complète de Files est remplacé. La [feuille de route hybride](FEUILLE_DE_ROUTE_HYBRIDE.md), la [matrice fonctionnelle](MATRICE_FILES_ET_HYBRIDE.md) et la [conception de l'installation](INSTALLATION_COMPAGNONS.md) précisent cette cible et l'ordre actuel des travaux. L'état réellement implémenté reste celui de [FEATURES.md](FEATURES.md). Les formulations ambitieuses du document initial ne constituent pas des garanties de performance, de sécurité absolue ou de compatibilité universelle.

> **Objectif du document :** Définir l'architecture, la sécurité, les protocoles et les spécifications fonctionnelles d'une **extension Chrome couplée à un Host Natif sécurisé (Native Messaging)**. Cette solution permet d'explorer **l'intégralité du système de fichiers local** (disques C:\, D:\, /home, volumes montés, disques amovibles) directement depuis le navigateur avec des performances natives et une sécurité maximale.

---

## 1. Vision du Produit & Architecture Globale

### 1.1 Pourquoi l'approche Hybride (Extension + Native Host) ?
* **Contournement sécurisé de la sandbox Chrome :** L'API standard `showDirectoryPicker()` bloque l'accès aux racines de disques (`C:\`) et répertoires système. L'utilisation officielle de **Chrome Native Messaging** permet d'accéder à l'ensemble du système de fichiers de l'utilisateur sans compromettre la sécurité.
* **Sécurité "Air-Gapped" (Aucun port réseau) :** Contrairement à un serveur local qui écoute sur un port TCP/HTTP, le pont Native Messaging utilise les pipes standard du système (`stdin` / `stdout`). **Aucun port réseau n'est ouvert.**
* **Whitelisting Cryptographique :** Le système d'exploitation et Chrome garantissent que **seule** l'extension Chrome possédant l'ID unique spécifié a le droit de lancer et de dialoguer avec le binaire compagnon.

### 1.2 Schéma d'Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                      INTERFACE EXTENSION CHROME                        │
│  • Chrome SidePanel API (panneau latéral persistant)                   │
│  • Onglet Pleine Page Dédié (Tableau de bord / Dashboard)             │
│  • React / Solid.js + TailwindCSS + Virtualized Windowing              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ chrome.runtime.connectNative()
                                    │ Communication bidirectionnelle (JSON sur stdin/stdout)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 NATIVE HOST COMPAGNON (Local en Rust / Go)             │
│  • Exécutable autonome ultra-léger (< 15 Mo, 0 dépendance externe)    │
│  • Whitelist Chrome : vérifie l'ID de l'extension appelante           │
│  • Moteur I/O natif : lecture/écriture sans restriction sur C:\, D:\... │
│  • Moteur de Hashing multithreadé (BLAKE3)                             │
│  • Moteur de Traitement par lot (Batch Renamer & Metadata)             │
│  • Moteur de Conversion Multimédia (FFmpeg / ImageMagick embarqués)    │
│  • Filesystem Watcher temps réel (notify-rs / FSEvents / ReadDir)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 SYSTÈME DE FICHIERS LOCAL DE L'OS                      │
│     C:\ (Windows)   │   D:\ (Disques / SSD)   │   Clés USB & NAS       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Protocole de Sécurité & Communication (Native Messaging)

### 2.1 Configuration du Manifeste Host (`com.local.file_explorer.json`)
Le fichier de configuration système (enregistré dans le registre Windows sous `HKCU\Software\Google\Chrome\NativeMessagingHosts` ou dans `~/.config/google-chrome/NativeMessagingHosts` sous Linux/macOS) déclare l'association stricte :

```json
{
  "name": "com.local.file_explorer",
  "description": "Native Host pour Super Explorateur de Fichiers Chrome",
  "path": "C:\\Program Files\\SuperExplorer\\native-host.exe",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://VOTRE_EXTENSION_ID_UNIQUE/"
  ]
}
```

### 2.2 Format des Messages (RPC Léger via JSON)
Tous les messages échangés entre Chrome et le Native Host suivent une structure typée avec identifiant de requête (`id`) pour la synchronisation asynchrone.

#### Exemple : Requête de listage de dossier
```json
{
  "id": "req-1024",
  "action": "FS_LIST_DIR",
  "payload": {
    "path": "C:\\",
    "showHidden": false,
    "sortBy": "name",
    "sortOrder": "asc"
  }
}
```

#### Exemple : Réponse du Native Host
```json
{
  "id": "req-1024",
  "status": "SUCCESS",
  "data": {
    "currentPath": "C:\\",
    "parentPath": null,
    "entries": [
      { "name": "Program Files", "type": "directory", "size": 0, "mtime": 1718000000 },
      { "name": "Users", "type": "directory", "size": 0, "mtime": 1718000000 },
      { "name": "bootmgr", "type": "file", "size": 395268, "mtime": 1690000000 }
    ]
  }
}
```

---

## 3. Ergonomie & Interface Utilisateur (Extension Chrome)

### 3.1 Double Mode d'Affichage
1. **Mode SidePanel (`chrome.sidePanel`) :**
   * Accessible en un clic sur l'icône de l'extension ou via raccourci clavier (`Alt+E`).
   * Reste ouvert à droite du navigateur pendant que l'utilisateur travaille sur ses pages web.
   * Disposition optimale en **Colonnes de Miller** ou liste arborescente compacte.
2. **Mode Pleine Page (Dashboard) :**
   * Onglet complet (`chrome-extension://.../index.html`) pour les opérations complexes.
   * Mode **Double Panneau (Dual-Pane)** pour déplacer des fichiers d'un dossier à un autre en glisser-déposer.
   * Treemap d'espace disque et tableau de bord des conversions.

### 3.2 Innovations Ergonomiques & Expérience Utilisateur (UI/UX)
* **1. Le "Web-to-Disk Bridge" (Glisser-Déposer direct depuis le Web) :**
  * Glisser n'importe quelle image ou fichier d'un onglet web directement dans un dossier du SidePanel pour le sauvegarder instantanément en local sans dialogue "Enregistrer sous".
  * Glisser une sélection de texte d'une page web crée automatiquement une note `.txt` ou `.md` dans le dossier local ciblé.
* **2. "Hover-Scrub" & Mini-Lecteur au Survol :**
  * **Vidéos :** Défilement dynamique de la timeline vidéo sur la miniature au simple déplacement de la souris, sans devoir ouvrir le fichier.
  * **Audio :** Affichage d'une mini-waveform (forme d'onde) avec bouton Play/Stop au survol pour écouter un échantillon instantanément.
* **3. "Stash Shelf" (Étagère de collecte persistante) :**
  * Zone escamotable en bas du SidePanel permettant de collecter des fichiers hétérogènes depuis divers disques/dossiers.
  * Actions en 1 clic sur toute la sélection : déplacement groupé, création d'archive ZIP, conversion groupée, ou injection en drag & drop dans un formulaire ou email du navigateur.
* **4. Palette de Commandes & Omnibar (`Ctrl+K` / `Cmd+K`) :**
  * Interface flottante type Raycast / VS Code avec recherche floue (Fuzzy Search).
  * Navigation ultra-rapide par alias (`~dl` vers Téléchargements, `~desk` vers Bureau, `~c` vers racine C:).
  * Exécution d'actions directes : `> convert to webp`, `> zip`, `> terminal here`, `> git status`.
* **5. Cartes de Code & Rendu Markdown Direct :**
  * Les fichiers de code source (`.js`, `.py`, `.rs`, etc.) affichent leurs 5 premières lignes avec coloration syntaxique directement sur leur carte.
  * Les fichiers Markdown (`.md`) peuvent s'afficher sous forme de "fiches de notes" formatées directement dans la grille.

### 3.3 Module d'Hybridation Web-to-Disk & Gestion de Liens Contextuels
* **1. Les Liens Web comme Fichiers de Premier Rang (`.weblink` / Open Graph Cards) :**
  * Glisser l'URL ou le favicon depuis la barre d'adresses de Chrome directement dans un dossier du SidePanel crée un lien enrichi.
  * Stockage local d'un petit fichier JSON de métadonnées (titre, URL, favicon, résumé et image Open Graph pré-téléchargée).
  * Affichage sous forme de carte visuelle au milieu des fichiers locaux normaux. Double-clic = ouverture immédiate dans un onglet Chrome.
* **2. Liens Web Épinglés aux Dossiers Locaux (Workspace Quicklinks) :**
  * Barre d'en-tête de dossier permettant d'épingler des raccourcis web pertinents pour le projet en cours (ex: raccourci vers la maquette Figma, le ticket Jira, la documentation ou le dépôt GitHub lié au dossier).
* **3. "Web Grabber" & Archivage Local en 1 Clic :**
  * Au dépôt d'un lien ou d'une sélection web dans le SidePanel, menu d'action rapide :
    * *Raccourci interactif* (.weblink).
    * *Capture en Markdown propre* (mode lecture / Readability sans publicités ni scripts).
    * *Capture PDF instantanée* de la page web.
    * *Aspiration média* (si lien YouTube/Soundcloud : téléchargement local audio/vidéo via le Native Host).
* **4. Synchronisation Groupes d'Onglets Chrome ⬌ Dossiers Locaux :**
  * Sauvegarde de tous les onglets d'un groupe Chrome sous forme de "session de travail" dans le dossier local du projet.
  * Réouverture en 1 clic de l'ensemble des onglets web associés à un dossier de projet donné.

### 3.4 Directives & Charte de Design UI/UX (Pour l'IA Front/Design)

> **Philosophie Visuelle : "Precision Instrument"**
> Éviter le look "template générique" ou "panneau d'administration basique". L'explorateur doit ressembler à un outil de travail chirurgical, dense, lisible et hautement réactif, inspiré des interfaces professionnelles (Linear, Raycast, Sublime Text, Ableton).

* **1. Palette & Thème (Sombre & Clair adaptatif) :**
  * *Dark Mode (prioritaire) :* Fond carbone profond (`#111216`), panneaux secondaires (`#18191E`), bordures subtiles à 1px (`#272932`), texte haute lisibilité (`#E4E6EB`), texte estompé pour métadonnées (`#8E929E`).
  * *Couleur d'accent (Signature) :* Un ambre électrique ou cobalt technique (`#3B82F6` ou `#F59E0B`) utilisé avec parcimonie pour la sélection, les badges d'état et la progression des tâches.
* **2. Typographie & Rythme :**
  * *Police d'interface (UI) :* Sans-serif géométrique et neutre avec forte lisibilité en petites tailles (`Inter`, `Plus Jakarta Sans` ou la police système native).
  * *Police de données & Code (Data/Monospace) :* `JetBrains Mono` ou `Fira Code` pour les chemins de fichiers, les tailles (Mo/Go), les hashs, les pourcentages de transfert et les horodatages.
* **3. Densité & Micro-Interactions :**
  * *Densité "Compact First" :* Padding maîtrisé pour afficher un maximum d'informations pertinentes sans scroll excessif dans l'espace contraint du SidePanel.
  * *Transitions instantanées :* Animations < 120ms (cubic-bezier vif). L'interface ne doit jamais paraître "flottante" ou lente.
  * *Micro-états clairs :* Hover subtil avec surbrillance de bordure plutôt qu'un gros changement de fond. Indicateur de focus clavier accessible (`focus-visible`).
* **4. Navigation & Contrôles Standards :**
  * **Barre d'adresse hybride :** Breadcrumb cliquable + saisie manuelle avec autocomplétion des chemins réels de l'OS (`C:\Users\...`).
  * **Filtre instantané :** Filtrage en temps réel dans le dossier actif dès la frappe au clavier (`/` ou frappe directe).

---

## 4. Moteur I/O & File de Transferts (Géré par le Native Host)

* **Performance I/O native :** Le binaire Rust effectue les copies de fichiers via les appels système natifs ultra-rapides (`CopyFileEx` sous Windows, `sendfile` / `copy_file_range` sous Linux).
* **Transfer Queue Manager (File d'attente) :**
  * Progression en pourcentage, débit en Mo/s et temps restant transmis à l'UI Chrome.
  * Pause, reprise et annulation des transferts.
* **Gestion des conflits :**
  * Écraser, renommer automatiquement (ex: `fichier (1).ext`), ignorer, ou afficher une comparaison côte à côte (différence de taille, date et aperçu).
* **Vérification d'intégrité :** Calcul automatique d'empreinte BLAKE3 en temps réel pour garantir qu'aucune donnée n'est corrompue.
* **Surveillance en temps réel (Watcher) :** Détection instantanée des ajouts/modifications/suppressions de fichiers dans le dossier ouvert (via `notify-rs`), mettant à jour l'UI Chrome sans besoin de rafraîchir (`F5`).

---

## 5. Module Avancé de Traitement par Lot (Batch Operations)

### 5.1 Renommage par Lot Avancé (Batch Renamer)
* **Capacités du moteur :**
  * Remplacement avec Expressions Régulières (Regex) en temps réel.
  * Numérotation séquentielle personnalisée (`%03d`, pas, préfixe/suffixe).
  * Transformations de casse (camelCase, kebab-case, snake_case, UPPERCASE, lowercase).
  * Injection de tags dynamiques :
    * **Photos :** Données EXIF (date de prise de vue, appareil, dimensions).
    * **Musiques :** Données ID3 (artiste, titre, album, piste).
* **Sécurité "Dry-Run" :**
  * L'extension affiche un tableau comparatif avant/après en direct.
  * Détection proactive des collisions de noms avant d'autoriser l'application.

### 5.2 Édition de Métadonnées en Masse
* Nettoyage des métadonnées privées (suppression des tags GPS/EXIF d'un dossier de photos avant partage).
* Uniformisation des tags ID3 musicaux par album.

---

## 6. Module de Conversion Multimédia Local Haute Performance

> Grâce au Native Host, les conversions s'exécutent avec les performances maximales du CPU/GPU (accélération matérielle NVENC, QuickSync, VAAPI) via un moteur FFmpeg / ImageMagick piloté en local par le binaire.

### 6.1 Conversions d'Images
* **Formats :** PNG, JPEG, WebP, AVIF, GIF, SVG, BMP, TIFF, formats RAW photographiques (CR2, NEF, ARW).
* **Fonctionnalités :**
  * Conversion en masse vers formats modernes (WebP, AVIF).
  * Redimensionnement par lot avec préservation du ratio.
  * Optimisation de la compression (avec ou sans perte de qualité).

### 6.2 Conversions Audio
* **Formats :** MP3, FLAC, AAC, WAV, OGG, M4A, Opus.
* **Fonctionnalités :**
  * Transcodage de collections audio vers formats compressés avec choix du débit.
  * Extraction instantanée de l'audio depuis des vidéos sans réencodage (Direct Stream Copy) ou avec conversion en MP3.
  * Normalisation sonore globale (ReplayGain).

### 6.3 Conversions Vidéo
* **Formats & Codecs :** MP4, MKV, WebM, MOV, AVI (H.264, H.265/HEVC, AV1).
* **Fonctionnalités :**
  * Remuxing rapide (ex: changer un conteneur `.mkv` en `.mp4` en 2 secondes sans toucher à la vidéo).
  * Compression vidéo calibrée (ex: cible < 25 Mo pour partage sur Discord/email).
  * Création de GIFs ou clips WebP animés.

---

## 7. Prévisualisation Instantanée (QuickLook Universel)

D'une simple pression sur la **Barre d'espace** dans l'extension :
* **Médias :** Flux vidéo/audio streamé depuis le Native Host vers les balises HTML5 de l'extension avec lecteur réactif.
* **Images :** Affichage haute résolution avec zoom et aperçu des métadonnées EXIF.
* **Code & Texte :** Intégration de Monaco Editor (ou Shiki) pour afficher n'importe quel fichier source avec coloration syntaxique et numérotation des lignes.
* **Documents & PDF :** Visualisation PDF intégrée multipages.
* **Archives :** Visualisation de l'arborescence des fichiers compressés (`.zip`, `.rar`, `.7z`, `.tar.gz`) sans extraction.

---

## 8. Outils Développeurs & Power-Users

* **Ouverture dans l'OS en un clic :**
  * "Ouvrir avec l'application par défaut" (lance le logiciel configuré dans l'OS).
  * "Ouvrir dans le Terminal" (lance PowerShell, Windows Terminal, Bash ou Zsh directement dans le dossier).
  * "Ouvrir dans VS Code" ou tout autre IDE.
* **Calculateur d'Espace Disque (Treemap) :**
  * Scan multithreadé ultra-rapide par le Native Host.
  * Visualisation graphique (façon WinDirStat / TreeSize) intégrée pour repérer immédiatement les gros fichiers.
* **Calculateur de Hash :**
  * Calcul de hash instantané (MD5, SHA-256, BLAKE3) et vérification avec le presse-papier.
* **Détection de Doublons Locaux :**
  * Scan par empreinte pour trouver les doublons sur n'importe quel disque et proposer un nettoyage assisté.

---

## 9. Plan de Développement & Feuille de Route (Phasage MVP)

| Phase | Étape | Livrables techniques |
| :--- | :--- | :--- |
| **Phase 1** | **Socle Hybride & IPC** | Binaire Native Host (Rust) + Extension Chrome Manifest V3. Mise en place du canal `chrome.runtime.connectNative()`. Listage de `C:\` et navigation fluide dans l'UI (SidePanel). |
| **Phase 2** | **Opérations de Fichiers** | Moteur I/O (Copier, Déplacer, Supprimer, Renommer), surveillance temps réel (Watcher), file de transfert avec barre de progression. |
| **Phase 3** | **QuickLook & Batch Renamer** | Aperçu universel (Espace), module de renommage par lot avec Regex, métadonnées EXIF/ID3 et validation Dry-Run. |
| **Phase 4** | **Conversions Multimédias** | Intégration du moteur de conversion local (FFmpeg/ImageMagick) pour images, audio et vidéos par lot. |
| **Phase 5** | **Outils Système & Finitions** | Lancement d'applications/terminal OS, Treemap d'espace disque, détection de doublons, mode Double Panneau. |
