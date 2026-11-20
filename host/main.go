// Tripwire's static host uses Bifrost's HTTP server and governance unchanged.
// The build command combines this file with the dynamic adapter's source.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	bifrost "github.com/maximhq/bifrost/core"
	"github.com/maximhq/bifrost/core/schemas"
	"github.com/maximhq/bifrost/transports/v2/bifrost-http/handlers"
	"github.com/maximhq/bifrost/transports/v2/bifrost-http/lib"
	gateway "github.com/maximhq/bifrost/transports/v2/bifrost-http/server"
)

//go:embed ui
var hostUI embed.FS

type transportPlugin struct{}

func (*transportPlugin) GetName() string { return GetName() }
func (*transportPlugin) Cleanup() error  { return Cleanup() }
func (*transportPlugin) HTTPTransportPreAuthHook(*schemas.BifrostContext, *schemas.HTTPRequest) (*schemas.HTTPResponse, error) {
	return nil, nil
}
func (*transportPlugin) HTTPTransportPreHook(ctx *schemas.BifrostContext, req *schemas.HTTPRequest) (*schemas.HTTPResponse, error) {
	return HTTPTransportPreHook(ctx, req)
}
func (*transportPlugin) HTTPTransportPostHook(*schemas.BifrostContext, *schemas.HTTPRequest, *schemas.HTTPResponse) error {
	return nil
}
func (*transportPlugin) HTTPTransportResponseHeadersHook(*schemas.BifrostContext, *schemas.HTTPRequest, *schemas.HTTPResponseMetadata) error {
	return nil
}
func (*transportPlugin) HTTPTransportStreamChunkHook(_ *schemas.BifrostContext, _ *schemas.HTTPRequest, chunk *schemas.BifrostStreamChunk) (*schemas.BifrostStreamChunk, error) {
	return chunk, nil
}

var _ schemas.HTTPTransportPlugin = (*transportPlugin)(nil)

type launchConfig struct {
	ControlURL  string `json:"controlUrl"`
	RecorderURL string `json:"recorderUrl"`
	RecorderKey string `json:"recorderKey"`
	SharedKey   string `json:"sharedKey"`
	DataDir     string `json:"dataDir"`
	Stock       bool   `json:"stock"`
	PluginPath  string `json:"pluginPath"`
}

func main() {
	var input launchConfig
	if err := json.NewDecoder(io.LimitReader(os.Stdin, 16384)).Decode(&input); err != nil {
		panic(err)
	}
	if input.DataDir == "" || input.SharedKey == "" || input.RecorderKey == "" {
		panic("host configuration required")
	}
	key := os.Getenv("TRIPWIRE_PLUGIN_KEY")
	if key == "" {
		panic("host setup credential required")
	}
	os.Setenv("BIFROST_SETUP_TOKEN", key)
	cfg := map[string]any{
		"version": 2, "disable_onboarding": true,
		"client": map[string]any{"enforce_governance_header": true, "disable_content_logging": true},
		"providers": map[string]any{"openai": map[string]any{
			"keys":                        []any{map[string]any{"id": "recorder", "name": "local-recorder", "value": input.RecorderKey, "models": []string{"*"}, "weight": 1}},
			"network_config":              map[string]any{"base_url": input.RecorderURL, "max_retries": 0, "default_request_timeout_in_seconds": 5, "allow_private_network": true},
			"concurrency_and_buffer_size": map[string]any{"concurrency": 4, "buffer_size": 16},
		}},
		"governance": map[string]any{"virtual_keys": []any{map[string]any{
			"id": "shared", "name": "Tripwire shared", "value": input.SharedKey, "is_active": true,
			"provider_configs": []any{map[string]any{"provider": "openai", "allowed_models": []string{"*"}, "key_ids": []string{"*"}, "weight": 1}},
		}}},
	}
	if !input.Stock && input.PluginPath != "" {
		cfg["plugins"] = []any{map[string]any{"name": "tripwire", "enabled": true, "path": input.PluginPath, "config": map[string]any{"control_url": input.ControlURL}}}
	}
	if err := os.MkdirAll(input.DataDir, 0700); err != nil {
		panic(err)
	}
	raw, _ := json.Marshal(cfg)
	if err := os.WriteFile(filepath.Join(input.DataDir, "config.json"), raw, 0600); err != nil {
		panic(err)
	}
	logger := bifrost.NewDefaultLogger(schemas.LogLevelError)
	lib.SetLogger(logger)
	gateway.SetLogger(logger)
	handlers.SetLogger(logger)
	server := gateway.NewBifrostHTTPServer("tripwire-3efed2f", hostUI)
	server.Host = "127.0.0.1"
	server.AppDir = input.DataDir
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	server.Port = strconv.Itoa(port)
	if err := server.Bootstrap(context.Background()); err != nil {
		panic(err)
	}
	if !input.Stock && input.PluginPath != "" {
		loaded := false
		for _, plugin := range server.Config.GetLoadedHTTPTransportPlugins() {
			if plugin.GetName() == "tripwire" {
				loaded = true
			}
		}
		if !loaded {
			panic("Tripwire dynamic HTTP plugin is not active")
		}
	}
	if !input.Stock && input.PluginPath == "" {
		if err := Init(map[string]any{"control_url": input.ControlURL}); err != nil {
			panic(err)
		}
		plugin := &transportPlugin{}
		if err := server.Config.ReloadPlugin(plugin); err != nil {
			panic(err)
		}
		if err := server.Client.ReloadPlugin(plugin, []schemas.PluginType{schemas.PluginTypeHTTP}); err != nil {
			panic(err)
		}
	}
	go func() {
		client := &http.Client{Timeout: time.Second}
		for attempt := 0; attempt < 100; attempt++ {
			response, err := client.Get("http://127.0.0.1:" + server.Port + "/health")
			if err == nil {
				response.Body.Close()
				if response.StatusCode == 200 {
					fmt.Printf("TRIPWIRE_READY:%d\n", port)
					return
				}
			}
			time.Sleep(100 * time.Millisecond)
		}
	}()
	if err := server.Start(); err != nil {
		panic(err)
	}
}
