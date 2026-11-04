# Development

Run `python scripts/bootstrap.py` with Python 3.14 and Node 24 available. It creates
a virtual environment, installs the locked Python dependencies, installs both npm
trees with npm ci and builds SvelteKit. `scripts/dev.py` starts the two services.

## Updating dependencies

Edit requirements.in or requirements-dev.in, then regenerate the lockfiles:

```bash
uv pip compile --universal --python-version 3.14 requirements.in -o requirements.txt
uv pip compile --universal --python-version 3.14 requirements-dev.in -o requirements-dev.txt
```

Install the result and run tests. Update npm dependencies from their package
directory so the local npm config applies. Commit package.json and package-lock.json
together. Monos UI stays pinned to a reviewed commit; its legacy Svelte peer range
is handled by frontend/.npmrc.

## Browser checks

Install Chromium in e2e with `npx playwright install chromium`. Run the production
build first, then npm test in e2e. Set TEST_REUSE_SERVERS=false and alternate ports
to isolate checks from your development session. The launcher and test harness
choose .venv/Scripts/python.exe on Windows and .venv/bin/python elsewhere.

CI intercepts only external publisher images with an explicitly labelled test
image. It still runs a real backend and production UI. Source availability is
checked by the import scripts and recorded in the library verification dates.

## Standard

The house-style workflow uses golden-repo v1.0.11 as a versioned action. The local
scripts/housecheck.py wrapper fetches that same version into ignored .cache.
The actual checker is not vendored or weakened for this project.
