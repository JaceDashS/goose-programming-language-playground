// Package hub is the internet-facing service. It checks origin, size and Turnstile,
// forwards runs to the runner's internal address, and reports health for the browser's
// service state. It never has Docker access (D-0014).
package hub

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/JaceDashS/goose-programming-language-playground/server/internal/contract"
	"github.com/JaceDashS/goose-programming-language-playground/server/internal/httpjson"
)

// Verifier checks a Turnstile token for a client IP.
type Verifier interface {
	Verify(ctx context.Context, token, remoteIP string) (bool, error)
}

// Config configures the hub.
type Config struct {
	RunnerURL      string        // internal runner base URL, for example http://runner:8090
	AllowedOrigins []string      // exact origins allowed to call /goose/run
	Turnstile      Verifier      // nil disables the Turnstile check
	RunTimeout     time.Duration // upper bound for one forwarded run
	Client         *http.Client
}

// Hub serves /goose/run and /goose/health.
type Hub struct {
	cfg     Config
	origins map[string]bool
}

// New creates a hub.
func New(cfg Config) *Hub {
	if cfg.Client == nil {
		cfg.Client = &http.Client{}
	}
	if cfg.RunTimeout == 0 {
		cfg.RunTimeout = 20 * time.Second
	}
	o := map[string]bool{}
	for _, s := range cfg.AllowedOrigins {
		o[strings.TrimRight(s, "/")] = true
	}
	return &Hub{cfg: cfg, origins: o}
}

// Handler returns the hub's HTTP routes.
func (h *Hub) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("OPTIONS /goose/run", h.preflight)
	mux.HandleFunc("POST /goose/run", h.run)
	mux.HandleFunc("GET /goose/health", h.health)
	return mux
}

func (h *Hub) allowOrigin(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" || !h.origins[origin] {
		return false
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Add("Vary", "Origin")
	return true
}

func (h *Hub) preflight(w http.ResponseWriter, r *http.Request) {
	if !h.allowOrigin(w, r) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	w.Header().Set("Access-Control-Allow-Methods", "POST")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Max-Age", "600")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Hub) run(w http.ResponseWriter, r *http.Request) {
	if !h.allowOrigin(w, r) {
		httpjson.Error(w, contract.ErrForbiddenOrigin, "This origin may not run code.")
		return
	}
	var body contract.RunRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, contract.MaxCodeBytes*2))
	if err := dec.Decode(&body); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			httpjson.Error(w, contract.ErrTooLarge, "The code is larger than 65536 bytes.")
			return
		}
		httpjson.Error(w, contract.ErrInvalidRequest, "The body must be a RunRequest JSON object.")
		return
	}
	if len(body.Code) > contract.MaxCodeBytes {
		httpjson.Error(w, contract.ErrTooLarge, "The code is larger than 65536 bytes.")
		return
	}
	if h.cfg.Turnstile != nil {
		ok, err := h.cfg.Turnstile.Verify(r.Context(), body.TurnstileToken, ClientIP(r))
		if err != nil {
			log.Printf("turnstile: %v", err)
		}
		if !ok {
			httpjson.Error(w, contract.ErrTurnstileFailed, "The Turnstile check failed.")
			return
		}
	}

	// The runner never sees the Turnstile token.
	fwd, _ := json.Marshal(contract.RunRequest{Code: body.Code})
	ctx, cancel := context.WithTimeout(r.Context(), h.cfg.RunTimeout)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, h.cfg.RunnerURL+"/run", bytes.NewReader(fwd))
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.cfg.Client.Do(req)
	if err != nil {
		log.Printf("runner unreachable: %v", err)
		httpjson.Error(w, contract.ErrUnavailable, "The run server is unavailable.")
		return
	}
	defer resp.Body.Close()
	// Pass the runner's answer through: RunResult, busy, too_large or unavailable.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (h *Hub) health(w http.ResponseWriter, r *http.Request) {
	h.allowOrigin(w, r)
	down := contract.Health{Runner: "down", FreeRunSlots: 0, AgentAvailable: false}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, h.cfg.RunnerURL+"/health", nil)
	resp, err := h.cfg.Client.Do(req)
	if err != nil {
		httpjson.Write(w, http.StatusOK, down)
		return
	}
	defer resp.Body.Close()
	var hl contract.Health
	if resp.StatusCode != http.StatusOK || json.NewDecoder(resp.Body).Decode(&hl) != nil {
		httpjson.Write(w, http.StatusOK, down)
		return
	}
	// Agent sessions are not implemented yet; until then the agent follows the runner.
	hl.AgentAvailable = hl.Runner == "up"
	httpjson.Write(w, http.StatusOK, hl)
}

// ClientIP returns the visitor's IP. Behind the Cloudflare tunnel and the gateway nginx,
// CF-Connecting-IP carries it; RemoteAddr is used only when that header is absent.
func ClientIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		host = host[:i]
	}
	return strings.Trim(host, "[]")
}

// TurnstileVerifier verifies tokens with Cloudflare's siteverify endpoint.
type TurnstileVerifier struct {
	Secret string
	Client *http.Client
	URL    string // defaults to Cloudflare's endpoint
}

// Verify implements Verifier.
func (t TurnstileVerifier) Verify(ctx context.Context, token, remoteIP string) (bool, error) {
	if token == "" {
		return false, nil
	}
	endpoint := t.URL
	if endpoint == "" {
		endpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
	}
	client := t.Client
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	form := url.Values{"secret": {t.Secret}, "response": {token}, "remoteip": {remoteIP}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	var out struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, err
	}
	return out.Success, nil
}
