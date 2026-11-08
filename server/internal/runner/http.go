package runner

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/JaceDashS/goose-programming-language-playground/server/internal/contract"
	"github.com/JaceDashS/goose-programming-language-playground/server/internal/httpjson"
)

// Handler serves the runner's internal API: POST /run and GET /health.
// It must only be reachable from the hub's network.
func Handler(r *Runner) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /run", func(w http.ResponseWriter, req *http.Request) {
		var body contract.RunRequest
		dec := json.NewDecoder(http.MaxBytesReader(w, req.Body, contract.MaxCodeBytes*2))
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
		res, err := r.Run(req.Context(), body.Code)
		switch {
		case errors.Is(err, ErrBusy):
			httpjson.Error(w, contract.ErrBusy, "All run slots are in use.")
		case err != nil:
			log.Printf("run failed: %v", err)
			httpjson.Error(w, contract.ErrUnavailable, "The runner could not start a container.")
		default:
			httpjson.Write(w, http.StatusOK, res)
		}
	})
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		httpjson.Write(w, http.StatusOK, contract.Health{Runner: "up", FreeRunSlots: r.FreeSlots(), AgentAvailable: true})
	})
	return mux
}
