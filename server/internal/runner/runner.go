// Package runner runs Goose programs in throwaway containers with time and output limits.
// It keeps a warm pool of started containers so a run does not wait for container startup,
// and it refuses new runs with ErrBusy when every run slot is in use.
package runner

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/JaceDashS/goose-programming-language-playground/server/internal/contract"
)

// ErrBusy means every run slot is in use.
var ErrBusy = errors.New("all run slots are in use")

// Proc is one started container waiting for its program on stdin.
type Proc interface {
	Stdin() io.WriteCloser
	Stdout() io.Reader
	Stderr() io.Reader
	// Wait returns the container's exit code once it has ended.
	Wait() (int, error)
	// Kill stops the container now. It is safe to call more than once.
	Kill()
}

// Backend starts containers.
type Backend interface {
	Start(ctx context.Context) (Proc, error)
}

// Limits bound one run.
type Limits struct {
	Timeout     time.Duration // wall time from code delivery to exit, check included
	OutputBytes int           // stdout and stderr together
}

// Config configures a Runner.
type Config struct {
	Slots    int // concurrent runs
	WarmPool int // containers started in advance
	Limits   Limits
}

// DefaultConfig holds the tentative defaults (D-0017).
func DefaultConfig() Config {
	return Config{Slots: 2, WarmPool: 2, Limits: Limits{Timeout: 10 * time.Second, OutputBytes: 1 << 20}}
}

// Runner runs programs.
type Runner struct {
	cfg     Config
	backend Backend
	slots   chan struct{}
	warm    chan Proc
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	now     func() time.Time
}

// New creates a Runner and starts filling the warm pool.
func New(cfg Config, backend Backend) *Runner {
	ctx, cancel := context.WithCancel(context.Background())
	r := &Runner{
		cfg:     cfg,
		backend: backend,
		slots:   make(chan struct{}, cfg.Slots),
		warm:    make(chan Proc, cfg.WarmPool),
		ctx:     ctx,
		cancel:  cancel,
		now:     time.Now,
	}
	for i := 0; i < cfg.WarmPool; i++ {
		r.refill()
	}
	return r
}

// Close stops refilling and kills the waiting containers.
func (r *Runner) Close() {
	r.cancel()
	r.wg.Wait()
	close(r.warm)
	for p := range r.warm {
		p.Kill()
		_, _ = p.Wait()
	}
}

// FreeSlots returns the number of runs that could start now.
func (r *Runner) FreeSlots() int { return r.cfg.Slots - len(r.slots) }

func (r *Runner) refill() {
	if r.cfg.WarmPool == 0 {
		return
	}
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		p, err := r.backend.Start(r.ctx)
		if err != nil {
			return // the next run starts a container itself
		}
		select {
		case r.warm <- p:
		case <-r.ctx.Done():
			p.Kill()
			_, _ = p.Wait()
		default:
			p.Kill()
			_, _ = p.Wait()
		}
	}()
}

func (r *Runner) take(ctx context.Context) (Proc, error) {
	select {
	case p := <-r.warm:
		r.refill()
		return p, nil
	default:
		return r.backend.Start(ctx)
	}
}

// Run runs one program. It returns ErrBusy at once when no run slot is free.
func (r *Runner) Run(ctx context.Context, code string) (contract.RunResult, error) {
	select {
	case r.slots <- struct{}{}:
	default:
		return contract.RunResult{}, ErrBusy
	}
	defer func() { <-r.slots }()

	p, err := r.take(ctx)
	if err != nil {
		return contract.RunResult{}, err
	}
	return execute(p, code, r.cfg.Limits, r.now), nil
}

// execute delivers the code, enforces the limits and builds the result.
func execute(p Proc, code string, lim Limits, now func() time.Time) contract.RunResult {
	defer p.Kill()
	start := now()

	var (
		mu        sync.Mutex
		budget    = lim.OutputBytes
		stopped   contract.Outcome // set once by whichever limit fires first
		truncated bool
	)
	stop := func(o contract.Outcome) {
		mu.Lock()
		if stopped == "" {
			stopped = o
		}
		mu.Unlock()
		p.Kill()
	}
	// take reserves up to n bytes of the shared output budget.
	take := func(n int) int {
		mu.Lock()
		defer mu.Unlock()
		if n > budget {
			n = budget
			truncated = true
		}
		budget -= n
		return n
	}

	timer := time.AfterFunc(lim.Timeout, func() { stop(contract.OutcomeTimeout) })
	defer timer.Stop()

	go func() {
		w := p.Stdin()
		_, _ = io.WriteString(w, code)
		_ = w.Close()
	}()

	var header checkHeader
	var stdout, stderr strings.Builder
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		br := bufio.NewReader(p.Stdout())
		line, err := br.ReadString('\n')
		header = parseHeader(line)
		if err != nil {
			return
		}
		copyCapped(&stdout, br, take, func() { stop(contract.OutcomeOutputLimit) })
	}()
	go func() {
		defer wg.Done()
		copyCapped(&stderr, p.Stderr(), take, func() { stop(contract.OutcomeOutputLimit) })
	}()
	wg.Wait()
	exit, waitErr := p.Wait()
	timer.Stop()

	res := contract.RunResult{
		Stdout:      stdout.String(),
		Stderr:      stderr.String(),
		Diagnostics: header.diagnostics,
		Truncated:   truncated,
		DurationMs:  now().Sub(start).Milliseconds(),
		Backend:     contract.BackendOnPrem,
	}
	if res.Diagnostics == nil {
		res.Diagnostics = []contract.Diagnostic{}
	}
	mu.Lock()
	reason := stopped
	mu.Unlock()
	switch {
	case reason != "":
		res.Outcome = reason
	case header.ok && header.checkExit != 0:
		res.Outcome = contract.OutcomeCompileError
	case waitErr != nil || !header.ok || exit == 137:
		// No header means the container died before the check finished;
		// 137 is SIGKILL from the memory or process limit.
		res.Outcome = contract.OutcomeKilled
	default:
		res.Outcome = contract.OutcomeExited
		res.ExitCode = &exit
	}
	return res
}

// copyCapped copies src into dst until the shared budget runs out, then calls over once
// and drains the rest so the container never blocks on a full pipe.
func copyCapped(dst *strings.Builder, src io.Reader, take func(int) int, over func()) {
	buf := make([]byte, 32*1024)
	exceeded := false
	for {
		n, err := src.Read(buf)
		if n > 0 && !exceeded {
			k := take(n)
			dst.Write(buf[:k])
			if k < n {
				exceeded = true
				over()
			}
		}
		if err != nil {
			return
		}
	}
}

type checkHeader struct {
	ok          bool
	checkExit   int
	diagnostics []contract.Diagnostic
}

const headerPrefix = "GOOSE-CHECK "

// parseHeader reads "GOOSE-CHECK <exit> <json array>" written by the image's run.sh.
func parseHeader(line string) checkHeader {
	line = strings.TrimRight(line, "\r\n")
	if !strings.HasPrefix(line, headerPrefix) {
		return checkHeader{}
	}
	rest := line[len(headerPrefix):]
	num, js, _ := strings.Cut(rest, " ")
	exit, err := strconv.Atoi(num)
	if err != nil {
		return checkHeader{}
	}
	var diags []contract.Diagnostic
	if json.Unmarshal([]byte(js), &diags) != nil {
		diags = nil
	}
	for i := range diags {
		diags[i].Text = strings.ReplaceAll(diags[i].Text, "/work/main.goose", "main.goose")
	}
	return checkHeader{ok: true, checkExit: exit, diagnostics: diags}
}
