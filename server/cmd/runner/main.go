// Command runner runs Goose programs in throwaway containers. It is the only component with Docker access.
//
// Environment:
//
//	RUNNER_ADDR     listen address, internal only (default 127.0.0.1:8090)
//	RUNNER_IMAGE    run container image (default goose-run:v2026.4)
//	RUNNER_RUNTIME  container runtime (default runsc; set to "default" for local development without gVisor)
package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/JaceDashS/goose-programming-language-playground/server/internal/runner"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	addr := env("RUNNER_ADDR", "127.0.0.1:8090")
	runtime := env("RUNNER_RUNTIME", "runsc")
	if runtime == "default" {
		runtime = ""
		log.Print("warning: running without gVisor; use only for local development")
	}
	backend := runner.DockerCLI{Image: env("RUNNER_IMAGE", "goose-run:v2026.4"), Runtime: runtime}
	r := runner.New(runner.DefaultConfig(), backend)

	srv := &http.Server{Addr: addr, Handler: runner.Handler(r)}
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
		<-stop
		_ = srv.Close()
	}()
	log.Printf("runner listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
	r.Close()
}
