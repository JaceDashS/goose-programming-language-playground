// Command hub is the internet-facing service: run requests and health now, the MCP endpoint
// and browser sessions later. It has no Docker access and reaches the runner over an internal address.
//
// Environment:
//
//	HUB_ADDR          listen address (default :8080)
//	RUNNER_URL        internal runner base URL (default http://127.0.0.1:8090)
//	ALLOWED_ORIGINS   comma-separated origins (default https://goose-playground.jace-s.com)
//	TURNSTILE_SECRET  Cloudflare Turnstile secret; empty disables the check
package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/JaceDashS/goose-programming-language-playground/server/internal/hub"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	cfg := hub.Config{
		RunnerURL:      strings.TrimRight(env("RUNNER_URL", "http://127.0.0.1:8090"), "/"),
		AllowedOrigins: strings.Split(env("ALLOWED_ORIGINS", "https://goose-playground.jace-s.com"), ","),
	}
	if secret := os.Getenv("TURNSTILE_SECRET"); secret != "" {
		cfg.Turnstile = hub.TurnstileVerifier{Secret: secret}
	} else {
		log.Print("warning: TURNSTILE_SECRET is empty; the Turnstile check is off")
	}
	addr := env("HUB_ADDR", ":8080")
	srv := &http.Server{
		Addr:              addr,
		Handler:           hub.New(cfg).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("hub listening on %s, runner %s", addr, cfg.RunnerURL)
	log.Fatal(srv.ListenAndServe())
}
