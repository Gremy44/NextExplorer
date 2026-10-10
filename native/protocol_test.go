package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestHelloProtocol(t *testing.T) {
	h := newHost(&bytes.Buffer{})
	for _, payload := range []string{`{}`, `{"protocolVersion":1}`} {
		data, err := h.dispatch(Request{Action: "HELLO", Payload: json.RawMessage(payload)})
		if err != nil {
			t.Fatal(err)
		}
		hello := data.(M)
		if hello["features"].(M)["transferMerge"] != true {
			t.Fatal("merge capability missing")
		}
		if hello["protocolVersion"] != protocolVersion || hello["tools"] == nil {
			t.Fatalf("invalid handshake: %v", hello)
		}
	}
	for _, payload := range []string{`{"protocolVersion":0}`, `{"protocolVersion":2}`} {
		_, err := h.dispatch(Request{Action: "HELLO", Payload: json.RawMessage(payload)})
		if err == nil || !strings.Contains(err.Error(), "Versions incompatibles") {
			t.Fatalf("incompatible protocol accepted: %s (%v)", payload, err)
		}
	}
}
