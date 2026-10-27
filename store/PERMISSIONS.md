# Permissions et pratiques de confidentialité — dossier d’examen

Inventaire du manifeste et du code, 19 octobre 2026. Finalité unique : organiser et préparer les fichiers locaux utilisés avec les pages web.

| Permission | Rôle actuel et point d’entrée |
|---|---|
| `nativeMessaging` | Communiquer avec le compagnon local pour lire les dossiers choisis, réaliser les opérations, traiter les médias et ouvrir PowerShell. `public/background.js`, `src/bridge.ts`. Aucun exécutable natif dans le ZIP Store. |
| `storage` | Réglages, espaces, tags, collecte et règles dans `chrome.storage.local`. `src/bridge.ts`. |
| `contextMenus` | Actions explicites de collecte d’une page, d’un lien, d’une sélection ou d’une image depuis le clic droit. `src/collect-background.ts`. |
| `sidePanel` | Panneau Chrome natif ouvert par l’icône ou `Alt+E`, avec hauteur gérée par Chrome. `public/background.js`, `src/collect-background.ts`. |
| `tabs` | Afficher le contexte de la page choisie, conserver/restaurer les onglets d’un espace et vérifier la page cible d’une insertion. Lecture de titres/URL ; pas de permission `history`. `src/web.ts`, `src/BrowserCompanion.tsx`. |
| `tabGroups` | Conserver/restaurer les groupes d’onglets d’un espace enregistré par l’utilisateur. `src/web.ts`. |
| `activeTab` | Accès temporaire à l’onglet ciblé par un geste utilisateur pour les actions de page. `src/web.ts`. |
| `scripting` | Code embarqué pour détecter un champ de fichiers et y insérer les fichiers choisis, après examen de la cible. `src/web.ts`. Pas de script téléchargé exécuté dans l’extension. |
| `downloads` — facultative | Afficher les téléchargements et appliquer les règles de rangement explicitement activées. Demandée depuis l’outil Téléchargements. `src/DownloadList.tsx`, `src/download-background.ts`. |
| `debugger` — facultative | Capturer la page choisie en PDF avec `Page.printToPDF`. Demandée au lancement, session attachée à cet onglet puis détachée, y compris après erreur. `src/page-capture.ts`. N’est pas nécessaire à la navigation de fichiers. |
| `http://*/*`, `https://*/*` — hôtes facultatifs | Permettre la collecte de pages/images et l’insertion sur les sites choisis par l’utilisateur. `grant()` demande l’origine précise ; aucune origine n’est accordée globalement par défaut. `src/web.ts`, `src/image-capture.ts`. |

## Code et ressources

Le JavaScript de l’extension, PDF.js, les polices et les notices sont embarqués. Les pages et fichiers téléchargés sont des données à traiter ; ils ne remplacent pas le code de l’extension. Le compagnon Windows et ses moteurs restent des composants installés séparément, décrits dans la fiche et les instructions de test.

Le manifeste 1.0.6 n’expose plus l’interface via `web_accessible_resources` : le panneau s’ouvre dans Chrome, sans iframe injectée dans les sites.

## Déclaration dans le tableau de bord

Le traitement local doit être déclaré : ne pas cocher « aucune donnée traitée » par simple absence de serveur distant. Décrire au minimum le contenu des pages/fichiers, les URL/titres utilisés, l’activité des outils enregistrée localement et les transferts vers un site choisi. Reporter ces traitements dans les catégories réellement proposées par le tableau de bord et vérifier la cohérence avec la politique publiée.

Le code ne collecte pas un profil publicitaire, l’historique général Chrome ou des moyens de paiement. Les fichiers et pages choisis peuvent néanmoins contenir des informations sensibles : ne pas affirmer leur absence du contenu traité.

Dans les sources intégrant les dossiers distants, l’utilisateur saisit volontairement les identifiants du serveur choisi. Le compagnon assure directement les connexions SSH/SFTP/FTP/FTPS ; aucune permission Chrome d’hôte supplémentaire n’est nécessaire pour ces sockets natifs. La mémorisation facultative du secret utilise DPAPI Windows, hors stockage Chrome et exports. La politique doit décrire ces traitements avant distribution de ce nouveau compagnon ; ils ne sont pas inclus dans le Setup existant.

Les URLs publiques et le nom de projet Gremy44 sont renseignés dans la fiche.
Le nom et l’adresse de contact vérifiés du compte développeur, ainsi que l’ID
Store, restent à relever. La soumission attend aussi l’EXE correspondant à cette
identité et sa recette Windows propre.

Sources : [permissions minimales et données locales](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [politique de confidentialité](https://developer.chrome.com/docs/webstore/program-policies/privacy).
