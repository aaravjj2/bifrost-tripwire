package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/maximhq/bifrost/core/schemas"
)

type configuration struct {
	ControlURL string `json:"control_url"`
}

type clientConfig struct {
	url string
	key string
}

var current atomic.Pointer[clientConfig]
var client = &http.Client{Timeout: 2 * time.Second}

func Init(raw any) error {
	data, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	var config configuration
	if err := json.Unmarshal(data, &config); err != nil {
		return err
	}
	address, err := url.Parse(config.ControlURL)
	if err != nil || address.Scheme != "http" || address.Hostname() != "127.0.0.1" {
		return fmt.Errorf("control_url must be a loopback HTTP URL")
	}
	key := os.Getenv("TRIPWIRE_PLUGIN_KEY")
	if key == "" {
		return fmt.Errorf("TRIPWIRE_PLUGIN_KEY is required")
	}
	current.Store(&clientConfig{url: strings.TrimRight(config.ControlURL, "/"), key: key})
	return nil
}

func GetName() string { return "tripwire" }

func reject(status int, message string) *schemas.HTTPResponse {
	body, _ := json.Marshal(map[string]any{"error": map[string]string{"type": "tripwire_denial", "message": message}})
	response := schemas.AcquireHTTPResponse()
	response.StatusCode = status
	response.Headers["Content-Type"] = "application/json"
	response.Body = body
	return response
}

// This hook runs after HTTP transport authentication and before provider dispatch.
// The protected demo uses one non-streaming model route, with fallback/retries/cache disabled.
func HTTPTransportPreHook(ctx *schemas.BifrostContext, request *schemas.HTTPRequest) (*schemas.HTTPResponse, error) {
	if request == nil {
		return reject(503, "Tripwire request unavailable"), nil
	}
	if request.Path != "/v1/chat/completions" {
		return nil, nil
	}
	config := current.Load()
	if config == nil {
		return reject(503, "Tripwire unavailable"), nil
	}
	association := request.CaseInsensitiveHeaderLookup("x-tripwire-association")
	requestID := request.CaseInsensitiveHeaderLookup("x-request-id")
	if association == "" || requestID == "" {
		return reject(401, "Trusted run association required"), nil
	}
	payload, _ := json.Marshal(map[string]string{"association": association, "requestId": requestID})
	check, err := http.NewRequest(http.MethodPost, config.url+"/internal/decision", bytes.NewReader(payload))
	if err != nil {
		return reject(503, "Tripwire unavailable"), nil
	}
	check.Header.Set("Authorization", "Bearer "+config.key)
	check.Header.Set("Content-Type", "application/json")
	response, err := client.Do(check)
	if err != nil {
		return reject(503, "Tripwire unavailable"), nil
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		status := response.StatusCode
		if status != 401 && status != 403 && status != 409 {
			status = 503
		}
		return reject(status, "Run admission rejected"), nil
	}
	var decision struct {
		Type      string `json:"type"`
		RequestID string `json:"requestId"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 16384)).Decode(&decision); err != nil || decision.Type != "admitted" || decision.RequestID != requestID {
		return reject(503, "Tripwire decision incomplete"), nil
	}
	// Remove association credentials before the transport builds the upstream request.
	for name := range request.Headers {
		if strings.EqualFold(name, "x-tripwire-association") {
			delete(request.Headers, name)
		}
	}
	if ctx != nil {
		ctx.SetValue(schemas.BifrostContextKeyExtraHeaders, map[string]string{"x-request-id": requestID})
	}
	return nil, nil
}

func Cleanup() error {
	current.Store(nil)
	client.CloseIdleConnections()
	return nil
}
