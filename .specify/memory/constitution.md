# Shityo Constitution

## Core Principles

### I. Order-first, master on demand (NON-NEGOTIABLE)

The core user is the independent tailor or micro-atelier sewing made to measure,
roughly one to ten individual orders per week. Every change MUST serve the order
flow: take client measurements, draft a tee, shirt, trouser or skirt block,
check seams, save the named design with its client profile in this browser, then
print a full-scale tiled PDF with a 50 mm calibration square for a toile. The
external pattern library is secondary inspiration and reference: it MUST preserve
publisher identity and MUST NOT feed geometry into the order workflow. Hobbyist
browsing and production grading, cloud or multi-user workflows are out of scope.

### II. Drawing, seams and exports agree (NON-NEGOTIABLE)

Backend geometry in millimetres is the single source of truth. The on-screen
drawing, seam measurements and SVG, DXF and PDF exports MUST coincide, with
explicit units (mm in drafts and exports, cm in the measurement UI). No claim
about fit, counts or coverage may ship without executed verification.

### III. Preserve user work

Designs and client profiles live in browser storage; project JSON is the backup
and transfer format. Invalid imported state MUST be rejected before it replaces
existing work. Backward-compatible migrations (for example, filling a newly
introduced measurement with its default) MUST NOT invalidate previously saved
projects, profiles or fixtures.

### IV. Attribution honesty

External designs open at their publishers, with authorship, verification dates
and license notes kept intact. NEVER present external or borrowed geometry as
our own; NEVER invent designs, images or fit guarantees. The 3D preview is a
visual approximation and MUST be labelled as such.

### V. Drawing-first, verifiable UI

The drawing keeps the space; controls and decoration come second. Panels follow
the 4/8/12/16/24 px scale with overlay behaviour under 1180 px and 768 px.
Every construction coordinate MUST offer a numeric input as an alternative to
dragging, and every line meaning MUST have a text label. Russian and English
MUST stay in key parity, including validator message placeholders.

## Additional Constraints

FastAPI builds geometry, validates contours and exports; SvelteKit renders the
same piece data and MUST NOT recompute geometry in the frontend. UI uses Monos
UI tokens and components, six palettes and light/dark modes. Python and npm
dependencies are locked; the project follows golden-repo v1.0.11. No emojis in
tracked files. Out of scope: accounts, cloud sync, production grading, arbitrary
freehand authoring, external-pattern editing. No commits or pushes without an
explicit request; no destructive commands (`rm -rf`, `git reset --hard`,
`git push --force`); no work outside the working directory without permission.

## Development Workflow

A change is done only when its relevant gates pass: `pytest` (backend/tests),
`ruff check` and `ruff format --check`, `svelte-check` with 0 errors and
warnings, `check:i18n` (dictionary parity, placeholders), the frontend
production build, the relevant Playwright specs against a fresh backend and a
built UI, and `scripts/housecheck.py --strict`. Evidence before synthesis:
inspect files and run code before claiming; verify by execution, never from
memory. Explanations of dependency additions belong in the change description.

## Governance

This constitution supersedes PRODUCT.md and DESIGN.md on conflict; those files
carry product detail, this file carries non-negotiable rules. Amendments require
a version bump (MAJOR for incompatible redefinitions, MINOR for a new principle
or section, PATCH for wording), ISO dates, a rationale and a migration plan for
saved projects and fixtures. Every review MUST verify gate results, order-flow
impact and compliance with principles I-V.

**Version**: 1.0.0 | **Ratified**: 2026-11-05 | **Last Amended**: 2026-11-05
