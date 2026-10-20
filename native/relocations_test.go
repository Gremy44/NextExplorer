package main

import (
	"testing"
)

func TestRelocationsSurviveRestartAndReportGaps(t *testing.T) {
	dir := t.TempDir()
	log, err := loadRelocations(dir)
	if err != nil {
		t.Fatal(err)
	}
	baseline, _ := log.read(nil)
	if baseline.(M)["cursor"] != int64(0) {
		t.Fatal(baseline)
	}
	message := M{"event": "PATHS_RELOCATED", "data": []M{{"from": "C:\\a", "to": "C:\\b"}, {"from": "C:\\b", "to": "C:\\a"}}}
	if err = log.append(message); err != nil {
		t.Fatal(err)
	}
	if message["cursor"] != int64(1) {
		t.Fatal(message)
	}
	reopened, err := loadRelocations(dir)
	if err != nil {
		t.Fatal(err)
	}
	var zero int64
	value, err := reopened.read(&zero)
	if err != nil {
		t.Fatal(err)
	}
	rows := value.(M)["events"].([]relocationEvent)
	if len(rows) != 1 || len(rows[0].Changes) != 2 {
		t.Fatal(value)
	}
	for i := 0; i < 201; i++ {
		if err = reopened.append(M{"event": "PATH_RELOCATED", "data": M{"from": "C:\\a", "to": "C:\\b"}}); err != nil {
			t.Fatal(err)
		}
	}
	value, err = reopened.read(&zero)
	if err != nil || value.(M)["lost"] != true {
		t.Fatal(value, err)
	}
	baseline, _ = reopened.read(nil)
	if baseline.(M)["cursor"] != int64(202) {
		t.Fatal(baseline)
	}
}
