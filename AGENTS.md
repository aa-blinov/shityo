# Agent context for Shityo

Shityo builds twelve garment blocks (tee, long sleeve, shirt, dress, vest, coat,
trousers, skirt, sweatshirt, hoodie, jumper, cardigan) from measurements on GOST women's
and men's size rows, and browses verified external
patterns. Read PRODUCT.md before extending the drafting engine.

## Run / build / test

```bash
python -m venv .venv
uv pip sync requirements-dev.txt --python .venv/bin/python
npm ci --prefix frontend
npm ci --prefix e2e
.venv/bin/python -m pytest
.venv/bin/python -m ruff check backend scripts frontend/scripts
.venv/bin/python -m ruff format --check backend scripts frontend/scripts
npm run check --prefix frontend
npm run check:i18n --prefix frontend
npm run build --prefix frontend
npm test --prefix e2e
```

On Windows use `.venv/Scripts/python.exe` instead of `.venv/bin/python`.
`pip install -r requirements-dev.txt` is an alternative to uv sync.

## Where things live

| Path | Responsibility |
| --- | --- |
| backend/app | FastAPI, geometry, drafting blocks, GOST size rows, PDF/SVG/DXF |
| frontend/src | SvelteKit interface, local projects, 2D and approximate 3D |
| backend/tests | Python unit and integration tests |
| e2e/tests | Browser workflows; e2e/cloth-regressions.mts checks simulation |
| scripts | Bootstrap, development server, formula audit, source imports |
| docs | API, architecture, printing, source provenance and screenshots |

The src and tests root indexes point to these native stack layouts.

## Traps

- Draft coordinates and lengths use millimetres; measurement controls use cm.
- Sleeve length is both a measurement and a parameter; keep their values coherent.
- Ease is added to the full girth in every block. Size rows follow GOST 31396/31399
  (women/men, height groups); see docs/SIZING.md before changing grids or formulas.
- External library designs open at their publishers. Never map them to our blocks.
- Projects and client profiles live in browser storage; JSON is the backup format.
- The UI kit is pinned to a Git commit. Its Svelte 4 peer range needs the checked-in npm config.
- Browser tests use a fresh backend and a production UI build. Ports are configurable.
- SSR uses BACKEND_ORIGIN; browser requests use the same-origin /api proxy.

## Style / safety rails

- Preserve the user's work and validate imported project data before applying it.
- Do not publish credentials, client measurements or browser storage exports.
- Keep pattern source attribution and third-party license notices.
- Use Monos UI tokens and components. Follow DESIGN.md for interface changes.
- No emojis in tracked files. Explain dependency additions in the change description.
