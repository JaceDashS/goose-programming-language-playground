#!/bin/sh
# Protocol with the runner:
#   stdin  : the program source; the runner closes stdin to start the run.
#   stdout : line 1 is the check header, then the program's own stdout.
#            header = "GOOSE-CHECK <exit code> " + diagnostics JSON array
#   stderr : the program's own stderr.
# The program is only run when the check passes.
set -u
cat > /work/main.goose
diag=$(goose check /work/main.goose --diagnostics json 2>/dev/null)
code=$?
[ -n "$diag" ] || diag='[]'
printf 'GOOSE-CHECK %d %s\n' "$code" "$(printf '%s' "$diag" | tr -d '\n')"
[ "$code" -eq 0 ] || exit 0
exec goose run /work/main.goose < /dev/null
