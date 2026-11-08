# Samples

- Related: [Playground Page](10-playground-page.md)

## Requirements

- The page offers a sample picker next to the Run button. Picking a sample replaces the editor content; if the editor was changed, ask for confirmation first.
- Samples come from the Goose v2026.4 release `samples/` folder (Apache-2.0). Keep the original file header comment, and add a `frontend/src/samples/NOTICE.md` that names the source repository, release and license.
- Only command-line samples that work in the run container are included (D-0017: CLI-only samples). A sample is included when, run through the run image with the production flags, it finishes within 10 s, exits with 0, and needs no arguments, files, network, graphics or window.
- Record the check for every release sample in the scenario document: included or excluded, with the reason (for example "opens a window", "timeout", "reads a file").
- Samples are bundled with the frontend as static text; they are not fetched at run time.
- The default editor content stays the hello program.

## Example

- Input: The user has edited the hello program and picks `07_sieve`.
- Steps: The page asks "Replace your code with the sample?" → the user confirms.
- Result: The editor shows `07_sieve.goose`; Run prints `664579 primes up to 10000000`.
