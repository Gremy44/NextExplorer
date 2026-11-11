package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
)

// A closed catalogue: neither MCP nor the browser relay accepts arbitrary dispatch.
type mcpSpec struct {
	Action, Fields, Description string
	Caps                        []string
	Kind                        string
}

func (s mcpSpec) name() string { return "nxe_" + strings.ToLower(s.Action) }
func (s mcpSpec) writes() bool {
	for _, c := range s.Caps {
		if c == "write" {
			return true
		}
	}
	return false
}
func (s mcpSpec) readOnly() bool {
	if s.writes() || s.Action == "BATCH_RENAME" || s.Action == "REMOTE_DISCONNECT" {
		return false
	}
	for _, cap := range s.Caps {
		if cap == "terminal" || cap == "execute" || cap == "desktop" {
			return false
		}
	}
	return true
}

var mcpSpecs = []mcpSpec{
	{"HELLO", "", "Versions, capacités et moteurs installés ; ne télécharge rien.", nil, "native"},
	{"FS_LIST_DIR", "path! offset limit filter mode showHidden mixedSort sortBy sortOrder snapshot", "Lister un dossier autorisé, avec pagination et instantané.", nil, "native"},
	{"DISK_VOLUMES", "", "Capacité et espace disponible des lecteurs.", nil, "native"},
	{"FS_STAT", "path!", "Métadonnées d'un fichier ou dossier.", nil, "native"},
	{"FS_WATCH", "paths!", "Surveiller jusqu'à 8 dossiers locaux (non récursif), liste vide pour arrêter. Les notifications se lisent via FS_CHANGES.", nil, "native"},
	{"FS_CHANGES", "", "Consommer les changements des dossiers surveillés par ce client ; overflow=true exige de relister les dossiers.", nil, "native"},
	{"FS_CHECK_ENTRIES", "entries!", "Vérifier en lot les références et changements externes.", nil, "native"},
	{"FS_READ", "path! offset limit", "Lire par morceaux bornés ; contenu en base64.", nil, "native"},
	{"FS_TEXT", "path!", "Extraire le texte PDF si le moteur facultatif est disponible.", nil, "native"},
	{"OFFICE_TEXT", "path!", "Extraire un aperçu texte Office borné.", nil, "native"},
	{"EDITOR_READ", "path!", "Lire un texte éditable avec instantané de conflit (UTF-8, 128 Kio).", nil, "native"},
	{"EDITOR_SAVE", "path! text! snapshot! expected!", "Enregistrer le texte avec protection contre les modifications externes et version précédente. Reprendre hash et entry de EDITOR_READ.", []string{"write"}, "native"},
	{"FILE_VERSIONS", "path!", "Lister les versions locales d'un fichier.", nil, "native"},
	{"FILE_VERSION_READ", "path! name!", "Consulter une version sans remplacer l'original.", nil, "native"},
	{"FILE_VERSION_CREATE", "path! expected!", "Créer une version locale.", []string{"write"}, "native"},
	{"FILE_VERSION_RESTORE", "path! name!", "Restaurer une version dans une copie sans écrasement.", []string{"write"}, "native"},
	{"FILE_VERSION_DELETE", "path! name!", "Supprimer explicitement une version sauvegardée.", []string{"write"}, "native"},
	{"FS_WRITE", "path! name! text!", "Créer un fichier texte sans écraser un fichier existant.", []string{"write"}, "native"},
	{"FS_UPLOAD", "path! name! data! offset final", "Écrire un fichier binaire par morceaux base64 ; suivre le protocole d'upload et ses limites.", []string{"write"}, "native"},
	{"FS_MKDIR", "path! name!", "Créer un sous-dossier.", []string{"write"}, "native"},
	{"FS_RENAME", "path! name!", "Renommer sans remplacer une destination occupée.", []string{"write"}, "native"},
	{"FS_TRASH", "paths!", "Mettre les fichiers dans la corbeille récupérable de NextExplorer.", []string{"write"}, "native"},
	{"FS_RESTORE", "path!", "Restaurer un enregistrement de corbeille sans écrasement.", []string{"write"}, "native"},
	{"FS_TRANSFER", "paths! destination! mode conflict merge remoteServers", "Démarrer une copie/déplacement durable ; résultat via tâches. Pas de répétition automatique.", []string{"write"}, "native"},
	{"BATCH_RENAME", "paths! pattern replacement prefix suffix case start step digits number apply", "Prévisualiser ou appliquer un renommage par lot ; apply=true exige write.", nil, "native"},
	{"HASH", "path! algorithm expected", "Empreinte de contenu, avec vérification de référence facultative.", nil, "native"},
	{"SCAN", "path!", "Analyse d'espace disque durable et paginée, état via jobs.", nil, "native"},
	{"DUPLICATES", "path! paths", "Chercher les copies identiques ; aucune suppression automatique.", nil, "native"},
	{"CONVERSION_CAPABILITIES", "", "Formats et codecs réellement disponibles dans les moteurs.", nil, "native"},
	{"QUICK_MEDIA_INFO", "path!", "Informations médias pour l'atelier.", nil, "native"},
	{"QUICK_IMAGE_INFO", "path! expected!", "Dimensions et informations d'image.", nil, "native"},
	{"QUICK_ACTION", "paths! destination! mode! startSeconds endSeconds angle", "Rotation (mode rotate, angle 90/-90) ou extrait média (mode trim, startSeconds/endSeconds). Exporte des copies.", []string{"write"}, "native"},
	{"CONVERT", "paths! destination! format! mode width quality videoQuality bitrate codec normalize strip targetMB tags", "Conversion images/vidéos dans une tâche durable, selon capacités du moteur ; mode convert/remux.", []string{"write"}, "native"},
	{"RECIPE", "paths! destination! format! mode width quality videoQuality bitrate codec normalize strip targetMB tags archive! archiveFormat password name!", "Exécuter la recette conversion puis archive existante ; archive=true et name en .zip requis.", []string{"write"}, "native"},
	{"ZIP", "paths! destination! name! format archiveFormat password store", "Créer une archive ZIP/7z selon moteur et paramètres ; chiffrement facultatif.", []string{"write"}, "native"},
	{"ARCHIVE_LIST", "path!", "Inventaire d'une archive, selon moteur disponible.", nil, "native"},
	{"ARCHIVE_BROWSE", "path! expected!", "Parcourir une archive inchangée sans extraction globale (128 Mio maximum).", nil, "native"},
	{"ARCHIVE_READ_MEMBER", "path! name! expected!", "Lire un membre d'archive (512 Kio maximum), sans écriture de l'original.", nil, "native"},
	{"ZIP_EXTRACT", "path! destination! conflict merge password members expected", "Extraire une archive avec les contrôles natifs de chemins et collisions.", []string{"write"}, "native"},
	{"ARCHIVE_EXTRACT", "path! destination! conflict merge password members expected", "Extraction durable des formats pris en charge par le moteur.", []string{"write"}, "native"},
	{"METADATA", "path!", "Lire les métadonnées via le moteur existant.", nil, "native"},
	{"METADATA_WRITE", "paths! tags strip", "Appliquer des métadonnées via une tâche vérifiable.", []string{"write"}, "native"},
	{"IMAGE_PREVIEW", "path! expected! width session", "Aperçu image natif borné et annulable.", nil, "native"},
	{"IMAGE_SAMPLE", "path! expected! session", "Échantillon visuel pour rapprochements d'images, pas une preuve de doublon.", nil, "native"},
	{"IMAGE_PREVIEW_CANCEL", "session!", "Annuler un aperçu appartenant à ce client.", nil, "native"},
	{"MEDIA_OPEN", "path! expected!", "Ouvrir un flux média local borné ; fermer le bail après usage.", nil, "native"},
	{"MEDIA_CLOSE", "name!", "Fermer le jeton d'un flux appartenant à ce client.", nil, "native"},
	{"MEDIA_WAVEFORM", "path! expected!", "Forme d'onde audio selon moteur.", nil, "native"},
	{"MEDIA_DETAILS", "path! expected!", "Pistes audio/vidéo et métadonnées de lecture.", nil, "native"},
	{"MEDIA_SUBTITLE", "path! expected! mode name offset", "Lire une piste de sous-titres selon moteur ; mode embedded et offset=piste, sinon name=SRT/VTT voisin.", nil, "native"},
	{"DOWNLOAD", "url! destination! name! mode", "Télécharger explicitement une ressource dans un dossier autorisé ; mode media pour le moteur facultatif yt-dlp.", []string{"write", "network"}, "native"},
	{"JOBS", "", "État des tâches créées par ce périmètre MCP, sans accéder aux autres tâches.", nil, "native"},
	{"JOB_RESULT", "jobId! offset limit", "Résultat d'une tâche de ce périmètre ; pagination des analyses d'espace.", nil, "native"},
	{"JOB_CONTROL", "jobId! command! password", "Contrôle explicite d'une tâche du périmètre : arrêt, pause ou reprise sûre.", []string{"write"}, "native"},
	{"OPERATION_JOURNAL", "", "Journal des tâches appartenant au périmètre MCP.", nil, "native"},
	{"TRANSFER_UNDO_CHECK", "jobId!", "Vérifier si un transfert du périmètre est annulable.", nil, "native"},
	{"TRANSFER_UNDO", "jobId!", "Annuler un transfert du périmètre après vérification native.", []string{"write"}, "native"},
	{"TRANSFER_UNDO_RESUME", "jobId!", "Reprendre explicitement une annulation interrompue du périmètre.", []string{"write"}, "native"},
	{"GIT_STATUS", "path!", "État Git du dossier autorisé, en lecture.", nil, "native"},
	{"OS_OPEN", "path! mode!", "Ouvrir dans une application locale (mode default/code/terminal) ; exécution explicitement autorisée requise.", []string{"execute"}, "native"},
	{"OS_DRAG_FILES", "paths!", "Dépôt Shell Windows ; exige une interaction physique et l'autorisation desktop.", []string{"desktop"}, "native"},
	{"TERMINAL_OPEN", "path! columns rows", "Ouvrir une console PowerShell locale appartenant à ce client.", []string{"terminal"}, "native"},
	{"TERMINAL_READ", "session! offset limit", "Lire uniquement la console de ce client.", []string{"terminal"}, "native"},
	{"TERMINAL_WRITE", "session! data!", "Envoyer du texte à la console autorisée ; une commande possède les droits du compte Windows.", []string{"terminal"}, "native"},
	{"TERMINAL_SYNC", "session! path!", "Synchroniser le dossier de la console selon les règles du compagnon.", []string{"terminal"}, "native"},
	{"TERMINAL_RESIZE", "session! columns! rows!", "Dimensionner la console du client.", []string{"terminal"}, "native"},
	{"TERMINAL_CLOSE", "session!", "Fermer la console du client.", []string{"terminal"}, "native"},
	{"REMOTE_PROFILES", "", "Lister les profils distants autorisés, sans secrets.", []string{"remote"}, "native"},
	{"REMOTE_PROFILE_SAVE", "profile! password remember", "Enregistrer une connexion distante et éventuellement son secret protégé.", []string{"remote", "write", "settings"}, "native"},
	{"REMOTE_PROFILE_DELETE", "id!", "Retirer une connexion autorisée, sans effacer les fichiers du serveur.", []string{"remote", "write", "settings"}, "native"},
	{"REMOTE_CONNECT", "id! password remember confirmFingerprint allowPlainFTP", "Connexion avec vérification de clé SSH/certificat et acceptation FTP explicite.", []string{"remote", "network"}, "native"},
	{"REMOTE_DISCONNECT", "id!", "Déconnecter un serveur autorisé.", []string{"remote"}, "native"},
	{"REMOTE_CHMOD", "path! mode! expected!", "Modifier les permissions d'une référence SFTP, sans récursion.", []string{"remote", "write"}, "native"},
	{"REMOTE_DELETE", "path! expected!", "Suppression distante permanente selon capacités du protocole.", []string{"remote", "write"}, "native"},
	{"REMOTE_TERMINAL_OPEN", "path! columns rows", "Console SSH explicite si le serveur fournit un shell compatible.", []string{"remote", "terminal", "network"}, "native"},
	{"REMOTE_TERMINAL_READ", "session! offset limit", "Lire la console SSH du client.", []string{"remote", "terminal"}, "native"},
	{"REMOTE_TERMINAL_WRITE", "session! data!", "Écrire dans la console SSH explicitement autorisée.", []string{"remote", "terminal"}, "native"},
	{"REMOTE_TERMINAL_SYNC", "session! path!", "Suivre le dossier dans la console SSH du client.", []string{"remote", "terminal"}, "native"},
	{"REMOTE_TERMINAL_RESIZE", "session! columns! rows!", "Dimensionner la console SSH du client.", []string{"remote", "terminal"}, "native"},
	{"REMOTE_TERMINAL_CLOSE", "session!", "Fermer la console SSH du client.", []string{"remote", "terminal"}, "native"},
}

// Browser tools use the same closed wire contract in the worker and extension.
type mcpBrowserArgs struct {
	ViewID    string   `json:"viewId,omitempty"`
	Operation string   `json:"operation,omitempty"`
	Domain    string   `json:"domain,omitempty"`
	Path      string   `json:"path,omitempty"`
	Paths     []string `json:"paths,omitempty"`
	ID        string   `json:"id,omitempty"`
	Query     string   `json:"query,omitempty"`
	Name      string   `json:"name,omitempty"`
	URL       string   `json:"url,omitempty"`
	Mode      string   `json:"mode,omitempty"`
	Offset    int      `json:"offset,omitempty"`
	Limit     int      `json:"limit,omitempty"`
	Value     any      `json:"value,omitempty"`
}

func init() {
	browser := []mcpSpec{
		{"BROWSER_DOCUMENT", "operation! viewId paths! path! name! value", "Créer un PDF (combine), annoter un PDF (annotate, name .pdf) ou une image (annotate-image, name .png). value.overlays : page,x,y,width,height,angle,data PNG base64. 20 originaux/64 Mio maximum, copies sans écrasement. Vue ouverte requise.", []string{"browser", "write"}, "browser"},
		{"BROWSER_PREPARE_IMAGES", "operation! paths path id value", "Préparation web : start (paths, path=destination, value={format,width,quality,maxBytes,strip}) ; check (id) vérifie les copies et contraintes. Historique partagé avec l'interface.", []string{"browser", "write"}, "browser"},
		{"BROWSER_COMPARE", "paths! mode offset limit", "Comparer deux dossiers locaux/distants autorisés (paths=[source,destination]), par nom/taille/date au niveau courant. Aucun contenu ni sous-dossier comparé ; aucune copie déclenchée.", []string{"browser"}, "browser"},
		{"BROWSER_CONTEXT", "", "Profils et vues connectés, onglets, sélection et outils visibles. MCP doit être activé dans les réglages.", []string{"browser"}, "browser"},
		{"BROWSER_ORGANIZATION_READ", "domain! offset limit", "Lire un domaine : tags, appearances, folders, preferences, rules, presets, families, favorites, quicklinks, spaces, collection, collections, captures, preparations, insertionHistory, categories, console, downloadRules, downloadHistory. Résultats filtrés au périmètre ; pagination.", []string{"browser"}, "browser"},
		{"BROWSER_ORGANIZATION_WRITE", "domain! operation! value paths id", "Modifier un domaine validé : tags(assign/unassign/label), appearances(set/remove), folders(set/remove), rules/presets/families/spaces(upsert/remove), favorites/quicklinks/collection(add/remove), captures(remove). Aucun accès brut au stockage.", []string{"browser", "write"}, "browser"},
		{"BROWSER_PREFERENCES", "value!", "Modifier les réglages validés. Ne peut pas accorder les permissions MCP, distantes ou automatiques. Paramètres de console via BROWSER_CONSOLE_SETTINGS.", []string{"browser", "write", "settings"}, "browser"},
		{"BROWSER_DOWNLOAD_RULE", "operation! value id", "Enregistrer/supprimer une règle ; activation automatique exige aussi automation et permission downloads déjà accordée.", []string{"browser", "write", "automation"}, "browser"},
		{"BROWSER_DOWNLOADS", "operation! id path mode", "Lister les téléchargements terminés ou ranger un élément (operation=file, id, path destination, mode copy/move). Permission downloads nécessaire ; les règles existantes restent explicites.", []string{"browser", "write"}, "browser"},
		{"BROWSER_SEARCH", "path! query! mode limit", "Rechercher/indexer/classer localement (mode names, content, related, groups), avec les algorithmes classiques existants. Travail borné, pas de modèle IA.", []string{"browser"}, "browser"},
		{"BROWSER_WEB", "operation! viewId paths path url mode value", "Session navigateur (session), restauration (restore, value=session), page active (page), capture page (capture, path, url, mode markdown/weblink), PDF (pdf), sélection (selection), inspection des champs (uploads), insertion de fichiers (insert, paths, value.target issu de uploads). Ne soumet aucun formulaire ; le site peut réagir au changement du champ. Permissions de site et gestes navigateur préservés.", []string{"browser", "write", "network"}, "browser"},
		{"BROWSER_UI", "operation! viewId path paths id mode value", "Piloter la vue : navigate (value.pane optionnel), select, tab-new/activate/close/move, view, sort, split, filter (value.query), pane (value.index), details (value.open/expanded), preview, edit, versions, refresh, workspace-save/open. Choisir viewId si plusieurs vues.", []string{"browser", "write"}, "browser"},
		{"BROWSER_TOOL", "operation! viewId paths", "Ouvrir un outil existant via sa commande : search, tags, quick, convert, batch, zip, extract, terminal, scan, duplicates, groups, web, pdf, downloads, spaces, prepare, metadata, trashList, settings, git, appearance, home, drives, mkdir, note. Ouvre l'interface sans appliquer ses formulaires.", []string{"browser", "write"}, "browser"},
		{"BROWSER_DRAFTS", "operation! viewId id", "Lister, reprendre ou supprimer un brouillon local de l'éditeur (list/resume/discard). Sauvegarde réelle via EDITOR_SAVE et son snapshot.", []string{"browser", "write"}, "browser"},
		{"BROWSER_CONSOLE_SETTINGS", "value!", "Thème, police, taille et suivi du dossier de la console ; ne lance aucune commande. TERMINAL_* fournit la console native réelle.", []string{"browser", "write", "settings"}, "browser"},
	}
	mcpSpecs = append(mcpSpecs, browser...)
}

func mcpSchema(s mcpSpec) (*jsonschema.Schema, error) {
	// Reuse the actual wire types so schema and native implementation cannot drift.
	typ := reflect.TypeOf(Payload{})
	if s.Kind == "browser" {
		typ = reflect.TypeOf(mcpBrowserArgs{})
	}
	if strings.HasPrefix(s.Action, "REMOTE_") && !strings.HasPrefix(s.Action, "REMOTE_TERMINAL_") {
		typ = reflect.TypeOf(remotePayload{})
	}
	whole, err := jsonschema.ForType(typ, nil)
	if err != nil {
		return nil, err
	}
	schema := &jsonschema.Schema{Type: "object", Properties: map[string]*jsonschema.Schema{}, AdditionalProperties: &jsonschema.Schema{Not: &jsonschema.Schema{}}, Defs: whole.Defs}
	for _, field := range strings.Fields(s.Fields) {
		name := strings.TrimSuffix(field, "!")
		p := whole.Properties[name]
		if p == nil {
			return nil, fmt.Errorf("MCP %s: champ inconnu %s", s.Action, name)
		}
		schema.Properties[name] = p
		if strings.HasSuffix(field, "!") {
			schema.Required = append(schema.Required, name)
		}
	}
	return schema, nil
}

func validateMCPArgs(s mcpSpec, args map[string]any) error {
	if args == nil {
		args = map[string]any{}
	}
	schema, err := mcpSchema(s)
	if err != nil {
		return err
	}
	resolved, err := schema.Resolve(nil)
	if err != nil {
		return err
	}
	if err := resolved.Validate(args); err != nil {
		return fmt.Errorf("arguments %s invalides : %w", s.name(), err)
	}
	return nil
}

func mcpSpecByName(name string) (mcpSpec, bool) {
	for _, s := range mcpSpecs {
		if s.name() == name {
			return s, true
		}
	}
	return mcpSpec{}, false
}
func mcpJSON(value any) json.RawMessage { data, _ := json.Marshal(value); return data }
