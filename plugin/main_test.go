package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/maximhq/bifrost/core/schemas"
)

func TestAdmissionValidatesResponseAndRemovesAssociation(t *testing.T) {
	t.Setenv("TRIPWIRE_PLUGIN_KEY", "test-only-key")
	var reply = `{"type":"admitted","requestId":"request-one"}`
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-only-key" {
			t.Error("missing control-service credential")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(reply))
	}))
	defer control.Close()
	if err := Init(map[string]any{"control_url": control.URL}); err != nil {
		t.Fatal(err)
	}
	request := &schemas.HTTPRequest{
		Path:    "/v1/chat/completions",
		Headers: map[string]string{"X-Tripwire-Association": "worker-secret", "x-request-id": "request-one"},
	}
	response, err := HTTPTransportPreHook(nil, request)
	if response != nil || err != nil {
		t.Fatalf("valid admission failed: %v %v", response, err)
	}
	if request.CaseInsensitiveHeaderLookup("x-tripwire-association") != "" {
		t.Fatal("association credential must be stripped")
	}
	reply = `{"type":"admitted","requestId":"other-request"}`
	request.Headers["x-tripwire-association"] = "worker-secret"
	response, err = HTTPTransportPreHook(nil, request)
	if err != nil || response == nil || response.StatusCode != 503 {
		t.Fatal("mismatched decision must fail closed")
	}
	schemas.ReleaseHTTPResponse(response)
}

func TestMissingAssociationFailsClosed(t *testing.T) {
	t.Setenv("TRIPWIRE_PLUGIN_KEY", "test-only-key")
	if err := Init(map[string]any{"control_url": "http://127.0.0.1:4177"}); err != nil {
		t.Fatal(err)
	}
	response, err := HTTPTransportPreHook(nil, &schemas.HTTPRequest{Path: "/v1/chat/completions"})
	if err != nil || response == nil || response.StatusCode != 401 {
		t.Fatalf("missing association must be rejected, got %v %v", response, err)
	}
	schemas.ReleaseHTTPResponse(response)
}

func TestUnavailableServiceFailsClosed(t *testing.T) {
	t.Setenv("TRIPWIRE_PLUGIN_KEY", "test-only-key")
	if err := Init(map[string]any{"control_url": "http://127.0.0.1:1"}); err != nil {
		t.Fatal(err)
	}
	response, err := HTTPTransportPreHook(nil, &schemas.HTTPRequest{
		Path:    "/v1/chat/completions",
		Headers: map[string]string{"x-tripwire-association": "test", "x-request-id": "test"},
	})
	if err != nil || response == nil || response.StatusCode != 503 {
		t.Fatalf("service failure must be rejected, got %v %v", response, err)
	}
	schemas.ReleaseHTTPResponse(response)
}
