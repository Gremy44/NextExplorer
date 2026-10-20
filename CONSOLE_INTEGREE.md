# Console intégrée — 19 octobre 2026

## Utilisation

Dans l’explorateur en pleine page, ouvrez **Aperçu → Console**. Le compagnon Windows démarre un vrai terminal PowerShell dans le dossier actif : commandes, scripts, programmes interactifs, autocomplétion et historique de session. Aucun moteur supplémentaire à télécharger ; une mise à jour du compagnon est nécessaire.

Après installation, **désactivez puis réactivez NextExplorer dans `chrome://extensions`**, puis rouvrez l’explorateur. Le service worker peut garder la connexion à l’ancien compagnon lorsque seule la page est actualisée. L’installateur corrigé du 19 octobre compare le binaire actif et sa politique à ceux du paquet, même si la liaison au navigateur est déjà valide.

- **Suivre le dossier**, activé au départ, suit le panneau ou l’onglet actif. Désactivez-le pour garder la console dans son dossier.
- **Apparence du terminal** (icône palette) propose **Ubuntu**, **Dracula**, **Nord**, **Solarized sombre/clair**, **LCD rétro**, en plus de **Suivre l’interface**, **Sombre**, **Clair**, **Bleu PowerShell** et **Personnalisé** (fond et texte par défaut). Les six nouveaux presets comprennent les 16 couleurs ANSI, le curseur et la sélection. Le contraste est ajusté pour rester lisible ; les programmes peuvent conserver leurs propres couleurs explicites.
- **LCD rétro** : fond gris-vert, encre vert très sombre, couleurs ANSI dans des nuances d’encre discrètes et sélection inversée, façon écran à cristaux liquides. Contraste minimal de la palette avec son fond : 4,69:1. Le réglage reste limité à la console.
- **Police du thème** associe Ubuntu Mono à Ubuntu, JetBrains Mono à Dracula/Solarized, Cascadia Mono à Nord/LCD et conserve Consolas pour les autres palettes. Choix indépendant possible parmi ces quatre polices ; taille de **10 à 24 px**, interligne de **100 à 150 %**. Les trois polices ajoutées sont embarquées avec leurs licences : aucun téléchargement ni service distant à l’utilisation. Les réglages sont mémorisés dans le navigateur et s’appliquent sans redémarrer la session ; le nombre de lignes/colonnes est réajusté.
- Le preset Ubuntu affiche en permanence **« Apparence Ubuntu uniquement : vous utilisez PowerShell, pas Bash. »** Il ne change pas le shell et n’installe ni Linux, ni Bash, ni WSL.
- La ligne au-dessus du terminal indique son dossier réel. Si une commande tourne ou si vous avez commencé une saisie, le prochain dossier reste en attente ; il est appliqué au prochain prompt disponible. Seul le dernier dossier demandé est conservé.
- Une saisie effacée reste considérée comme en cours jusqu’à **Entrée** ou **Ctrl+C**, pour éviter d’injecter un changement de dossier dans une ligne en cours d’édition. Naviguer vers **Ce PC** suspend le suivi sans fermer PowerShell.
- **Interrompre** envoie Ctrl+C. **Effacer l’affichage** garde la session et son historique. **Fermer la session** termine PowerShell et ses processus enfants. La relance ouvre une session neuve dans le dossier actif.
- Redimensionnez ou agrandissez le volet avec ses commandes existantes. Passer à **Sélection** ou **Espace disque**, ou masquer le volet, conserve la session. Chaque page complète dispose de sa propre console ; ses onglets de dossiers partagent cette session.

## Fonctionnement et limites

Windows 10 avec ConPTY ou Windows 11 et Windows PowerShell sont requis. Les autres plateformes ne proposent pas encore ce terminal. L’extension utilise xterm.js, chargé à la demande, et le compagnon existant. Aucun serveur réseau ni compte supplémentaire ne relie le terminal à l’extension.

PowerShell démarre sans profil et sans élévation, avec les droits du compte Windows. La sortie et l’historique restent en mémoire ; NextExplorer ne les enregistre pas. Les changements automatiques de dossier apparaissent dans la sortie et sont exclus de l’historique avec les versions de PSReadLine compatibles. Fermer/recharger la page, arrêter le compagnon ou perdre la connexion termine la session et ses processus enfants. Masquer le volet ne les arrête pas. Cette console est distincte des tâches durables de l’onglet **Activité**.

**Les commandes peuvent modifier ou supprimer vos fichiers avec vos droits habituels. Elles ne passent pas par le journal ni par l’annulation de NextExplorer.** Un programme peut naturellement accéder au réseau ou enregistrer ses propres données. Le terminal n’est pas un bac à sable.

Le suivi dépend du prompt PowerShell fourni au démarrage. Un sous-shell ou le remplacement de la fonction `prompt` suspend la détection tant que ce prompt n’est pas retrouvé. Le dossier choisi est validé puis passé comme chemin littéral, y compris les espaces, apostrophes et caractères Unicode.

Limites : 8 sessions par compagnon, sortie en attente de 512 Kio par session, 2 000 lignes de défilement, requêtes de sortie de 64 Kio, entrée de 16 Kio par envoi et files bornées. Une sortie trop ancienne est retirée avec un message. Un collage trop volumineux ou une saturation bloque la saisie avec une erreur : utilisez **Interrompre**, vérifiez la ligne, puis reprenez ; aucune commande n’est rejouée automatiquement. Les séquences de copie au presse-papiers OSC 52 sont désactivées.

## Vérification reproductible

- `npm run check` : typage, tests existants et isolation des RPC console dans le service worker, refus des pages web, fermeture pendant une ouverture tardive.
- `npm run native:test` : suite Go, vrai PowerShell/ConPTY, chemin Unicode/apostrophe/crochets, suivi différé pendant saisie et commande longue, Ctrl+C, redimensionnement, fermeture, contrôle du propriétaire et bornes mémoire.
- `npm run test:console` : interface Chrome et compagnon réels ; commandes créant uniquement des fichiers temporaires, persistance après masquage/changement d’outil, suivi/épinglage, saisie préservée, interruption, agrandissement, fermeture et relance.
- `npm run test:console:extension` : même parcours dans l’extension empaquetée, avec le service worker et Native Messaging réels, refus d’accès entre vues et arrêt de PowerShell à la fermeture. Profil et données isolés ; enregistrement Native Messaging de Chromium remplacé temporairement puis restauré, sans changer celui de Chrome.
- `node scripts/console-extension-test.mjs --installed` : utilise le compagnon réellement enregistré pour Chromium, sans remplacer son enregistrement. Vérifie aussi une installation existante après mise à jour ; profil et fichiers de recette temporaires.

La recette Windows propre J1.7 et la validation de tous les programmes interactifs possibles restent distinctes.

### Thèmes et polices — complément du 19 octobre

Typage et **233 tests** réussis. La recette avec le compagnon installé (`extension-console-themes.log`) vérifie les huit palettes fixes, l’avertissement Ubuntu, le chargement effectif des trois polices embarquées, leur choix indépendant, la taille/interligne, la conservation de la variable PowerShell, les réglages après rechargement, le clavier et les largeurs 320/390 px. Captures `console-theme-ubuntu.png` et `console-colors-*.png` inspectées. Le paquet vérifie les empreintes des polices et la présence des licences. Aucun changement natif.

### Couleurs du terminal — complément du 19 octobre

Typage et **229 tests** réussis. Palettes et couleurs personnalisées vérifiées dans Chrome puis dans l’extension avec le compagnon installé : session et variable PowerShell conservées, palette fixe indépendante du thème global, suivi de l’interface, fermeture du menu avec Échap/changement d’outil, contrôles à 320/390 px et persistance après rechargement. Captures `console-colors-*.png`, logs `check-console-colors-final.log`, `browser-console-colors.log` et `extension-console-colors.log`. Aucun changement du compagnon pour ce complément.

## Résultat du 19 octobre

Typage et **227 tests TypeScript**, suite Go complète et parcours Chrome/compagnon réussis. La recette de l’extension empaquetée valide les onglets et le double panneau, le maintien d’une variable après masquage/changement d’outil, le suivi différé, l’épinglage, Ctrl+C, les chemins Unicode/apostrophe/crochets, l’ouverture/fermeture/relance, l’isolation entre pages et l’arrêt de PowerShell à la fermeture de sa page. Le test natif vérifie aussi l’arrêt d’un processus enfant et la fermeture malgré une entrée en attente. Affichage inspecté en clair/sombre à 320/390/900/1440 px ; le terminal adapte ses couleurs au thème et impose un contraste minimal de 4,5. Le parcours existant d’espace disque reste validé.

Preuves locales : `check-console-complete.log`, `native-console-complete.log`, `extension-console-complete.log`, `space-console-regression.log` et captures `console-*.png` dans `test-results`. Aucun fichier personnel utilisé dans ces recettes. Paquet, installateur et kit à utiliser ensemble ; installation sur Windows propre toujours à réaliser.
