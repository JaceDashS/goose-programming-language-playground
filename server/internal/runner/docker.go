package runner

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os/exec"
	"sync"
)

// DockerCLI starts run containers with the docker command line.
// Each container gets every isolation flag of the architecture (D-0002).
type DockerCLI struct {
	Image   string // for example goose-run:v2026.4
	Runtime string // "runsc" in production; empty uses Docker's default runtime (local development only)
	Docker  string // docker executable, "docker" when empty
}

// Args returns the docker arguments for one container.
func (d DockerCLI) Args(name string) []string {
	args := []string{"run", "--rm", "-i", "--name", name,
		"--network", "none",
		"--read-only",
		"--tmpfs", "/work:rw,exec,size=64m,uid=10001,gid=10001",
		"--tmpfs", "/tmp:rw,exec,size=16m",
		"--cpus", "1",
		"--memory", "512m", "--memory-swap", "512m",
		"--pids-limit", "64",
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--label", "goose-playground=run",
	}
	if d.Runtime != "" {
		args = append(args, "--runtime", d.Runtime)
	}
	return append(args, d.Image)
}

func (d DockerCLI) bin() string {
	if d.Docker == "" {
		return "docker"
	}
	return d.Docker
}

// Start starts one container that waits for its program on stdin.
func (d DockerCLI) Start(_ context.Context) (Proc, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return nil, err
	}
	name := "goose-run-" + hex.EncodeToString(b[:])
	// Not tied to the request context: a warm container outlives the request that refilled it.
	cmd := exec.Command(d.bin(), d.Args(name)...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return &dockerProc{d: d, name: name, cmd: cmd, stdin: stdin, stdout: stdout, stderr: stderr}, nil
}

type dockerProc struct {
	d              DockerCLI
	name           string
	cmd            *exec.Cmd
	stdin          io.WriteCloser
	stdout, stderr io.Reader
	killOnce       sync.Once
	waitOnce       sync.Once
	exit           int
	waitErr        error
}

func (p *dockerProc) Stdin() io.WriteCloser { return p.stdin }
func (p *dockerProc) Stdout() io.Reader     { return p.stdout }
func (p *dockerProc) Stderr() io.Reader     { return p.stderr }

func (p *dockerProc) Wait() (int, error) {
	p.waitOnce.Do(func() {
		err := p.cmd.Wait()
		var ee *exec.ExitError
		switch {
		case err == nil:
			p.exit = 0
		case errors.As(err, &ee):
			p.exit = ee.ExitCode()
		default:
			p.exit, p.waitErr = -1, err
		}
	})
	return p.exit, p.waitErr
}

// Kill removes the container. Killing only the docker client would leave the container running.
func (p *dockerProc) Kill() {
	p.killOnce.Do(func() {
		_ = exec.Command(p.d.bin(), "kill", p.name).Run()
	})
}
