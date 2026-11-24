# Vercel Fallback Scenarios

- Design: [Vercel Fallback Design](../../../design/run/30-vercel-fallback.md)

## Representative Case

- Input: RunRequest and exact Origin header; optional Turnstile token
- Steps: Validate origin and UTF-8 size, verify Turnstile when configured, check primary health within 2 seconds, admit against both caps, prepare and check then run, always stop
- Expected result: A healthy primary returns 409 use_primary without consuming quota or creating a sandbox

## Admission Cases

- Input: Forbidden or missing Origin; localhost in production or development; malformed JSON; missing, mistyped or unknown request properties; 65536 bytes and non-ASCII overflow.
- Steps: Call the handler with mocked dependencies.
- Expected result: Exact production origin and development localhost are accepted. Other origins return 403 forbidden_origin; invalid JSON or shape returns 400 invalid_request; UTF-8 overflow returns 413 too_large, without sandbox creation.
- Test: frontend/src/lib/fallback/handler.test.ts

## Turnstile Cases

- Input: Configured secret with missing token, rejected token, network failure, malformed response, non-200 response, or verified token.
- Steps: Mock Siteverify and call the handler.
- Expected result: Failures return 403 turnstile_failed; only verified tokens proceed to health checking.
- Test: frontend/src/lib/fallback/handler.test.ts

## Primary And Quotas

- Input: Healthy primary with one slot; busy, unreachable or invalid primary; exhausted hourly or daily caps; concurrent admission and UTC window rollover.
- Steps: Check health with a two second signal, then reserve admission only if primary is unavailable.
- Expected result: Healthy primary returns 409 use_primary with unchanged counters and no sandbox. Full caps return 503 unavailable. Concurrent calls cannot exceed a process-local cap; hourly and daily rollover reset the appropriate window.
- Test: frontend/src/lib/fallback/handler.test.ts

## Execution Outcomes

- Input: Compiler rejection with diagnostics; zero or nonzero program exit; exit 137; stalled check or run; output across stdout and stderr beyond 1 MiB.
- Steps: Mock sandbox commands and advance the clock for timeout cases.
- Expected result: compile_error never runs; normal exits return exited with the exit code; killed and timeout have null exitCode; output_limit truncates combined output. Every case stops the sandbox once.
- Test: frontend/src/lib/fallback/handler.test.ts

## Setup And Cleanup Failures

- Input: Creation failure, download failure, incorrect archive digest, setup failure, command failure, or stop failure.
- Steps: Reject the corresponding mocked dependency.
- Expected result: unavailable; each created sandbox is stopped even on setup or execution errors. A digest mismatch prevents extraction or command execution.
- Test: frontend/src/lib/fallback/handler.test.ts, frontend/src/lib/fallback/vercel.test.ts

## SDK Wiring

- Input: Mock SDK command with stdout and stderr sinks and remaining deadline.
- Steps: Invoke run through the SDK adapter.
- Expected result: The deadline and abort signal reach the SDK; source is passed as a file, stdin is closed and credentials are absent from the command environment.
- Test: frontend/src/lib/fallback/vercel.test.ts

## Exact Output And Shared Deadline
- Input: Empty compiler diagnostics followed by exactly 1 MiB of program output; or a check that consumes 7 seconds before a stalled run.
- Steps: Execute check then run under the shared deadline.
- Expected result: Exact output capacity is accepted without truncation; the stalled run times out after 3 remaining seconds, at 10 seconds total.
- Test: frontend/src/lib/fallback/handler.test.ts

## Compiler Runtime Compatibility

- Input: Goose v2026.4 linux-x64, verified SHA-256, and the hello program in a fresh Sandbox.
- Steps: Start the Ubuntu-based vercel/sandbox/node:24 image, install libc development headers, check the compiler version before admitting source, then check and run the hello program with no stdin and network disabled.
- Expected result: The compiler starts successfully, check exits 0 with an empty diagnostic array, run exits 0 and prints Hello, Goose. A legacy Amazon Linux node24 runtime fails because its GLIBC lacks version 2.35 and must not be selected.
- Test: frontend/src/lib/fallback/vercel.test.ts checks the managed image selection and setup; live Sandbox smoke check verified on 2026-11-08.

## Release Download Gateway Failure

- Input: GitHub release browser download endpoint returns 504 or a network failure.
- Steps: Retry through the official API for the same v2026.4 linux-x64 asset, request binary content and verify the pinned SHA-256 before extraction.
- Expected result: A valid matching archive permits setup; both endpoints failing or any digest mismatch prevents code execution and stops the sandbox.
- Test: frontend/src/lib/fallback/vercel.test.ts.
