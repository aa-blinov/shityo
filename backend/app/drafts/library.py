"""Verified official FreeSewing catalog, linked to the original patterns."""

import json
from pathlib import Path

LIBRARY = json.loads(Path(__file__).with_name("library.json").read_text(encoding="utf-8"))
