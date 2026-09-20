# Halloween Eyes

Two animated eyes, one per front window, on a Raspberry Pi 5.

## Run locally

    nvm use
    python3 server/serve.py --root public --port 8080
    open "http://localhost:8080/?viewport=left"

## Test

    node --test                       # scans recursively from the repo root
    .venv/bin/pytest tests/
    ./tools/check-no-random.sh

Note: pass no path to `node --test`. On Node 22 a positional directory argument
is treated as a file to execute, so `node --test tests/` fails to resolve.

## Design

See `docs/DESIGN.md` for the design spec and `docs/PLAN.md` for the implementation plan.
