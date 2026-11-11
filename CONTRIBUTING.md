# Contribuer à NextExplorer

Le code est sous MIT ; aucun compte ni paiement NextExplorer n'est nécessaire.

1. Forker le dépôt puis créer une branche.
2. Installer Node.js 22+, Go 1.26+, puis lancer `npm ci`.
3. Lire [DESIGN.md](DESIGN.md) pour l'interface et [MCP.md](MCP.md) pour les outils des assistants.
4. Faire une modification ciblée, conserver les protections contre les écrasements et les changements externes, puis vérifier `npm run check`, `npm run native:test`, `npm run build` et `npm run native:build`.
5. Ouvrir une pull request avec le problème résolu, les vérifications effectuées et les limites restantes. Pour une interface modifiée, joindre une capture sans fichiers personnels.

La recette MCP Windows complète s'exécute avec `npm run test:mcp:extension` après compilation et installation des navigateurs Playwright dans `.tools/browsers`. Elle utilise des dossiers et profils temporaires et restaure l'enregistrement natif Chromium. Ne pas lancer simultanément deux recettes qui changent ce même enregistrement.

Les signalements de bugs doivent indiquer la version de l'extension, celle du compagnon, le navigateur, Windows et un scénario reproductible. Éviter les journaux bruts, chemins personnels, identifiants de serveur, documents ou captures confidentiels. Les études de `founder/` sont des simulations de travail, pas des données de clients ni une preuve de demande.

Pour une faille, voir [SECURITY.md](SECURITY.md). Les nouveaux moteurs, protocoles et formats doivent conserver leurs notices et indiquer leurs limites ; la présence d'une idée dans la feuille de route ne signifie pas qu'elle est disponible.
