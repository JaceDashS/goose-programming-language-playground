// Package httpjson writes JSON responses and contract error responses.
package httpjson

import (
	"encoding/json"
	"net/http"

	"github.com/JaceDashS/goose-programming-language-playground/server/internal/contract"
)

// Write writes v as a JSON response.
func Write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes an ErrorResponse with the status that goes with code.
func Error(w http.ResponseWriter, code contract.ErrorCode, msg string) {
	Write(w, code.HTTPStatus(), contract.ErrorResponse{Error: contract.ErrorBody{Code: code, Message: msg}})
}
