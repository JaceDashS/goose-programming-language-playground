package contract

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Each schema's examples must decode into the matching Go type with no unknown fields,
// so the Go types cannot drift from the schema without a failing test.
func TestSchemaExamplesDecode(t *testing.T) {
	cases := []struct {
		file string
		new  func() any
	}{
		{"run-request.schema.json", func() any { return &RunRequest{} }},
		{"run-result.schema.json", func() any { return &RunResult{} }},
		{"error.schema.json", func() any { return &ErrorResponse{} }},
		{"health.schema.json", func() any { return &Health{} }},
	}
	for _, c := range cases {
		t.Run(c.file, func(t *testing.T) {
			raw, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", c.file))
			if err != nil {
				t.Fatal(err)
			}
			var schema struct {
				Examples []json.RawMessage `json:"examples"`
			}
			if err := json.Unmarshal(raw, &schema); err != nil {
				t.Fatal(err)
			}
			if len(schema.Examples) == 0 {
				t.Fatal("schema has no examples")
			}
			for i, ex := range schema.Examples {
				dec := json.NewDecoder(bytes.NewReader(ex))
				dec.DisallowUnknownFields()
				if err := dec.Decode(c.new()); err != nil {
					t.Errorf("example %d: %v", i, err)
				}
			}
		})
	}
}

func TestErrorCodeStatus(t *testing.T) {
	want := map[ErrorCode]int{ErrBusy: 503, ErrUsePrimary: 409, ErrTooLarge: 413, ErrInternal: 500}
	for code, status := range want {
		if got := code.HTTPStatus(); got != status {
			t.Errorf("%s: got %d, want %d", code, got, status)
		}
	}
}
