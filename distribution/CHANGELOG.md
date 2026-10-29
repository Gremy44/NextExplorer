# Historique

## 1.0.7 — candidat pilote gratuit, 29 octobre 2026

- Installateur et extension reconstruits ensemble pour le pilote ; chargement manuel guidé sous Chrome ou Edge.
- Recherche locale élargie, résultats paginés, contrôle de fraîcheur et arrêt sans perdre le cache précédent.
- Aperçus bornés et arrêtables : gros TIFF via moteur facultatif, PDF page par page, polices locales, lecture progressive des médias compatibles.
- Éditeur texte dans l’aperçu, brouillons récupérables après fermeture, téléchargement du brouillon, contrôle des changements externes et versions conservées.
- Déplacement/duplication au curseur dans le double panneau, corbeille directe avec restauration, atelier et conversion image/vidéo avec copies conservées.
- Rangement automatique activé explicitement par règle et vrai glissement Windows depuis le panneau latéral vers une page web.
- Interface compacte, réglages recherchables sans accents, tailles ajustables, aides clavier et actions contextuelles harmonisées.
- Connexions distantes disponibles à titre expérimental, désactivées par défaut ; aucun modèle d’IA intégré.

Les moteurs spécialisés restent facultatifs et ne sont pas inclus dans le paquet léger. L’EXE n’est pas signé. [Guide de test et retours](TESTER.md).

## Préversion privée — 27 octobre 2026

- Compagnon Windows 1.0.6 recompilé depuis les sources courantes, avec l’extension correspondante dans une archive de test.
- Sauvegarde de l’ensemble de l’avancement sur `design/fluent-preview`, avec conservation des points de retour visuels.
- Inclut les outils documents/archives, l’ergonomie compacte, l’atelier d’actions rapides, les animations et le socle SFTP/SSH.
- Compilation et vérifications du paquet avant envoi ; fichiers locaux, journaux, profils, identifiants et moteurs téléchargés exclus du dépôt et de l’archive.

Le Setup existant et la version du dépôt public de téléchargements ne sont pas modifiés. L’archive privée utilise l’installation manuelle du compagnon ; elle ne met pas à jour automatiquement le compagnon déjà installé. Recette SFTP sur serveur utilisateur et qualification FTP/FTPS externe encore ouvertes.

## Dossiers distants — sources du 26 octobre 2026

- Activation facultative dans Réglages → Connexions, carnet de serveurs, onglets distants et double panneau local/SFTP.
- Empreinte SSH approuvée avant authentification, secret facultatif protégé avec DPAPI Windows, FTPS avec validation de certificat.
- Copies récursives vérifiées SHA-256 dans l’Activité, sans écrasement ni suppression de la source ; comparaison du niveau affiché avant préparation d’une copie.
- Clic droit distant adapté, permissions SFTP, suppression explicite de fichiers/dossiers vides et console SSH ouverte sur demande.
- Inspirations FileZilla, GNOME Files, Dolphin et Krusader documentées ; aucune reprise de l’autre dépôt NextExplorer.

266 tests TypeScript, suite Go complète, build web et recettes navigateur distantes/console/ergonomie réussis. Périmètre et limites dans [DOSSIERS_DISTANTS.md](../DOSSIERS_DISTANTS.md). Recette sur serveur utilisateur encore à faire. Aucun EXE ni Setup reconstruit, aucune publication.

## Atelier et fluidité — sources du 26 octobre 2026

- Convertisseur intégré à l’atelier, avec conservation des réglages de conversion et des annotations lors des changements d’outil.
- Ouverture animée des modales et menus, transitions des panneaux et changement d’outil sans recréer son contenu.
- Repère de dépôt et déplacement animé des onglets voisins ; annuler le glisser conserve l’ordre initial.
- Réduction des animations système respectée, sans nouvelle dépendance.

253 tests et recettes navigateur dédiées réussis ; conversion WebP réelle vérifiée après un aller-retour entre outils. Aucun EXE reconstruit ni publication.

## Actions rapides — sources du 26 octobre 2026

- Bouton sur la sélection et ouverture directe de l’outil adapté, avec changement d’outil dans un atelier unique.
- Aperçu de rotation, page d’annotation ajustée à l’espace et annotations conservées entre outils.
- Ordre PDF modifiable par glisser-déposer ou flèches ; bornes d’extrait depuis la lecture et durée lisible.
- Destination proposée, réglages secondaires repliés et export accessible sur petits écrans.
- Copies PDF/annotées numérotées en cas de nom existant ; nom enregistré affiché dans la confirmation.

250 tests et exports PNG/PDF/MP4 réels vérifiés. Aucun EXE reconstruit ni publication.

## Ergonomie — sources du 26 octobre 2026

- Réglages par sections, navigation à droite et onglets de catégories sur petits écrans.
- Densité compacte/standard/confortable, texte de 85 à 150 % et taille indépendante du menu contextuel.
- Navigation redimensionnable avec largeur mémorisée, catégories repliables et traits fins conservés.
- Glisser-déposer pour réordonner les onglets, icônes des actions et fermeture à droite.
- Explications des principaux outils en infobulles accessibles au clavier, désactivables dans les réglages.
- Gestion distante inspirée de FileZilla ajoutée aux idées de feuille de route, sans implémentation.

Lot local : aucun installateur EXE reconstruit, aucune publication.

## Sources non empaquetées — 24 octobre 2026

- L’enregistrement du compagnon conserve une clé existante et ses permissions.
- Test de non-régression intégré à la recette d’installation ; erreurs d’écriture,
  réparation ambiguë et récupération après retrait partiel vérifiées en VM.
- Mise à jour pendant une copie de 200 fichiers et reprise explicite d’une tâche
  interrompue vérifiées avec les binaires déjà disponibles.

Aucun EXE reconstruit. Ce correctif des sources n’est pas dans le Setup 1.0.6
existant ; la publication 1.0.3 et les téléchargements restent inchangés.

## 1.0.6 — panneau natif et préparation Windows

- Retour au panneau Chrome natif par l’icône et `Alt+E`, à la hauteur disponible,
  après un blocage signalé avec le panneau flottant 1.0.5.
- Injection du panneau et exposition de ses ressources aux sites retirées.
- Installateur avec informations d’éditeur, licence et empreintes SHA-256.
- Fichiers de débogage source maps exclus du build de distribution.
- Signature Authenticode horodatée du compagnon, du Setup et du désinstalleur
  prise en charge lorsqu’un certificat reconnu est fourni au build. Aucun
  certificat n’est disponible ici : le candidat reste non signé.
- Préparation de la recette Windows corrigée pour choisir l’EXE versionné.

Candidat local, non publié. Parcours principal réalisé sur Windows 11 neuf avec
Chrome/Edge et compte standard : installation, annulation, connexion/lecture réelle,
reconnexion, réinstallation, réparation et désinstallation réussies. Les cas
complémentaires, la signature et la réputation de téléchargement restent distincts.
Panneau natif Edge et conservation d’un enregistrement Chrome étranger vérifiés.
Le contrôleur de recette accepte `-Browser Edge` ; aucun changement de l’EXE testé.
Recette du 24 octobre : mise à jour au repos 1.0.3 → 1.0.6 réussie dans la VM,
sources/fichiers accentués, préférences et ancien runtime préservés, puis
désinstallation complète vérifiée. Profil Windows accentué et tâches en cours
pendant une mise à jour restent à qualifier.
Cas d’échec ciblés également vérifiés dans la VM : enregistrement Edge étranger
préservé, désinstallation refusée sans altération si le script manque ou échoue,
puis restauration du paquet par le même Setup et lecture réelle dans Edge 156.
Ces essais ne couvrent pas les erreurs de disque, d’ACL ou d’écriture du registre.

## 1.0.5 — panneau flottant glassmorphique

- L’icône ouvre un panneau translucide superposé au site courant ; cliquer à
  nouveau sur l’icône ou sur Fermer le retire.
- `Alt+E` conserve l’ouverture du panneau Chrome latéral. Si une page interdit
  l’injection, l’icône ouvre aussi ce panneau latéral en repli.
- L’injection n’a lieu qu’après le clic explicite sur l’icône. `activeTab` et
  `scripting` déjà présents servent à ce geste, sans accès permanent aux sites.
- La page de l’extension reste isolée dans une iframe ; les ressources UI sont
  déclarées accessibles pour le rendu de ce panneau.

Cette version locale n’est pas publiée. La recette sur les sites et pages
incompatibles reste nécessaire avant diffusion.

## 1.0.4 — fonctions locales de documents, médias et archives

- Galerie des médias avec navigation, zoom et plein écran.
- Parcours d’archives et extraction de la sélection, avec limites de lecture explicites.
- Éditeur UTF-8 et versions locales avec restauration sous forme de copie.
- Recherche de texte DOCX, XLSX et PPTX.
- Sous-titres SRT/VTT ou pistes intégrées et diagnostic des codecs.

Cette version de développement nécessite le compagnon 1.0.4 et n’a pas été
publiée sur le Chrome Web Store ou GitHub. Les comptes, partages publics et
outils collaboratifs ne sont pas inclus.

## 1.0.3 — connexion guidée et préparation Chrome Web Store

- Identité officielle Store et compagnon correspondant, avec contrôle de leur concordance.
- Accueil guidé : télécharger le compagnon, vérifier la connexion et choisir son premier dossier.
- Réglages présentant les fonctions disponibles et les moteurs facultatifs manquants ; diagnostic technique replié.
- Installateur Chrome préconfiguré, réglages avancés facultatifs et lien Store proposé en fin de parcours.
- Guides mis à jour et précisions de confidentialité sur les métadonnées des fichiers choisis.

La publication Store dépend de l’examen de Google. Les moteurs restent facultatifs
et leur préparation avancée ; aucun moteur ni modèle d’IA téléchargé automatiquement.
L’EXE reste non signé et la recette complète sur Windows propre reste à réaliser.

## 1.0.1 — première préversion technique

- Première distribution gratuite via un dépôt public dédié ; code applicatif privé.
- Installateur Windows et extension séparée, numérotés et accompagnés de SHA256.
- Paquet public sans cartes de sources ni documents internes de développement.
- Licences et notices des composants distribués incluses.
- Explorateur à onglets/double panneau, aperçus, tags, organisation et console
  PowerShell avec thèmes, dont LCD rétro.

Cette publication ne vaut pas validation sur Windows propre. Aucun modèle d’IA,
fonction Pro, signature payante ou mise à jour native automatique ajouté.
