# Contributing

Use an issue to describe changes larger than a fix. Keep one concern per pull
request and explain observable behavior before implementation details.

## Development

Follow the bootstrap commands in [README](README.md). Run Python tests, Ruff,
Svelte checks, the translation check and affected browser workflows before
opening a pull request. The CI workflow repeats these checks on a clean runner.
The house-style command is `python scripts/housecheck.py --strict .`.

## Changes

Update documentation and CHANGELOG.md when behavior changes. Keep real publisher
provenance and license notices. Introduce a dependency only with a concrete reason
and a matching lockfile change. Do not commit measurements of real clients,
credentials, generated builds or browser storage exports.

## Commit messages

Use a concise area and imperative summary, for example `printing: preserve tile
contours at page boundaries`. Add a body when the reason is not obvious.

## Conduct and security

Follow the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through
[the security policy](SECURITY.md), rather than posting exploit details publicly.
