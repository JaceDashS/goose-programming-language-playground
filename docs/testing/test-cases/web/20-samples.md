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
- Environment: Green-G4 production, Ubuntu 26.04, runsc release-20261102.0, verified 2026-11-08. Every sample used the production runsc, network, filesystem, tmpfs, CPU, memory, PID, capability and privilege flags. A 10 second process deadline includes container startup, check and run. Included samples all checked and exited successfully within 2.423 seconds; no additional arguments or files were supplied.

| Sample | Decision | Seconds | Reason |
| --- | --- | --- | --- |
| 01_tour.goose | Included | 1.029 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 02_memory.goose | Included | 1.465 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 03_strings.goose | Included | 1.743 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 04_errors.goose | Included | 1.165 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 05_shapes.goose | Included | 1.049 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 06_functions.goose | Included | 1.478 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 07_sieve.goose | Included | 1.284 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 08_bignum.goose | Included | 1.205 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 09_sorting.goose | Included | 2.423 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 10_sudoku.goose | Included | 1.524 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 11_maze.goose | Included | 1.285 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 12_huffman.goose | Included | 1.32 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 13_linked_list.goose | Included | 1.245 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 14_bst.goose | Included | 1.379 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 15_word_freq.goose | Excluded | 1.336 | Reads data/alice.txt; exits 1 |
| 16_records.goose | Included | 1.448 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 17_calc.goose | Excluded | 1.328 | Requires interactive stdin; EOF only exits without calculating |
| 18_json.goose | Excluded | 1.225 | Reads data/sample.json; exits 1 |
| 19_vm.goose | Included | 1.151 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 20_life.goose | Included | 1.227 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 21_raytrace.goose | Excluded | 1.512 | Writes raytrace.ppm |
| 22_image_filters.goose | Excluded | 1.464 | Writes blurred.pgm and edges.pgm |
| 23_mandelbrot_threads.goose | Excluded | 1.481 | Threads are unsupported by goose run JIT; exits 1 |
| 24_call_c.goose | Excluded | 1.18 | Needs call_c.h and --include; unresolved C symbols, exits 1 |
| 25_serialize.goose | Excluded | 1.561 | Reads data/alice.txt; exits 1 |
| 26_file_tree.goose | Included | 0.935 | No arguments, files, network, graphics or stdin; check and run exit 0 |
| 27_gfx_cube.goose | Excluded | 1.455 | Opens a graphics window; no video device |
| 28_physics_boxes.goose | Excluded | 1.844 | Opens a graphics window; no video device |
| 29_ui_todo.goose | Excluded | 1.224 | Needs font file and graphics; check fails |
| 30_mini_minecraft.goose | Excluded | 2.056 | Opens a graphics window; no video device |
| 31_mini_doom.goose | Excluded | 2.3 | Needs WAD file and graphics; exits 1 |
| 32_pool_worker_snapshots.goose | Excluded | 0.878 | Threads are unsupported by goose run JIT; exits 1 |

## Edited Code
- Input: User edits hello and picks 07_sieve.
- Steps: Cancel replacement, then select again and confirm.
- Expected result: Cancel preserves edits; confirmation loads the exact sample source.
- Test: frontend/src/components/Playground.test.tsx
