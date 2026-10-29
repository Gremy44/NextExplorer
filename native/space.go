package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
)

type spaceItem struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

type spaceResult struct {
	Path        string      `json:"path"`
	Items       []spaceItem `json:"items"`
	Total       int64       `json:"total"`
	Skipped     int         `json:"skipped"`
	Scanned     int64       `json:"scanned"`
	Omitted     int         `json:"omitted,omitempty"`
	Truncated   bool        `json:"truncated"`
	ItemsStored bool        `json:"itemsStored,omitempty"`
}

func (j *Job) scanSpace(path string) (any, error) {
	root, err := validPath(path)
	if err != nil {
		return nil, err
	}
	result := &spaceResult{Path: root, Items: []spaceItem{}}
	var walk func(string, int, func(spaceItem)) (int64, error)
	walk = func(directory string, depth int, collect func(spaceItem)) (int64, error) {
		if err := j.check(); err != nil {
			return 0, err
		}
		if depth > 512 {
			result.Truncated = true
			result.Skipped++
			return 0, nil
		}
		folder, err := os.Open(directory)
		if err != nil {
			if depth == 0 {
				return 0, err
			}
			result.Skipped++
			return 0, nil
		}
		defer folder.Close()
		var total int64
		for {
			entries, readErr := folder.ReadDir(256)
			for _, entry := range entries {
				if err := j.check(); err != nil {
					return total, err
				}
				result.Scanned++
				location := filepath.Join(directory, entry.Name())
				if entry.Type()&os.ModeSymlink != 0 {
					result.Skipped++
					continue
				}
				var bytes int64
				if entry.IsDir() {
					bytes, err = walk(location, depth+1, nil)
					if err != nil {
						return total, err
					}
				} else {
					info, err := entry.Info()
					if err != nil || !info.Mode().IsRegular() {
						result.Skipped++
						continue
					}
					bytes = info.Size()
					j.progress(1)
				}
				total += bytes
				if collect != nil {
					collect(spaceItem{Path: location, Size: bytes})
				}
			}
			if readErr == io.EOF {
				return total, nil
			}
			if readErr != nil {
				if depth == 0 {
					return total, readErr
				}
				result.Skipped++
				return total, nil
			}
		}
	}
	// Bound analysis memory; the complete row set is stored outside the task record.
	metadataBytes := 0
	result.Total, err = walk(root, 0, func(item spaceItem) {
		encoded, _ := json.Marshal(item)
		if metadataBytes+len(encoded)+1 > 60<<20 {
			result.Omitted++
			result.Truncated = true
			return
		}
		metadataBytes += len(encoded) + 1
		result.Items = append(result.Items, item)
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(result.Items, func(i, k int) bool {
		if result.Items[i].Size == result.Items[k].Size {
			return result.Items[i].Path < result.Items[k].Path
		}
		return result.Items[i].Size > result.Items[k].Size
	})
	if j.host != nil && j.host.durableDir != "" {
		if err := atomicJSON(filepath.Join(j.host.durableDir, j.ID+".space"), result, 64<<20); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func loadSpaceResult(value any, cachePath string) (*spaceResult, error) {
	if result, ok := value.(*spaceResult); ok && !result.ItemsStored {
		return result, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	result := &spaceResult{}
	if err := json.Unmarshal(data, result); err != nil {
		return nil, err
	}
	if !result.ItemsStored {
		return result, nil
	}
	info, err := os.Lstat(cachePath)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 64<<20 {
		return nil, fmt.Errorf("cache d’analyse invalide")
	}
	file, err := os.Open(cachePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err = io.ReadAll(io.LimitReader(file, (64<<20)+1))
	if err != nil {
		return nil, err
	}
	if len(data) > 64<<20 {
		return nil, fmt.Errorf("cache d’analyse trop volumineux")
	}
	if err := json.Unmarshal(data, result); err != nil {
		return nil, err
	}
	result.ItemsStored = false
	return result, nil
}

func spaceResultPage(value any, offset, limit int) (any, error) {
	result, err := loadSpaceResult(value, "")
	if err != nil {
		return nil, err
	}
	if offset < 0 || offset > len(result.Items) || limit < 0 {
		return nil, fmt.Errorf("page d’analyse invalide")
	}
	if limit == 0 || limit > 500 {
		limit = 500
	}
	page := M{"path": result.Path, "total": result.Total, "skipped": result.Skipped, "scanned": result.Scanned, "omitted": result.Omitted, "truncated": result.Truncated, "itemCount": len(result.Items), "nextOffset": offset, "items": []spaceItem{}}
	header, _ := json.Marshal(page)
	bytes := len(header)
	end := offset
	for end < len(result.Items) && end-offset < limit {
		encoded, err := json.Marshal(result.Items[end])
		if err != nil {
			return nil, err
		}
		if bytes+len(encoded)+1 > maxFrame/2 {
			break
		}
		bytes += len(encoded) + 1
		end++
	}
	if end == offset && offset < len(result.Items) {
		return nil, fmt.Errorf("chemin d’analyse trop volumineux")
	}
	page["items"] = result.Items[offset:end]
	if end < len(result.Items) {
		page["nextOffset"] = end
	} else {
		delete(page, "nextOffset")
	}
	return page, nil
}
