// Package contract holds the JSON types shared by the hub, the runner and the browser.
// The source of truth is the JSON schema in /schema; contract_test.go checks that the
// schema examples decode into these types without unknown fields.
package contract

// MaxCodeBytes is the largest accepted source, in UTF-8 bytes.
const MaxCodeBytes = 65536

// RunRequest is the body of POST /goose/run and of the runner's POST /run.
type RunRequest struct {
	Code           string `json:"code"`
	TurnstileToken string `json:"turnstileToken,omitempty"`
}

// Outcome says how a run ended.
type Outcome string

const (
	OutcomeCompileError Outcome = "compile_error"
	OutcomeExited       Outcome = "exited"
	OutcomeTimeout      Outcome = "timeout"
	OutcomeOutputLimit  Outcome = "output_limit"
	OutcomeKilled       Outcome = "killed"
)

// Backend names where a run happened.
type Backend string

const (
	BackendOnPrem  Backend = "onprem"
	BackendSandbox Backend = "sandbox"
)

// Diagnostic is one entry of goose check --diagnostics json.
type Diagnostic struct {
	Severity string `json:"severity"`
	Message  string `json:"message"`
	Line     int    `json:"line,omitempty"`
	Col      int    `json:"col,omitempty"`
	EndLine  int    `json:"endLine,omitempty"`
	EndCol   int    `json:"endCol,omitempty"`
	Text     string `json:"text,omitempty"`
}

// RunResult is the result of one run.
type RunResult struct {
	Outcome     Outcome      `json:"outcome"`
	ExitCode    *int         `json:"exitCode"`
	Stdout      string       `json:"stdout"`
	Stderr      string       `json:"stderr"`
	Diagnostics []Diagnostic `json:"diagnostics"`
	Truncated   bool         `json:"truncated"`
	DurationMs  int64        `json:"durationMs"`
	Backend     Backend      `json:"backend"`
}

// ErrorCode is the machine-readable reason of an error response.
type ErrorCode string

const (
	ErrInvalidRequest  ErrorCode = "invalid_request"
	ErrTooLarge        ErrorCode = "too_large"
	ErrForbiddenOrigin ErrorCode = "forbidden_origin"
	ErrTurnstileFailed ErrorCode = "turnstile_failed"
	ErrRateLimited     ErrorCode = "rate_limited"
	ErrBusy            ErrorCode = "busy"
	ErrUsePrimary      ErrorCode = "use_primary"
	ErrUnavailable     ErrorCode = "unavailable"
	ErrInternal        ErrorCode = "internal"
)

// HTTPStatus returns the status code that goes with an error code.
func (c ErrorCode) HTTPStatus() int {
	switch c {
	case ErrInvalidRequest:
		return 400
	case ErrForbiddenOrigin, ErrTurnstileFailed:
		return 403
	case ErrUsePrimary:
		return 409
	case ErrTooLarge:
		return 413
	case ErrRateLimited:
		return 429
	case ErrBusy, ErrUnavailable:
		return 503
	default:
		return 500
	}
}

// ErrorBody is the inner object of ErrorResponse.
type ErrorBody struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
}

// ErrorResponse is the body of every non-2xx response.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

// Health is the body of GET /goose/health and the runner's GET /health.
type Health struct {
	Runner         string `json:"runner"`
	FreeRunSlots   int    `json:"freeRunSlots"`
	AgentAvailable bool   `json:"agentAvailable"`
}
