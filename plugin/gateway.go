//go:build tripwire_gateway

package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"time"

	bifrost "github.com/maximhq/bifrost/core"
	"github.com/maximhq/bifrost/core/schemas"
)

type gatewayConfiguration struct {
	ControlURL  string `json:"controlUrl"`
	RecorderURL string `json:"recorderUrl"`
	RecorderKey string `json:"recorderKey"`
	SharedKey   string `json:"sharedKey"`
}

type localAccount struct{ config gatewayConfiguration }

func (a *localAccount) GetConfiguredProviders() ([]schemas.ModelProvider, error) {
	return []schemas.ModelProvider{schemas.OpenAI}, nil
}

func (a *localAccount) GetKeysForProvider(_ context.Context, _ schemas.ModelProvider) ([]schemas.Key, error) {
	return []schemas.Key{{ID: "recorder", Name: "local-recorder", Value: *schemas.NewSecretVar(a.config.RecorderKey), Models: schemas.WhiteList{"*"}, Weight: 1}}, nil
}

func (a *localAccount) GetConfigForProvider(_ schemas.ModelProvider) (*schemas.ProviderConfig, error) {
	return &schemas.ProviderConfig{
		NetworkConfig:            schemas.NetworkConfig{BaseURL: a.config.RecorderURL, MaxRetries: 0, DefaultRequestTimeoutInSeconds: 5, AllowPrivateNetwork: true},
		ConcurrencyAndBufferSize: schemas.ConcurrencyAndBufferSize{Concurrency: 4, BufferSize: 16},
	}, nil
}

// This optional executable embeds the pinned Bifrost engine and the same hook as
// the dynamic plugin. Its HTTP shell authenticates a shared demo credential.
// It does not implement Bifrost governance virtual-key administration.
func main() {
	var config gatewayConfiguration
	if err := json.NewDecoder(io.LimitReader(os.Stdin, 16384)).Decode(&config); err != nil {
		panic(err)
	}
	if config.SharedKey == "" || config.RecorderKey == "" {
		panic("gateway credentials required")
	}
	if err := Init(map[string]any{"control_url": config.ControlURL}); err != nil {
		panic(err)
	}
	engine, err := bifrost.Init(context.Background(), schemas.BifrostConfig{Account: &localAccount{config: config}})
	if err != nil {
		panic(err)
	}
	defer engine.Shutdown()
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("x-bifrost-vk")), []byte(config.SharedKey)) != 1 {
			w.WriteHeader(401)
			return
		}
		var input struct {
			Model    string                `json:"model"`
			Messages []schemas.ChatMessage `json:"messages"`
			Stream   bool                  `json:"stream"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 16384)).Decode(&input); err != nil || input.Stream || input.Model == "" || len(input.Messages) == 0 {
			w.WriteHeader(400)
			return
		}
		ctx, cancel := schemas.NewBifrostContextWithTimeout(r.Context(), 6*time.Second)
		defer cancel()
		request := &schemas.HTTPRequest{Method: r.Method, Path: r.URL.Path, Headers: map[string]string{
			"x-tripwire-association": r.Header.Get("x-tripwire-association"),
			"x-request-id":           r.Header.Get("x-request-id"),
		}}
		denial, _ := HTTPTransportPreHook(ctx, request)
		if denial != nil {
			defer schemas.ReleaseHTTPResponse(denial)
			w.WriteHeader(denial.StatusCode)
			_, _ = w.Write(denial.Body)
			return
		}
		ctx.SetValue(schemas.BifrostContextKeyExtraHeaders, map[string][]string{"x-request-id": {r.Header.Get("x-request-id")}})
		result, bifrostErr := engine.ChatCompletionRequest(ctx, &schemas.BifrostChatRequest{
			Provider: schemas.OpenAI, Model: input.Model, Input: input.Messages,
		})
		if bifrostErr != nil {
			w.WriteHeader(502)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Bifrost provider request failed"})
			return
		}
		_ = json.NewEncoder(w).Encode(result)
	})
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	fmt.Printf("TRIPWIRE_READY:%d\n", listener.Addr().(*net.TCPAddr).Port)
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
