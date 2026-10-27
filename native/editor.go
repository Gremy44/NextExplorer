package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const editorLimit = 128 << 10
const versionLimit = 16 << 20
const versionsBudget = 256 << 20

type fileVersion struct {
	ID   string `json:"id"`
	Date string `json:"date"`
	Size int64  `json:"size"`
	Hash string `json:"hash"`
	Path string `json:"path"`
}

func textDigest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
func editableText(data []byte) bool {
	if !utf8.Valid(data) {
		return false
	}
	for _, b := range data {
		if b < 32 && b != '\n' && b != '\r' && b != '\t' {
			return false
		}
	}
	return true
}
func readEditor(path string) (any, error) {
	entry, err := statEntry(path)
	if err != nil {
		return nil, err
	}
	if entry.Type != "file" || entry.Size > editorLimit {
		return nil, fmt.Errorf("Éditeur limité aux fichiers texte UTF-8 de 128 Kio")
	}
	f, err := os.Open(entry.Path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, editorLimit+1))
	if err != nil {
		return nil, err
	}
	after, err := statEntry(path)
	if err != nil || after != entry || len(data) > editorLimit || !editableText(data) {
		return nil, fmt.Errorf("Fichier modifié, binaire ou encodage autre que UTF-8")
	}
	return M{"text": strings.TrimPrefix(string(data), "\ufeff"), "hash": textDigest(data), "entry": entry}, nil
}
func (h *Host) versionsRoot() (string, error) {
	if h.journalDir == "" {
		return "", fmt.Errorf("Stockage des versions indisponible : mettez à jour le compagnon")
	}
	root := filepath.Join(h.journalDir, "file-versions")
	if err := os.MkdirAll(root, 0700); err != nil {
		return "", err
	}
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("Stockage des versions invalide")
	}
	return root, nil
}
func versionKey(path string) string { return textDigest([]byte(strings.ToLower(filepath.Clean(path)))) }
func (h *Host) versionList(path string) ([]fileVersion, error) {
	a, err := validPath(path)
	if err != nil {
		return nil, err
	}
	root, err := h.versionsRoot()
	if err != nil {
		return nil, err
	}
	files, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	result := []fileVersion{}
	for _, f := range files {
		if !strings.HasPrefix(f.Name(), versionKey(a)+"-") || !strings.HasSuffix(f.Name(), ".json") || f.Type()&os.ModeSymlink != 0 {
			continue
		}
		meta, err := os.Open(filepath.Join(root, f.Name()))
		if err != nil {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(meta, 16385))
		meta.Close()
		if err != nil || len(data) > 16384 {
			continue
		}
		var v fileVersion
		if json.Unmarshal(data, &v) == nil && strings.EqualFold(v.Path, a) && f.Name() == v.ID+".json" {
			result = append(result, v)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date > result[j].Date })
	return result, nil
}
func (h *Host) keepVersion(path string, data []byte) (fileVersion, error) {
	v := fileVersion{ID: versionKey(path) + "-" + randomID(), Date: time.Now().UTC().Format(time.RFC3339Nano), Size: int64(len(data)), Hash: textDigest(data), Path: path}
	if len(data) > versionLimit {
		return v, fmt.Errorf("Versions limitées à 16 Mio par fichier")
	}
	root, err := h.versionsRoot()
	if err != nil {
		return v, err
	}
	existing, err := h.versionList(path)
	if err != nil {
		return v, err
	}
	if len(existing) > 0 && existing[0].Hash == v.Hash {
		return existing[0], nil
	}
	if len(existing) >= 20 {
		return v, fmt.Errorf("20 versions conservées : supprimez une ancienne version avant de continuer")
	}
	var total int64
	files, err := os.ReadDir(root)
	if err != nil {
		return v, err
	}
	for _, f := range files {
		if info, e := f.Info(); e == nil {
			total += info.Size()
		}
	}
	if total+int64(len(data))+16384 > versionsBudget {
		return v, fmt.Errorf("Budget des versions atteint (256 Mio) : libérez des versions")
	}
	content := filepath.Join(root, v.ID+".bin")
	f, err := os.OpenFile(content, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return v, err
	}
	complete := false
	defer func() {
		if !complete {
			os.Remove(content)
		}
	}()
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return v, err
	}
	meta, _ := json.Marshal(v)
	m, err := os.OpenFile(filepath.Join(root, v.ID+".json"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return v, err
	}
	_, err = m.Write(meta)
	if err == nil {
		err = m.Sync()
	}
	closeErr = m.Close()
	if err == nil {
		err = closeErr
	}
	complete = err == nil
	if !complete {
		os.Remove(filepath.Join(root, v.ID+".json"))
	}
	return v, err
}
func (h *Host) saveEditor(p Payload) (any, error) {
	entry, err := statEntry(p.Path)
	if err != nil {
		return nil, err
	}
	if p.Expected == nil || *p.Expected != entry || entry.Type != "file" || entry.Size > editorLimit || len(p.Text) > editorLimit || !editableText([]byte(p.Text)) {
		return nil, fmt.Errorf("Fichier modifié ou texte UTF-8 de 128 Kio maximum requis")
	}
	f, err := openEditorExclusive(entry.Path)
	if err != nil {
		return nil, fmt.Errorf("Fichier utilisé par une autre application : %w", err)
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return nil, fmt.Errorf("Fichier ordinaire requis")
	}
	old, err := io.ReadAll(io.LimitReader(f, editorLimit+1))
	if err != nil {
		return nil, err
	}
	if !editableText(old) || len(old) > editorLimit || p.Snapshot != textDigest(old) {
		return nil, fmt.Errorf("Le fichier a changé depuis l’ouverture. Rechargez-le avant d’enregistrer")
	}
	text := strings.TrimPrefix(p.Text, "\ufeff")
	if strings.Contains(string(old), "\r\n") {
		text = strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\n", "\r\n")
	}
	if strings.HasPrefix(string(old), "\ufeff") {
		text = "\ufeff" + text
	}
	data := []byte(text)
	if len(data) > editorLimit {
		return nil, fmt.Errorf("Texte supérieur à 128 Kio")
	}
	if textDigest(data) == textDigest(old) {
		return M{"saved": true}, nil
	}
	version, err := h.keepVersion(entry.Path, old)
	if err != nil {
		return nil, err
	}
	// An exclusive OS handle prevents concurrent writes. A synced version exists before touching the original.
	write := func(b []byte) error {
		if _, e := f.Seek(0, 0); e != nil {
			return e
		}
		if _, e := f.Write(b); e != nil {
			return e
		}
		if e := f.Truncate(int64(len(b))); e != nil {
			return e
		}
		return f.Sync()
	}
	if err = write(data); err != nil {
		restore := write(old)
		return nil, fmt.Errorf("Écriture échouée : %v ; récupération : %v ; version conservée %s", err, restore, version.ID)
	}
	return M{"saved": true, "version": version.ID}, nil
}
func (h *Host) fileVersions(action string, p Payload) (any, error) {
	a, err := validPath(p.Path)
	if err != nil {
		return nil, err
	}
	if action == "FILE_VERSIONS" {
		return h.versionList(a)
	}
	if action == "FILE_VERSION_CREATE" {
		entry, e := statEntry(a)
		if e != nil {
			return nil, e
		}
		if p.Expected == nil || *p.Expected != entry || entry.Type != "file" || entry.Size > versionLimit {
			return nil, fmt.Errorf("Fichier inchangé de 16 Mio maximum requis")
		}
		f, e := os.Open(a)
		if e != nil {
			return nil, e
		}
		defer f.Close()
		info, e := f.Stat()
		if e != nil || !info.Mode().IsRegular() || info.Size() != entry.Size || fmt.Sprint(info.ModTime().UnixNano()) != entry.Stamp {
			return nil, fmt.Errorf("Fichier remplacé avant la sauvegarde")
		}
		data, e := io.ReadAll(io.LimitReader(f, versionLimit+1))
		if e != nil {
			return nil, e
		}
		after, e := statEntry(a)
		if e != nil || after != entry || int64(len(data)) != entry.Size { return nil, fmt.Errorf("Fichier modifié pendant la sauvegarde") }
		return h.keepVersion(a, data)
	}
	versions, err := h.versionList(a)
	if err != nil {
		return nil, err
	}
	var selected *fileVersion
	for _, v := range versions {
		if v.ID == p.Name {
			copy := v
			selected = &copy
			break
		}
	}
	if selected == nil {
		return nil, fmt.Errorf("Version inconnue")
	}
	root, err := h.versionsRoot()
	if err != nil {
		return nil, err
	}
	file := filepath.Join(root, selected.ID+".bin")
	if action == "FILE_VERSION_DELETE" {
		if err := os.Remove(file); err != nil && !os.IsNotExist(err) {
			return nil, err
		}
		return true, os.Remove(filepath.Join(root, selected.ID+".json"))
	}
	f, err := os.Open(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, versionLimit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) != selected.Size || len(data) > versionLimit || textDigest(data) != selected.Hash {
		return nil, fmt.Errorf("Version endommagée")
	}
	if action == "FILE_VERSION_READ" {
		if len(data) > editorLimit || !editableText(data) {
			return nil, fmt.Errorf("Aperçu réservé au texte UTF-8 de 128 Kio maximum ; restaurez une copie")
		}
		return M{"text": string(data)}, nil
	}
	if action != "FILE_VERSION_RESTORE" {
		return nil, fmt.Errorf("Action de version inconnue")
	}
	// Restore is always a new sibling file, never an overwrite.
	dest := uniquePath(filepath.Join(filepath.Dir(a), strings.TrimSuffix(filepath.Base(a), filepath.Ext(a))+"-restaure"+filepath.Ext(a)))
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return nil, err
	}
	_, err = out.Write(data)
	if err == nil {
		err = out.Sync()
	}
	closeErr := out.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(dest)
	}
	return M{"path": dest}, err
}
