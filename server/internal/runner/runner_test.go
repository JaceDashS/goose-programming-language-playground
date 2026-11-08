package runner

import (
	"context"
	"io"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/JaceDashS/goose-programming-language-playground/server/internal/contract"
)

// fakeProc imitates the run image: it reads the code from stdin, then calls script,
// which writes to stdout and stderr and returns the exit code.
type fakeProc struct {
	inR, outR, errR *io.PipeReader
	inW, outW, errW *io.PipeWriter
	done            chan struct{}
	exit            int
	killed          atomic.Bool
	once            sync.Once
}

type script func(code string, out, errw io.Writer, killed <-chan struct{}) int

func startFake(s script) *fakeProc {
	p := &fakeProc{done: make(chan struct{})}
	p.inR, p.inW = io.Pipe()
	p.outR, p.outW = io.Pipe()
	p.errR, p.errW = io.Pipe()
	go func() {
		code, _ := io.ReadAll(p.inR)
		p.exit = s(string(code), p.outW, p.errW, p.done)
		p.outW.Close()
		p.errW.Close()
	}()
	return p
}

func (p *fakeProc) Stdin() io.WriteCloser { return p.inW }
func (p *fakeProc) Stdout() io.Reader     { return p.outR }
func (p *fakeProc) Stderr() io.Reader     { return p.errR }
func (p *fakeProc) Wait() (int, error) {
	if p.killed.Load() {
		return 137, nil
	}
	return p.exit, nil
}
func (p *fakeProc) Kill() {
	p.once.Do(func() {
		p.killed.Store(true)
		close(p.done)
		p.inR.CloseWithError(io.ErrClosedPipe)
		p.outW.CloseWithError(io.EOF)
		p.errW.CloseWithError(io.EOF)
	})
}

type fakeBackend struct {
	s       script
	started atomic.Int32
}

func (b *fakeBackend) Start(context.Context) (Proc, error) {
	b.started.Add(1)
	return startFake(b.s), nil
}

func header(exit int, diags string) string {
	return "GOOSE-CHECK " + strconv.Itoa(exit) + " " + diags + "\n"
}

func newRunner(s script, lim Limits) (*Runner, *fakeBackend) {
	b := &fakeBackend{s: s}
	r := New(Config{Slots: 2, WarmPool: 0, Limits: lim}, b)
	return r, b
}

var fastLimits = Limits{Timeout: 2 * time.Second, OutputBytes: 1024}

func TestRunExited(t *testing.T) {
	r, _ := newRunner(func(code string, out, errw io.Writer, _ <-chan struct{}) int {
		io.WriteString(out, header(0, "[]"))
		io.WriteString(out, "hello\n")
		io.WriteString(errw, "warn\n")
		return 3
	}, fastLimits)
	res, err := r.Run(context.Background(), "fn main() {}")
	if err != nil {
		t.Fatal(err)
	}
	if res.Outcome != contract.OutcomeExited || res.ExitCode == nil || *res.ExitCode != 3 {
		t.Fatalf("got %+v", res)
	}
	if res.Stdout != "hello\n" || res.Stderr != "warn\n" || res.Truncated {
		t.Fatalf("output %+v", res)
	}
	if res.Diagnostics == nil || len(res.Diagnostics) != 0 {
		t.Fatalf("diagnostics should be an empty array, got %#v", res.Diagnostics)
	}
}

func TestRunCompileError(t *testing.T) {
	r, _ := newRunner(func(code string, out, errw io.Writer, _ <-chan struct{}) int {
		io.WriteString(out, header(1, `[{"severity":"error","message":"expression expected","file":"/work/main.goose","line":1,"col":23,"text":"/work/main.goose:1: error"}]`))
		return 0
	}, fastLimits)
	res, _ := r.Run(context.Background(), "fn main() { print(1 + ); }")
	if res.Outcome != contract.OutcomeCompileError || res.ExitCode != nil {
		t.Fatalf("got %+v", res)
	}
	if len(res.Diagnostics) != 1 || res.Diagnostics[0].Line != 1 || res.Diagnostics[0].Text != "main.goose:1: error" {
		t.Fatalf("diagnostics %+v", res.Diagnostics)
	}
}

func TestRunTimeout(t *testing.T) {
	r, _ := newRunner(func(code string, out, errw io.Writer, killed <-chan struct{}) int {
		io.WriteString(out, header(0, "[]"))
		<-killed
		return 137
	}, Limits{Timeout: 50 * time.Millisecond, OutputBytes: 1024})
	res, _ := r.Run(context.Background(), "loop")
	if res.Outcome != contract.OutcomeTimeout || res.ExitCode != nil {
		t.Fatalf("got %+v", res)
	}
}

func TestRunOutputLimit(t *testing.T) {
	r, _ := newRunner(func(code string, out, errw io.Writer, killed <-chan struct{}) int {
		io.WriteString(out, header(0, "[]"))
		for {
			if _, err := io.WriteString(out, strings.Repeat("x", 100)); err != nil {
				return 137
			}
		}
	}, Limits{Timeout: 2 * time.Second, OutputBytes: 250})
	res, _ := r.Run(context.Background(), "spam")
	if res.Outcome != contract.OutcomeOutputLimit || !res.Truncated || len(res.Stdout) != 250 {
		t.Fatalf("got outcome=%s truncated=%v len=%d", res.Outcome, res.Truncated, len(res.Stdout))
	}
}

func TestRunKilledWithoutHeader(t *testing.T) {
	r, _ := newRunner(func(code string, out, errw io.Writer, _ <-chan struct{}) int {
		return 137
	}, fastLimits)
	res, _ := r.Run(context.Background(), "x")
	if res.Outcome != contract.OutcomeKilled {
		t.Fatalf("got %+v", res)
	}
}

func TestRunBusy(t *testing.T) {
	release := make(chan struct{})
	r, _ := newRunner(func(code string, out, errw io.Writer, killed <-chan struct{}) int {
		io.WriteString(out, header(0, "[]"))
		select {
		case <-release:
		case <-killed:
		}
		return 0
	}, fastLimits)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); r.Run(context.Background(), "x") }()
	}
	deadline := time.Now().Add(time.Second)
	for r.FreeSlots() != 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if _, err := r.Run(context.Background(), "third"); err != ErrBusy {
		t.Fatalf("third run: got %v, want ErrBusy", err)
	}
	close(release)
	wg.Wait()
	if r.FreeSlots() != 2 {
		t.Fatalf("slots not released: %d", r.FreeSlots())
	}
}

func TestWarmPoolIsUsedAndRefilled(t *testing.T) {
	b := &fakeBackend{s: func(code string, out, errw io.Writer, _ <-chan struct{}) int {
		io.WriteString(out, header(0, "[]"))
		return 0
	}}
	r := New(Config{Slots: 2, WarmPool: 2, Limits: fastLimits}, b)
	defer r.Close()
	waitFor(t, func() bool { return len(r.warm) == 2 })
	if _, err := r.Run(context.Background(), "x"); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(r.warm) == 2 })
	if got := b.started.Load(); got != 3 {
		t.Fatalf("started %d containers, want 3 (2 warm + 1 refill)", got)
	}
}

func TestParseHeaderRejectsProgramOutput(t *testing.T) {
	if h := parseHeader("hello\n"); h.ok {
		t.Fatal("plain output must not parse as a header")
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not reached")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
