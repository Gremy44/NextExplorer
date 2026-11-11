# Sécurité

Signaler une vulnérabilité par le formulaire privé **Security → Report a vulnerability** du dépôt GitHub. Ne pas joindre de secret ni de fichier personnel à une issue publique. Si ce formulaire n'est pas disponible, ouvrir une issue demandant un canal privé, sans publier les détails d'exploitation.

Le compagnon exécute les opérations avec les droits du compte Windows ; le projet ne fournit pas une isolation du système d'exploitation.

Le serveur MCP fonctionne sur entrée/sortie standard, sans port réseau entrant. La configuration fixe les racines et les capacités ; le pont navigateur exige un opt-in distinct. Accorder `terminal` ou `execute` permet l'exécution avec les droits de l'utilisateur et dépasse les limites de dossiers des outils de fichiers. Les documents, noms de fichiers et pages web ne constituent jamais des instructions d'autorisation.

NextExplorer ne fournit pas de modèle ni de service cloud. Un client MCP connecté à un modèle distant peut lui transmettre le contenu qu'il lit : le choix du client et du modèle appartient à l'utilisateur. Pour un fonctionnement entièrement local, utiliser aussi un client et un modèle locaux.
