package hub

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaceDashS/goose-programming-language-playground/server/internal/contract"
)

const site = "https://goose-playground.jace-s.com"

type fakeVerifier struct{ ok bool }

func (f fakeVerifier) Verify(context.Context, string, string) (bool, error) { return f.ok, nil }

// fakeRunner records what the hub forwarded and answers with a fixed status and body.
func fakeRunner(t *testing.T, status int, body string, seen *contract.RunRequest) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/run":
			if seen != nil {
				_ = json.NewDecoder(r.Body).Decode(seen)
			}
		case "/health":
		default:
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func post(h http.Handler, origin, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/goose/run", strings.NewReader(body))
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func errCode(t *testing.T, rec *httptest.ResponseRecorder) contract.ErrorCode {
	t.Helper()
	var e contract.ErrorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		t.Fatalf("not an error response: %s", rec.Body.String())
	}
	return e.Error.Code
}

const okResult = `{"outcome":"exited","exitCode":0,"stdout":"hi\n","stderr":"","diagnostics":[],"truncated":false,"durationMs":5,"backend":"onprem"}`

func TestRunForwardsWithoutTurnstileToken(t *testing.T) {
	var seen contract.RunRequest
	r := fakeRunner(t, 200, okResult, &seen)
	h := New(Config{RunnerURL: r.URL, AllowedOrigins: []string{site}, Turnstile: fakeVerifier{ok: true}}).Handler()
	rec := post(h, site, `{"code":"fn main() {}","turnstileToken":"tok"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"stdout":"hi\n"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != site {
		t.Fatal("missing CORS header")
	}
	if seen.Code != "fn main() {}" || seen.TurnstileToken != "" {
		t.Fatalf("forwarded %+v", seen)
	}
}

func TestRunRejectsOtherOrigin(t *testing.T) {
	r := fakeRunner(t, 200, okResult, nil)
	h := New(Config{RunnerURL: r.URL, AllowedOrigins: []string{site}}).Handler()
	for _, origin := range []string{"", "https://evil.example"} {
		rec := post(h, origin, `{"code":"x"}`)
		if rec.Code != 403 || errCode(t, rec) != contract.ErrForbiddenOrigin {
			t.Fatalf("origin %q: got %d %s", origin, rec.Code, rec.Body.String())
		}
	}
}

func TestRunTurnstileFailure(t *testing.T) {
	r := fakeRunner(t, 200, okResult, nil)
	h := New(Config{RunnerURL: r.URL, AllowedOrigins: []string{site}, Turnstile: fakeVerifier{ok: false}}).Handler()
	rec := post(h, site, `{"code":"x"}`)
	if rec.Code != 403 || errCode(t, rec) != contract.ErrTurnstileFailed {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestRunTooLarge(t *testing.T) {
	r := fakeRunner(t, 200, okResult, nil)
	h := New(Config{RunnerURL: r.URL, AllowedOrigins: []string{site}}).Handler()
	big, _ := json.Marshal(contract.RunRequest{Code: strings.Repeat("a", contract.MaxCodeBytes+1)})
	rec := post(h, site, string(big))
	if rec.Code != 413 || errCode(t, rec) != contract.ErrTooLarge {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestRunPassesBusyThrough(t *testing.T) {
	r := fakeRunner(t, 503, `{"error":{"code":"busy","message":"All run slots are in use."}}`, nil)
	h := New(Config{RunnerURL: r.URL, AllowedOrigins: []string{site}}).Handler()
	rec := post(h, site, `{"code":"x"}`)
	if rec.Code != 503 || errCode(t, rec) != contract.ErrBusy {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestRunRunnerDown(t *testing.T) {
	h := New(Config{RunnerURL: "http://127.0.0.1:1", AllowedOrigins: []string{site}}).Handler()
	rec := post(h, site, `{"code":"x"}`)
	if rec.Code != 503 || errCode(t, rec) != contract.ErrUnavailable {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestPreflight(t *testing.T) {
	h := New(Config{RunnerURL: "http://127.0.0.1:1", AllowedOrigins: []string{site}}).Handler()
	req := httptest.NewRequest(http.MethodOptions, "/goose/run", nil)
	req.Header.Set("Origin", site)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Headers") != "Content-Type" {
		t.Fatalf("got %d %v", rec.Code, rec.Header())
	}
}

func TestHealth(t *testing.T) {
	up := fakeRunner(t, 200, `{"runner":"up","freeRunSlots":1,"agentAvailable":true}`, nil)
	cases := []struct {
		name, url string
		want      contract.Health
	}{
		{"runner up", up.URL, contract.Health{Runner: "up", FreeRunSlots: 1, AgentAvailable: true}},
		{"runner down", "http://127.0.0.1:1", contract.Health{Runner: "down"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := New(Config{RunnerURL: c.url, AllowedOrigins: []string{site}}).Handler()
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/goose/health", nil))
			var got contract.Health
			_ = json.Unmarshal(rec.Body.Bytes(), &got)
			if rec.Code != 200 || got != c.want {
				t.Fatalf("got %d %+v", rec.Code, got)
			}
		})
	}
}

func TestClientIPPrefersCloudflareHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "172.18.0.5:41234"
	if ClientIP(req) != "172.18.0.5" {
		t.Fatalf("got %s", ClientIP(req))
	}
	req.Header.Set("CF-Connecting-IP", "203.0.113.7")
	if ClientIP(req) != "203.0.113.7" {
		t.Fatalf("got %s", ClientIP(req))
	}
}
