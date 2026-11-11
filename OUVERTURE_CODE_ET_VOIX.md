# Ouverture du code et interface vocale locale — étude du 11 novembre 2026

## Nouvelle orientation du propriétaire

Ouvrir le projet et permettre à la communauté de l'utiliser et le faire évoluer ; d'éventuelles fonctionnalités payantes pourront être étudiées plus tard. Cette décision remplace l'orientation « code applicatif privé » du plan antérieur, sans transformer les simulations Founder en preuve que toute offre payante serait inutile.

Publication non exécutée dans cette étude. Choix de licence et identification exacte de « Mochi » demandés au propriétaire, encore à confirmer. Aucun modèle téléchargé ni serveur MCP développé.

## Préparation de l'ouverture

La [licence actuelle](LICENSE) réserve modification et redistribution des éléments propres au projet : rendre le dépôt visible ne la transforme pas en licence libre. [Explication GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

Options présentées : MIT si l'objectif est une réutilisation très libre, y compris commerciale, avec conservation des notices ; GPLv3 si l'objectif est de maintenir ouvertes les versions dérivées redistribuées, sous les conditions de cette licence. Le choix n'est pas fait par l'agent. Un futur payant reste possible, mais les droits déjà accordés aux copies ouvertes ne se retirent pas simplement ; contributions de tiers et licences des dépendances devront être prises en compte avant de créer une offre sous d'autres termes. [MIT](https://choosealicense.com/licenses/mit/), [GPLv3](https://choosealicense.com/licenses/gpl-3.0/).

Travail concret à effectuer avant diffusion du code :

- [ ] Confirmer la licence souhaitée et les droits sur les éléments propres au projet ; conserver les licences tierces.
- [ ] Préparer un instantané public du code nécessaire, tests, notices, instructions de construction et contribution.
- [ ] Examiner le contenu et l'historique pour secrets et données personnelles. Le contrôle des noms de fichiers effectué ici ne constitue pas une détection complète de secrets.
- [ ] Choisir une publication d'instantané propre ou un historique audité. Ne pas rendre public automatiquement tout l'historique privé, ses études internes et ses captures.
- [ ] Mettre en cohérence README, licence, contribution et pages de téléchargements ; conserver les binaires 1.0.7 existants et leurs empreintes.
- [ ] Construire et vérifier depuis l'instantané propre, puis publier dans le dépôt choisi par le propriétaire.

État constaté : 560 fichiers suivis ; aucun nom conventionnel de secret (`.env`, clé privée, credential) détecté dans l'arbre suivi ou la liste des chemins de l'historique. **Ce n'est pas un audit du contenu ni une autorisation d'exposer l'historique.** Les moteurs externes restent facultatifs et leurs licences restent distinctes. Les données de test réelles, outils téléchargés et profils locaux ignorés ne doivent pas être ajoutés au paquet source.

## Quel projet audio ?

Le nom est ambigu. Cette comparaison suppose **Moshi de Kyutai** ; le propriétaire doit confirmer le lien avant choix technique. Un dépôt [xiaolai/mochi](https://github.com/xiaolai/mochi) existe aussi, dont le README actuel présente principalement un avatar animé : ne pas l'assimiler au modèle vocal de Kyutai.

| Piste | Faits documentés | Appréciation pour NextExplorer |
| --- | --- | --- |
| [Moshi](https://github.com/kyutai-labs/moshi) | Dialogue vocal full duplex ; FAQ centrée sur l'anglais et indiquant l'absence de solution 8 Go ; Windows non supporté officiellement | Pas le premier choix pour un explorateur francophone Windows grand public |
| [Unmute](https://github.com/kyutai-labs/unmute) | Combine reconnaissance, LLM texte et synthèse ; documentation demandant 16 Go VRAM et Linux/WSL | Architecture intéressante ; installation de référence lourde pour notre pilote |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Reconnaissance locale, CPU ou GPU, Windows ; modèles multilingues disponibles | Candidat pour la transcription française, à mesurer sur les noms/chemins de fichiers |
| [Pocket TTS](https://github.com/kyutai-labs/pocket-tts) | Synthèse sur CPU, français annoncé dans le README actuel | Candidat de voix locale ; qualité française, dépendances et installation Windows à qualifier |

Prudence sur les chiffres Moshi : le README mentionne 24 Go dans la section des exigences PyTorch tout en listant désormais des modèles q8 expérimentaux ; certaines indications de la FAQ ne sont donc pas entièrement synchronisées. Cela ne constitue pas une validation d'un fonctionnement Windows/8 Go. Les latences annoncées par les auteurs ne sont pas des mesures sur le PC du propriétaire. Sources : [README](https://raw.githubusercontent.com/kyutai-labs/moshi/main/README.md), [FAQ](https://raw.githubusercontent.com/kyutai-labs/moshi/main/FAQ.md).

Pour whisper.cpp, le tableau amont indique `base` 142 Mio sur disque et environ 388 MB de mémoire ; `small` 466 Mio et environ 852 MB. Ce ne sont pas des budgets de toute la chaîne vocale. Choisir un modèle multilingue, pas une variante `.en` pour le français. Pocket TTS est un synthétiseur, pas un moteur de compréhension ni un assistant ; les variantes anglaises minuscules ne prouvent pas la même taille en français. Licences du code **et** des poids/voix choisis à vérifier avant redistribution.

## Rôle du MCP

MCP expose des outils et du contexte à un hôte IA ; il ne fournit ni reconnaissance audio, ni synthèse, ni intelligence au modèle. Un modèle vocal ne devient pas automatiquement capable d'utiliser les outils parce qu'un serveur MCP existe. [Architecture officielle](https://modelcontextprotocol.io/docs/learn/architecture).

Proposition de chaîne, à prototyper après décision :

```mermaid
flowchart LR
  A[Microphone activé par bouton] --> B[Transcription locale]
  B --> C[Interprétation et plan structuré]
  C --> D[Outils autorisés NextExplorer]
  D --> E[Résultat et état visibles]
  E --> F[Synthèse vocale locale facultative]
```

L'interprétation peut commencer par quelques intentions déterministes (« ouvre le dossier », « cherche ce nom ») ; une formulation libre nécessitera un petit LLM capable de produire des arguments structurés, à choisir et mesurer. [llama.cpp](https://github.com/ggml-org/llama.cpp) est un candidat d'exécution locale, pas un modèle sélectionné ni une garantie d'appels d'outils corrects.

Dans le code actuel, `native/main.go` possède déjà `HELLO`, lecture de dossiers, aperçu et opérations de fichiers, avec contrôle de concurrence et jobs. **Réutiliser ces services métier** ; ne pas faire exécuter une chaîne de terminal produite par la voix.

Deux chemins possibles : assistant interne appelant directement cette API métier ; ou façade MCP locale pour des hôtes compatibles. Le MCP est particulièrement utile pour exposer le contexte d'onglet, la sélection, la collecte, les aperçus et les activités ; un simple MCP de fichiers générique ne représente pas ce contexte d'extension.

Premier lot proposé en lecture : dossier actif, sélection, liste bornée de fichiers, recherche bornée, métadonnées et état des tâches. Commencer par ce contexte permet de tester aussi un assistant texte externe avant d'ajouter le microphone. Les noms d'outils et leurs schémas restent à définir ; aucune commande n'est implémentée ici.

Les actions IA d'écriture pourront ensuite passer par une préparation de plan/destination et une validation explicite, avec contrôles côté compagnon des chemins autorisés et des collisions. Cela ne réintroduit pas de confirmation dans les opérations manuelles directes demandées par l'utilisateur. Ne pas exposer le terminal général au modèle. Limiter l'accès au périmètre consenti et traiter le contenu des fichiers comme des données, pas des instructions d'autorisation. [Recommandations MCP sur les outils](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Ordre proposé

1. Choisir la licence et préparer la publication propre du socle.
2. Définir une API d'outils restreinte à partir du compagnon ; façade MCP locale si l'interopérabilité est recherchée.
3. Tester un assistant texte sur cinq intentions réelles, avec contexte et erreurs explicites.
4. Ajouter appui-pour-parler, transcription française et résultat visible ; voix de réponse facultative.
5. Mesurer latence, mémoire, faux déclenchements et compréhension des noms propres, puis seulement envisager une conversation full duplex.

L'IA vocale serait facultative, les téléchargements explicites et le parcours clavier/souris conservé. Aucun repli cloud implicite. Cette étude est une proposition d'architecture ; elle ne qualifie aucun moteur en conditions réelles.
