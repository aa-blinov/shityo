# Agent context for Shityo

Shityo builds sixteen garment blocks (tee, long sleeve, shirt, dress, vest, coat,
trousers, skirt, sweatshirt, hoodie, jumper, cardigan, briefs, boxers, bralette, slip)
from measurements on GOST women's
and men's size rows, and browses verified external
patterns. Read PRODUCT.md before extending the drafting engine.

## Run / build / test

```bash
docker compose up -d mongo
python -m venv .venv
uv pip sync requirements-dev.txt --python .venv/bin/python
npm ci --prefix frontend
npm ci --prefix e2e
.venv/bin/python -m pytest
.venv/bin/python scripts/blocks.py check
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
| backend/app/blocks | Block passports and EMKO reference checks; one folder per block |
| backend/app/store | MongoDB connection, sessions, passwords, roles |
| frontend/src | SvelteKit interface, local projects, 2D and approximate 3D |
| backend/tests | Python unit and integration tests |
| e2e/tests | Browser workflows; e2e/cloth-regressions.mts checks simulation |
| scripts | Bootstrap, development server, block checks, formula audit, source imports |
| docs | API, architecture, printing, source provenance and screenshots |

The src and tests root indexes point to these native stack layouts.

## Traps

- Draft coordinates and lengths use millimetres; measurement controls use cm.
- A block is a folder in backend/app/blocks: passport.toml, reference.toml, draft
  function. Add one with scripts/blocks.py new; see docs/BLOCKS.md.
- Back length, armhole depth and garment length run from the cervical point
  (centre back neck), not from the shoulder neck point.
- Sleeve length is both a measurement and a parameter; keep their values coherent.
- Ease is added to the full girth in every block; lingerie uses negative ease
  through the stretch parameter. Size rows follow GOST 31396/31399
  (women/men, height groups); see docs/SIZING.md before changing grids or formulas.
- External library designs open at their publishers. Never map them to our blocks.
- Ateliers, staff, clients, measurement sets and orders live in MongoDB; files in
  GridFS. Every query filters by the atelier from the session, never from input.
- Record ids come from the browser and are unique only inside an atelier.
- Storage tests and browser tests need MongoDB; each test gets its own atelier.
- The UI kit is pinned to a Git commit. Its Svelte 4 peer range needs the checked-in npm config.
- Browser tests use a fresh backend and a production UI build. Ports are configurable.
- SSR uses BACKEND_ORIGIN; browser requests use the same-origin /api proxy.

## Style / safety rails

- Preserve the user's work and validate imported project data before applying it.
- Do not publish credentials, client measurements, database dumps or backups.
- Keep pattern source attribution and third-party license notices.
- Use Monos UI tokens and components. Follow DESIGN.md for interface changes.
- No emojis in tracked files. Explain dependency additions in the change description.
