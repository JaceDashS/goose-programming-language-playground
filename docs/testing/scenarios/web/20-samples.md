# Samples Scenarios

- Design: [Samples Design](../../../design/web/20-samples.md)

## Representative Case

- Input: Release sample selection and current editor text
- Steps: Pick sample then compare with the last loaded text; confirm replacement of edits; load static sample text
- Expected result: Selecting 07_sieve after editing hello asks for confirmation and Run prints 664579 primes up to 10000000

## Release Audit

- Input: Every Goose v2026.4 linux-x64 release sample, archive SHA-256 559ad7572df89fcd1273512d8679528bcdf876c252ec1f31608d3808b24125b3.
- Steps: Supply unmodified source on stdin to goose-run:v2026.4 using DockerCLI.Args isolation flags, no extra files or arguments; check then run with stdin closed. Enforce a 10 s deadline including check. Review source dependencies as well as exit codes.
- Expected result: Only independent command-line programs are offered. Support files are excluded because they are not standalone programs.
- Environment: Docker Desktop Linux, 2026-11-08. The production network, read-only filesystem, tmpfs, CPU, memory, PID, capability and privilege flags were used. The runsc runtime is unavailable locally; production gVisor verification remains open. Recorded times include Docker startup and are below 10 s for included programs.

| Sample | Decision | Seconds | Reason |
| --- | --- | --- | --- |
| 01_tour.goose | Included | 0.703 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 02_memory.goose | Included | 0.719 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 03_strings.goose | Included | 0.672 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 04_errors.goose | Included | 0.594 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 05_shapes.goose | Included | 0.515 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 06_functions.goose | Included | 0.61 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 07_sieve.goose | Included | 0.516 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 08_bignum.goose | Included | 0.437 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 09_sorting.goose | Included | 1.031 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 10_sudoku.goose | Included | 0.781 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 11_maze.goose | Included | 0.469 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 12_huffman.goose | Included | 0.5 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 13_linked_list.goose | Included | 0.469 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 14_bst.goose | Included | 0.469 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 15_word_freq.goose | Excluded | 0.469 | Reads data/alice.txt; exits 1 |
| 16_records.goose | Included | 0.5 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 17_calc.goose | Excluded | 0.5 | Requires interactive stdin; EOF only exits without calculating |
| 18_json.goose | Excluded | 0.516 | Reads data/sample.json; exits 1 |
| 19_vm.goose | Included | 0.468 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 20_life.goose | Included | 0.468 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 21_raytrace.goose | Excluded | 0.485 | Writes raytrace.ppm |
| 22_image_filters.goose | Excluded | 0.485 | Writes blurred.pgm and edges.pgm |
| 23_mandelbrot_threads.goose | Excluded | 0.468 | Threads are unsupported by goose run JIT; exits 1 |
| 24_call_c.goose | Excluded | 0.453 | Needs call_c.h and --include; unresolved C symbols, exits 1 |
| 25_serialize.goose | Excluded | 0.469 | Reads data/alice.txt; exits 1 |
| 26_file_tree.goose | Included | 0.453 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 27_gfx_cube.goose | Excluded | 0.516 | Opens a graphics window; no video device |
| 28_physics_boxes.goose | Excluded | 0.531 | Opens a graphics window; no video device |
| 29_ui_todo.goose | Excluded | 0.437 | Needs font file and graphics; check fails |
| 30_mini_minecraft.goose | Excluded | 0.594 | Opens a graphics window; no video device |
| 31_mini_doom.goose | Excluded | 0.625 | Needs WAD file and graphics; exits 1 |
| 32_pool_worker_snapshots.goose | Excluded | 0.406 | Threads are unsupported by goose run JIT; exits 1 |

## Edited Code
- Input: User edits hello and picks 07_sieve.
- Steps: Cancel replacement, then select again and confirm.
- Expected result: Cancel preserves edits; confirmation loads the exact sample source.
- Test: frontend/src/components/Playground.test.tsx
